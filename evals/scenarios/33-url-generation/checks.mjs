import { check, ok, fail, read, filesMatching, matchParen } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const actions = (changed) => php(changed).filter((c) => /Action\.php$/.test(c.path));

/** Route constructor segments (paren-matched) in a routes config text, with the closing-paren tail for
 * fluent `->name(...)` calls. Grounded: router 4.0.3 per-verb ctor is (pattern, ?string $name = null, action, ...)
 * — references/router/src/Route/Get.php:28-37 and references/router/src/Route/Post.php — so `name:` is the route
 * naming mechanism; Route::name(string|BackedEnum $name): self — references/router/src/Route.php:211. */
const routeSegments = (text) => {
  const segs = [];
  const re = /new\s+\\?(?:Yiisoft\\Router\\(?:Route\\)?)?(Get|Post|Put|Patch|Delete|Head|Options)\s*\(/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(text, open);
    segs.push({
      verb: m[1],
      seg: text.slice(m.index, close === -1 ? open + 120 : close + 1),
      tail: close === -1 ? '' : text.slice(close + 1, close + 200),
    });
  }
  return segs;
};

const isNamed = ({ seg, tail }) => /\bname\s*:/.test(seg) || /^\s*->\s*name\s*\(/.test(tail);

/** A quoted URL path literal under the blog prefix (e.g. '/posts', '/posts/42', "/posts/42/edit"). */
const HARD_PATH = /['"]\/posts(?:\/[^'"]*)?['"]/;

/** The quoted-concat build `'/posts/' . $id` (a path literal glued to a variable). */
const HARD_CONCAT = /['"]\/posts[^'"]*['"]\s*\.\s*\$/;

/** Redirect Location value passed as a string literal instead of a generated variable. */
const LITERAL_LOCATION = /->\s*with(?:Added)?Header\s*\(\s*(?:Header::LOCATION|['"]Location['"])\s*,\s*['"]/i;

export default [
  // Grounded: UrlGeneratorInterface — references/router/src/UrlGeneratorInterface.php:14; the implementation is
  // bound to the interface by yiisoft/router-fastroute DI (references/router-fastroute/config/di.php:11-12;
  // references/router-fastroute/src/UrlGenerator.php:28), so injecting the interface is the grounded idiom
  // (guide http-routes-url-and-middleware.md §6: "Never hardcode URLs ... Inject Yiisoft\Router\UrlGeneratorInterface").
  check('url-generator-injected', 'Every changed action receives Yiisoft\\Router\\UrlGeneratorInterface through constructor DI, and UrlGenerator is never instantiated directly', ({ changed }) => {
    const acts = actions(changed);
    if (!acts.length) return fail('no changed action file');
    const missing = acts.filter((c) => !/\\?(?:Yiisoft\\Router\\)?UrlGeneratorInterface\s+\$\w+/.test(read(c.abs)));
    if (missing.length) return fail(`changed actions without UrlGeneratorInterface injection: ${missing.map((c) => c.path).join(', ')}`);
    const direct = php(changed).filter((c) => /new\s+\\?(?:Yiisoft\\Router\\(?:FastRoute\\)?)?UrlGenerator\s*\(/.test(read(c.abs)));
    return direct.length
      ? fail(`UrlGenerator instantiated directly (inject the interface instead): ${direct.map((d) => d.path).join(', ')}`)
      : ok(acts.map((a) => a.path).join(', '));
  }),

  // Grounded: generate(string $name, array $arguments = [], array $queryParameters = [], ?string $hash = null): string
  // — references/router/src/UrlGeneratorInterface.php:31-36; named-argument form per guide §6.1 (generate(name: ...)).
  check('generate-called-with-route-name', 'Each changed action builds at least one URL through ->generate(<route-name string>, ...) (positional or name: form)', ({ changed }) => {
    const acts = actions(changed);
    const GENERATE_CALL = /->\s*generate\s*\(\s*(?:name:\s*)?['"]/;
    const missing = acts.filter((c) => !GENERATE_CALL.test(read(c.abs)));
    return missing.length
      ? fail(`no ->generate('route-name', ...) call in: ${missing.map((c) => c.path).join(', ')}`)
      : ok(acts.map((a) => a.path).join(', '));
  }),

  // Grounded: naming via the ctor's second parameter as the `name:` named argument (Get.php:28-37) or the fluent
  // Route::name() (Route.php:211) — both shown by guide §6.4 (lines 283-295).
  check('routes-named', 'Routes in the changed routes config are named (name: named argument inside the route constructor, or a fluent ->name(...) call) - a positional second argument would silently become the route name on router 4.0.3', ({ changed }) => {
    const routes = changed.filter((c) => /^config\/.*routes.*\.php$/.test(c.path)).map((c) => read(c.abs)).join('\n');
    if (!routes) return fail('no routes config file changed');
    if (/Route::(get|post|put|delete|patch|options)\s*\(|Group::create\s*\(/.test(routes)) return fail('legacy static router API used');
    const segs = routeSegments(routes);
    if (segs.length < 2) return fail('fewer than two route definitions found in the changed config');
    const unnamed = segs.filter((s) => !isNamed(s));
    return unnamed.length
      ? fail(`unnamed routes: ${unnamed.map((u) => u.seg.replace(/\s+/g, ' ').slice(0, 60)).join(' | ')}`)
      : ok(`${segs.length} route(s) named`);
  }),

  // Dir-wide over src/ + views/ (not only changed files): a work dir that leaves the fixture views untouched keeps
  // its hardcoded links, and that must fail. Scoped to src/ + views/ so the route patterns in config/ are never hit.
  check('no-hardcoded-urls', 'No hardcoded "/posts..." URL literals or quoted-concat URL builds remain under src/ or views/ - links come from the URL generator', ({ dir }) => {
    const files = filesMatching(dir, /^(src|views)\/.*\.php$/);
    const bad = files.filter((p) => HARD_PATH.test(read(p)) || HARD_CONCAT.test(read(p)));
    return bad.length
      ? fail(`hardcoded URLs still present in: ${bad.join(', ')}`)
      : ok();
  }),

  // Grounded: 302 Status::FOUND / 303 Status::SEE_OTHER redirect + Header::LOCATION — references/http/src/Status.php:142,
  // references/http/src/Header.php:410; PRG redirect idiom as in exemplar 23's positive sample.
  check('redirect-uses-generated', 'The post-edit redirect responds 302/303 with a Location header whose value is variable-sourced (the generated URL), not a string literal or path concat', ({ changed }) => {
    const redirecting = actions(changed).filter((c) => {
      const t = read(c.abs);
      return /Status::(?:FOUND|SEE_OTHER)|\b30[23]\b/.test(t) && /Header::LOCATION|['"]Location['"]/.test(t);
    });
    if (!redirecting.length) return fail('no redirect (302/303 + Location) found in changed actions');
    const literal = redirecting.filter((c) => LITERAL_LOCATION.test(read(c.abs)));
    return literal.length
      ? fail(`Location header value is a hardcoded literal in: ${literal.map((l) => l.path).join(', ')}`)
      : ok(redirecting.map((r) => r.path).join(', '));
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

  check('transcript-mentions-named-routes', 'The transcript reports naming the routes and generating URLs from the route names', ({ transcript }) => {
    return /(url\s*generator|UrlGeneratorInterface|named\s+routes?)/i.test(transcript)
      ? ok()
      : fail('transcript does not mention named routes / the URL generator');
  }),
];
