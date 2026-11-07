import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\/.*\.php$/.test(c.path));
const config = (changed) => php(changed).filter((c) => /^config\//.test(c.path));

/** Changed invokable/handler classes under src/ taking the ApplicationError event as a typed parameter. */
const listeners = (changed) =>
  srcPhp(changed)
    .map((c) => ({ path: c.path, t: read(c.abs) }))
    .map((f) => {
      const m = f.t.match(/(?:final\s+|readonly\s+|abstract\s+)*class\s+(\w+)[^{;]*\{[\s\S]*?public\s+function\s+(?:__invoke|handle|process)\s*\(\s*[\w\\]*ApplicationError\s+\$\w+/);
      return { ...f, name: m?.[1] ?? '' };
    })
    .filter((l) => l.name !== '');

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

/** The event class key as written in config: short imported or fully qualified. */
const EVENT_KEY = /(?:\\[\w\\]*\\)?ApplicationError(?:::class|['"])\s*=>/;

export default [
  check('listener-implements-shape', 'A changed class under src/ handles the ApplicationError event (typed __invoke/handle/process parameter)', ({ changed }) => {
    const hits = listeners(changed);
    return hits.length ? ok(hits.map((l) => `${l.name} (${l.path})`).join(', ')) : fail('no class with a typed ApplicationError handler method');
  }),

  check('listener-registered', 'A changed events config file maps ApplicationError::class => [<Listener>::class, ...]', ({ changed }) => {
    const pairs = listeners(changed);
    if (!pairs.length) return fail('no listener class found to map');
    const files = eventsConfigFiles(changed);
    if (!files.length) return fail('no events config file (config/**/events*.php) was added or changed');
    for (const f of files) {
      const t = read(f.abs);
      const mapped = pairs.filter((l) => EVENT_KEY.test(t) && new RegExp(`\\b${l.name}::class\\b`).test(t));
      if (mapped.length) return ok(`${mapped.map((m) => m.name).join(', ')} mapped in ${f.path}`);
    }
    return fail(`no events config file maps ApplicationError to any of [${pairs.map((p) => p.name).join(', ')}]`);
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

  check('logger-injected', 'The listener injects Psr\\Log\\LoggerInterface via its constructor and writes through it (->error()/->log())', ({ changed }) => {
    const hits = listeners(changed).filter((l) =>
      /__construct\s*\([^)]*LoggerInterface\s+\$\w+/.test(l.t) && /->(?:error|log)\s*\(/.test(l.t));
    return hits.length ? ok(hits.map((h) => h.name).join(', ')) : fail('no listener class injects LoggerInterface and calls ->error()/->log()');
  }),

  check('throwable-context-logged', 'The listener logs the event throwable: ->getThrowable() is called and the log context carries the throwable/its details', ({ changed }) => {
    const hits = listeners(changed).filter((l) =>
      /getThrowable\s*\(/.test(l.t) && /['"](?:exception|message|file|line|class|trace)['"]\s*=>|getTraceAsString\s*\(/.test(l.t));
    return hits.length ? ok(hits.map((h) => h.name).join(', ')) : fail('the listener never extracts getThrowable() into the log context');
  }),

  check('dispatcher-reaches-errorcatcher', 'A PSR-14 dispatcher is installed/bound so it reaches ErrorCatcher (yii-event added per the guide, or an explicit EventDispatcherInterface wiring in config)', ({ changed }) => {
    const composerChanged = changed.find((c) => c.path === 'composer.json');
    if (composerChanged && /yiisoft\/yii-event|yiisoft\/event-dispatcher/.test(read(composerChanged.abs))) {
      return ok('composer.json now requires the PSR-14 event packages (yii-event ships the dispatcher binding)');
    }
    const hit = config(changed).filter((c) =>
      /EventDispatcher(?:Interface)?::class\s*=>|['"]eventDispatcher['"]\s*=>/.test(read(c.abs)));
    return hit.length
      ? ok(hit.map((h) => h.path).join(', '))
      : fail('no dispatcher wiring: no PSR-14 event package added to composer.json and no EventDispatcherInterface binding in config - without it no ApplicationError listener ever runs');
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

  check('transcript-mentions-event-logging', 'The answer explains the event-listener wiring and how the dispatcher reaches ErrorCatcher', ({ transcript }) => {
    if (!/\blistener\b|\bevent\b/i.test(transcript)) return fail('transcript does not mention the event-listener wiring');
    return /dispatcher|yii-event|ErrorCatcher|ApplicationError/i.test(transcript)
      ? ok()
      : fail('transcript does not explain how the dispatcher reaches the error handler');
  }),

  check('error-catcher-kept', 'ErrorCatcher is still wired in config (logging must not replace the global catcher)', ({ dir }) => {
    const configs = filesMatching(dir, /^config\/.*\.php$/);
    return configs.some((p) => /ErrorCatcher/.test(read(p))) ? ok() : fail('ErrorCatcher no longer wired in config/');
  }, { required: false }),

  check('tests-added', 'Tests added (tests/**Test.php)', ({ changed }) =>
    changed.some((c) => c.added && /^tests\/.*Test\.php$/.test(c.path)) ? ok() : fail('no tests'), { required: false }),
];
