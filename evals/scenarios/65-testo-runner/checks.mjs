import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export default [
  check('testo-package-required', 'composer.json requires testo/testo in require-dev', ({ dir }) => {
    const cPath = join(dir, 'composer.json');
    if (!existsSync(cPath)) return fail('composer.json not found');
    try {
      const c = JSON.parse(read(cPath));
      if (!c['require-dev']?.['testo/testo']) {
        return fail('testo/testo missing from composer.json require-dev');
      }
      return ok();
    } catch (e) {
      return fail('invalid composer.json: ' + e.message);
    }
  }),

  check('exclusive-runner-no-phpunit', 'composer.json does not require phpunit/phpunit (strict exclusive runner rule)', ({ dir }) => {
    const cPath = join(dir, 'composer.json');
    if (existsSync(cPath)) {
      try {
        const c = JSON.parse(read(cPath));
        if (c.require?.['phpunit/phpunit'] || c['require-dev']?.['phpunit/phpunit']) {
          return fail('phpunit/phpunit co-installed with testo/testo (violates exclusive runner rule)');
        }
      } catch {}
    }
    return ok();
  }),

  check('testo-config-exists', 'testo.php configuration exists in project root', ({ dir }) => {
    const tPath = join(dir, 'testo.php');
    if (!existsSync(tPath)) return fail('testo.php not found in project root');
    const content = read(tPath);
    if (!/suite|testo/i.test(content)) {
      return fail('testo.php lacks suite configuration');
    }
    return ok();
  }),

  check('test-attribute-usage', 'Test class uses #[Test] attribute and Testo\\Assert', ({ dir }) => {
    const testFiles = filesMatching(dir, /(^|\/)tests\/.*Test\.php$/);
    if (testFiles.length === 0) return fail('no *Test.php files found in tests/');
    let hasAttribute = false;
    for (const f of testFiles) {
      const content = read(f);
      if (content.includes('#[Test]') || content.includes('#[\\Testo\\Test]') || content.includes('#[Testo\\Test]')) {
        hasAttribute = true;
        break;
      }
    }
    return hasAttribute ? ok() : fail('test class does not use #[Test] attribute');
  })
];
