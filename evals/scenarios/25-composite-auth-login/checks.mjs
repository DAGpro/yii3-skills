import { check, ok, fail, read, matchParen } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\/.*\.php$/.test(c.path));
const actions = (changed) => php(changed).filter((c) => /Action\.php$/.test(c.path));
const configPhp = (changed) => php(changed).filter((c) => /^config\//.test(c.path));

const POPULATE_CALL = /->\s*populate(?:FromPost)?(?:AndValidate)?\s*\(|->\s*validate\s*\(/;
const VERIFY_CALL = /->\s*verifyPassword\s*\(|password_verify\s*\(/;
const FIND_BY_LOGIN = /->\s*findByLogin\s*\(/;
const LOGIN_CALL = /->\s*login\s*\(/;
const FLASH_INJECTED = /\b(?:Yiisoft\\Session\\Flash\\)?FlashInterface\s+\$\w+/;
const SESSION_IDENTITY_WRITE = /->\s*set\s*\(\s*['"]identity['"]|\$_SESSION\s*\[\s*['"](?:identity|user)['"]\s*\]\s*=/;

/** Route constructor segments (paren-matched) in a routes config text, with the HTTP verb(s). */
const routeSegments = (text) => {
  const segs = [];
  const re = /new\s+\\?(?:Yiisoft\\Router\\(?:Route\\)?)?Post\s*\(/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(text, open);
    segs.push({
      seg: text.slice(m.index, close === -1 ? open + 120 : close + 1),
      tail: close === -1 ? '' : text.slice(close + 1, close + 40),
    });
  }
  return segs;
};

export default [
  // Concern 1: the POST /login endpoint is registered (router 4.0.3 named action: form)
  check('post-route-added', 'A POST /login route is declared via new Route\\Post(...) with the handler bound through the named action: argument (on Get/Post the positional second ctor argument is the route NAME, not the action); no legacy static router API', ({ changed }) => {
    const routes = configPhp(changed).filter((c) => /routes.*\.php$/.test(c.path));
    if (!routes.length) return fail('no changed routes config - the POST /login route was not registered');
    const text = routes.map((c) => read(c.abs)).join('\n');
    if (/Route::(get|post|put|delete|patch|options)\s*\(|Group::create\s*\(/.test(text)) {
      return fail('legacy static router API used (deprecated since router 4.0.3)');
    }
    const loginPosts = routeSegments(text).filter(({ seg }) => /['"][^'"]*login[^'"]*['"]/.test(seg));
    if (!loginPosts.length) return fail('no new Post(...) route for /login');
    for (const { seg, tail } of loginPosts) {
      if (/\(\s*['"][^'"]*['"]\s*,\s*\\?[A-Z]/.test(seg)) {
        return fail(`positional action argument silently becomes the route NAME on router 4.0.3 - use the named action: argument: ${seg.replace(/\s+/g, ' ').slice(0, 80)}`);
      }
      if (!/\baction\s*:/.test(seg) && !/^\s*->\s*action\s*\(/.test(tail)) {
        return fail(`POST /login route without an action binding (action: ... or ->action(...)): ${seg.replace(/\s+/g, ' ').slice(0, 80)}`);
      }
    }
    return ok(loginPosts.map(({ seg }) => seg.replace(/\s+/g, ' ').slice(0, 60)).join(', '));
  }),

  // Concern 2: constructor DI, no manual service construction
  check('di-injected-not-newed', 'The login action receives FormHydrator + CurrentUser + FlashInterface via constructor DI; FormHydrator/CurrentUser/Flash/Session are never constructed with new in changed src files', ({ changed }) => {
    const injected = actions(changed).filter((c) => {
      const t = read(c.abs);
      return /(?:Yiisoft\\FormModel\\)?FormHydrator\s+\$\w+/.test(t)
        && /(?:Yiisoft\\User\\)?CurrentUser\s+\$\w+/.test(t)
        && FLASH_INJECTED.test(t);
    });
    if (!injected.length) {
      return fail('no changed action injects FormHydrator + CurrentUser + FlashInterface together via the constructor');
    }
    const newed = srcPhp(changed).filter((c) => /new\s+\\?(?:Yiisoft\\FormModel\\)?FormHydrator\s*\(|new\s+\\?(?:Yiisoft\\User\\)?CurrentUser\s*\(|new\s+\\?(?:Yiisoft\\Session\\(?:Flash\\)?)?(?:Flash|Session)\s*\(/.test(read(c.abs)));
    return newed.length
      ? fail(`services constructed manually instead of injected: ${newed.map((n) => n.path).join(', ')}`)
      : ok(injected.map((h) => h.path).join(', '));
  }),

  // Concern 3: form hydration, no raw body digging
  check('form-hydration-used', 'POST data goes through FormHydrator::populateFromPostAndValidate(FormModelInterface, ServerRequestInterface, ...): bool; no raw getParsedBody()/$_POST/$_GET digging in changed actions', ({ changed }) => {
    const hydratorActions = actions(changed).filter((c) => /(?:Yiisoft\\FormModel\\)?FormHydrator\s+\$\w+/.test(read(c.abs)));
    if (!hydratorActions.length) return fail('no changed action injects FormHydrator');
    const used = hydratorActions.filter((c) => POPULATE_CALL.test(read(c.abs)));
    if (!used.length) return fail('FormHydrator injected but populateFromPostAndValidate()/populate() never called');
    const raw = actions(changed).filter((c) => /getParsedBody\s*\(|\$_POST|\$_GET/.test(read(c.abs)));
    return raw.length
      ? fail(`raw body digging in action (form hydration belongs to FormHydrator): ${raw.map((b) => b.path).join(', ')}`)
      : ok(used.map((h) => h.path).join(', '));
  }),

  // Concern 4: untrusted input is validated before it ever reaches password verification
  check('validation-before-verify', 'Form validation runs BEFORE credential verification (populate/validate call position precedes verifyPassword()/password_verify() in the changed file) - no unvalidated input reaches password_verify()', ({ changed }) => {
    const verifyFiles = srcPhp(changed).filter((c) => VERIFY_CALL.test(read(c.abs)));
    if (!verifyFiles.length) return fail('credentials are never verified (no User::verifyPassword()/password_verify() in changed src files)');
    const bad = [];
    const good = [];
    for (const c of verifyFiles) {
      const t = read(c.abs);
      const verifyIdx = t.search(VERIFY_CALL);
      const populateIdx = t.search(POPULATE_CALL);
      if (populateIdx === -1) bad.push(`${c.path}: password verified without any form validation call in the same flow`);
      else if (populateIdx > verifyIdx) bad.push(`${c.path}: password verified before form validation`);
      else good.push(c.path);
    }
    return bad.length ? fail(bad.join('; ')) : ok(good.join(', '));
  }),

  // Concern 5: session login through the service, never raw session writes
  check('login-via-service', 'The identity obtained from the repository (->findByLogin()) is logged in via CurrentUser::login(IdentityInterface): bool - identity is never written directly into the session (SessionInterface::set(\'identity\', ...) / $_SESSION)', ({ changed }) => {
    const src = srcPhp(changed);
    const viaRepo = src.filter((c) => FIND_BY_LOGIN.test(read(c.abs)));
    if (!viaRepo.length) return fail('no ->findByLogin() call - the identity must come from the repository');
    const loginCall = src.filter((c) => LOGIN_CALL.test(read(c.abs)));
    if (!loginCall.length) return fail('CurrentUser::login() never called - the user is not logged in through the service');
    const rawWrite = src.filter((c) => SESSION_IDENTITY_WRITE.test(read(c.abs)));
    return rawWrite.length
      ? fail(`identity written directly into the session (bypasses CurrentUser::login and session regeneration): ${rawWrite.map((w) => w.path).join(', ')}`)
      : ok(loginCall.map((l) => l.path).join(', '));
  }),

  // Concern 6a: flash through the interface (same pair as scenario 23)
  check('flash-via-interface', 'Flash messages are handled through an injected Yiisoft\\Session\\Flash\\FlashInterface (->add()/->set())', ({ changed }) => {
    const files = srcPhp(changed)
      .map((c) => ({ path: c.path, t: read(c.abs) }))
      .filter(({ t }) => FLASH_INJECTED.test(t));
    if (!files.length) return fail('no FlashInterface injection in changed src files');
    const used = files.filter(({ t }) => /->\s*(?:add|set)\s*\(/.test(t));
    return used.length
      ? ok(used.map((u) => u.path).join(', '))
      : fail(`FlashInterface injected but ->add()/->set() never called: ${files.map((f) => f.path).join(', ')}`);
  }),

  // Concern 6b: the banned Yii2-style flash (SKILL ban row 12) - the negative sample's failure mode
  check('no-session-flash-methods', 'No Yii2-style flash on a session object (->setFlash()/->getFlash()/->flash()/->set(\'flash...\')) anywhere in changed PHP - inject FlashInterface instead', ({ changed }) => {
    const re = /->\s*setFlash\s*\(|->\s*getFlash\s*\(|->\s*flash\s*\(|->\s*set\s*\(\s*['"]flash['"]/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length
      ? fail(`session-object flash methods used: ${bad.map((b) => b.path).join(', ')}`)
      : ok();
  }),

  // Concern 7: success path is a PRG redirect
  check('redirect-on-success', 'After a successful login the action redirects: 302 (Status::FOUND) or 303 (Status::SEE_OTHER) response with a Location header - never a 200 HTML body', ({ changed }) => {
    const hits = actions(changed).filter((c) => {
      const t = read(c.abs);
      return /Status::(?:SEE_OTHER|FOUND)|\b30[23]\b/.test(t)
        && /Header::LOCATION|->\s*withHeader\s*\(\s*['"]Location['"]/i.test(t);
    });
    return hits.length
      ? ok(hits.map((h) => h.path).join(', '))
      : fail('no redirect (302/303 + Location) found in changed actions - the success path must redirect to /dashboard');
  }),

  // Concern 8: failure paths answer 422
  check('failure-422', 'Validation failures and wrong credentials answer 422 (Status::UNPROCESSABLE_ENTITY) - not 200, not 401, not 500', ({ changed }) => {
    const hits = actions(changed).filter((c) => /Status::UNPROCESSABLE_ENTITY|\b422\b/.test(read(c.abs)));
    return hits.length
      ? ok(hits.map((h) => h.path).join(', '))
      : fail('no Status::UNPROCESSABLE_ENTITY / 422 in changed actions - failure paths must re-render with 422');
  }),

  // Concern 9: rendering through the grounded renderer, consistent with the fixture actions
  check('view-render-idiom', 'The form is (re-)rendered through the injected WebViewRenderer (Yiisoft\\Yii\\View\\Renderer\\WebViewRenderer::render()) - not Yii2-style $this->render()', ({ changed }) => {
    const hits = actions(changed).filter((c) => {
      const t = read(c.abs);
      return /(?:Yiisoft\\Yii\\View\\Renderer\\)?WebViewRenderer\s+\$\w+/.test(t) && /->\s*render(?:Partial)?\s*\(/.test(t);
    });
    if (!hits.length) {
      const legacy = actions(changed).filter((c) => /\$this->render\s*\(/.test(read(c.abs)));
      return legacy.length
        ? fail(`Yii2-style \$this->render() in action: ${legacy.map((b) => b.path).join(', ')}`)
        : fail('no changed action injects WebViewRenderer and calls ->render()');
    }
    const legacy = hits.filter((c) => /\$this->render\s*\(/.test(read(c.abs)));
    return legacy.length
      ? fail(`Yii2-style \$this->render() alongside the renderer: ${legacy.map((b) => b.path).join(', ')}`)
      : ok(hits.map((h) => h.path).join(', '));
  }),

  check('no-yii2', 'No Yii2 constructs or #[Override] in changed PHP files', ({ changed }) => {
    const re = /Yii::\$app|\\Yii::|\buse\s+yii\\|#\[Override\]|ActiveForm::begin/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('strict-types', 'declare(strict_types=1) in every added PHP file', ({ changed }) => {
    const bad = php(changed).filter((c) => c.added && !/declare\(strict_types=1\);/.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('transcript-mentions-flow', 'The final answer mentions the login flow pieces: login, flash and redirect', ({ transcript }) =>
    /login/i.test(transcript) && /flash/i.test(transcript) && /redirect/i.test(transcript)
      ? ok()
      : fail('transcript does not mention login + flash + redirect')),

  check('tests-added', 'Tests added (tests/**Test.php)', ({ changed }) =>
    changed.some((c) => c.added && /^tests\/.*Test\.php$/.test(c.path)) ? ok() : fail('no tests'), { required: false }),
];
