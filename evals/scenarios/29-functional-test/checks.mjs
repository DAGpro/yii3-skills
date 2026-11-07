import { check, ok, fail, read, filesMatching, rel } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));

/** The grounded base class: Yiisoft\Yii\Testing\FunctionalTestCase (references/yii-testing/src/FunctionalTestCase.php:11, abstract extends PHPUnit\Framework\TestCase). */
const isFunctionalTestCase = (t) =>
  (/use\s+Yiisoft\\Yii\\Testing\\FunctionalTestCase;/.test(t) && /extends\s+FunctionalTestCase\b/.test(t))
  || /extends\s+\\?Yiisoft\\Yii\\Testing\\FunctionalTestCase\b/.test(t);

/** Hand-rolled HTTP against a live server - the anti-pattern the in-memory runner replaces (testing-http.md §9). */
const RAW_HTTP = /file_get_contents\s*\(\s*['"]https?:|fopen\s*\(\s*['"]https?:|curl_init\s*\(|\buse\s+GuzzleHttp\\/;

/** Status-code assertion grounded on ResponseAccessor::getStatusCode(): int - accept either assertSame argument order. */
const STATUS_ASSERT = /assertSame\s*\(\s*(?:\\?Yiisoft\\Http\\)?Status::OK\b|(?:assertSame|assertEquals)\s*\([^,()]*,\s*(?:\\?Yiisoft\\Http\\)?Status::OK\b|(?:assertSame|assertEquals)\s*\(\s*200\b|(?:assertSame|assertEquals)\s*\([^,()]*,\s*200\b/;

const functionalTestFiles = (changed) => changed.filter((c) => /^tests\/Functional\/[^/]*Test\.php$/.test(c.path));

export default [
  check('codeception-config', 'Root Codeception configuration exists (codeception.yml, grounded name: testing guide §1.2 "Root Configuration (codeception.yml)")', ({ dir }) => {
    const cfg = filesMatching(dir, /^codeception(\.dist)?\.ya?ml$/);
    return cfg.length ? ok(cfg.map((c) => rel(dir, c)).join(', ')) : fail('no codeception.yml at the project root');
  }),

  check('functional-suite-config', 'A Functional suite configuration exists with the FunctionalTester actor (grounded name: testing guide §1.3 "Suite Configuration (tests/Functional.suite.yml)", actor: FunctionalTester)', ({ dir }) => {
    const suite = filesMatching(dir, /^tests\/Functional(\.dist)?\.suite\.ya?ml$/);
    if (!suite.length) return fail('no tests/Functional.suite.yml');
    return suite.map(read).join('\n').includes('FunctionalTester')
      ? ok(suite.map((s) => rel(dir, s)).join(', '))
      : fail('Functional suite config does not declare the FunctionalTester actor');
  }),

  check('functional-test-file', 'A functional test file tests/Functional/*Test.php was added', ({ changed }) => {
    const files = functionalTestFiles(changed);
    return files.length ? ok(files.map((f) => f.path).join(', ')) : fail('no tests/Functional/*Test.php file added');
  }),

  check('test-extends-functional-case', 'The functional test class extends Yiisoft\\Yii\\Testing\\FunctionalTestCase (the grounded in-memory base class), not plain PHPUnit TestCase', ({ changed }) => {
    const files = functionalTestFiles(changed);
    if (!files.length) return fail('no tests/Functional/*Test.php file added');
    const okFiles = files.filter((f) => isFunctionalTestCase(read(f.abs)));
    return okFiles.length
      ? ok(okFiles.map((f) => f.path).join(', '))
      : fail(`functional test does not extend Yiisoft\\Yii\\Testing\\FunctionalTestCase: ${files.map((f) => f.path).join(', ')}`);
  }),

  check('test-exercises-api-status', 'The functional test dispatches GET /api/status in-memory (doRequest) and asserts the 200 status code and the JSON body (ResponseAccessor::getStatusCode() / getContentAsJson(), grounded: testing-http.md §1.1, §2)', ({ changed }) => {
    const files = functionalTestFiles(changed);
    if (!files.length) return fail('no tests/Functional/*Test.php file added');
    const bad = [];
    for (const f of files) {
      const t = read(f.abs);
      const reasons = [];
      if (!/doRequest\s*\(/.test(t)) reasons.push('no in-memory doRequest() dispatch');
      if (!/['"]\/api\/status['"]/.test(t)) reasons.push('GET /api/status not exercised');
      if (!STATUS_ASSERT.test(t)) reasons.push('no 200 status-code assertion');
      if (!/getContentAsJson\s*\(|assertJsonStringEqualsJsonString|json_decode\s*\(/.test(t)) reasons.push('no JSON body assertion');
      if (reasons.length) bad.push(`${f.path}: ${reasons.join('; ')}`);
    }
    return bad.length ? fail(bad.join('; ')) : ok(files.map((f) => f.path).join(', '));
  }),

  check('no-raw-http', 'No raw HTTP calls against a live server in changed test/PHP files (file_get_contents/fopen on http://, curl_init, GuzzleHttp\\Client) - functional tests must run in-memory', ({ changed }) => {
    const bad = php(changed).filter((c) => RAW_HTTP.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
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
];
