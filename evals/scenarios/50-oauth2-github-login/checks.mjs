import { check, ok, fail, read } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\/.*\.php$/.test(c.path));
const configPhp = (changed) => php(changed).filter((c) => /^config\//.test(c.path));
const routesFiles = (changed) => configPhp(changed).filter((c) => /routes[a-z0-9./-]*\.php$/.test(c.path));

/** Params files that declare the package params block. */
const authParamsFiles = (changed) =>
  configPhp(changed).filter((c) => /params[a-z0-9./-]*\.php$/.test(c.path) && /['"]yiisoft\/yii-auth-client['"]/.test(read(c.abs)));

/** Route constructor segments (paren-matched) for Get/Post objects, with the text right after them. */
const routeSegments = (text) => {
  const segs = [];
  const re = /new\s+\\?(?:Yiisoft\\Router\\(?:Route\\)?)?(?:Get|Post)\s*\(/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let close = -1;
    for (let i = open; i < text.length; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')' && --depth === 0) { close = i; break; }
    }
    segs.push({
      seg: text.slice(m.index, close === -1 ? open + 120 : close + 1),
      tail: close === -1 ? '' : text.slice(close + 1, close + 40),
    });
  }
  return segs;
};

/** Every changed text that registers routes (config routes files, fluent chain included). */
const routesText = (changed) => routesFiles(changed).map((c) => read(c.abs)).join('\n');

/** A changed route registration that binds the auth flow: AuthAction, or an action whose class
 *  appears in changed src and drives the flow through Collection::getClient(). */
const authRouteBindings = (changed) => {
  const text = routesText(changed);
  if (!text) return [];
  const bindings = [];
  if (/AuthAction::class/.test(text)) bindings.push('AuthAction::class');
  const actionClasses = [...text.matchAll(/action:\s*\\?([\w\\]+)::class/g)].map((m) => m[1].split('\\').pop());
  for (const cls of actionClasses) {
    const usesCollection = srcPhp(changed).some((c) => {
      const t = read(c.abs);
      return new RegExp(`\\bclass\\s+${cls}\\b`).test(t)
        && (/Yiisoft\\Yii\\AuthClient\\Collection|->\s*getClient\s*\(/.test(t));
    });
    if (usesCollection) bindings.push(cls);
  }
  return bindings;
};

export default [
  // Concern 1: the provider client is configured where the package reads it (params -> CollectionFactory)
  check('oauth-clients-params', 'A params config file defines the yiisoft/yii-auth-client clients block with a github entry carrying the class, clientId, clientSecret and oauth2ReturnUrl keys (exact key names: CollectionFactory maps every key to a set*() method - setClientId/setClientSecret/setOauth2ReturnUrl on OAuth2)', ({ changed }) => {
    const files = authParamsFiles(changed);
    if (!files.length) return fail('no params config file declares the yiisoft/yii-auth-client block');
    for (const f of files) {
      const t = read(f.abs);
      const block = t.slice(t.indexOf("'yiisoft/yii-auth-client'") === -1 ? t.indexOf('"yiisoft/yii-auth-client"') : t.indexOf("'yiisoft/yii-auth-client'"));
      const has = (re) => re.test(block);
      if (has(/['"]clients['"]/) && has(/['"]github['"]/) && has(/['"]class['"]/) && has(/['"]clientId['"]/) && has(/['"]clientSecret['"]/) && has(/['"]oauth2ReturnUrl['"]/)) {
        return ok(`${f.path}: github client configured with class/clientId/clientSecret/oauth2ReturnUrl`);
      }
    }
    return fail(`the yiisoft/yii-auth-client params block in [${files.map((f) => f.path).join(', ')}] misses one of: clients / github / class / clientId / clientSecret / oauth2ReturnUrl`);
  }),

  // Concern 2: the client registry is actually used - Collection injected in DI or getClient() in app code
  check('collection-used', 'The auth flow resolves clients through Yiisoft\\Yii\\AuthClient\\Collection: it is injected as a dependency in a DI definition or referenced in config, or app code calls ->getClient() on it (Collection::getClient(string $name): OAuth2Interface)', ({ changed }) => {
    const inDi = configPhp(changed).filter((c) => /di[a-z0-9./-]*\.php$/.test(c.path) && /Yiisoft\\Yii\\AuthClient\\Collection|Collection::class/.test(read(c.abs)));
    if (inDi.length) return ok(`Collection referenced in ${inDi.map((c) => c.path).join(', ')}`);
    const inSrc = srcPhp(changed).filter((c) => /->\s*getClient\s*\(/.test(read(c.abs)));
    return inSrc.length
      ? ok(`->getClient() called in ${inSrc.map((c) => c.path).join(', ')}`)
      : fail('no DI definition injects Collection and no src file calls ->getClient() - the oauth client registry is unused');
  }),

  // Concern 3: the auth entry/callback route is registered (guide-taught AuthAction idiom or a Collection-driven action)
  check('oauth-route-added', 'A route for the oauth flow is registered in a routes config file: bound to AuthAction::class (the guide-taught PSR-15 middleware) or to a changed action class that drives the flow through Collection/getClient(); no legacy static router API; on Get/Post the second positional ctor argument is the route NAME - the handler must be bound via the named action: argument', ({ changed }) => {
    const text = routesText(changed);
    if (!text) return fail('no changed routes config - the auth route was not registered');
    if (/Route::(get|post|put|delete|patch|options)\s*\(/.test(text)) {
      return fail('legacy static router API used (deprecated since router 4.0.3)');
    }
    const bindings = authRouteBindings(changed);
    if (!bindings.length) return fail('no route is bound to AuthAction::class or to a changed Collection-driven action');
    for (const { seg } of routeSegments(text)) {
      if (/auth/i.test(seg) && /\(\s*['"][^'"]*['"]\s*,\s*\\?[A-Z]/.test(seg)) {
        return fail(`positional action argument silently becomes the route NAME on router 4.0.3 - use the named action: argument: ${seg.replace(/\s+/g, ' ').slice(0, 80)}`);
      }
    }
    return ok(`route bound via: ${bindings.join(', ')}`);
  }),

  // Concern 4: the route carries the {authclient} argument AuthAction reads via CurrentRoute
  check('authclient-route-argument', 'The auth route pattern carries the {authclient} placeholder - AuthAction reads the provider name exclusively from the route argument via CurrentRoute, never from the query string or body', ({ changed }) => {
    const text = routesText(changed);
    if (!text) return fail('no changed routes config');
    const hit = text.match(/['"]\/[\w/.-]*\{authclient\}['"]/);
    return hit
      ? ok(hit[0])
      : fail("no route pattern contains {authclient} - the provider name must come from the route argument, e.g. '/auth/{authclient}'");
  }),

  // Concern 5: the fatal-crash gotcha - success/cancel URLs configured on the AuthAction definition
  check('auth-action-urls-configured', 'The AuthAction DI definition configures ->withSuccessUrl() and ->withCancelUrl() (or returns a ResponseInterface from callbacks) - without them PHP 8.2 throws "Typed property ...::$successUrl must not be accessed before initialization" when a callback returns void', ({ changed }) => {
    const defs = configPhp(changed).filter((c) => /AuthAction::class/.test(read(c.abs)));
    if (!defs.length) return fail('no DI definition for AuthAction was added');
    const good = defs.filter((c) => {
      const t = read(c.abs);
      return /->\s*withSuccessUrl\s*\(/.test(t) && /->\s*withCancelUrl\s*\(/.test(t);
    });
    return good.length
      ? ok(good.map((c) => c.path).join(', '))
      : fail(`AuthAction defined in [${defs.map((d) => d.path).join(', ')}] but withSuccessUrl()/withCancelUrl() are not configured - a void callback crashes on the uninitialized typed property`);
  }),

  // Concern 6: after the callback the user is logged in through the existing session flow
  check('login-via-session-flow', 'The success path logs the user in through the session flow: a changed src class injects CurrentUser (or the auth flow DI references it) and calls CurrentUser::login(IdentityInterface): bool', ({ changed }) => {
    const hits = srcPhp(changed).filter((c) => {
      const t = read(c.abs);
      return /(?:Yiisoft\\User\\)?CurrentUser\s+\$\w+/.test(t) && /->\s*login\s*\(/.test(t);
    });
    return hits.length
      ? ok(hits.map((h) => h.path).join(', '))
      : fail('no changed src class injects CurrentUser and calls ->login() - the provider identity is never logged into the session');
  }),

  // Concern 7: the banned hand-rolled plumbing (provider URLs and token exchange belong to the package)
  check('no-hand-rolled-oauth', 'No hand-rolled OAuth plumbing in changed files: no literal github.com/login/oauth URL (auth/token URLs are owned by the GitHub client class) and no curl_* token exchange (the OAuth2 client exchanges the code via the PSR-18 client)', ({ changed }) => {
    const re = /github\.com\/login\/oauth|curl_init|curl_exec|curl_setopt/;
    const bad = changed.filter((c) => re.test(read(c.abs)));
    return bad.length
      ? fail(`provider URLs / token exchange hand-rolled instead of using the package client: ${bad.map((b) => b.path).join(', ')}`)
      : ok();
  }),

  check('no-yii2', 'No Yii2 constructs or #[Override] in changed PHP files', ({ changed }) => {
    const re = /Yii::\$app|\buse\s+yii\\|#\[Override\]|ActiveForm::begin/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('strict-types', 'declare(strict_types=1) in every added PHP file', ({ changed }) => {
    const bad = php(changed).filter((c) => c.added && !/declare\(strict_types=1\);/.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('transcript-mentions-flow', 'The final answer mentions the oauth flow pieces: oauth, github and callback', ({ transcript }) =>
    /oauth/i.test(transcript) && /github/i.test(transcript) && /callback/i.test(transcript)
      ? ok()
      : fail('transcript does not mention oauth + github + callback')),
];
