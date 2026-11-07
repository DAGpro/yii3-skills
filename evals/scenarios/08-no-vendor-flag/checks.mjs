import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const added = (changed, re) => changed.filter((c) => c.added && re.test(c.path));
const baseName = (p) => p.replace(/^.*\//, '').replace(/\.php$/, '');

const paramsText = (dir) =>
  filesMatching(dir, /^config\/.*params\.php$/).map(read).join('\n');

export default [
  check('unverified-flagged', "With vendor/ absent, the report flags the used yiisoft/* APIs as 'not verified against sources'", ({ transcript }) =>
    /not\s+verified\s+against\s+(the\s+|installed\s+)?sources/i.test(transcript)
      ? ok()
      : fail("no 'not verified against sources' flag in the transcript (vendor/ is absent — the signature lookup protocol requires it)")),

  check('command-registered', "The 'user:import' command is registered in config/**/params.php under 'yiisoft/yii-console' => ['commands' => [...]]", ({ dir }) => {
    const params = paramsText(dir);
    if (!/user:import/.test(params)) return fail("no 'user:import' entry in config/**/params.php");
    return /yiisoft\/yii-console/.test(params) || /'commands'\s*=>/.test(params)
      ? ok()
      : fail("'user:import' found but not under the 'yiisoft/yii-console' commands config");
  }),

  check('command-class-added', 'The registered command class is an added PHP file under src/', ({ changed, dir }) => {
    const params = paramsText(dir);
    const classes = added(changed, /^src\/.*\.php$/).map((c) => ({ name: baseName(c.path), path: c.path }));
    const wired = classes.filter((c) => new RegExp(c.name + '::class').test(params));
    return wired.length ? ok(wired.map((w) => w.path).join(', ')) : fail('no added src/ class is referenced from the params config next to user:import');
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

  check('install-requested', 'A composer install / dependency installation was requested before writing vendor-backed code', ({ transcript }) =>
    /composer\s+install|install the (composer )?dependencies|vendor\/ is (not|absent|missing)/i.test(transcript)
      ? ok()
      : fail('no composer install request / vendor-absence note'), { required: false }),
];
