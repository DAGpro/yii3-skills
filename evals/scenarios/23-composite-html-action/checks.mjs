import { check, ok, fail, read, matchParen } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\/.*\.php$/.test(c.path));
const actions = (changed) => php(changed).filter((c) => /Action\.php$/.test(c.path));
const configPhp = (changed) => php(changed).filter((c) => /^config\//.test(c.path));
const joinedSrc = (changed) => srcPhp(changed).map((c) => read(c.abs)).join('\n');

/** Route constructor segments (paren-matched) in a routes config text, with the HTTP verb(s).
 * Recognizes both grounded forms: per-verb `new Get/Post` classes and the multi-method
 * `new Route($pattern, [Method::GET, Method::POST])` (guide: http-routes-definition.md). */
const routeSegments = (text) => {
  const segs = [];
  const re = /new\s+\\?(?:Yiisoft\\Router\\(?:Route\\)?)?(Route|Get|Post)\s*\(/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(text, open);
    const seg = text.slice(m.index, close === -1 ? open + 120 : close + 1);
    const hasGet = /\bMethod::GET\b|['"]GET['"]/.test(seg);
    const hasPost = /\bMethod::POST\b|['"]POST['"]/.test(seg);
    const verb = m[1] === 'Route' ? (hasGet && hasPost ? 'GetPost' : `Route:${hasGet ? 'GET' : hasPost ? 'POST' : '?'}`) : m[1];
    segs.push({
      verb,
      seg,
      tail: close === -1 ? '' : text.slice(close + 1, close + 120),
    });
  }
  return segs;
};

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

/** Added view templates: under views/ or typed as Yiisoft\View\WebView in the docblock (short or FQ). */
const templates = (changed) =>
  php(changed)
    .filter((c) => c.added)
    .filter((c) => /^views\/.*\.php$/.test(c.path) || /@var\s+(?:\\?Yiisoft\\View\\)?WebView\s+\$this/.test(read(c.abs)));

export default [
  // Concern 1: entity absence -> idiomatic 404 (guides sanction Status::NOT_FOUND responses; no HTTP NotFoundHttpException exists in the grounded packages).
  // A dedicated not-found handler/view carrying the 404 status is an accepted delegation.
  check('not-found-404', 'The edit action handles the missing-post path with a 404 response: Status::NOT_FOUND / 404 in a null-find branch of a changed *Action.php, or in a dedicated not-found handler/view it delegates to', ({ changed }) => {
    const actionHits = actions(changed).filter((c) => /Status::NOT_FOUND|\b404\b/.test(read(c.abs)));
    if (actionHits.length) return ok(actionHits.map((h) => h.path).join(', '));
    const dedicated = php(changed).filter((c) => /not-?found|404/i.test(c.path) && /Status::NOT_FOUND|\b404\b/.test(read(c.abs)));
    return dedicated.length
      ? ok(`via dedicated handler: ${dedicated.map((h) => h.path).join(', ')}`)
      : fail('no Status::NOT_FOUND / 404 in changed actions nor a dedicated not-found handler - the null-find path is not handled idiomatically');
  }),

  // Concern 2a: view rendering via the grounded renderer (both grounded names: ViewRenderer and WebViewRenderer, references/yii-view-renderer/src)
  check('view-renderer-used', 'The edit action renders through the injected view renderer (Yiisoft\\Yii\\View\\Renderer\\ViewRenderer / WebViewRenderer -> render()) - not Yii2-style $this->render()', ({ changed }) => {
    const hits = actions(changed).filter((c) => {
      const t = read(c.abs);
      return /(?:Yiisoft\\Yii\\View\\Renderer\\)?(?:Web)?ViewRenderer\s+\$\w+/.test(t) && /->\s*render(?:Partial)?\s*\(/.test(t);
    });
    if (!hits.length) {
      const legacy = actions(changed).filter((c) => /\$this->render\s*\(/.test(read(c.abs)));
      return legacy.length
        ? fail(`Yii2-style \$this->render() in action: ${legacy.map((b) => b.path).join(', ')}`)
        : fail('no changed action injects the view renderer (ViewRenderer/WebViewRenderer) and calls ->render()');
    }
    const legacy = hits.filter((c) => /\$this->render\s*\(/.test(read(c.abs)));
    return legacy.length
      ? fail(`Yii2-style \$this->render() alongside the renderer: ${legacy.map((b) => b.path).join(', ')}`)
      : ok(hits.map((h) => h.path).join(', '));
  }),

  // Concern 2b: template escaping (fully static templates with no dynamic output are exempt)
  check('view-template-escapes', 'The added view template(s) escape dynamic output with Html::encode()/Html::encodeAttribute() and contain no bare variable echoes (<?= $var ?>); templates without any dynamic output are exempt', ({ changed }) => {
    const tpl = templates(changed);
    if (!tpl.length) return fail('no added view template found (expected under views/ or WebView-typed)');
    const dynamic = tpl.filter((c) => /<\?=\s*\$|echo\s+\$/.test(read(c.abs)));
    const noEscape = dynamic.filter((c) => !/Html::\s*(?:encode|encodeAttribute)\s*\(/.test(read(c.abs)));
    if (noEscape.length) return fail(`template with dynamic output but without Html::encode(): ${noEscape.map((b) => b.path).join(', ')}`);
    // $content is the trusted rendered-view slot in layouts (guide §5.1) - exempt; only lone variables are flagged.
    const bare = tpl.filter((c) => /<\?=\s*\$(?!content\b)\w+\s*\?>/.test(read(c.abs)));
    return bare.length
      ? fail(`raw variable echo (must go through Html::encode()): ${bare.map((b) => b.path).join(', ')}`)
      : ok(tpl.map((h) => h.path).join(', '));
  }),

  // Concern 3a: form model added
  check('form-model-added', 'A FormModel subclass (Yiisoft\\FormModel\\FormModel) is added with validator rule attributes (#[Required]/#[Length]/#[Validate]/...)', ({ changed }) => {
    const models = srcPhp(changed)
      .map((c) => ({ path: c.path, t: read(c.abs) }))
      .filter(({ t }) => /extends\s+\\?(?:Yiisoft\\FormModel\\)?FormModel\b/.test(t));
    if (!models.length) return fail('no new class extends Yiisoft\\FormModel\\FormModel');
    const withRules = models.filter(({ t }) => /#\[(?:Required|Length|Email|File|Image|Validate|HasLength|Integer|Number|BooleanValue|Count|InEnum)\b/.test(t));
    return withRules.length
      ? ok(withRules.map((v) => v.path).join(', '))
      : fail(`FormModel subclass without validator rule attributes: ${models.map((m) => m.path).join(', ')}`);
  }),

  // Concern 3b: FormHydrator used, no raw body digging
  check('form-hydrator-used', 'FormHydrator is injected into the action and populate*/validate is called on it (grounded: FormHydrator::populateFromPostAndValidate(FormModelInterface, ServerRequestInterface, ...): bool); no raw getParsedBody()/$_POST/$_GET digging in actions', ({ changed }) => {
    const hydratorActions = actions(changed).filter((c) => /(?:Yiisoft\\FormModel\\)?FormHydrator\s+\$\w+/.test(read(c.abs)));
    if (!hydratorActions.length) return fail('no changed action injects FormHydrator');
    const used = hydratorActions.filter((c) => /->\s*populate(?:FromPost)?(?:AndValidate)?\s*\(|->\s*validate\s*\(/.test(read(c.abs)));
    if (!used.length) return fail('FormHydrator injected but populateFromPostAndValidate()/populate() never called');
    const raw = actions(changed).filter((c) => /getParsedBody\s*\(|\$_POST|\$_GET/.test(read(c.abs)));
    return raw.length
      ? fail(`raw body digging in action (form hydration belongs to FormHydrator): ${raw.map((b) => b.path).join(', ')}`)
      : ok(used.map((h) => h.path).join(', '));
  }),

  // Concern 4a: upload consumed and persisted
  check('file-upload-stored', 'The uploaded cover is consumed as a PSR-7 UploadedFileInterface (getUploadedFiles() or #[UploadedFiles]) and persisted with ->moveTo()', ({ changed }) => {
    const t = joinedSrc(changed);
    if (!/UploadedFileInterface/.test(t)) return fail('no UploadedFileInterface usage in changed src files');
    if (!/getUploadedFiles\s*\(|#\[\s*\\?(?:Yiisoft\\Input\\Http\\Attribute\\Parameter\\)?UploadedFiles\b/.test(t)) {
      return fail('uploaded files never read (no getUploadedFiles() / #[UploadedFiles])');
    }
    return /->\s*moveTo\s*\(/.test(t)
      ? ok()
      : fail('UploadedFileInterface read but never persisted with ->moveTo()');
  }),

  // Concern 4b: grounded directory helper + no client-filename move target
  check('file-helper-dir', 'Storage directory prepared via the grounded yiisoft/files helper (FileHelper::ensureDirectory()/normalizePath()) and the client-supplied filename is never the moveTo() target', ({ changed }) => {
    const t = joinedSrc(changed);
    if (/moveTo\s*\(\s*\$\w+->getClientFilename\s*\(\s*\)\s*\)/.test(t)) {
      return fail('moveTo() targets the client-supplied getClientFilename() - generate a server-side name');
    }
    return /FileHelper::\s*(?:ensureDirectory|normalizePath)\s*\(/.test(t)
      ? ok()
      : fail('no FileHelper::ensureDirectory()/normalizePath() in changed src files');
  }),

  // Concern 5a: flash via FlashInterface
  check('flash-via-interface', 'Success flash is handled through an injected Yiisoft\\Session\\Flash\\FlashInterface (->add()/->set())', ({ changed }) => {
    const files = srcPhp(changed)
      .map((c) => ({ path: c.path, t: read(c.abs) }))
      .filter(({ t }) => /\b(?:Yiisoft\\Session\\Flash\\)?FlashInterface\s+\$\w+/.test(t));
    if (!files.length) return fail('no FlashInterface injection in changed src files');
    const used = files.filter(({ t }) => /->\s*(?:add|set)\s*\(/.test(t));
    return used.length
      ? ok(used.map((u) => u.path).join(', '))
      : fail(`FlashInterface injected but ->add()/->set() never called: ${files.map((f) => f.path).join(', ')}`);
  }),

  // Concern 5b: the banned Yii2-style flash (SKILL ban row 12) - the negative sample's failure mode
  check('no-session-flash-methods', 'No Yii2-style flash on a session object (->setFlash()/->getFlash()/->flash()) anywhere in changed PHP - inject FlashInterface instead', ({ changed }) => {
    const re = /->\s*setFlash\s*\(|->\s*getFlash\s*\(|->\s*flash\s*\(/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length
      ? fail(`session-object flash methods used: ${bad.map((b) => b.path).join(', ')}`)
      : ok();
  }),

  // Concern 6: middleware ordering (deterministic slice over the middlewareDefinitions list)
  check('middleware-order-session-csrf', 'In the global middleware stack (middlewareDefinitions slice), SessionMiddleware is listed before CsrfTokenMiddleware and both before Router (first-listed = outermost; the synchronizer CSRF token lives in the session)', ({ changed }) => {
    for (const c of configPhp(changed)) {
      const t = read(c.abs);
      if (!/middlewareDefinitions/.test(t) || !/CsrfTokenMiddleware/.test(t)) continue;
      // Comments inside the list mention middleware names too - strip them before order matching.
      const slice = middlewareSlice(t).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      const session = slice.indexOf('SessionMiddleware');
      const csrf = slice.indexOf('CsrfTokenMiddleware');
      const router = slice.indexOf('Router');
      if (session === -1) return fail('SessionMiddleware is missing from the middlewareDefinitions list');
      if (csrf === -1) return fail('CsrfTokenMiddleware is missing from the middlewareDefinitions list');
      if (router === -1) return fail('Router is missing from the middlewareDefinitions list');
      return session < csrf && csrf < router
        ? ok(`${c.path}: SessionMiddleware -> CsrfTokenMiddleware -> Router`)
        : fail(`in ${c.path} the order must be SessionMiddleware -> CsrfTokenMiddleware -> Router (first-listed = outermost), found session@${session}, csrf@${csrf}, router@${router}`);
    }
    return fail('no changed middleware stack config containing CsrfTokenMiddleware to order-check');
  }),

  // Shared: route wiring (GET+POST pair, named action: argument, no legacy API)
  check('route-added', 'GET and POST routes for the edit path declared via the grounded router 4.0.3 forms - per-verb new Route\\Get + new Route\\Post, or the multi-method new Route(pattern, [Method::GET, Method::POST]) - with the action bound (named action: argument or ->action(...); on Get/Post the constructor is (pattern, ?string $name = null, action, ...) so a positional second argument silently becomes the route NAME)', ({ changed }) => {
    const routes = changed.filter((c) => /^config\/.*routes.*\.php$/.test(c.path)).map((c) => read(c.abs)).join('\n');
    if (!routes) return fail('no changed routes config file');
    if (/Route::(get|post|put|delete|patch|options)\s*\(|Group::create\s*\(/.test(routes)) return fail('legacy static router API used (deprecated since router 4.0.3)');
    const editSegs = routeSegments(routes).filter(({ seg }) => /['"][^'"]*edit[^'"]*['"]/.test(seg));
    const gets = editSegs.filter(({ verb }) => verb === 'Get' || verb === 'GetPost');
    const posts = editSegs.filter(({ verb }) => verb === 'Post' || verb === 'GetPost');
    if (!gets.length) return fail('no new Get(...) route for the edit path');
    if (!posts.length) return fail('no new Post(...) route for the edit path');
    for (const { seg, tail, verb } of editSegs) {
      // The silent-name trap is specific to Get/Post: on their constructor the second
      // positional argument is ?string $name. On the base Route it is the methods array.
      if (verb !== 'GetPost' && /\(\s*['"][^'"]*['"]\s*,\s*\\?[A-Z]/.test(seg)) {
        return fail(`positional action argument silently becomes the route NAME on router 4.0.3 - use the named action: argument: ${seg.replace(/\s+/g, ' ').slice(0, 80)}`);
      }
      // Fluent chains may be wrapped in parens: (new Route(...))->action(...) - allow only
      // closing parens/whitespace between the constructor call and the ->action( call.
      if (!/\baction\s*:/.test(seg) && !/^[)\s]*->\s*action\s*\(/.test(tail)) {
        return fail(`edit route without an action binding (action: ... or ->action(...)): ${seg.replace(/\s+/g, ' ').slice(0, 80)}`);
      }
    }
    const pair = editSegs.find(({ verb }) => verb === 'GetPost');
    return ok(pair
      ? `multi-method edit route with action bound (${pair.seg.replace(/\s+/g, ' ').slice(0, 60)}...)`
      : `${gets.length} GET + ${posts.length} POST edit route(s) with action bound`);
  }),

  // Shared: PRG redirect after successful POST
  check('redirect-after-post', 'After a successful POST the action redirects: 303 (Status::SEE_OTHER) or 302 (Status::FOUND) response with a Location header (guide PRG idiom)', ({ changed }) => {
    const hits = actions(changed).filter((c) => {
      const t = read(c.abs);
      return /Status::(?:SEE_OTHER|FOUND)|\b30[23]\b/.test(t)
        && /Header::LOCATION|->\s*withHeader\s*\(\s*['"]Location['"]/i.test(t);
    });
    return hits.length
      ? ok(hits.map((h) => h.path).join(', '))
      : fail('no redirect (303/302 + Location) found in changed actions');
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
