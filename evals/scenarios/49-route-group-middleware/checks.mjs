import { check, ok, fail, read, matchParen } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const routesFiles = (changed) => php(changed).filter((c) => /^config\/.*routes.*\.php$/.test(c.path));

// Fixture-provided tokens the task explicitly asks to regroup/attach (not agent-invented names).
const MIDDLEWARE = 'AdminAuthMiddleware';
const ADMIN_ACTIONS = ['AdminUserListAction', 'AdminUserViewAction', 'AdminUserDeleteAction', 'AdminSettingsAction'];
const API_ACTION = 'ApiUsersAction';

/** Route constructor segments (paren-matched) in a routes config text, with the text right after
 * the closing paren (closing parens of a wrapping expression skipped), so both grounded action
 * bindings are recognized: the named `action:` argument and a chained ->action(...)
 * (scenario 23/24 helper approach). */
const routeSegments = (text) => {
  const segs = [];
  const re = /new\s+\\?(?:Yiisoft\\Router\\(?:Route\\)?)?(?:Get|Post)\s*\(/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(text, open);
    segs.push({
      seg: text.slice(m.index, close === -1 ? open + 120 : close + 1),
      tail: close === -1 ? '' : text.slice(close + 1, close + 120).replace(/^[\s)]*/, ''),
    });
  }
  return segs;
};

/** Group definition statements: `new Group(` (grounded ctor: ?string $prefix, array $routes,
 * array $middlewares, ... — references/router/src/Group.php:46-54) or the deprecated
 * `Group::create(` factory. Returns the ctor paren span plus every chained ->method(...) call
 * span; skipping the closing parens of a wrapping expression keeps
 * `(new Group('/admin'))->middleware(...)->routes(...)` whole. */
const groupStatements = (text) => {
  const stmts = [];
  const re = /(?:new\s+\\?(?:Yiisoft\\Router\\)?Group|\\?(?:Yiisoft\\Router\\)?Group::create)\s*\(/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const isCreate = /::create/.test(m[0]);
    const ctorOpen = text.indexOf('(', m.index);
    const ctorClose = matchParen(text, ctorOpen);
    if (ctorClose === -1) continue;
    const calls = [];
    let cursor = ctorClose + 1;
    for (;;) {
      const skipped = /^[\s)]+/.exec(text.slice(cursor));
      if (skipped) cursor += skipped[0].length;
      const chain = /^->\s*(\w+)\s*\(/.exec(text.slice(cursor));
      if (!chain) break;
      const open = cursor + chain[0].length - 1;
      const close = matchParen(text, open);
      if (close === -1) break;
      calls.push({ name: chain[1], open, close });
      cursor = close + 1;
    }
    stmts.push({
      isCreate,
      ctorSeg: text.slice(ctorOpen, ctorClose + 1),
      calls,
    });
  }
  return stmts;
};

/** Admin-prefixed groups. */
const adminGroups = (text) => groupStatements(text).filter((s) => /['"]\/admin['"]/.test(s.ctorSeg));

/** Where member routes may legitimately live: the ctor routes slot (only for `new Group(`, whose
 * 2nd ctor parameter is $routes) and chained ->routes(...) calls. For the deprecated
 * Group::create() factory — signature (?string $prefix) only — extra arguments are silently
 * discarded (guide anti-pattern matrix), so its ctor span never counts as a member zone. */
const memberText = (text, stmt) => {
  const zones = stmt.calls.filter((c) => c.name === 'routes').map((c) => text.slice(c.open, c.close + 1));
  if (!stmt.isCreate) zones.push(stmt.ctorSeg);
  return zones.join('\n');
};

/** Group-level middleware attach: the `middlewares:` ctor argument (grounded: Group::__construct(...,
 * array $middlewares, ...) — Group.php:49) or a chained ->middleware()/->prependMiddleware() call
 * directly on the group (grounded: Group::middleware(array|callable|string ...$definition): self —
 * Group.php:102, ::prependMiddleware() — Group.php:119) — never a member route's own chain. */
const hasGroupMiddleware = (text, stmt, name) => {
  const token = `${name}::class`;
  if (/\bmiddlewares\s*:/.test(stmt.ctorSeg) && stmt.ctorSeg.includes(token)) return true;
  return stmt.calls
    .filter((c) => /^(?:prepend)?middleware$/.test(c.name))
    .some((c) => text.slice(c.open, c.close + 1).includes(token));
};

export default [
  // Grounded: Group::__construct(?string $prefix, array $routes, ...) — references/router/src/Group.php:46;
  // guide http-routes-definition.md §3.1: "Group::create() is deprecated. Always instantiate groups
  // directly with new Group(...)".
  check('group-created', 'An admin group is created with the grounded `new Group(\'/admin\', ...)` form (the deprecated Group::create() factory does not count)', ({ changed }) => {
    const files = routesFiles(changed);
    if (!files.length) return fail('routes config not touched');
    for (const c of files) {
      if (adminGroups(read(c.abs)).some((s) => !s.isCreate)) return ok('new Group(\'/admin\', ...) found');
    }
    return fail('no `new Group(` with the /admin prefix in the changed routes config');
  }),

  // Grounded: Group::middleware(array|callable|string ...$definition): self — references/router/src/Group.php:102;
  // ctor 3rd parameter $middlewares — Group.php:49; guide §3.1/§3.2 attach middleware on the group.
  check('group-middleware-attached', 'AdminAuthMiddleware is attached at the GROUP level (->middleware(...) chained on the group, or the middlewares: constructor argument) — not on a single member route', ({ changed }) => {
    const files = routesFiles(changed);
    if (!files.length) return fail('routes config not touched');
    for (const c of files) {
      const t = read(c.abs);
      const wired = adminGroups(t).some((s) => !s.isCreate && hasGroupMiddleware(t, s, MIDDLEWARE));
      if (wired) return ok(`${MIDDLEWARE} attached to the /admin group`);
    }
    return fail(`${MIDDLEWARE} is not attached at the group level (or the group uses the deprecated factory)`);
  }),

  check('all-admin-routes-grouped', 'All four admin routes are members of the /admin group (each fixture action ::class inside the group ctor/routes zones) and no member route pattern duplicates the /admin prefix', ({ changed }) => {
    const files = routesFiles(changed);
    if (!files.length) return fail('routes config not touched');
    for (const c of files) {
      const t = read(c.abs);
      const groups = adminGroups(t).filter((s) => !s.isCreate);
      if (!groups.length) continue;
      const member = groups.map((s) => memberText(t, s)).join('\n');
      const missing = ADMIN_ACTIONS.filter((a) => !new RegExp(`\\b${a}::class`).test(member));
      if (missing.length) return fail(`admin routes still outside the group: ${missing.join(', ')}`);
      const doublePrefixed = routeSegments(member).filter(({ seg }) => {
        const p = seg.match(/\(\s*(['"])(.*?)\1/);
        return p !== null && /^\/admin(\/|$)/.test(p[2]);
      });
      if (doublePrefixed.length) {
        return fail(`member route patterns repeat the /admin prefix (the group already adds it): ${doublePrefixed.map((d) => d.seg.replace(/\s+/g, ' ').slice(0, 60)).join(' | ')}`);
      }
      return ok('all four admin actions are group members with prefix-relative patterns');
    }
    return fail('no changed routes config with a `new Group(`/admin group');
  }),

  // Deprecated legacy factory: "@deprecated Use new Group() instead." — references/router/src/Group.php:69-71;
  // guide §9 anti-pattern matrix row "Deprecated Group::create('/...')" and §3.1.
  check('no-deprecated-group-create', 'No deprecated Group::create() in the changed routes config (deprecated factory; its extra arguments are silently discarded)', ({ changed }) => {
    const bad = routesFiles(changed).filter((c) => /(?:\\?Yiisoft\\Router\\)?Group::create\s*\(/.test(read(c.abs)));
    return bad.length ? fail(`Group::create() used: ${bad.map((b) => b.path).join(', ')}`) : ok();
  }),

  check('api-routes-untouched', 'The public API route stays registered outside the admin group (ApiUsersAction still present and not a group member)', ({ changed }) => {
    const files = routesFiles(changed);
    if (!files.length) return fail('routes config not touched - the admin routes were never regrouped');
    for (const c of files) {
      const t = read(c.abs);
      if (!new RegExp(`\\b${API_ACTION}::class`).test(t)) return fail(`${API_ACTION} disappeared from the routes config`);
      const insideGroup = adminGroups(t).some((s) => memberText(t, s).includes(`${API_ACTION}::class`));
      if (insideGroup) return fail(`${API_ACTION} was moved inside the admin group`);
    }
    return ok(`${API_ACTION} stays registered outside the admin group`);
  }),

  // Scenario 24's positional-trap check, verbatim shape: on Get/Post the constructor's 2nd
  // positional argument is ?string $name (references/router/src/Route/Get.php:28-37), not the handler.
  check('routes-named-action', 'Changed routes keep the grounded router form: no legacy static API and every new Get/Post binds the handler via the named action: argument (a positional second argument silently becomes the route NAME)', ({ changed }) => {
    const files = routesFiles(changed);
    if (!files.length) return ok('routes not touched by the agent');
    for (const c of files) {
      const t = read(c.abs);
      if (/Route::(get|post|put|delete|patch|options)\s*\(|Group::create\s*\(/.test(t)) {
        return fail(`legacy static router API used in ${c.path} (deprecated since router 4.0.3)`);
      }
      for (const { seg, tail } of routeSegments(t)) {
        if (/\(\s*['"][^'"]*['"]\s*,\s*\\?[A-Z]/.test(seg)) {
          return fail(`positional action argument silently becomes the route NAME on router 4.0.3 - use the named action: argument in ${c.path}: ${seg.replace(/\s+/g, ' ').slice(0, 80)}`);
        }
        if (!/\baction\s*:/.test(seg) && !/^->\s*action\s*\(/.test(tail)) {
          return fail(`route without an action binding (action: ... or ->action(...)) in ${c.path}: ${seg.replace(/\s+/g, ' ').slice(0, 80)}`);
        }
      }
    }
    return ok(files.map((f) => f.path).join(', '));
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

  check('transcript-mentions-group', 'The final answer mentions the route group and the group-level middleware', ({ transcript }) =>
    /group/i.test(transcript) && /middleware/i.test(transcript)
      ? ok()
      : fail('transcript does not mention the group/middleware wiring')),
];
