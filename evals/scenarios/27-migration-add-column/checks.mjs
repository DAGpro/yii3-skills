import { check, ok, fail, read, methodBody } from '../../lib/checks.mjs';
import { noYii2Check, strictTypesCheck, overrideAdvisoryCheck } from '../../lib/shared-checks.mjs';
import { extractCalls, resolveScalar } from '../../lib/semantic.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const migrationChanges = (changed) => php(changed).filter((c) => /^migrations\/.*\.php$/.test(c.path));
const newMigrations = (changed) => changed.filter((c) => c.added && /^migrations\/M\d{12}\w*\.php$/.test(c.path));

const EXISTING_MIGRATION = 'migrations/M260101010101CreateUsersTable.php';

const normTable = (t) => (t ?? '').replace(/^\{\{%/, '').replace(/%\}\}$/, '');

/** A `-><fn>(...)` call on the users.last_login_at pair: positional, named, or
 *  class-constant form (constants are resolved against the file's const definitions). */
const callsOperation = (body, fileText, fn, table, column) => {
  if (body === null) return false;
  for (const c of extractCalls(body)) {
    if (c.fn !== fn) continue;
    const t = normTable(resolveScalar(c.positional[0] ?? c.named.table, fileText));
    const col = resolveScalar(c.positional[1] ?? c.named.column, fileText);
    if (t === table && col === column) return true;
  }
  return false;
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

  check('up-addcolumn', 'up() of the new migration adds the column: addColumn(users, last_login_at, ...) (positional, named, or class-constant form)', ({ changed }) => {
    const m = newMigrations(changed);
    if (!m.length) return fail('no new migration files');
    const good = m.filter((f) => callsOperation(methodBody(read(f.abs), 'up'), read(f.abs), 'addColumn', 'users', 'last_login_at'));
    return good.length ? ok(good.map((x) => x.path).join(', ')) : fail('no addColumn(users, last_login_at, ...) call found in any new migration up()');
  }),

  check('down-drops-column', 'down() of the new migration reverts exactly that column: dropColumn(users, last_login_at)', ({ changed }) => {
    const m = newMigrations(changed);
    if (!m.length) return fail('no new migration files');
    const good = m.filter((f) => callsOperation(methodBody(read(f.abs), 'down'), read(f.abs), 'dropColumn', 'users', 'last_login_at'));
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

  noYii2Check(),
  overrideAdvisoryCheck(),

  strictTypesCheck(),
];
