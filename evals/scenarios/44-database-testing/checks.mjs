import { check, ok, fail, read } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const testPhp = (changed) => php(changed).filter((c) => c.path.startsWith('tests/'));
const addedPhp = (changed) => php(changed).filter((c) => c.added);

const classDecl = (t) => /(?:abstract\s+|final\s+)*class\s+(\w+)/.exec(t)?.[1] ?? null;
const extendsTarget = (t) => /class\s+\w+\s+extends\s+([\\\w]+)/.exec(t)?.[1] ?? null;

/** The transactional base-class shape taught by testing-database.md §4.1:
 *  extends PHPUnit TestCase, beginTransaction() in setUp(), rollback in tearDown(). */
const isTransactionalBase = (t) =>
  /extends\s+(?:\\?PHPUnit\\Framework\\)?TestCase\b/.test(t)
  && /function\s+setUp\s*\(\s*\)\s*:\s*void/.test(t)
  && /beginTransaction\s*\(/.test(t)
  && /function\s+tearDown\s*\(\s*\)\s*:\s*void/.test(t)
  && /rollback\s*\(/i.test(t);

/** The in-memory SQLite wiring taught by testing-database.md §2.1/§4.1:
 *  the Sqlite driver classes, the in-memory DSN, and a Driver instantiation. */
const isSqliteMemoryWiring = (t) =>
  /Yiisoft\\Db\\Sqlite\\/.test(t)
  && /sqlite::memory:/.test(t)
  && /new\s+Driver\s*\(/.test(t);

export default [
  check('sqlite-test-db-wired', 'A changed file wires the ephemeral in-memory SQLite database (Yiisoft\\Db\\Sqlite driver classes + sqlite::memory: DSN + new Driver(...), testing-database.md §2.1/§4.1)', ({ changed }) => {
    const good = php(changed).filter((c) => isSqliteMemoryWiring(read(c.abs)));
    return good.length ? ok(good.map((g) => g.path).join(', ')) : fail('no changed file combines the Yiisoft\\Db\\Sqlite driver classes, the sqlite::memory: DSN and a Driver instantiation - tests would hit a real database');
  }),

  check('transactional-base-class', 'A reusable base test class exists under tests/ that extends PHPUnit TestCase, begins a transaction in setUp() and rolls back in tearDown() (testing-database.md §4.1)', ({ changed }) => {
    const good = testPhp(changed).filter((c) => isTransactionalBase(read(c.abs)));
    return good.length ? ok(good.map((g) => g.path).join(', ')) : fail('no tests/ base class with setUp(): beginTransaction() + tearDown(): rollBack() - test state would leak between tests');
  }),

  check('migrations-run-in-setup', 'The test setup runs the project migrations through MigrationBuilder with NullMigrationInformer and executes them via ->up(...) (testing-database.md §3.2)', ({ changed }) => {
    const good = testPhp(changed).filter((c) => /NullMigrationInformer/.test(read(c.abs)) && /->\s*up\s*\(/.test(read(c.abs)));
    return good.length ? ok(good.map((g) => g.path).join(', ')) : fail('no changed tests/ file references NullMigrationInformer and runs a migration via ->up(...) - the test schema would never exist');
  }),

  check('repository-test-extends-base', 'A repository test (tests/**/*Test.php) was added that uses ProductRepository and extends the transactional base class declared in the change (testing-database.md §6)', ({ changed }) => {
    const baseNames = testPhp(changed)
      .filter((c) => isTransactionalBase(read(c.abs)))
      .map((c) => classDecl(read(c.abs)))
      .filter(Boolean);
    const repoTests = changed.filter((c) => c.added && /^tests\/.*Test\.php$/.test(c.path));
    const good = repoTests.filter((c) => {
      const t = read(c.abs);
      const target = extendsTarget(t);
      return /ProductRepository/.test(t) && target !== null && baseNames.includes(target);
    });
    return good.length ? ok(good.map((g) => g.path).join(', ')) : fail(`no added tests/**/*Test.php exercising ProductRepository and extending the transactional base (${baseNames.join(', ') || 'none declared'})`);
  }),

  check('seed-read-back-asserted', 'The test performs a write (repository ->save(...) or ->insert(...)), a read-back (->find(...) / findById(...)) and value assertions on the mapped fields', ({ changed }) => {
    const repoTests = changed.filter((c) => c.added && /^tests\/.*Test\.php$/.test(c.path));
    const good = repoTests.filter((c) => {
      const t = read(c.abs);
      return /->save\s*\(|->insert\s*\(/.test(t)
        && /->find\s*\(|findById\s*\(/.test(t)
        && /assert(?:Same|Equals|NotNull|True|NotEmpty)\s*\(/.test(t);
    });
    return good.length ? ok(good.map((g) => g.path).join(', ')) : fail('no insert/save + find/read-back + assertion sequence found in the added test files');
  }),

  check('no-dev-db-in-tests', 'Changed test files never touch the dev MySQL DSN (mysql:host=...) - tests must stay on the ephemeral in-memory database', ({ changed }) => {
    const bad = testPhp(changed).filter((c) => /mysql:host=/i.test(read(c.abs)));
    return bad.length ? fail(`changed test files connect to the dev MySQL DSN: ${bad.map((b) => b.path).join(', ')}`) : ok();
  }),

  check('no-yii2', 'No Yii2 constructs (Yii::$app, yii\\ namespace) in changed PHP files', ({ changed }) => {
    const re = /Yii::\$app|\\Yii::|\buse\s+yii\\/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('strict-types', 'declare(strict_types=1) in every added PHP file', ({ changed }) => {
    const bad = addedPhp(changed).filter((c) => !/declare\(strict_types=1\);/.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('transcript-mentions-isolation', 'The transcript explains the isolation strategy (in-memory SQLite and transaction rollback)', ({ transcript }) => {
    const t = transcript ?? '';
    if (!/sqlite/i.test(t)) return fail('transcript does not mention SQLite');
    if (!/transaction|rollback/i.test(t)) return fail('transcript does not mention transaction rollback');
    return ok('transcript mentions in-memory SQLite and transaction rollback');
  }),
];
