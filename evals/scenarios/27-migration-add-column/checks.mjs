import { check, ok, fail, read, matchParen, methodBody } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const migrationChanges = (changed) => php(changed).filter((c) => /^migrations\/.*\.php$/.test(c.path));
const newMigrations = (changed) => changed.filter((c) => c.added && /^migrations\/M\d{12}\w*\.php$/.test(c.path));

const EXISTING_MIGRATION = 'migrations/M260101010101CreateUsersTable.php';

/** Argument substring of the call at the given match index. */
const callArgs = (t, nameIdx) => {
  const open = t.indexOf('(', nameIdx);
  const close = matchParen(t, open);
  return close === -1 ? t.slice(nameIdx, nameIdx + 800) : t.slice(nameIdx, close);
};

const USERS = /['"](?:\{\{%users\}\}|users)['"]/;
const LAST_LOGIN = /['"]last_login_at['"]/;
const NAMED_USERS = /table\s*:\s*['"](?:\{\{%users\}\}|users)['"]/;
const NAMED_LAST_LOGIN = /column\s*:\s*['"]last_login_at['"]/;

/** A `-><fn>(...)` call on the users.last_login_at pair: named args in any order,
 *  or positional with the table name before the column name (order-sensitive). */
const callsOperation = (body, fn) => {
  if (body === null) return false;
  let hit = false;
  for (const m of body.matchAll(new RegExp(`->\\s*${fn}\\s*\\(`, 'g'))) {
    const args = callArgs(body, m.index);
    if (NAMED_USERS.test(args) && NAMED_LAST_LOGIN.test(args)) hit = true;
    else if (USERS.test(args) && LAST_LOGIN.test(args)) {
      const tableIdx = args.search(USERS);
      const columnIdx = args.search(LAST_LOGIN);
      if (tableIdx !== -1 && columnIdx !== -1 && tableIdx < columnIdx) hit = true;
    }
  }
  return hit;
};

/** implements RevertibleMigrationInterface (use-import + short name, or FQCN). */
const isRevertible = (t) =>
  (/use\s+Yiisoft\\Db\\Migration\\RevertibleMigrationInterface\s*;/.test(t) && /implements\s+[\w\\,\s]*\bRevertibleMigrationInterface\b/.test(t))
  || /implements\s+[\w\\,\s]*\\?Yiisoft\\Db\\Migration\\RevertibleMigrationInterface\b/.test(t);

export default [
  check('migration-added', 'A new migration class file was appended under migrations/ (M<12-digit timestamp> naming)', ({ changed }) => {
    const m = newMigrations(changed);
    return m.length ? ok(m.map((x) => x.path).join(', ')) : fail('no new migrations/M<12-digit>*.php file was added');
  }),

  check('revertible-contract', 'Every new migration implements Yiisoft\\Db\\Migration\\RevertibleMigrationInterface (the rollback contract)', ({ changed }) => {
    const m = newMigrations(changed);
    if (!m.length) return fail('no new migration files');
    const bad = m.filter((f) => !isRevertible(read(f.abs)));
    return bad.length ? fail(`not implementing RevertibleMigrationInterface: ${bad.map((b) => b.path)}`) : ok(m.map((x) => x.path).join(', '));
  }),

  check('up-addcolumn', 'up() of the new migration adds the column: addColumn("users", "last_login_at", ...) in that order', ({ changed }) => {
    const m = newMigrations(changed);
    if (!m.length) return fail('no new migration files');
    const good = m.filter((f) => callsOperation(methodBody(read(f.abs), 'up'), 'addColumn'));
    return good.length ? ok(good.map((x) => x.path).join(', ')) : fail('no addColumn(users, last_login_at, ...) call found in any new migration up()');
  }),

  check('down-drops-column', 'down() of the new migration reverts: dropColumn("users", "last_login_at")', ({ changed }) => {
    const m = newMigrations(changed);
    if (!m.length) return fail('no new migration files');
    const good = m.filter((f) => callsOperation(methodBody(read(f.abs), 'down'), 'dropColumn'));
    return good.length ? ok(good.map((x) => x.path).join(', ')) : fail('no dropColumn(users, last_login_at) call found in any new migration down()');
  }),

  check('no-raw-sql', 'No raw ALTER TABLE SQL in changed migration files (MigrationBuilder API only)', ({ changed }) => {
    const re = /ALTER\s+TABLE/i;
    const bad = migrationChanges(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('existing-migration-untouched', 'The pre-existing CreateUsersTable migration was NOT modified', ({ changed }) => {
    const touched = changed.filter((c) => c.path === EXISTING_MIGRATION);
    return touched.length ? fail(`${EXISTING_MIGRATION} was modified - deployed history must stay untouched`) : ok();
  }),

  check('discoverable-namespace', 'The new migration is discoverable: same namespace as the existing migrations', ({ changed, base }) => {
    const m = newMigrations(changed);
    if (!m.length) return fail('no new migration files');
    const existing = read(`${base.replace(/\\/g, '/')}/${EXISTING_MIGRATION}`);
    const expected = /namespace\s+([\w\\]+)\s*;/.exec(existing)?.[1];
    if (!expected) return fail('fixture migration namespace not found');
    const bad = m.filter((f) => {
      const ns = /namespace\s+([\w\\]+)\s*;/.exec(read(f.abs))?.[1];
      return ns !== expected;
    });
    return bad.length ? fail(`namespace differs from existing migrations (${expected}): ${bad.map((b) => b.path)}`) : ok(m.map((x) => x.path).join(', '));
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
];
