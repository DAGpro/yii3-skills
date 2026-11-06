import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\/.*\.php$/.test(c.path));

/** Changed classes implementing PSR-15 MiddlewareInterface (import + short implements, or FQCN). */
const middlewares = (changed) =>
  srcPhp(changed)
    .map((c) => ({ path: c.path, t: read(c.abs) }))
    .map((f) => ({ ...f, name: f.t.match(/class\s+(\w+)[^{;]*implements\s+[^;{]*\bMiddlewareInterface\b/)?.[1] ?? '' }))
    .filter((m) => m.name !== '');

/** Index of the closing bracket for an opening one at openIdx (heuristic: strings/comments ignored). */
const matchBracket = (text, openIdx) => {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']' && --depth === 0) return i;
  }
  return -1;
};

/** Config DI files that may carry the global application pipeline (guide: config/web/di/application.php). */
const pipelineFiles = (dir) => filesMatching(dir, /^config\/(?:web|common)\/di\/[^/]+\.php$/);

/** The config file where a middleware class name is listed inside a dispatcher middlewareDefinitions/withMiddlewares array. */
const registeredInPipeline = (dir, name) => {
  const token = new RegExp(`\\b${name}::class\\b`);
  for (const f of pipelineFiles(dir)) {
    const t = read(f);
    for (const key of ["'middlewareDefinitions'", '"middlewareDefinitions"', "'withMiddlewares()'", '"withMiddlewares()"']) {
      let idx = t.indexOf(key);
      while (idx !== -1) {
        const open = t.indexOf('[', idx + key.length);
        const close = open === -1 ? -1 : matchBracket(t, open);
        if (close !== -1 && token.test(t.slice(open, close))) return f;
        idx = t.indexOf(key, idx + 1);
      }
    }
  }
  return null;
};

export default [
  check('middleware-interface-implemented', 'A changed class implements PSR-15 Psr\\Http\\Server\\MiddlewareInterface', ({ changed }) => {
    const hits = middlewares(changed);
    return hits.length ? ok(hits.map((m) => m.path).join(', ')) : fail('no new class implements MiddlewareInterface');
  }),

  check('process-signature', 'process(ServerRequestInterface, RequestHandlerInterface): ResponseInterface signature shape', ({ changed }) => {
    const hits = middlewares(changed).filter(({ t }) => {
      const m = t.match(/public\s+function\s+process\s*\(([\s\S]*?)\)\s*:\s*([\w\\]+)/);
      return m !== null && /ServerRequestInterface/.test(m[1]) && /RequestHandlerInterface/.test(m[1])
        && /ResponseInterface$/.test(m[2].replace(/^\\/, ''));
    });
    return hits.length ? ok(hits.map((m) => m.path).join(', ')) : fail('no process() with the PSR-15 signature');
  }),

  check('middleware-registered', 'The middleware is registered in the global Application middleware stack (dispatcher middlewareDefinitions in config/{web,common}/di)', ({ dir, changed }) => {
    const names = middlewares(changed).map((m) => m.name);
    if (!names.length) return fail('no MiddlewareInterface implementation found');
    const wired = names.map((n) => [n, registeredInPipeline(dir, n)]).find(([, f]) => f !== null);
    return wired ? ok(`${wired[0]} registered in ${wired[1]}`) : fail(`none of [${names.join(', ')}] appears in the Application dispatcher middlewareDefinitions`);
  }),

  check('psr7-immutability', 'PSR-7 immutability: withAttribute()/withHeader() results are not discarded as bare statements', ({ changed }) => {
    const re = /^\s*\$(request|response)->with(?:Attribute|Header)\(/m;
    const bad = middlewares(changed).filter((m) => re.test(m.t));
    return bad.length ? fail(`discarded immutable call (must reassign or return): ${bad.map((b) => b.path).join(', ')}`) : ok();
  }),

  check('middleware-thin', 'New middlewares contain no SQL or persistence calls', ({ changed }) => {
    const hits = middlewares(changed);
    if (!hits.length) return fail('no middleware class found');
    const bad = hits.filter((m) => /createCommand|->insert\(|new\s+Query\b|->transaction\(|ActiveRecord/.test(m.t));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('no-with-middlewares', 'No deprecated MiddlewareDispatcher::withMiddlewares() in changed DI config (deprecated since middleware-dispatcher 5.5.0)', ({ changed }) => {
    const bad = php(changed).filter((c) => /^config\/.*\.php$/.test(c.path) && /['"]withMiddlewares\(\)['"]/.test(read(c.abs)));
    return bad.length ? fail(`withMiddlewares() used: ${bad.map((b) => b.path).join(', ')}`) : ok();
  }, { required: false }),

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
