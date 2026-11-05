# Yii3 Migrations: Configuration & Console Commands

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Part of the [Database Migrations Guide](persistence-migrations.md) split — the index and the schema-construction guide live there.

## 7. Application Configuration (`config/params.php`)

Configure migration paths, namespaces, and databases in `config/params.php` under the `'yiisoft/db-migration'` key:

```php
declare(strict_types=1);

use Yiisoft\Db\Migration\Migrator;
use Yiisoft\Db\Migration\Service\Generate\CreateService;

return [
    'yiisoft/db-migration' => [
        // Target namespace for newly generated migrations
        'newMigrationNamespace' => 'App\\Infrastructure\\Migration',

        // Path MUST be left empty when namespaced migrations are used!
        'newMigrationPath' => '',

        // Global default transaction mode for new migrations (true, false, or null for template defaults)
        'newMigrationTransactional' => true,

        // Application namespaces scanned for migrations
        'sourceNamespaces' => [
            'App\\Infrastructure\\Migration',
        ],

        // Concrete directory paths scanned for vendor migrations (non-namespaced)
        'sourcePaths' => [
            dirname(__DIR__) . '/vendor/yiisoft/rbac-db/migrations/items',
            dirname(__DIR__) . '/vendor/yiisoft/rbac-db/migrations/assignments',
        ],

        // Additional named databases (multi-DB setup)
        'databases' => [
            'analytics' => [
                'db' => 'db.analytics', // DI container service ID
                'newMigrationNamespace' => 'App\\Infrastructure\\Migration\\Analytics',
                'sourceNamespaces' => [
                    'App\\Infrastructure\\Migration\\Analytics',
                ],
            ],
        ],
    ],
];
```

---

### 7.1. Namespaces vs Paths Configuration

> [!CAUTION]
> **Mutual Exclusivity Invariant in `migrate:create`:**
> `newMigrationNamespace` and `newMigrationPath` are mutually exclusive.
> If both keys contain non-empty strings, `migrate:create` will terminate with:
> `Only one of "newMigrationNamespace" or "newMigrationPath" should be specified.`
> In modern Yii3 applications using PSR-4 autoloading, always set `newMigrationNamespace` and leave `'newMigrationPath' => ''`.

---

### 7.2. Vendor Migrations Scanning Invariant

Many official Yii3 packages (such as `yiisoft/rbac-db`) ship unnamespaced migration classes in subdirectories.

`MigrationService::loadMigrationClasses()` scans directory entries using PHP's non-recursive `readdir()`. It tests each immediate entry against `/^(M(\d{12}).*)\.php$/s`.

> [!CAUTION]
> **Non-Recursive Subdirectory Trap:**
> `yiisoft/rbac-db` does not store migration files at its root `migrations/` directory; it organizes them into subdirectories:
> ```text
> vendor/yiisoft/rbac-db/migrations/
> ├── items/
> │   └── M240118192500CreateItemsTables.php
> └── assignments/
>     └── M240118192500CreateAssignmentsTable.php
> ```
> If you specify `dirname(__DIR__) . '/vendor/yiisoft/rbac-db/migrations'`, the non-recursive scanner will encounter the subdirectories `items` and `assignments`, fail the `.php` regex, and discover **0 migrations**.
> **Always point `sourcePaths` directly to the specific subdirectories** containing the migration files:
> ```php
> 'sourcePaths' => [
>     dirname(__DIR__) . '/vendor/yiisoft/rbac-db/migrations/items',
>     dirname(__DIR__) . '/vendor/yiisoft/rbac-db/migrations/assignments',
> ],
> ```

---

### 7.3. Multi-Database Configuration (`DatabaseConfig`)

Each entry in the `'databases'` array corresponds to a `Yiisoft\Db\Migration\DatabaseConfig` instance:

| Property | Type | Description |
|---|---|---|
| `db` | `ConnectionInterface` | DI service ID or reference to the connection. |
| `newMigrationNamespace` | `string` | Namespace for new migrations on this database. |
| `newMigrationPath` | `string` | Directory path for new migrations (if not namespaced). |
| `sourceNamespaces` | `array` | Namespaces to scan for this database. |
| `sourcePaths` | `array` | Directory paths to scan for this database. |
| `historyTable` | `string` | History table name (default: `{{%migration}}`). |
| `migrationNameLimit` | `?int` | Maximum class name length (default: 180). |
| `useTablePrefix` | `bool` | Whether to apply table prefix (default: `true`). |
| `maxSqlOutputLength` | `?int` | Maximum length of logged SQL statements in console. |
| `newMigrationTransactional` | `?bool` | Transaction mode for new migrations on this database. |

> [!NOTE]
> The database name `'default'` is reserved by `Yiisoft\Db\Migration\DatabaseRegistry::DEFAULT_DATABASE` for the primary database connection.

---

## 8. Console Migration Commands & Automation

Yii3 console commands follow **Symfony Console** standards, using **colon notation** (`migrate:up`, NOT `migrate/up`).

### 8.1. Scaffolding New Migrations (`migrate:create`)

```bash
# 1. Blank migration skeleton
./yii migrate:create CreatePostTable

# 2. Scaffolding a full table migration
./yii migrate:create post --command=table

# 3. Scaffolding with rich column types and foreign keys
./yii migrate:create order --command=table --fields="user_id:integer:foreignKey(user id),total:decimal(10,2):defaultValue(0.00)"

# 4. Junction (Pivot) table for many-to-many relationships
./yii migrate:create post --command=junction --and=tag

# 5. Add columns to an existing table
./yii migrate:create add_avatar_to_user --command=addColumn --fields="avatar_url:string(255):null"

# 6. Drop columns from an existing table
./yii migrate:create drop_temp_from_user --command=dropColumn --fields="temp_token"

# 7. Drop an existing table
./yii migrate:create drop_legacy_log --command=dropTable

# 8. Controlling transactions and table comments
./yii migrate:create audit --command=table --table-comment="Audit log entries" --no-transactional
```

#### Junction Table Scaffolding Logic
Running `--command=junction --and=<table2>` automatically generates:
1. Two integer foreign key columns: `<table1>_id` and `<table2>_id`.
2. Composite primary key: `PRIMARY KEY(table1_id, table2_id)`.
3. Two foreign keys with `CASCADE` referential action: `fk-<table1>_<table2>-<table1>_id` and `fk-<table1>_<table2>-<table2>_id`.
4. Table name: `<table1>_<table2>`.

#### Available `migrate:create` Options
- `--command=` (`-c`): Template type (`create`, `table`, `dropTable`, `addColumn`, `dropColumn`, `junction`).
- `--fields=` (`-f`): Comma-separated list of columns and types. Supports `foreignKey(targetTable targetColumn)` syntax.
- `--and=`: Second table name for `junction` command.
- `--table-comment=`: Adds table comment DDL.
- `--transactional` / `--no-transactional`: `VALUE_NEGATABLE` option to override transaction mode.
- `--db=`: Specifies target database from `'databases'` configuration.

---

### 8.2. Applying Migrations (`migrate:up` & CI/CD)

```bash
# Apply all pending migrations on default database
./yii migrate:up

# Apply next 3 migrations
./yii migrate:up --limit=3

# Apply only from a specific namespace
./yii migrate:up --namespace=App\\Infrastructure\\Migration

# Apply to a specific named database
./yii migrate:up --db=analytics

# Automated execution in Docker / CI/CD pipelines (non-interactive)
./yii migrate:up --force-yes
```

> [!IMPORTANT]
> **CI/CD Automation Invariant (`--force-yes` / `-y`):**
> When running migrations inside CI/CD runners, deployment scripts, or Docker container entrypoints, **always pass the `--force-yes` (or `-y`) flag**. Without `-y`, the command waits indefinitely for interactive confirmation (`Apply the above migration? (yes/no) [no]:`), causing the build pipeline to hang or timeout.

#### Multi-Database Execution Behavior
Once additional databases are configured under `'yiisoft/db-migration' => ['databases' => [...]]` in `config/params.php`, the `--db` option is **mandatory** for every migration command. Running `./yii migrate:up` without `--db` does **not** fan out to all configured databases — the command aborts with the error:
```text
The --db option is required when multiple databases are configured.
```
Only when no additional databases are configured does the command fall back to the `default` database automatically. Targeted runs (`--namespace`, `--path`) must always name the database explicitly.

---

### 8.3. Rolling Back & Redoing Migrations (`migrate:down` & `migrate:redo`)

```bash
# Revert the last applied migration
./yii migrate:down

# Revert the last 3 applied migrations
./yii migrate:down --limit=3

# Revert ALL applied migrations (destructive!)
./yii migrate:down --all --force-yes

# Redo the last applied migration (down then up)
./yii migrate:redo

# Redo the last 3 migrations non-interactively
./yii migrate:redo --limit=3 -y
```

---

### 8.4. Inspection Commands (`migrate:history` & `migrate:new`)

```bash
# List last 10 applied migrations
./yii migrate:history

# List all applied migrations
./yii migrate:history --all

# List unapplied (pending) migrations
./yii migrate:new

# Inspect history on a secondary database
./yii migrate:history --db=analytics
```

---

### 8.5. History Synchronization (`migrate:mark`)

`migrate:mark` updates the migration history table records **without executing any DDL or SQL queries**.

```bash
# Mark all migrations up to the specified version as applied
./yii migrate:mark M261022120000CreateUserTable -y

# Clear all migration history entries (resets history table to empty)
./yii migrate:mark --clear -y
```

> [!WARNING]
> **`migrate:mark` changes history records without executing SQL.**
> A later `migrate:up` will execute migrations whose records were removed, and `migrate:down` can attempt to revert migrations that were never physically applied. Use `migrate:mark` only when:
> 1. Adopting existing databases into a new migration history.
> 2. Repairing a known history desync between environments.

---

## 9. Anti-Pattern Matrix

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
| **Executing `alterColumn` or `dropColumn` on SQLite** | `Yiisoft\Db\Sqlite\DDLQueryBuilder` throws `NotSupportedException` on 18 alteration methods. | Use the Table Copy-and-Rename pattern when running schema alterations on SQLite. |
| **Calling `$b->checkIntegrity()` on `MigrationBuilder`** | Method does not exist on `MigrationBuilder`. Calling it causes fatal `Error: Call to undefined method`. | Invoke via command: `$b->getDb()->createCommand()->checkIntegrity(...)`. |
| **Calling `$columns::interval()` on `ColumnBuilder`** | Method does not exist on `ColumnBuilder`. Causes fatal `Error: Call to undefined method`. | Use `$columns::string()->dbType('interval')`. |
| **Autowiring domain repositories or Active Record models in migration constructors** | Repositories and models assume the database schema already exists. Instantiating them before migrations run triggers schema errors. | Inject only infrastructure services (`LoggerInterface`, `PasswordHasher`, `Aliases`) into migrations. |
| **Omitting `--force-yes` (`-y`) in CI/CD pipelines** | Console prompts for interactive confirmation, causing automated builds and Docker entrypoints to hang indefinitely. | Always pass `-y` / `--force-yes` in automated environments: `./yii migrate:up -y`. |

---

## 10. Related Topic Guides

- [Database Persistence Guide](persistence-db.md) — Low-level `yiisoft/db` Connection, Query Builder, Transactions, and Data Readers.
- [Active Record Persistence Guide](persistence-active-record.md) — Active Record models, relations, lifecycle, and LazyLoadGuard.
- [Cycle ORM Persistence Guide](persistence-cycle-orm.md) — Clean Data Mapper persistence with Cycle ORM (`#[Entity]`, `EntityReader`).
- [Console Commands Guide](infra-commands.md) — Running migration commands (`./yii migrate:*`) and console runners.
- [I18n & Translation Guide](http-i18n-translation.md) — Creating the `yii_source_message` / `yii_message` translation schema for the DB message source.