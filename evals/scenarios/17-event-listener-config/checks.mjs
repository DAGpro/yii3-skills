import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\/.*\.php$/.test(c.path));

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
  check('event-dto', 'The event class exists as a changed final class under src/ (immutable DTO shape per the guide)', ({ changed }) => {
    const events = [...new Set(listeners(changed).map((l) => l.eventType))];
    if (!events.length) return fail('no listener with a typed __invoke parameter - cannot identify the event class');
    const found = events.filter((e) =>
      srcPhp(changed).some((c) => new RegExp(`\\bfinal\\s+(?:readonly\\s+)?class\\s+${e}\\b`).test(read(c.abs))));
    return found.length
      ? ok(found.join(', '))
      : fail(`no final class declaration found for event(s): ${events.join(', ')}`);
  }),

  check('listener-invokable', 'A changed listener class handles the event via __invoke(<Event> $event)', ({ changed }) => {
    const hits = listeners(changed);
    return hits.length ? ok(hits.map((l) => `${l.name} (${l.eventType})`).join(', ')) : fail('no class with __invoke(<Event> $event)');
  }),

  check('dispatcher-injected', 'Psr\\EventDispatcher\\EventDispatcherInterface is injected via a constructor and ->dispatch() is called (PSR-14 dispatcher)', ({ changed }) => {
    const hits = srcPhp(changed).filter((c) => {
      const t = read(c.abs);
      return /__construct\s*\([^)]*EventDispatcherInterface\s+\$\w+/.test(t) && /->dispatch\s*\(/.test(t);
    });
    return hits.length ? ok(hits.map((c) => c.path).join(', ')) : fail('no changed class injects EventDispatcherInterface and calls ->dispatch()');
  }),

  check('listener-mapped', 'An events config file (config/**/events*.php) maps <Event>::class => [<Listener>::class, ...]', ({ changed }) => {
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

  check('tests-added', 'Tests added (tests/**Test.php)', ({ changed }) =>
    changed.some((c) => c.added && /^tests\/.*Test\.php$/.test(c.path)) ? ok() : fail('no tests'), { required: false }),
];
