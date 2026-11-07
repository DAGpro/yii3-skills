import { check, ok, fail, read } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\/.*\.php$/.test(c.path));
const actions = (changed) => php(changed).filter((c) => /Action\.php$/.test(c.path));
const routes = (changed) => php(changed).filter((c) => /^config\/.*routes.*\.php$/.test(c.path));

/** Changed src files that still perform the destructive repository delete. */
const deleteFiles = (changed) => srcPhp(changed).filter((c) => /->\s*delete\s*\(/.test(read(c.abs)));

const CAN_CALL = /->\s*can\s*\(/;
const PERMISSION_NAME = /['"]userAdmin['"]|UserAdmin/;
const FORBIDDEN_403 = /Status::FORBIDDEN|\b403\b/;
const CHECKER_INJECTED = /(?:Yiisoft\\User\\)?CurrentUser\s+\$\w+|(?:Yiisoft\\Access\\)?AccessCheckerInterface\s+\$\w+/;

/** Route constructor segments (paren-matched) in a routes config text. */
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
    segs.push(text.slice(m.index, close === -1 ? open + 120 : close + 1));
  }
  return segs;
};

export default [
  check('can-called', 'The changed code calls the RBAC permission check ->can(\'userAdmin\') (CurrentUser::can, or AccessCheckerInterface::userHasPermission) - not a role or guest check', ({ changed }) => {
    const callers = srcPhp(changed).filter((c) => CAN_CALL.test(read(c.abs)));
    if (!callers.length) return fail('no ->can(...) permission check in changed src files - authentication (isGuest/getIdentity) does not authorize');
    const named = srcPhp(changed).filter((c) => PERMISSION_NAME.test(read(c.abs)));
    return named.length
      ? ok(callers.map((c) => c.path).join(', '))
      : fail('->can() called but the required `userAdmin` permission name is not referenced in any changed src file');
  }),

  check('guard-before-delete', 'The permission check executes BEFORE the repository delete call (regex positions in the changed file) - the destructive operation never runs for unauthorized users', ({ changed }) => {
    const hits = deleteFiles(changed);
    if (!hits.length) return fail('no changed src file performs the repository delete - the guard task was not implemented where the deletion happens');
    const bad = [];
    const good = [];
    for (const c of hits) {
      const t = read(c.abs);
      const canIdx = t.search(CAN_CALL);
      const delIdx = t.search(/->\s*delete\s*\(/);
      if (canIdx === -1) bad.push(`${c.path}: delete not preceded by any ->can() permission check`);
      else if (canIdx > delIdx) bad.push(`${c.path}: ->can() runs after the delete call`);
      else good.push(c.path);
    }
    return bad.length ? fail(bad.join('; ')) : ok(good.join(', '));
  }),

  check('denied-403', 'The denied path returns a 403 response (Status::FORBIDDEN / 403) - not a redirect, 404 or exception', ({ changed }) => {
    const hits = srcPhp(changed).filter((c) => FORBIDDEN_403.test(read(c.abs)));
    return hits.length
      ? ok(hits.map((h) => h.path).join(', '))
      : fail('no Status::FORBIDDEN / 403 response in changed src files - unauthorized users must get 403');
  }),

  check('guard-checker-injected', 'The changed action keeps a checker injected via constructor DI (CurrentUser or AccessCheckerInterface) - no service-location or statics', ({ changed }) => {
    const hits = actions(changed).filter((c) => CHECKER_INJECTED.test(read(c.abs)));
    if (!hits.length) return fail('no changed action injects CurrentUser / AccessCheckerInterface through the constructor');
    const bad = hits.filter((c) => /Yii::\$app|\buse\s+yii\\|#\[Override\]|->setFlash\s*\(|ActiveRecord/.test(read(c.abs)));
    return bad.length
      ? fail(`Yii2-style constructs in changed actions: ${bad.map((b) => b.path).join(', ')}`)
      : ok(hits.map((h) => h.path).join(', '));
  }),

  check('routes-named-action', 'Changed routes keep the grounded router 4.0.3 form: no legacy static API and every new Get/Post binds the handler via the named action: argument (a positional second argument silently becomes the route NAME)', ({ changed }) => {
    const files = routes(changed);
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

  check('no-yii2', 'No Yii2 constructs in changed PHP files (Yii::$app, use yii\\, #[Override], ActiveForm, session flash methods)', ({ changed }) => {
    const re = /Yii::\$app|\\Yii::|\buse\s+yii\\|#\[Override\]|ActiveForm::begin|->setFlash\s*\(|->getFlash\s*\(/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('strict-types', 'declare(strict_types=1) in every added PHP file', ({ changed }) => {
    const bad = php(changed).filter((c) => c.added && !/declare\(strict_types=1\);/.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('transcript-mentions-guard', 'The final answer mentions the RBAC permission check (can(...) / permission)', ({ transcript }) =>
    /->\s*can\s*\(|permission/i.test(transcript)
      ? ok()
      : fail('transcript does not mention the permission check')),
];
