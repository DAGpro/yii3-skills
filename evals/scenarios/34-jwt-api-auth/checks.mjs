import { check, ok, fail, read, filesMatching, matchParen } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\/.*\.php$/.test(c.path));

const configPhp = (dir) => filesMatching(dir, /^config\/.*\.php$/);
const routeFiles = (dir) => filesMatching(dir, /^config\/.*routes[^/]*\.php$/);
const appPipelineFiles = (dir) => filesMatching(dir, /^config\/(?:web|common)\/di\/application\.php$/);
const paramsFiles = (dir) => filesMatching(dir, /^config\/.*params[^/]*\.php$/);

/** Segments of every `->middleware(...)` / `->prependMiddleware(...)` attach call in a config text (paren-matched). */
const middlewareSegments = (text) => {
  const segs = [];
  const re = /->\s*(?:prepend)?middleware\s*\(/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(text, open);
    segs.push(close === -1 ? text.slice(open + 1, open + 200) : text.slice(open + 1, close));
  }
  return segs;
};

/** Index of the closing bracket for an opening one at openIdx (heuristic: strings/comments ignored). */
const matchBracket = (text, openIdx) => {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']' && --depth === 0) return i;
  }
  return -1;
};

/** The middlewareDefinitions array body of an Application dispatcher wiring, if present. */
const middlewareDefinitionsBody = (text) => {
  const key = 'middlewareDefinitions';
  const idx = text.indexOf(key);
  if (idx === -1) return null;
  const open = text.indexOf('[', idx + key.length);
  if (open === -1) return null;
  const close = matchBracket(text, open);
  return close === -1 ? null : text.slice(open, close);
};

/** Changed src classes implementing PSR-15 MiddlewareInterface (import + short implements, or FQCN). */
const changedMiddlewareClasses = (changed) =>
  new Set(
    srcPhp(changed)
      .map((c) => read(c.abs).match(/class\s+(\w+)[^{;]*implements\s+[^;{]*\bMiddlewareInterface\b/)?.[1])
      .filter(Boolean),
  );

/** Route constructor segments (paren-matched) in a routes config text. */
const routeSegments = (text) => {
  const segs = [];
  const re = /new\s+\\?(?:Yiisoft\\Router\\(?:Route\\)?)?(?:Get|Post)\s*\(/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(text, open);
    segs.push(text.slice(m.index, close === -1 ? open + 120 : close + 1));
  }
  return segs;
};

/** Hand-rolled token handling that belongs to the authenticator method, not to an action. */
const MANUAL_TOKEN_PARSING =
  /getHeaderLine\s*\(\s*['"]Authorization|str_starts_with\s*\(\s*['"]Bearer|\$_SERVER\[\s*['"]HTTP_AUTHORIZATION|apache_request_headers\s*\(/i;

export default [
  check('jwt-method-wired', 'The JwtMethod authenticator (yiisoft/auth-jwt) is referenced in config/ - the JWT method must be defined, not hand-rolled', ({ dir }) => {
    const hits = configPhp(dir).filter((f) => /\bJwtMethod\b/.test(read(f)));
    return hits.length ? ok(hits.join(', ')) : fail('no JwtMethod reference under config/ - token authentication is not wired');
  }),

  check('authenticator-wired', 'AuthenticatorInterface (or AuthenticatorWithChallengeInterface) is bound to JwtMethod in the same DI config file', ({ dir }) => {
    const hits = configPhp(dir).filter((f) => {
      const t = read(f);
      return /\bAuthenticator(?:WithChallenge)?Interface::class\b/.test(t) && /\bJwtMethod\b/.test(t);
    });
    return hits.length
      ? ok(hits.join(', '))
      : fail('no config file binds AuthenticatorInterface/AuthenticatorWithChallengeInterface to JwtMethod - the authentication middleware has no authenticator to delegate to');
  }),

  check('jwt-params-secret', "The 'yiisoft/auth-jwt' params group configures algorithms and key.secret (HS256 key material from config/params)", ({ dir }) => {
    const hit = paramsFiles(dir).find((f) => {
      const t = read(f);
      return /['"]yiisoft\/auth-jwt['"]\s*=>/.test(t) && /['"]algorithms['"]\s*=>/.test(t) && /['"]secret['"]\s*=>/.test(t);
    });
    return hit
      ? ok(hit)
      : fail("no config params file declares the 'yiisoft/auth-jwt' group with 'algorithms' and 'secret' entries");
  }),

  check('auth-on-api-routes', 'An authentication middleware is attached to the API routes (group/route ->middleware(...) or the global Application pipeline) - not merely created or imported', ({ dir, changed }) => {
    const custom = changedMiddlewareClasses(changed);
    const isAuthAttach = (seg) =>
      /\bAuthentication\b/.test(seg) ||
      [...seg.matchAll(/([A-Za-z_][\w\\]*)::class/g)].some((m) => custom.has(m[1].replace(/^\\/, '').split('\\').pop()));

    for (const f of routeFiles(dir)) {
      for (const seg of middlewareSegments(read(f))) {
        if (isAuthAttach(seg)) return ok(`authentication middleware attached in ${f}`);
      }
    }
    for (const f of appPipelineFiles(dir)) {
      const body = middlewareDefinitionsBody(read(f));
      if (body !== null && isAuthAttach(body)) return ok(`authentication middleware registered in the global pipeline (${f})`);
    }
    return fail('no authentication middleware attached to the /api routes or the global pipeline - requests still reach the actions unauthenticated');
  }),

  check('no-manual-token-parsing', 'No hand-rolled Authorization-header parsing in changed src code - token extraction and verification belong to the JwtMethod authenticator', ({ changed }) => {
    const bad = srcPhp(changed).filter((c) => MANUAL_TOKEN_PARSING.test(read(c.abs)));
    return bad.length
      ? fail(`manual token handling in changed src files: ${bad.map((b) => b.path).join(', ')}`)
      : ok();
  }),

  check('routes-named-action', 'Changed routes keep the grounded router 4.0.3 form: no legacy static API and every new Get/Post binds the handler via the named action: argument (a positional second argument silently becomes the route NAME)', ({ changed }) => {
    const files = php(changed).filter((c) => /^config\/.*routes.*\.php$/.test(c.path));
    if (!files.length) return ok('routes not touched by the agent');
    for (const c of files) {
      const t = read(c.abs);
      if (/Route::(get|post|put|delete|patch|options)\s*\(|Group::create\s*\(/.test(t)) {
        return fail(`legacy static router API used in ${c.path} (deprecated since router 4.0.3)`);
      }
      for (const seg of routeSegments(t)) {
        if (/\(\s*['"][^'"]*['"]\s*,\s*\\?[A-Z]/.test(seg)) {
          return fail(`positional action argument silently becomes the route NAME on router 4.0.3 - use the named action: argument in ${c.path}: ${seg.replace(/\s+/g, ' ').slice(0, 80)}`);
        }
        if (!/\baction\s*:/.test(seg)) {
          return fail(`route without an action binding (action: ...) in ${c.path}: ${seg.replace(/\s+/g, ' ').slice(0, 80)}`);
        }
      }
    }
    return ok(files.map((f) => f.path).join(', '));
  }),

  check('no-yii2', 'No Yii2 constructs in changed PHP files (Yii::$app, \\Yii::, use yii\\, #[Override], ActiveForm, session flash methods)', ({ changed }) => {
    const re = /Yii::\$app|\\Yii::|\buse\s+yii\\|#\[Override\]|ActiveForm::begin|->setFlash\s*\(|->getFlash\s*\(/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('strict-types', 'declare(strict_types=1) in every added PHP file', ({ changed }) => {
    const bad = php(changed).filter((c) => c.added && !/declare\(strict_types=1\);/.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('transcript-mentions-jwt', 'The final answer mentions the JWT/bearer authentication and the 401 rejection', ({ transcript }) =>
    /jwt|bearer|401/i.test(transcript)
      ? ok()
      : fail('transcript does not mention JWT/bearer authentication or the 401 rejection')),
];
