import { check, ok, fail, read } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const commandTestFiles = (changed) =>
  changed.filter((c) => c.added && /^tests\/(?:Console|Command)\/.*Test\.php$/.test(c.path));

/** Guide-contract (testing-console.md §3-§4): Symfony's official CommandTester,
 *  executed in-process via ->execute([...]) which returns the exit code. */
const usesCommandTester = (t) =>
  /use\s+Symfony\\Component\\Console\\Tester\\CommandTester\s*;/.test(t)
  && /new\s+CommandTester\s*\(/.test(t)
  && /->execute\s*\(/.test(t);

/** Success-path assertions: an OK exit-code check AND the fixture's success text. */
const successPathAsserted = (t) =>
  /assertSame\s*\(\s*(?:\\?Yiisoft\\Yii\\Console\\)?ExitCode::OK\b|assertCommandIsSuccessful\s*\(/.test(t)
  && /assertStringContainsString\s*\([^)]*['"]Cache purged/.test(t);

/** Failure-path assertions: a non-OK exit-code check AND the fixture's error text. */
const failurePathAsserted = (t) =>
  /ExitCode::(?:UNAVAILABLE|DATAERR)\b|Command::FAILURE\b|assertNot(?:Same|Equals)\s*\(\s*(?:\\?[\w\\]+\\)?ExitCode::OK\b/.test(t)
  && /assertStringContainsString\s*\([^)]*['"]Cache storage directory is missing/.test(t);

/** getDisplay(true) / getDisplay(normalize: true) - the guide's line-ending invariant (§3). */
const displayNormalized = (t) => /getDisplay\s*\(\s*(?:true|normalize:\s*true)\s*\)/.test(t);

/** Shell-outs instead of in-process CommandTester execution. */
const SHELL_OUT = /\bexec\s*\(|shell_exec\s*\(|proc_open\s*\(|popen\s*\(|\bsystem\s*\(/;

export default [
  check('command-test-file', 'A test file was added under tests/Console/ or tests/Command/ (*Test.php)', ({ changed }) => {
    const files = commandTestFiles(changed);
    return files.length ? ok(files.map((f) => f.path).join(', ')) : fail('no tests/Console/*Test.php or tests/Command/*Test.php file added');
  }),

  check('command-tester-used', 'The test runs the command in-process with Symfony\\Component\\Console\\Tester\\CommandTester and ->execute(...) (testing-console.md §3-§4)', ({ changed }) => {
    const files = commandTestFiles(changed);
    if (!files.length) return fail('no command test file added');
    const good = files.filter((f) => usesCommandTester(read(f.abs)));
    return good.length ? ok(good.map((g) => g.path).join(', ')) : fail(`test does not use CommandTester with ->execute(): ${files.map((f) => f.path).join(', ')}`);
  }),

  check('success-path-asserted', 'A success-path test asserts the OK exit code (ExitCode::OK / assertCommandIsSuccessful) and the "Cache purged" output via assertStringContainsString', ({ changed }) => {
    const files = commandTestFiles(changed);
    if (!files.length) return fail('no command test file added');
    const good = files.filter((f) => successPathAsserted(read(f.abs)));
    return good.length ? ok(good.map((g) => g.path).join(', ')) : fail('no OK exit-code assertion plus "Cache purged" output assertion found');
  }),

  check('failure-path-asserted', 'A failure-path test asserts a non-OK exit code (ExitCode::UNAVAILABLE / DATAERR / Command::FAILURE) and the "Cache storage directory is missing." error output', ({ changed }) => {
    const files = commandTestFiles(changed);
    if (!files.length) return fail('no command test file added');
    const good = files.filter((f) => failurePathAsserted(read(f.abs)));
    return good.length ? ok(good.map((g) => g.path).join(', ')) : fail('no non-OK exit-code assertion plus error-output assertion found');
  }),

  check('display-normalized', 'getDisplay(true) (or getDisplay(normalize: true)) is used at least once - the guide\'s line-ending normalization invariant (testing-console.md §3)', ({ changed }) => {
    const files = commandTestFiles(changed);
    if (!files.length) return fail('no command test file added');
    const good = files.filter((f) => displayNormalized(read(f.abs)));
    return good.length ? ok(good.map((g) => g.path).join(', ')) : fail('getDisplay() is never called with the normalization argument');
  }),

  check('no-shell-out', 'Changed test files never shell out to the command (exec/shell_exec/proc_open/popen/system) - console tests run in-process', ({ changed }) => {
    const bad = php(changed).filter((c) => SHELL_OUT.test(read(c.abs)));
    return bad.length ? fail(`tests shell out to the command: ${bad.map((b) => b.path).join(', ')}`) : ok();
  }),

  check('no-yii2', 'No Yii2 constructs (Yii::$app, yii\\ namespace) in changed PHP files', ({ changed }) => {
    const re = /Yii::\$app|\\Yii::|\buse\s+yii\\/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('strict-types', 'declare(strict_types=1) in every added PHP file', ({ changed }) => {
    const bad = php(changed).filter((c) => c.added && !/declare\(strict_types=1\);/.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('transcript-mentions-tester', 'The transcript mentions CommandTester and exit codes', ({ transcript }) => {
    const t = transcript ?? '';
    if (!/CommandTester/i.test(t)) return fail('transcript does not mention CommandTester');
    if (!/exit\s*code|ExitCode/i.test(t)) return fail('transcript does not mention exit codes');
    return ok('transcript mentions CommandTester and exit codes');
  }),
];
