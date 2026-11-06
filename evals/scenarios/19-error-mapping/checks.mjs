import { check, ok, fail, read } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const config = (changed) => php(changed).filter((c) => /^config\//.test(c.path));

/** The exceptionMap key for the fixture domain exception (short imported name or fully-qualified). */
const MAP_KEY = /(?:\\?\w+\\)*EmailAlreadySubscribedException(?:::class|['"])\s*=>/;
const STATUS_409 = /Status::CONFLICT|\b409\b/;
const PIPELINE_FILE = /middlewareDefinitions|MiddlewareDispatcher/;
const DEBUG_LEAK = /getTraceAsString\(\)|->getTrace\(\)|var_dump\(|print_r\(|debug_zval_dump\(|phpinfo\(/;

/** Slice of the middlewareDefinitions array body (bracket-matched), where list order = pipeline order. */
const middlewareSlice = (text) => {
  const k = text.indexOf('middlewareDefinitions');
  if (k === -1) return '';
  const open = text.indexOf('[', k);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']' && --depth === 0) return text.slice(open, i);
  }
  return text.slice(open);
};

export default [
  check('exception-map-registered', 'A changed config file defines ExceptionResponder with the domain exception as an exceptionMap key', ({ changed }) => {
    const hit = config(changed).filter((c) => {
      const t = read(c.abs);
      return /ExceptionResponder::class/.test(t) && MAP_KEY.test(t);
    });
    return hit.length ? ok(hit.map((h) => h.path).join(', ')) : fail('no changed config file registers EmailAlreadySubscribedException in the ExceptionResponder exceptionMap');
  }),

  check('map-target-409', 'The mapped response status is 409 / Status::CONFLICT (client error), not 500', ({ changed }) => {
    const hit = php(changed).filter((c) => STATUS_409.test(read(c.abs)));
    return hit.length ? ok(hit.map((h) => h.path).join(', ')) : fail('no 409 / Status::CONFLICT found in changed PHP files');
  }),

  check('exception-responder-in-pipeline', 'ExceptionResponder::class is added to the global middleware pipeline (config with middlewareDefinitions/MiddlewareDispatcher)', ({ changed }) => {
    const hit = config(changed).filter((c) => {
      const t = read(c.abs);
      return PIPELINE_FILE.test(t) && /ExceptionResponder::class/.test(t);
    });
    return hit.length ? ok(hit.map((h) => h.path).join(', ')) : fail('ExceptionResponder::class not found in any changed middleware pipeline config');
  }),

  check('middleware-order-error-catcher-first', 'In the middleware list ErrorCatcher::class comes before ExceptionResponder::class (first-listed = outermost, so the responder sits inside the catcher)', ({ changed }) => {
    for (const c of config(changed)) {
      const t = read(c.abs);
      if (!PIPELINE_FILE.test(t) || !/ExceptionResponder::class/.test(t)) continue;
      const slice = middlewareSlice(t);
      const catcher = slice.indexOf('ErrorCatcher');
      const responder = slice.indexOf('ExceptionResponder');
      if (catcher === -1) return fail('ErrorCatcher::class is missing from the middlewareDefinitions list');
      if (responder === -1) return fail('ExceptionResponder::class is missing from the middlewareDefinitions list');
      return catcher < responder
        ? ok(`${c.path}: ErrorCatcher (outermost) -> ExceptionResponder`)
        : fail(`in ${c.path} ExceptionResponder must be listed after ErrorCatcher (first-listed = outermost)`);
    }
    return fail('no changed pipeline config with ExceptionResponder to order-check');
  }),

  check('problem-details-json-body', 'Mapped body is ProblemDetails JSON: type, title, status, detail members present plus a JSON/problem+json content type', ({ changed }) => {
    const joined = php(changed).map((c) => read(c.abs)).join('\n');
    const missing = ['type', 'title', 'status', 'detail'].filter((k) => !new RegExp(`['"]${k}['"]\\s*=>`).test(joined));
    if (missing.length) return fail(`missing ProblemDetails member(s): ${missing.join(', ')}`);
    return /application\/problem\+json|application\/json/.test(joined) ? ok() : fail('no application/problem+json (or application/json) content type');
  }),

  check('no-debug-leak', 'No stack-trace or debug output markers in changed PHP files (error bodies must not leak internals)', ({ changed }) => {
    const bad = php(changed).filter((c) => DEBUG_LEAK.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
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
