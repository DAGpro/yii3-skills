import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export default [
  check('codeception-package-required', 'composer.json requires codeception/codeception in require-dev', ({ dir }) => {
    const cPath = join(dir, 'composer.json');
    if (!existsSync(cPath)) return fail('composer.json not found');
    try {
      const c = JSON.parse(read(cPath));
      if (!c['require-dev']?.['codeception/codeception']) {
        return fail('codeception/codeception missing from composer.json require-dev');
      }
      return ok();
    } catch (e) {
      return fail('invalid composer.json: ' + e.message);
    }
  }),

  check('no-codeception-in-runtime-require', 'codeception/codeception is not placed in runtime require', ({ dir }) => {
    const cPath = join(dir, 'composer.json');
    if (existsSync(cPath)) {
      try {
        const c = JSON.parse(read(cPath));
        if (c.require?.['codeception/codeception']) {
          return fail('codeception/codeception placed in runtime require (must be in require-dev)');
        }
      } catch {}
    }
    return ok();
  }),

  check('codeception-config-exists', 'codeception.yml exists in project root', ({ dir }) => {
    const cPath = join(dir, 'codeception.yml');
    if (!existsSync(cPath)) return fail('codeception.yml not found');
    const content = read(cPath);
    if (!content.includes('namespace:') && !content.includes('paths:')) {
      return fail('codeception.yml lacks namespace or paths configuration');
    }
    return ok();
  }),

  check('api-suite-config-exists', 'tests/Api.suite.yml or tests/Functional.suite.yml configures REST/asserts module', ({ dir }) => {
    const suiteFiles = filesMatching(dir, /(^|\/)tests\/.*suite\.ya?ml$/);
    if (suiteFiles.length === 0) return fail('no suite configuration file found in tests/');
    let hasModule = false;
    for (const f of suiteFiles) {
      const content = read(f);
      if (content.includes('REST') || content.includes('Asserts') || content.includes('actor:')) {
        hasModule = true;
        break;
      }
    }
    return hasModule ? ok() : fail('suite configuration lacks actor or module definition');
  }),

  check('cest-implementation-exists', 'Test class is structured as a Cest using actor tester', ({ dir }) => {
    const cestFiles = filesMatching(dir, /(^|\/)tests\/.*Cest\.php$/);
    if (cestFiles.length === 0) return fail('no *Cest.php test found in tests/');
    const content = read(cestFiles[0]);
    if (!/function\s+\w+\s*\(\s*(ApiTester|FunctionalTester|Tester)\s+\$I\s*\)/i.test(content)) {
      return fail('Cest test does not declare actor parameter ($I)');
    }
    return ok();
  })
];
