import { check, ok, fail, read } from '../../lib/checks.mjs';
import { join } from 'node:path';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const VERB_CLASSES = /(Get|Post|Put|Patch|Delete|Head|Options)/;

// composer.lock in the fixture is the version truth; the stub lists yiisoft/router explicitly.
function routerVersion(base) {
  try {
    const lock = JSON.parse(read(join(base, 'composer.lock')));
    return lock.packages?.find((p) => p.name === 'yiisoft/router')?.version ?? '';
  } catch {
    return '';
  }
}

const cmp = (a, b) => {
  const pa = a.split(/[-+]/)[0].split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
};

export default [
  check('router-api-matches-lock', 'Router API style matches the version pinned in composer.lock (<4.0.3: static factories; >=4.0.3: constructor classes)', ({ base, changed }) => {
    const routes = changed.filter((c) => /^config\/.*routes.*\.php$/.test(c.path)).map((c) => read(c.abs)).join('\n');
    if (!routes) return fail('no route file changed');
    const modern = cmp(routerVersion(base), '4.0.3') >= 0;
    const ctorRe = new RegExp(`new\\s+\\\\?(?:Yiisoft\\\\Router\\\\Route\\\\)?${VERB_CLASSES.source}\\s*\\(`);
    const staticRe = /Route::(get|post|put|patch|delete|head|options)\s*\(/;
    if (!modern && ctorRe.test(routes)) return fail(`constructor route classes do not exist on the locked router ${routerVersion(base)} (added in 4.0.3)`);
    if (modern && staticRe.test(routes)) return fail('static route factories are deprecated since router 4.0.3');
    if (!modern && !staticRe.test(routes)) return fail(`no static Route::get() found (required on locked router ${routerVersion(base)})`);
    if (modern && !ctorRe.test(routes)) return fail('no constructor-style route found (required on router >=4.0.3)');
    return ok(`router ${routerVersion(base)}`);
  }),

  check('route-added', 'A GET /posts route is registered in a changed routes file', ({ changed }) => {
    const routes = changed.filter((c) => /^config\/.*routes.*\.php$/.test(c.path)).map((c) => read(c.abs)).join('\n');
    if (!/\/posts['"]/.test(routes)) return fail('no /posts route found');
    return /Route::get\s*\(|new\s+\\?(?:Yiisoft\\Router\\Route\\)?Get\s*\(/.test(routes) ? ok() : fail('/posts present but no Get factory');
  }),

  check('action-thin', 'New Actions contain no SQL, createCommand, transaction()', ({ changed }) => {
    const actions = php(changed).filter((c) => /Action\.php$/.test(c.path));
    if (!actions.length) return fail('no Action found');
    const bad = actions.filter((a) => /createCommand|->transaction\(|new\s+Query\b|->insert\(|ActiveRecord/.test(read(a.abs)));
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
