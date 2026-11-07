import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const added = (changed, re) => changed.filter((c) => c.added && re.test(c.path));
const baseName = (p) => p.replace(/^.*\//, '').replace(/\.php$/, '');

/** Interfaces the agent added under src/ (any name - the prompt prescribes none). */
const addedInterfaces = (changed) =>
  added(changed, /^src\/.*Interface\.php$/).map((c) => ({ path: c.path, name: baseName(c.path), t: read(c.abs) }));

/** Added non-interface classes implementing one of the added interfaces (discovered, not named). */
const addedImplementations = (changed, ifs) =>
  added(changed, /^src\/.*\.php$/)
    .filter((c) => !/Interface\.php$/.test(c.path))
    .map((c) => ({ path: c.path, name: baseName(c.path), t: read(c.abs) }))
    .filter((c) => c.t.includes('implements') && ifs.some((i) => c.t.includes(i.name)));

const diConfig = (dir) =>
  filesMatching(dir, /^config\/.*\/di\/.*\.php$|^config\/.*\/di\.php$/).map(read).join('\n');

export default [
  check('interface-added', 'A domain abstraction (interface) is added under src/', ({ changed }) => {
    const ifs = addedInterfaces(changed);
    return ifs.length ? ok(ifs.map((i) => i.name).join(', ')) : fail('no interface added under src/');
  }),

  check('implementation-added', 'A DB-backed implementation of the added interface is added under src/', ({ changed }) => {
    const ifs = addedInterfaces(changed);
    if (!ifs.length) return fail('no interface added under src/');
    const impls = addedImplementations(changed, ifs);
    if (!impls.length) return fail(`no added class implements the added interface(s): ${ifs.map((i) => i.name).join(', ')}`);
    const db = impls.filter((c) => /ConnectionInterface|QueryBuilder|CommandInterface|->insert\(|->execute\(|->query\(/.test(c.t));
    return db.length
      ? ok(db.map((c) => c.name).join(', '))
      : fail(`implementation(s) ${impls.map((c) => c.name).join(', ')} look non-DB-backed (no connection/query/execute usage)`);
  }),

  // The core gate: a freshly added interface is useless until it is bound to its implementation.
  check('interface-bound', 'Every added interface is bound in config/**/di/*.php (<Name>::class => <implementation>)', ({ dir, changed }) => {
    const ifs = addedInterfaces(changed);
    if (!ifs.length) return fail('no interface added under src/');
    const di = diConfig(dir);
    const unbound = ifs.filter((i) => !new RegExp(i.name + "::class['\"]?\\s*=>").test(di));
    return unbound.length
      ? fail(`DI binding missing for: ${unbound.map((i) => i.name).join(', ')} (a fresh interface must be bound to its implementation)`)
      : ok(ifs.map((i) => i.name).join(', '));
  }),

  check('di-injected-not-newed', 'Consumers type-hint the added interface; discovered implementations are never `new`-ed outside tests', ({ changed }) => {
    const ifs = addedInterfaces(changed);
    if (!ifs.length) return fail('no interface added under src/');
    const impls = addedImplementations(changed, ifs);
    const app = php(changed).filter((c) => !/^tests\//.test(c.path));
    const injected = app.filter((c) => ifs.some((i) => read(c.abs).includes(i.name)));
    if (!injected.length) return fail('the added interface is not type-hinted in any changed non-test file');
    const implNames = impls.map((c) => c.name);
    const newed = app.filter((c) => implNames.some((n) => new RegExp('new\\s+\\\\?[\\w\\\\]*' + n + '\\b').test(read(c.abs))));
    return newed.length
      ? fail(`direct instantiation: ${newed.map((b) => b.path).join(', ')} (bind in DI and type-hint the interface)`)
      : ok();
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
