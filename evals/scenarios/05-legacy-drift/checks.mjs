import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const added = (changed, re) => changed.filter((c) => c.added && re.test(c.path));
const baseName = (p) => p.replace(/^.*\//, '').replace(/\.php$/, '');

const addedActions = (changed) =>
  added(changed, /^src\/.*\.php$/)
    .filter((c) => /__invoke/.test(read(c.abs)) && /ResponseInterface/.test(read(c.abs)))
    .map((c) => ({ path: c.path, name: baseName(c.path) }));

const routesText = (dir) =>
  filesMatching(dir, /^config\/.*routes.*\.php$/).map(read).join('\n');

export default [
  check('validated-input', 'The new endpoint validates input through yiisoft validator constructs (FormModel/FormHydrator/validator rules), not manual parsing', ({ changed }) => {
    const validated = php(changed).filter((c) =>
      /Yiisoft\\Validator|FormHydrator|FormModel|populateFromPost/.test(read(c.abs))
    );
    return validated.length ? ok(validated.map((v) => v.path).join(', ')) : fail('no validator/form-model usage in changed files (manual parsing copied from the legacy pattern?)');
  }),

  check('drift-flagged', 'The divergence of the existing input handling from the guides is flagged in the report (legacy drift — flag, never copy)', ({ transcript }) =>
    /drift|divergen/i.test(transcript) ? ok() : fail('no drift/divergence mention in the transcript')),

  check('endpoint-wired', "The '/subscribe' route is registered in config/**/routes.php and references the added action", ({ dir, changed }) => {
    const routes = routesText(dir);
    if (!/['"]\/subscribe['"]/.test(routes)) return fail("no '/subscribe' route in config/**/routes.php");
    const actions = addedActions(changed);
    const wired = actions.filter((a) => routes.includes(a.name));
    return wired.length ? ok(wired.map((a) => a.name).join(', ')) : fail("'/subscribe' found but no added action class is referenced from the routes config");
  }),

  check('no-yii2', 'No Yii2 constructs in changed PHP files', ({ changed }) => {
    const re = /Yii::\$app|\buse\s+yii\\|ActiveForm::begin|->getFlash\(|\$this->render\(/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('strict-types', 'declare(strict_types=1) in every added PHP file', ({ changed }) => {
    const bad = php(changed).filter((c) => c.added && !/declare\(strict_types=1\);/.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),
];
