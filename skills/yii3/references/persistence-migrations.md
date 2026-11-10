# Yii3 Database Migrations Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Practical patterns for schema DDL, foreign keys, indexes, data seeding, multi-database management, and reversible migrations using `yiisoft/db-migration` and `yiisoft/db`.

This topic is split into two focused guides — load the one that matches the task:

- [Schema Construction & Data Seeding](persistence-migrations-schema.md) — migration architecture & interface contracts, class/file naming, modern `ColumnBuilder` schema construction, foreign keys & cross-DBMS portability, DDL alterations, data migrations & streaming seeds (§1–§6).
- [Configuration & Console Commands](persistence-migrations-operations.md) — `config/params.php` for the migration tool, the full console command catalog, namespaces, multi-database targets, CI/Docker automation (§7–§8).

## Anti-Pattern Matrix (Module-Wide: Migrations)

Audited at Stage 6 (Config Audit & Consolidation) and the Finale Code-to-Reference audit. The child guides carry no separate matrices — this is the single migrations module matrix.

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| **`class M... extends \yii\db\Migration`** | Yii2 legacy base class; does not exist in Yii3. Causes fatal `Error: Class not found`. | Implement `MigrationInterface` or `RevertibleMigrationInterface` and use `MigrationBuilder $b`. |
| **`addForeignKey(..., refTable: '...', refColumns: '...')`** | Parameter names in `MigrationBuilder` are `$referenceTable` and `$referenceColumns`. PHP 8 named argument throws fatal `Unknown named parameter`. | Use `referenceTable:` and `referenceColumns:` named arguments. |
| **Underscore in filename: `M261022_120000...`** | `MigrationService` regex is `/^(M(\d{12}).*)\.php$/s`. The underscore breaks the 12 contiguous digits match, causing Yii3 to silently ignore the file. | Use 12 contiguous digits without underscores: `M261022120000Create...`. |
| **Slash in console commands: `./yii migrate/up`** | Yii3 console uses Symfony Console syntax with colons. Slashes fail with `Command not found`. | Use `./yii migrate:up`, `./yii migrate:create`, `./yii migrate:down`. |
| **`$b->batchInsert($table, $columns, $rows)`** | `batchInsert()` is deprecated; parameter order changed. | Use `$b->insertBatch(table: $table, rows: $rows, columns: $columns)`. |
| **Setting both `newMigrationNamespace` and `newMigrationPath`** | `MigrationService::before('migrate:create')` enforces mutual exclusivity, terminating with `Command::INVALID`. | Set `newMigrationNamespace` and leave `'newMigrationPath' => ''`. |
| **Empty `down()` for irreversible migrations** | Falsely claims the migration is revertible. Rollback leaves schema or data in a corrupted state. | Implement `MigrationInterface` without `RevertibleMigrationInterface`. `MigrationService::makeRevertibleMigration()` will safely reject rollback. |
| **Raw table names without tokens: `'user'`** | Bypasses database table prefix configuration (`tbl_user`). | Wrap all table names in prefix tokens: `'{{%user}}'`. |
| **`Yii::$app->db` inside migration** | Static service locator removed in Yii3. | Use `$b->getDb()` to access `ConnectionInterface`. |
| **Omitting indexes on foreign key columns** | Causes full table scans during `JOIN` queries and row lock escalations on updates/deletes. | Call `$b->createIndex()` on foreign key columns before adding foreign key constraints. |
| **Assuming MySQL/MariaDB DDL rolls back on failure** | MySQL executes implicit commits on DDL, leaving tables created while history rolls back. | Write small, atomic migrations and design cleanup scripts for partial failures on MySQL. |
| **`sourcePaths` pointing to vendor parent directory: `'vendor/yiisoft/rbac-db/migrations'`** | `MigrationService` scans non-recursively. Package migrations reside in subdirectories `migrations/items` and `migrations/assignments`. 0 migrations will be found. | Register exact subdirectories in `sourcePaths`: `dirname(__DIR__) . '/vendor/yiisoft/rbac-db/migrations/items'` and `.../assignments`. |
| **Using `migrate:mark` as a substitute for running migrations** | `migrate:mark` only modifies history rows and never executes SQL. The database schema remains untouched while history claims it exists. | Use `migrate:up` to change schema. Reserve `migrate:mark` for baselining existing databases. |
| **Calling `->unsigned()` on PostgreSQL, SQLite, MSSQL, Oracle** | `unsigned()` is supported exclusively by MySQL. All other drivers throw fatal `NotSupportedException`. | Use check constraints (`->check('val >= 0')`) or use `bigint` for portable migrations. |
| **Passing `ReferentialAction::RESTRICT` on MSSQL/Oracle** | Neither driver emits the `RESTRICT` keyword; it is silently dropped from the generated DDL and the constraint falls back to `NO ACTION` behavior. No error is raised. | Use `ReferentialAction::NO_ACTION` explicitly, or omit `$delete`/`$update` (`null`). |
| **Passing `$update` clause on Oracle** | Oracle Database does not support `ON UPDATE` on foreign keys. Throws fatal `Exception: Oracle does not support ON UPDATE clause.`. | Leave `$update: null` on Oracle. |
| **Executing `alterColumn` or `dropColumn` on SQLite** | `Yiisoft\Db\Sqlite\DDLQueryBuilder` throws `NotSupportedException` on 17 alteration methods unconditionally (plus `dropTable()` when called with `$cascade = true`). | Use the Table Copy-and-Rename pattern when running schema alterations on SQLite. |
| **Calling `$b->checkIntegrity()` on `MigrationBuilder`** | Method does not exist on `MigrationBuilder`. Calling it causes fatal `Error: Call to undefined method`. | Invoke via command: `$b->getDb()->createCommand()->checkIntegrity(...)`. |
| **Calling `$columns::interval()` on `ColumnBuilder`** | Method does not exist on `ColumnBuilder`. Causes fatal `Error: Call to undefined method`. | Use `$columns::string()->dbType('interval')`. |
| **Autowiring domain repositories or Active Record models in migration constructors** | Repositories and models assume the database schema already exists. Instantiating them before migrations run triggers schema errors. | Inject only infrastructure services (`LoggerInterface`, `PasswordHasher`, `Aliases`) into migrations. |
| **Omitting `--force-yes` (`-y`) in CI/CD pipelines** | Console prompts for interactive confirmation, causing automated builds and Docker entrypoints to hang indefinitely. | Always pass `-y` / `--force-yes` in automated environments: `./yii migrate:up -y`. |

Related guides: [Database Persistence](persistence-db.md), [Active Record](persistence-active-record.md), [Cycle ORM](persistence-cycle-orm.md), [Console Commands](infra-commands.md), [i18n & Translation](http-i18n-translation.md) (translation schema).
