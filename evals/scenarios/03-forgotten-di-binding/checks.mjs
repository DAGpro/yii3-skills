import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const added = (changed, re) => changed.filter((c) => c.added && re.test(c.path));

export default [
  check('interface-added', 'ViewCounterInterface added in src/', ({ changed }) =>
    added(changed, /^src\/.*ViewCounterInterface\.php$/).length ? ok() : fail('no ViewCounterInterface file')),

  check('implementation-added', 'A DB-backed implementation class added in src/', ({ changed }) =>
    added(changed, /^src\/.*ViewCounter\.php$/).length ? ok() : fail('no implementation class (*ViewCounter.php)')),

  check('interface-bound', 'ViewCounterInterface::class is bound in config/**/di/*.php', ({ dir }) => {
    const di = filesMatching(dir, /^config\/.*\/di\/.*\.php$|^config\/.*\/di\.php$/).map(read).join('\n');
    return /ViewCounterInterface::class\s*=>/.test(di) ? ok() : fail('no ViewCounterInterface::class => binding in DI config');
  }),

  check('di-injected-not-newed', 'Consumer receives ViewCounterInterface via DI; no direct `new *ViewCounter` outside tests', ({ changed }) => {
    const app = php(changed).filter((c) => !/^tests\//.test(c.path));
    const newed = app.filter((c) => /new\s+\w*ViewCounter\b/.test(read(c.abs)));
    if (newed.length) return fail(`direct instantiation: ${newed.map((b) => b.path).join(', ')}`);
    const injected = app.filter((c) => /ViewCounterInterface/.test(read(c.abs)));
    return injected.length ? ok() : fail('ViewCounterInterface is not type-hinted in any changed file');
  }),

  check('migration-reversible', 'New migration in migrations/ with a non-empty down()', ({ changed }) => {
    const m = added(changed, /^migrations\/.*\.php$/);
    if (!m.length) return fail('no new migration');
    const bad = m.filter((f) => !/function\s+down\s*\([^)]*\)[^{]*\{[^}]*\b(drop|delete)\w*\(/i.test(read(f.abs)));
    return bad.length ? fail(`down() empty or missing: ${bad.map((b) => b.path)}`) : ok(m.map((x) => x.path).join(', '));
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
    added(changed, /^tests\/.*Test\.php$/).length ? ok() : fail('no tests'), { required: false }),
];
