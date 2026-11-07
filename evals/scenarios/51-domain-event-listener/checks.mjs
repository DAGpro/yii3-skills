import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\/.*\.php$/.test(c.path));

/** Changed src files that dispatch: text + the short name of the class instantiated inside ->dispatch(...). */
const dispatchingFiles = (changed) =>
  srcPhp(changed)
    .map((c) => ({ path: c.path, t: read(c.abs) }))
    .filter((f) => /->\s*dispatch\s*\(/.test(f.t))
    .map((f) => {
      const m = f.t.match(/->\s*dispatch\s*\(\s*new\s+\\?([\w\\]+)\s*\(/);
      return { ...f, eventShort: m ? m[1].split('\\').pop() : '' };
    });

/** Changed invokable listener classes under src/: __invoke with a class-typed first parameter (the event). */
const listeners = (changed) =>
  srcPhp(changed)
    .map((c) => ({ path: c.path, t: read(c.abs) }))
    .map((f) => {
      const m = f.t.match(/(?:final\s+|readonly\s+|abstract\s+)*class\s+(\w+)[^{;]*\{[\s\S]*?public\s+function\s+__invoke\s*\(\s*(\\?[\w\\]+)\s+\$\w+/);
      return { ...f, name: m?.[1] ?? '', eventType: m ? m[2].replace(/^\\/, '').split('\\').pop() : '' };
    })
    .filter((l) => l.name !== '' && l.eventType !== '');

/** Changed events config files (config/.../events*.php); configuration.php never matches its basename. */
const eventsConfigFiles = (changed) =>
  changed.filter((c) => /^config\//.test(c.path) && /(^|\/)events[a-z0-9-]*\.php$/.test(c.path));

/** Value slices of every events/events-web/events-console group in the configuration.php merge plan. */
const eventsGroupSlices = (cfgText) => {
  const re = /['"]events(?:-(?:web|console))?['"]\s*=>/g;
  const slices = [];
  let m;
  while ((m = re.exec(cfgText)) !== null) {
    const rest = cfgText.slice(m.index + m[0].length);
    const nextKey = rest.search(/\n\s*['"][\w.-]+['"]\s*=>/);
    slices.push(nextKey === -1 ? rest : rest.slice(0, nextKey));
  }
  return slices;
};

export default [
  // Concern 1: the domain event is an immutable, self-contained DTO (guide: `final readonly class` shape)
  check('event-class-declared', 'The domain event class exists as a changed final class under src/ declared `final readonly` (or final with public readonly properties) - an immutable DTO, not a mutable or framework-based event', ({ changed }) => {
    const events = [...new Set([
      ...dispatchingFiles(changed).map((f) => f.eventShort),
      ...listeners(changed).map((l) => l.eventType),
    ])].filter(Boolean);
    if (!events.length) return fail('no ->dispatch(new Event(...)) and no typed __invoke listener - cannot identify the event class');
    const found = events.filter((e) =>
      srcPhp(changed).some((c) => {
        const t = read(c.abs);
        if (new RegExp(`\\bfinal\\s+readonly\\s+class\\s+${e}\\b`).test(t)) return true;
        return new RegExp(`\\bfinal\\s+class\\s+${e}\\b`).test(t) && /public\s+readonly\s+\S+\s+\$\w+/.test(t);
      }));
    return found.length
      ? ok(found.join(', '))
      : fail(`no final readonly class declaration found for event(s): ${events.join(', ')}`);
  }),

  // Concern 2: the service dispatches through constructor-injected PSR-14, not a hand-built dispatcher
  check('dispatcher-injected-and-dispatched', 'The dispatching class injects Psr\\EventDispatcher\\EventDispatcherInterface via its constructor and calls ->dispatch(new Event(...)) - no `new Dispatcher` service construction', ({ changed }) => {
    const hits = dispatchingFiles(changed).filter((f) =>
      /__construct\s*\([^)]*EventDispatcherInterface\s+\$\w+/.test(f.t)
      && !/new\s+\\?(?:[\w\\]*\\)?(?:Event)?Dispatcher\s*\(/.test(f.t));
    return hits.length
      ? ok(hits.map((h) => h.path).join(', '))
      : fail('no changed class injects EventDispatcherInterface via the constructor and calls ->dispatch()');
  }),

  // Concern 3: the side-effect leaves the domain operation - no more inline mail send next to dispatch
  check('no-direct-mail-in-service', 'The class that dispatches the event no longer sends mail inline: no MailerInterface usage and no ->send() call in the dispatching file (keeping both = double notification)', ({ changed }) => {
    const dispatchers = dispatchingFiles(changed);
    if (!dispatchers.length) return fail('nothing dispatches the domain event');
    const bad = dispatchers.filter((f) => /MailerInterface|->\s*send\s*\(/.test(f.t));
    return bad.length
      ? fail(`the dispatching class still sends mail inline (belt-and-suspenders double notification): ${bad.map((b) => b.path).join(', ')}`)
      : ok(dispatchers.map((d) => d.path).join(', '));
  }),

  // Concern 4: the listener owns the side effect
  check('listener-sends-mail', 'A changed listener class handles the event via __invoke(<Event> $event), injects MailerInterface via its constructor and sends through it (->send())', ({ changed }) => {
    const hits = listeners(changed).filter((l) =>
      /__construct\s*\([^)]*MailerInterface\s+\$\w+/.test(l.t) && /->\s*send\s*\(/.test(l.t));
    return hits.length
      ? ok(hits.map((h) => h.name).join(', '))
      : fail('no listener class injects MailerInterface and calls ->send()');
  }),

  // Concern 5: the listener is registered in the events config, not in DI or nowhere
  check('listener-registered', 'An events config file (config/**/events*.php) maps <Event>::class => [<Listener>::class, ...] - the explicit format ListenerCollectionFactory::create() consumes', ({ changed }) => {
    const pairs = listeners(changed);
    if (!pairs.length) return fail('no listener class found to map');
    const files = eventsConfigFiles(changed);
    if (!files.length) return fail('no events config file (config/**/events*.php) was added or changed');
    for (const f of files) {
      const t = read(f.abs);
      const mapped = pairs.filter((l) =>
        new RegExp(`\\b${l.eventType}::class\\s*=>`).test(t) && new RegExp(`\\b${l.name}::class\\b`).test(t));
      if (mapped.length) return ok(`${mapped.map((m) => m.name).join(', ')} mapped in ${f.path}`);
    }
    return fail(`no events config file maps any of [${pairs.map((p) => p.eventType).join(', ')}] to its listener`);
  }),

  // Concern 6: the events config file is reachable from the merge plan (otherwise silently dead)
  check('events-group-wired', 'The events config file is reachable from the merge plan: config/configuration.php references it under an events* group', ({ dir, changed }) => {
    const files = eventsConfigFiles(changed);
    if (!files.length) return fail('no events config file (config/**/events*.php) was added');
    const cfgPath = filesMatching(dir, /^config\/configuration\.php$/)[0];
    if (!cfgPath) return fail('config/configuration.php not found');
    const cfg = read(cfgPath);
    const slices = eventsGroupSlices(cfg);
    if (!slices.length) return fail('configuration.php declares no events/events-web/events-console group');
    for (const f of files) {
      const rel = f.path.replace(/^config\//, '');
      if (slices.some((s) => s.includes(rel))) return ok(`${rel} is reachable from an events group`);
    }
    return fail(`none of [${files.map((f) => f.path).join(', ')}] is referenced by an events* group in configuration.php - the mapping file is silently dead`);
  }),

  check('no-yii2', 'No Yii2 constructs or #[Override] in changed PHP files', ({ changed }) => {
    const re = /Yii::\$app|\buse\s+yii\\|#\[Override\]|ActiveForm::begin|->getFlash\(/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('strict-types', 'declare(strict_types=1) in every added PHP file', ({ changed }) => {
    const bad = php(changed).filter((c) => c.added && !/declare\(strict_types=1\);/.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('transcript-mentions-flow', 'The final answer mentions the event flow pieces: event, dispatch and listener', ({ transcript }) =>
    /\bevent\b/i.test(transcript) && /dispatch/i.test(transcript) && /\blistener\b/i.test(transcript)
      ? ok()
      : fail('transcript does not mention event + dispatch + listener')),
];
