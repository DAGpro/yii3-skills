import { check, ok, fail, read, matchParen } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\/.*\.php$/.test(c.path));

/** Changed classes under src/ that declare an __invoke() entry point (name-agnostic). */
const invokable = (changed) =>
  srcPhp(changed)
    .map((c) => ({ path: c.path, t: read(c.abs) }))
    .filter((f) => /public\s+function\s+__invoke\s*\(/.test(f.t));

/**
 * For each __invoke() occurrence: does it declare a strict Psr\Http\Message\ResponseInterface
 * return type? Uses matchParen so multi-line params, defaults and parameter attributes work.
 * Rejects unions (`ResponseInterface|array`), nullables (`?ResponseInterface`) and bare types
 * (`array`, `string`, `void`, `mixed`) because the closing char after the type must be `{` or `;`.
 */
const invokeReturns = (t) => {
  const re = /public\s+function\s+__invoke\s*\(/g;
  const out = [];
  let m;
  while ((m = re.exec(t)) !== null) {
    const close = matchParen(t, re.lastIndex - 1);
    if (close === -1) { out.push(false); continue; }
    const after = t.slice(close + 1, close + 160);
    out.push(/^\s*:\s*\\?(?:Psr\\Http\\Message\\)?ResponseInterface\s*(?:\{|;)/.test(after));
  }
  return out;
};

/** Route/query args must come from CurrentRoute, not superglobals or raw request attributes (guide §3.1, matrix §4). */
const RAW_ROUTE_ARG_RE = /\$_GET|\$_POST|\$_REQUEST|->\s*getAttribute\(\s*['"]id['"]/;

/**
 * Output statements only - NOT the bare words inside strings or comments:
 * `echo $x;`, `print($x);`, `die;`, `exit('...');`, `var_dump($x);`, `print_r($x);`.
 * Anchored to statement boundaries (line start or `;`/`{`/`}`) and followed by an expression;
 * `print_r`/`ExitCode::OK`-style identifiers do not match the print/exit branches.
 */
const OUTPUT_STATEMENT_RE = /(?:^|[;{}])\s*echo\s+\S|(?:^|[;{}])\s*print\s+\S|(?:^|[;{}])\s*(?:die|exit)\s*(?:\(|;|\?)|\b(?:var_dump|print_r)\s*\(/m;

/** The root-namespace data-response factory is @deprecated; only ResponseFactory\ is current (guide §3.4, matrix §4). */
const LEGACY_DATA_FACTORY_RE = /use\s+Yiisoft\\DataResponse\\DataResponseFactoryInterface\s*;|\\Yiisoft\\DataResponse\\DataResponseFactoryInterface\b/;

/** Direct PSR-7 response instantiation (`new Response(...)`, `new JsonResponse(...)`) instead of an injected factory. */
const RAW_RESPONSE_RE = /\bnew\s+[\w\\]*\\?Response\b\s*\(/;

export default [
  check('action-class-shape', 'The endpoint handler is a `final readonly class` with a single __invoke() entry and no actionX()-style methods (matrix §4: no SiteController-style classes)', ({ changed }) => {
    const hits = invokable(changed);
    if (!hits.length) return fail('no changed class under src/ declares public function __invoke()');
    const notFinalReadonly = hits.filter(({ t }) => !/\b(?:final\s+readonly|readonly\s+final)\s+class\s+\w+/.test(t));
    if (notFinalReadonly.length) return fail(`__invoke() class is not final readonly: ${notFinalReadonly.map((h) => h.path).join(', ')}`);
    const multiEntry = hits.filter(({ t }) => /\bpublic\s+function\s+action[A-Z]/.test(t));
    if (multiEntry.length) return fail(`actionX()-style methods next to __invoke(): ${multiEntry.map((h) => h.path).join(', ')}`);
    return ok(hits.map((h) => h.path).join(', '));
  }),

  check('response-interface-return', 'Every __invoke() declares a strict Psr\\Http\\Message\\ResponseInterface return type (never array/string/void/nullable/union)', ({ changed }) => {
    const hits = invokable(changed);
    if (!hits.length) return fail('no changed class under src/ declares public function __invoke()');
    const bad = hits.filter(({ t }) => {
      const rs = invokeReturns(t);
      return rs.length === 0 || rs.some((strict) => !strict);
    });
    return bad.length ? fail(`__invoke() without a strict ResponseInterface return type: ${bad.map((b) => b.path).join(', ')}`) : ok(hits.map((h) => h.path).join(', '));
  }),

  check('route-args-via-currentroute', 'The {id} route argument is read via Yiisoft\\Router\\CurrentRoute::getArgument() - never $_GET/$_POST/$_REQUEST or $request->getAttribute(\'id\') (guide §3.1, matrix §4)', ({ changed }) => {
    const src = srcPhp(changed);
    if (!src.length) return fail('no PHP files changed under src/');
    const raw = src.filter((c) => RAW_ROUTE_ARG_RE.test(read(c.abs)));
    if (raw.length) return fail(`raw route/query argument access instead of CurrentRoute: ${raw.map((c) => c.path).join(', ')}`);
    const viaRoute = src.filter((c) => {
      const t = read(c.abs);
      return /\bCurrentRoute\b/.test(t) && /->\s*getArgument\s*\(\s*['"][A-Za-z_][\w-]*['"]/.test(t);
    });
    return viaRoute.length ? ok(viaRoute.map((c) => c.path).join(', ')) : fail('no CurrentRoute::getArgument(\'...\') usage in changed src/ files');
  }),

  check('no-echo-output', 'No direct output statements (echo/print/die/exit/var_dump/print_r) in changed PHP - SKILL.md bans table row 10: return a PSR-7 ResponseInterface instead', ({ changed }) => {
    const bad = php(changed).filter((c) => OUTPUT_STATEMENT_RE.test(read(c.abs)));
    return bad.length ? fail(`output statements used: ${bad.map((b) => b.path).join(', ')}`) : ok();
  }),

  check('response-via-factory', 'Responses are built via an injected response factory (DataResponseFactoryInterface / ResponseFactoryInterface createResponse()) - not `new Response(...)`, not the deprecated root-namespace Yiisoft\\DataResponse\\DataResponseFactoryInterface (guide §3.4, matrix §4)', ({ changed }) => {
    const src = srcPhp(changed);
    if (!src.length) return fail('no PHP files changed under src/');
    const legacy = src.filter((c) => LEGACY_DATA_FACTORY_RE.test(read(c.abs)));
    if (legacy.length) return fail(`deprecated Yiisoft\\DataResponse\\DataResponseFactoryInterface used (inject Yiisoft\\DataResponse\\ResponseFactory\\DataResponseFactoryInterface): ${legacy.map((c) => c.path).join(', ')}`);
    const raw = src.filter((c) => RAW_RESPONSE_RE.test(read(c.abs)));
    if (raw.length) return fail(`PSR-7 response instantiated directly instead of via factory: ${raw.map((c) => c.path).join(', ')}`);
    const viaFactory = src.filter((c) => {
      const t = read(c.abs);
      return /\bResponseFactory(?:Interface)?\b/.test(t) && /->\s*createResponse\s*\(/.test(t);
    });
    return viaFactory.length ? ok(viaFactory.map((c) => c.path).join(', ')) : fail('no response built via an injected factory createResponse()');
  }),

  check('route-added', 'GET /posts/{id}/related declared via new Route\\Get(...) in a changed routes config (legacy Route::get()/Group::create() banned - deprecated in router 4.0.3)', ({ changed }) => {
    const routes = changed.filter((c) => /^config\/.*routes.*\.php$/.test(c.path)).map((c) => read(c.abs)).join('\n');
    if (!routes) return fail('no routes config file changed');
    if (/Route::(get|post|put|delete|patch)\s*\(|Group::create\s*\(/.test(routes)) return fail('legacy static router API used');
    return /new\s+\\?(?:Yiisoft\\Router\\Route\\)?Get\s*\(\s*['"][^'"]*posts\/\{[^'"]*related[^'"]*['"]/.test(routes)
      ? ok()
      : fail("no new Get('/posts/{id}/related')");
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
