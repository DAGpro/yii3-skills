import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
// Either a fully-qualified extends or an import + short extends (the common idiom).
const isSfCommand = (t) => (/use\s+Symfony\\Component\\Console\\Command\\Command;/.test(t) && /extends\s+Command\b/.test(t))
  || /extends\s+\\?Symfony\\Component\\Console\\Command\\Command\b/.test(t);

export default [
  check('command-registered', "The 'blog:recount' command is registered in config/console (commands.php or params.php)", ({ dir }) => {
    const cfg = filesMatching(dir, /^config\/console\/(commands|params)\.php$/).map(read).join('\n');
    return /['"]blog:recount['"]/.test(cfg) ? ok() : fail("no 'blog:recount' entry in console config");
  }),

  check('commands-key-wired', "config/console/params.php exposes the 'commands' key under yiisoft/yii-console (inline or via require)", ({ dir }) => {
    const params = filesMatching(dir, /^config\/console\/params\.php$/).map(read).join('\n');
    return /['"]commands['"]\s*=>/.test(params) ? ok() : fail("params.php has no 'commands' key - a registration file nobody requires is silently ignored");
  }),

  check('command-class-shape', "A changed class extends Symfony Console Command with #[AsCommand(name: 'blog:recount')]", ({ changed }) => {
    const cmd = php(changed).filter((c) => isSfCommand(read(c.abs)));
    if (!cmd.length) return fail('no class extends Symfony\\Component\\Console\\Command\\Command');
    const named = cmd.filter((c) => /#\[AsCommand\(/.test(read(c.abs)) && /name:\s*['"]blog:recount['"]/.test(read(c.abs)));
    return named.length ? ok() : fail('AsCommand name does not match blog:recount');
  }),

  check('command-thin', 'Command classes contain no SQL or persistence calls (CLI I/O and delegation only)', ({ changed }) => {
    const cmd = php(changed).filter((c) => /Command\.php$/.test(c.path) || isSfCommand(read(c.abs)));
    if (!cmd.length) return fail('no command class found');
    const bad = cmd.filter((c) => /createCommand|->insert\(|new\s+Query\b|->transaction\(/.test(read(c.abs)));
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
