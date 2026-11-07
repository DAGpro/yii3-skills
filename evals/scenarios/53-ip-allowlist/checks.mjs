import { check, ok, fail, read, filesMatching, matchParen } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\/.*\.php$/.test(c.path));

const composerFiles = (dir) => filesMatching(dir, /(^|\/)composer\.json$/);
const routeFiles = (dir) => filesMatching(dir, /^config\/.*routes[^/]*\.php$/);
const appPipelineFiles = (dir) => filesMatching(dir, /^config\/(?:web|common)\/di\/application\.php$/);

const OFFICE_SUBNET = '203.0.113.0/24';

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
const routeDecls = (text) => {
  const decls = [];
  const re = /new\s+\\?(?:Yiisoft\\Router\\(?:Route\\)?)?(?:Get|Post)\s*\(/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(text, open);
    decls.push({
      seg: text.slice(m.index, close === -1 ? open + 120 : close + 1),
      start: m.index,
      bodyStart: close === -1 ? open : close + 1,
    });
  }
  return decls;
};

/** Hand-rolled client IP handling that belongs to the grounded package, not to app code. */
const HAND_ROLLED_IP =
  /\$_SERVER\s*\[\s*['"]REMOTE_ADDR['"]|str(?:pos|starts_with|contains)\s*\([^;]*203\.0\.113|preg_match\s*\([^;]*203\.0\.113|getenv\s*\(\s*['"]REMOTE_ADDR/i;

export default [
  // Grounded: references/network-utilities/composer.json:2 ("yiisoft/network-utilities"); guide §3.
  check('package-required', 'composer.json requires yiisoft/network-utilities - the CIDR subnet math comes from this package', ({ dir }) => {
    const hits = composerFiles(dir).filter((f) => /["']yiisoft\/network-utilities["']\s*:/.test(read(f)));
    return hits.length
      ? ok(hits.join(', '))
      : fail('no composer.json requires yiisoft/network-utilities');
  }),

  // PSR-15 contract: process(ServerRequestInterface, RequestHandlerInterface): ResponseInterface.
  check('middleware-added', 'A changed src/ class implements PSR-15 MiddlewareInterface with the grounded process() signature (ServerRequestInterface + RequestHandlerInterface -> ResponseInterface)', ({ changed }) => {
    const hits = srcPhp(changed).filter((c) => {
      const t = read(c.abs);
      return /\bimplements\s+[^;{]*\bMiddlewareInterface\b/.test(t) &&
        /public\s+function\s+process\s*\([^)]*RequestHandlerInterface[^)]*\)\s*:\s*[^{;]*ResponseInterface/s.test(t);
    });
    return hits.length
      ? ok(hits.map((h) => h.path).join(', '))
      : fail('no changed src/ class implements MiddlewareInterface with a process(ServerRequestInterface, RequestHandlerInterface): ResponseInterface signature');
  }),

  // Grounded CIDR API: references/network-utilities/src/IpHelper.php:130 (inRange(string $subnet, string $range): bool)
  // and references/network-utilities/src/IpRanges.php:126 (isAllowed(string $ip): bool); guide §3.1/§3.3.
  check('middleware-uses-package', 'The middleware uses the grounded network-utilities API: Yiisoft\\NetworkUtilities\\IpHelper::inRange() or IpRanges (import + method call)', ({ changed }) => {
    const hits = srcPhp(changed).filter((c) => {
      const t = read(c.abs);
      const imported = /use\s+Yiisoft\\NetworkUtilities\\(?:IpHelper|IpRanges)\s*;/.test(t);
      const called = /IpHelper::inRange\s*\(|new\s+(?:\\?(?:Yiisoft\\NetworkUtilities\\)?)IpRanges\s*\(|->\s*isAllowed\s*\(/.test(t);
      return imported && called;
    });
    return hits.length
      ? ok(hits.map((h) => h.path).join(', '))
      : fail('no changed src/ file both imports Yiisoft\\NetworkUtilities\\IpHelper|IpRanges and calls the grounded CIDR/allowlist method');
  }),

  // The office subnet must live in config params, not inside the guard class.
  check('subnet-from-params', `${OFFICE_SUBNET} is configured in a changed config file and is not hardcoded inside the middleware class`, ({ changed }) => {
    const configHit = changed.filter((c) => /^config\/.*\.php$/.test(c.path) && read(c.abs).includes(OFFICE_SUBNET));
    if (!configHit.length) return fail(`no changed config file contains the office subnet ${OFFICE_SUBNET}`);
    const hardcoded = srcPhp(changed).filter((c) => read(c.abs).includes('203.0.113'));
    return hardcoded.length
      ? fail(`subnet hardcoded in src code instead of config: ${hardcoded.map((h) => h.path).join(', ')}`)
      : ok(configHit.map((h) => h.path).join(', '));
  }),

  // Grounded: references/http/src/Status.php:213 (public const FORBIDDEN = 403).
  check('forbidden-on-mismatch', 'The middleware answers 403 (Status::FORBIDDEN or withStatus(403)) for clients outside the allowlist instead of letting the request through', ({ changed }) => {
    const hits = srcPhp(changed).filter((c) => {
      if (!/\bMiddlewareInterface\b/.test(read(c.abs))) return false;
      return /Status::FORBIDDEN\b|->withStatus\s*\(\s*403\s*\)|createResponse\s*\([^;)]*\b403\b/.test(read(c.abs));
    });
    return hits.length
      ? ok(hits.map((h) => h.path).join(', '))
      : fail('no middleware class answers 403/Status::FORBIDDEN on the not-allowed path');
  }),

  // The guard must actually be attached in front of the /admin routes (group, per-route, or global pipeline).
  check('admin-routes-guarded', 'The allowlist middleware is attached to the admin routes (route/group ->middleware(...) or the global Application pipeline) - not merely created or imported', ({ dir, changed }) => {
    const custom = changedMiddlewareClasses(changed);
    const isGuardAttach = (seg) =>
      [...seg.matchAll(/([A-Za-z_][\w\\]*)::class/g)].some((m) => custom.has(m[1].replace(/^\\/, '').split('\\').pop()));

    for (const f of routeFiles(dir)) {
      for (const seg of middlewareSegments(read(f))) {
        if (isGuardAttach(seg)) return ok(`allowlist middleware attached in ${f}`);
      }
    }
    for (const f of appPipelineFiles(dir)) {
      const body = middlewareDefinitionsBody(read(f));
      if (body !== null && isGuardAttach(body)) return ok(`allowlist middleware registered in the global pipeline (${f})`);
    }
    return fail('no allowlist middleware attached to the /admin routes or the global pipeline - requests still reach the actions unguarded');
  }),

  // The package exists precisely so app code does not hand-roll IP handling (guide §3 anti-pattern table).
  check('no-hand-rolled-ip-parsing', 'No hand-rolled client IP handling in changed src code ($_SERVER[REMOTE_ADDR] reads, string-prefix comparisons against the office subnet) - containment math belongs to network-utilities', ({ changed }) => {
    const bad = srcPhp(changed).filter((c) => HAND_ROLLED_IP.test(read(c.abs)));
    return bad.length
      ? fail(`hand-rolled IP handling in changed src files: ${bad.map((b) => b.path).join(', ')}`)
      : ok();
  }),

  // Router 4.0.3: 2nd positional ctor arg of Get/Post is the route NAME, not the handler.
  check('routes-named-action', 'Changed routes keep the grounded router 4.0.3 form: no legacy static API and every new Get/Post binds its handler via the named action: argument or ->action() (a positional second argument silently becomes the route NAME)', ({ changed }) => {
    const files = php(changed).filter((c) => /^config\/.*routes.*\.php$/.test(c.path));
    if (!files.length) return ok('routes not touched by the agent');
    for (const c of files) {
      const t = read(c.abs);
      if (/Route::(get|post|put|delete|patch|options)\s*\(|Group::create\s*\(/.test(t)) {
        return fail(`legacy static router API used in ${c.path} (deprecated since router 4.0.3)`);
      }
      const decls = routeDecls(t);
      for (let i = 0; i < decls.length; i++) {
        const d = decls[i];
        if (/\(\s*['"][^'"]*['"]\s*,\s*\\?[A-Z]/.test(d.seg)) {
          return fail(`positional action argument silently becomes the route NAME on router 4.0.3 - use the named action: argument in ${c.path}: ${d.seg.replace(/\s+/g, ' ').slice(0, 80)}`);
        }
        const nextStart = i + 1 < decls.length ? decls[i + 1].start : Math.min(d.bodyStart + 400, t.length);
        const bound = /\baction\s*:/.test(d.seg) || /->\s*action\s*\(/.test(t.slice(d.bodyStart, nextStart));
        if (!bound) {
          return fail(`route without an action binding (action: ... or ->action(...)) in ${c.path}: ${d.seg.replace(/\s+/g, ' ').slice(0, 80)}`);
        }
      }
    }
    return ok(files.map((f) => f.path).join(', '));
  }),

  check('no-yii2', 'No Yii2 constructs (Yii::$app, \\Yii::, yii\\ root namespace) in changed PHP files', ({ changed }) => {
    const re = /Yii::\$app|\\Yii::|\buse\s+yii\\/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('strict-types', 'declare(strict_types=1) present in every changed PHP file', ({ changed }) => {
    const bad = php(changed).filter((c) => !/declare\(strict_types=1\);/.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('transcript-mentions', 'The transcript reports the admin allowlist work (subnet, allowlist, office network or the CIDR range)', ({ transcript }) =>
    /subnet|allowlist|203\.0\.113|office|cidr/i.test(transcript) ? ok() : fail('transcript does not mention the admin subnet/allowlist work')),
];
