import { check, ok, fail, read } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\//.test(c.path));
const hasRoutes = (changed) => changed.some((c) => /^config\/.*routes.*\.php$/.test(c.path));
const routesText = (changed) => changed.filter((c) => /^config\/.*routes.*\.php$/.test(c.path)).map((c) => read(c.abs)).join('\n');

// Class names mandated by the prompt (the fixture's legacy SiteController is named there too,
// so anchoring on these is grounded, not on arbitrary agent choices).
const NEW_ACTIONS = ['IndexAction', 'StatsAction'];
const actionFiles = (changed, name) => srcPhp(changed).filter((c) => new RegExp(`(^|/)${name}\\.php$`).test(c.path));

export default [
  check('no-actionx-methods', 'No public function actionX() methods in changed src/ PHP files (endpoints become single-action classes, not more controller methods)', ({ changed }) => {
    const re = /public\s+function\s+action[A-Z]\w*\s*\(/;
    const bad = srcPhp(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('actions-are-final-readonly-invoke', 'Each new single-action class (IndexAction, StatsAction) is final readonly with a __invoke() method', ({ changed }) => {
    for (const name of NEW_ACTIONS) {
      const files = actionFiles(changed, name);
      if (!files.length) return fail(`no new ${name} class found`);
      for (const f of files) {
        const t = read(f.abs);
        if (!/\b(final\s+readonly|readonly\s+final)\s+class\b/.test(t)) return fail(`${f.path}: class is not final readonly`);
        if (!/function\s+__invoke\s*\(/.test(t)) return fail(`${f.path}: no __invoke() method`);
      }
    }
    return ok();
  }),

  check('actions-return-response', '__invoke() of each new action class declares a ResponseInterface return type (MiddlewareFactory rejects other return types)', ({ changed }) => {
    const re = /function\s+__invoke\s*\([^)]*\)\s*:\s*\\?(?:Psr\\Http\\Message\\)?ResponseInterface\b/;
    const files = NEW_ACTIONS.flatMap((name) => actionFiles(changed, name));
    const bad = files.filter((f) => !re.test(read(f.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok(files.map((f) => f.path).join(', '));
  }),

  check('routes-repointed', 'Routes re-pointed: no legacy SiteController callables left, / and /stats wired to the new action classes as route actions', ({ changed }) => {
    if (!hasRoutes(changed)) return fail('no route file changed');
    const routes = routesText(changed);
    if (/SiteController/.test(routes)) return fail('routes still reference the legacy SiteController');
    for (const name of NEW_ACTIONS) {
      if (!new RegExp(`${name}::class`).test(routes)) return fail(`routes missing ${name}::class`);
      const miswired = new RegExp(`new\\s+\\\\?(?:Yiisoft\\\\Router\\\\Route\\\\)?[A-Z]\\w+\\s*\\(\\s*['"][^'"]+['"]\\s*,\\s*${name}::class`).test(routes);
      if (miswired) return fail(`${name}::class passed as the 2nd constructor argument - on router 4.0.x that binds to $name; pass the handler as action: named argument or ->action()`);
      if (!new RegExp(`(?:action:\\s*|->action\\(\\s*)${name}::class`).test(routes)) return fail(`${name} is not wired as a route action (action: named argument or ->action())`);
    }
    return ok();
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
