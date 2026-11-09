import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const added = (changed, re) => changed.filter((c) => c.added && re.test(c.path));
const baseName = (p) => p.replace(/^.*\//, '').replace(/\.php$/, '');

/** Added action-shaped classes: __invoke + ResponseInterface (any name). */
const addedActions = (changed) =>
  added(changed, /^src\/.*\.php$/)
    .filter((c) => /__invoke/.test(read(c.abs)) && /ResponseInterface/.test(read(c.abs)))
    .map((c) => ({ path: c.path, name: baseName(c.path) }));

const routesText = (dir) =>
  filesMatching(dir, /^config\/.*routes.*\.php$/).map(read).join('\n');

export default [
  check('mode-light', 'The mode is printed as Patch or Light (single route = Patch/Light, not Feature/Enterprise)', ({ transcript }) =>
    /Mode:\s*(Patch|Light)/i.test(transcript) ? ok() : fail('no "Mode: Patch" (or Light) in the transcript')),

  check('no-full-decomposition', 'No Full-mode machinery (migrations, repositories, use cases, DTOs) for a static single-route payload', ({ changed }) => {
    const overkill = changed.filter((c) =>
      /^migrations\/[^/]+\.php$/.test(c.path) ||
      /Repository(Interface)?\.php$/.test(c.path) ||
      /UseCase\.php$/.test(c.path) ||
      /(Input|DTO)\.php$/.test(c.path)
    );
    return overkill.length ? fail(overkill.map((o) => o.path).join(', ')) : ok();
  }),

  check('action-added', 'A thin action (added class with __invoke returning ResponseInterface) is added', ({ changed }) => {
    const actions = addedActions(changed);
    return actions.length ? ok(actions.map((a) => a.name).join(', ')) : fail('no added __invoke action returning ResponseInterface');
  }),

  check('route-wired', "The '/about' route is registered in config/**/routes.php and references the added action", ({ dir, changed }) => {
    const routes = routesText(dir);
    if (!/['"]\/about['"]/.test(routes)) return fail("no '/about' route in config/**/routes.php");
    const actions = addedActions(changed);
    const wired = actions.filter((a) => routes.includes(a.name));
    return wired.length ? ok(wired.map((a) => a.name).join(', ')) : fail("'/about' found but no added action class is referenced from the routes config");
  }),

  check('report-block', 'The report block is present with Architecture line and the Light gate n/a', ({ transcript }) => {
    const missing = [];
    if (!/Architecture:\s*\S/i.test(transcript)) missing.push('Architecture line');
    if (!/production readiness gate:\s*n\/a/i.test(transcript)) missing.push('production readiness gate: n/a (Light prints n/a)');
    return missing.length ? fail(missing.join('; ')) : ok();
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
