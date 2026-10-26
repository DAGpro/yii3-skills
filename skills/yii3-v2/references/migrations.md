# Yii3 Database Migrations Guide

> Practical patterns for schema DDL, foreign keys, indexes, data seeding, and reversible migrations using `yiisoft/db-migration` and `yiisoft/db`.

---

## Table of Contents
- [1. Migration Architecture & Interface Contracts](#1-migration-architecture--interface-contracts)
- [2. Migration Class & File Naming Conventions](#2-migration-class--file-naming-conventions)
- [3. Standard Table Creation with Modern ColumnBuilder](#3-standard-table-creation-with-modern-columnbuilder)
- [4. Foreign Key Constraints](#4-foreign-key-constraints)
- [5. Schema Alterations & DDL Operations Reference](#5-schema-alterations--ddl-operations-reference)
- [6. Data Migrations, Seeding & Batch Operations](#6-data-migrations-seeding--batch-operations)
- [7. Application Configuration (config/params.php)](#7-application-configuration-configparamsphp)
- [8. Console Migration Commands](#8-console-migration-commands)
- [9. Anti-Pattern Matrix](#9-anti-pattern-matrix)
- [10. Related Topic Guides](#10-related-topic-guides)

---

## 1. Migration Architecture & Interface Contracts

In Yii3, migrations are plain PHP classes with dependency injection support. They do **not** extend any monolithic framework base class (unlike Yii2's `\yii\db\Migration`).

All migration classes interact with the database via `Yiisoft\Db\Migration\MigrationBuilder`, passed as an explicit argument to migration methods.

> [!TIP]
> Migrations establish and maintain the database schema consumed by `yiisoft/db`, `yiisoft/active-record`, and `yiisoft/yii-cycle` repositories. For query builders, Data Mapper patterns, and transaction management in the application layer, see [Database Persistence Guide](persistence-db.md), [Active Record Persistence Guide](persistence-active-record.md), and [Cycle ORM Persistence Guide](persistence-cycle-orm.md).

### Core Interface Contracts

| Interface | FQCN | Purpose |
|---|---|---|
| **`MigrationInterface`** | `Yiisoft\Db\Migration\MigrationInterface` | Defines `up(MigrationBuilder $b): void`. Used for any migration (including irreversible one-way migrations). |
| **`RevertibleMigrationInterface`** | `Yiisoft\Db\Migration\RevertibleMigrationInterface` | Extends `MigrationInterface`. Adds `down(MigrationBuilder $b): void`. Required for migrations that can be rolled back. |
| **`TransactionalMigrationInterface`** | `Yiisoft\Db\Migration\TransactionalMigrationInterface` | Marker interface. When implemented, `Migrator` wraps `up()` and `down()` execution within `$db->transaction()`. |

> [!IMPORTANT]
> - `Yiisoft\Db\Migration\Runner\DownRunner` strictly requires `RevertibleMigrationInterface`. If a migration only implements `MigrationInterface`, the runner rejects rollback attempts with a type error, preventing accidental corruption.
> - **DDL Transaction Warning:** On PostgreSQL and SQLite, DDL statements are transactional. However, on MySQL and MariaDB, DDL statements trigger **implicit commits**. On MySQL/MariaDB, `TransactionalMigrationInterface` cannot roll back schema errors mid-migration; structure your migrations carefully.

---

## 2. Migration Class & File Naming Conventions

Yii3 discovery in `Yiisoft\Db\Migration\Service\MigrationService::loadMigrationClasses()` scans files matching the strict regular expression:
```regex
/^(M(\d{12}).*)\.php$/s
```

The timestamp **must contain exactly 12 contiguous digits** (`YYMMDDHHMMSS`) immediately following the capital letter `M`.

### Class and File Format

```text
M<YYMMDDHHMMSS><PascalCaseDescription>.php
```

Example path:
```text
src/Infrastructure/Migration/M261022120000CreateUserTable.php
```

> [!CAUTION]
> **Yii2 vs Yii3 Timestamp Naming Trap:**
> In Yii2, migration files were formatted as `mYYMMDD_HHMMSS_description.php` (with an underscore between date and time).
> In Yii3, an underscore between the 6th and 7th digit (e.g. `M261022_120000...`) fails the `\d{12}` regex match. **Yii3 will silently ignore the file** and report that there are no new migrations to apply.

---

## 3. Standard Table Creation with Modern `ColumnBuilder`

Yii3 introduces fluent `Yiisoft\Db\Schema\Column\ColumnBuilder` as the preferred, type-safe method to construct database columns. The builder is available via `$b->columnBuilder()`, which automatically resolves to the database driver's specific column builder (e.g. PostgreSQL, MySQL, SQLite).

### 3.1. Complete Reversible Migration

```php
declare(strict_types=1);

namespace App\Infrastructure\Migration;

use Yiisoft\Db\Constant\IndexType;
use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;
use Yiisoft\Db\Migration\TransactionalMigrationInterface;

/**
 * Creates table `{{%user}}` with indexes.
 */
final class M261022120000CreateUserTable implements RevertibleMigrationInterface, TransactionalMigrationInterface
{
    private const TABLE_NAME = '{{%user}}';

    public function up(MigrationBuilder $b): void
    {
        $columns = $b->columnBuilder();

        // 1. Create table schema
        $b->createTable(
            table: self::TABLE_NAME,
            columns: [
                'id' => $columns::primaryKey(),
                'username' => $columns::string(64)->notNull(),
                'email' => $columns::string(255)->notNull(),
                'status' => $columns::smallint()->notNull()->defaultValue(1)->comment('User status flag'),
                'settings' => $columns::json()->null(),
                'rating' => $columns::decimal(10, 2)->notNull()->defaultValue(0.00),
                'created_at' => $columns::timestamp()->notNull(),
                'updated_at' => $columns::timestamp()->notNull(),
            ],
        );

        // 2. Add Unique Index on email
        $b->createIndex(
            table: self::TABLE_NAME,
            name: 'idx_user_email_unique',
            columns: 'email',
            indexType: IndexType::UNIQUE,
        );

        // 3. Add Composite Index on status + created_at
        $b->createIndex(
            table: self::TABLE_NAME,
            name: 'idx_user_status_created_at',
            columns: ['status', 'created_at'],
        );
    }

    public function down(MigrationBuilder $b): void
    {
        // Revert in strict reverse order
        $b->dropIndex(table: self::TABLE_NAME, name: 'idx_user_status_created_at');
        $b->dropIndex(table: self::TABLE_NAME, name: 'idx_user_email_unique');
        $b->dropTable(table: self::TABLE_NAME);
    }
}
```

### 3.2. `ColumnBuilder` Methods Cheat Sheet

| ColumnBuilder Method | Fluent Modifiers | Typical Output (DBMS Dependent) |
|---|---|---|
| `$columns::primaryKey(bool $autoIncrement = true)` | Built-in | `INT NOT NULL AUTO_INCREMENT PRIMARY KEY` |
| `$columns::bigPrimaryKey()` | Built-in | `BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY` |
| `$columns::uuidPrimaryKey()` | Built-in | `UUID NOT NULL PRIMARY KEY` |
| `$columns::string(?int $size = 255)` | `->notNull()`, `->null()`, `->defaultValue('val')`, `->unique()` | `VARCHAR(255)` |
| `$columns::text(?int $size = null)` | `->notNull()`, `->null()`, `->comment('...')` | `TEXT` |
| `$columns::integer(?int $size = null)` | `->unsigned()`, `->notNull()`, `->defaultValue(0)` | `INT` |
| `$columns::smallint(?int $size = null)` | `->unsigned()`, `->notNull()`, `->defaultValue(1)` | `SMALLINT` |
| `$columns::bigint(?int $size = null)` | `->unsigned()`, `->notNull()` | `BIGINT` |
| `$columns::boolean()` | `->notNull()`, `->defaultValue(false)` | `BOOLEAN` / `TINYINT(1)` |
| `$columns::decimal(?int $size = 10, ?int $scale = 0)` | `->notNull()`, `->defaultValue(0.00)` | `DECIMAL(10,0)` |
| `$columns::json()` | `->notNull()`, `->null()` | `JSON` |
| `$columns::timestamp(?int $size = 0)` | `->notNull()`, `->null()` | `TIMESTAMP` |
| `$columns::datetime(?int $size = 0)` | `->notNull()`, `->null()` | `DATETIME` |
| `$columns::date()` | `->notNull()`, `->null()` | `DATE` |
| `$columns::binary(?int $size = null)` | `->null()` | `BLOB` / `BYTEA` |
| `$columns::uuid()` | `->notNull()`, `->null()` | `UUID` / `VARCHAR(36)` |

> [!NOTE]
> You can also specify column definitions using raw strings (e.g. `'status' => 'smallint NOT NULL DEFAULT 1'`) or `Yiisoft\Db\Constant\ColumnType` constants (`ColumnType::STRING . '(255) NOT NULL'`), but `ColumnBuilder` is preferred for driver portability.

---

## 4. Foreign Key Constraints

Declare foreign keys using `MigrationBuilder::addForeignKey()`.

### Method Signature & Named Arguments
```php
public function addForeignKey(
    string $table,
    string $name,
    array|string $columns,
    string $referenceTable,
    array|string $referenceColumns,
    ?string $delete = null,
    ?string $update = null,
): void
```

> [!CAUTION]
> **Named Argument Fatal Error:**
> The parameter names in Yii3 `MigrationBuilder::addForeignKey` are **`$referenceTable`** and **`$referenceColumns`** (NOT `$refTable` and NOT `$refColumns`).
> Calling `addForeignKey(refTable: '...', refColumns: '...')` throws a fatal `Error: Unknown named parameter $refTable` in PHP 8.

### Complete Foreign Key Migration

```php
declare(strict_types=1);

namespace App\Infrastructure\Migration;

use Yiisoft\Db\Constant\ReferentialAction;
use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;
use Yiisoft\Db\Migration\TransactionalMigrationInterface;

/**
 * Creates table `{{%order}}` with foreign keys to `{{%user}}`.
 */
final class M261022130000CreateOrderTable implements RevertibleMigrationInterface, TransactionalMigrationInterface
{
    private const ORDER_TABLE = '{{%order}}';
    private const USER_TABLE = '{{%user}}';

    public function up(MigrationBuilder $b): void
    {
        $columns = $b->columnBuilder();

        // 1. Create Order Table
        $b->createTable(
            table: self::ORDER_TABLE,
            columns: [
                'id' => $columns::primaryKey(),
                'user_id' => $columns::integer()->notNull(),
                'total_cents' => $columns::bigint()->notNull()->defaultValue(0),
                'created_at' => $columns::timestamp()->notNull(),
            ],
        );

        // 2. Index foreign key column (essential for JOIN performance and locking)
        $b->createIndex(
            table: self::ORDER_TABLE,
            name: 'idx_order_user_id',
            columns: 'user_id',
        );

        // 3. Add Foreign Key Constraint
        $b->addForeignKey(
            table: self::ORDER_TABLE,
            name: 'fk_order_user_id',
            columns: 'user_id',
            referenceTable: self::USER_TABLE,
            referenceColumns: 'id',
            delete: ReferentialAction::RESTRICT,
            update: ReferentialAction::CASCADE,
        );
    }

    public function down(MigrationBuilder $b): void
    {
        // Drop foreign key BEFORE dropping the table or index
        $b->dropForeignKey(table: self::ORDER_TABLE, name: 'fk_order_user_id');
        $b->dropIndex(table: self::ORDER_TABLE, name: 'idx_order_user_id');
        $b->dropTable(table: self::ORDER_TABLE);
    }
}
```

### Referential Actions (`Yiisoft\Db\Constant\ReferentialAction`)
- `ReferentialAction::CASCADE`: Delete/update referencing row when referenced row is deleted/updated.
- `ReferentialAction::RESTRICT`: Prevent deletion/update of referenced row if referenced by child rows.
- `ReferentialAction::SET_NULL`: Set foreign key column to `NULL` (requires column to be nullable).
- `ReferentialAction::NO_ACTION`: Standard SQL default constraint check.
- `ReferentialAction::SET_DEFAULT`: Set foreign key column to its declared default value.

---

## 5. Schema Alterations & DDL Operations Reference

All DDL operations are executed through `MigrationBuilder`.

### 5.1. Adding, Dropping, and Altering Columns

```php
declare(strict_types=1);

namespace App\Infrastructure\Migration;

use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;
use Yiisoft\Db\Migration\TransactionalMigrationInterface;

final class M261022140000AddPhoneToUserTable implements RevertibleMigrationInterface, TransactionalMigrationInterface
{
    private const TABLE_NAME = '{{%user}}';

    public function up(MigrationBuilder $b): void
    {
        $columns = $b->columnBuilder();

        // Add a new nullable column
        $b->addColumn(
            table: self::TABLE_NAME,
            column: 'phone',
            type: $columns::string(32)->null()->comment('E.164 phone number'),
        );

        // Alter existing column definition
        $b->alterColumn(
            table: self::TABLE_NAME,
            column: 'username',
            type: $columns::string(100)->notNull(),
        );
    }

    public function down(MigrationBuilder $b): void
    {
        $columns = $b->columnBuilder();

        // Revert altered column
        $b->alterColumn(
            table: self::TABLE_NAME,
            column: 'username',
            type: $columns::string(64)->notNull(),
        );

        // Drop added column
        $b->dropColumn(table: self::TABLE_NAME, column: 'phone');
    }
}
```

### 5.2. Complete `MigrationBuilder` DDL Method Signatures

```php
// Table Operations
$b->createTable(string $table, array $columns, ?string $options = null): void
$b->dropTable(string $table): void
$b->renameTable(string $table, string $newName): void
$b->truncateTable(string $table): void

// Column Operations
$b->addColumn(string $table, string $column, ColumnInterface|string $type): void
$b->dropColumn(string $table, string $column): void
$b->alterColumn(string $table, string $column, ColumnInterface|string $type): void
$b->renameColumn(string $table, string $name, string $newName): void

// Primary & Foreign Keys
$b->addPrimaryKey(string $table, string $name, array|string $columns): void
$b->dropPrimaryKey(string $table, string $name): void
$b->addForeignKey(string $table, string $name, array|string $columns, string $referenceTable, array|string $referenceColumns, ?string $delete = null, ?string $update = null): void
$b->dropForeignKey(string $table, string $name): void

// Indexes
$b->createIndex(string $table, string $name, array|string $columns, ?string $indexType = null, ?string $indexMethod = null): void
$b->dropIndex(string $table, string $name): void

// Views
$b->createView(string $viewName, QueryInterface|string $subQuery): void
$b->dropView(string $viewName): void

// Comments
$b->addCommentOnTable(string $table, string $comment): void
$b->dropCommentFromTable(string $table): void
$b->addCommentOnColumn(string $table, string $column, string $comment): void
$b->dropCommentFromColumn(string $table, string $column): void

// Raw SQL Execution
$b->execute(string $sql, array $params = []): void
```

---

## 6. Data Migrations, Seeding & Batch Operations

For inserting seed data, lookup tables, and batch data updates, use `insertBatch()`, `upsert()`, `insert()`, and `delete()`.

> [!WARNING]
> **Deprecated Method Warning:**
> In Yii3 `yiisoft/db` 2.x and `yiisoft/db-migration`, `$b->batchInsert($table, $columns, $rows)` is **deprecated**.
> Use **`$b->insertBatch($table, $rows, $columns = [])`** instead. Note that `$rows` is now the second argument, and `$columns` is optional when passing associative rows.

### 6.1. Reversible Data Seeding Migration

```php
declare(strict_types=1);

namespace App\Infrastructure\Migration;

use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;
use Yiisoft\Db\Migration\TransactionalMigrationInterface;

final class M261022150000SeedDefaultRoles implements RevertibleMigrationInterface, TransactionalMigrationInterface
{
    private const TABLE_NAME = '{{%role}}';

    public function up(MigrationBuilder $b): void
    {
        // insertBatch accepts an iterable of associative rows directly:
        $b->insertBatch(
            table: self::TABLE_NAME,
            rows: [
                [
                    'code' => 'admin',
                    'name' => 'Administrator',
                    'created_at' => '2026-01-01 00:00:00',
                ],
                [
                    'code' => 'editor',
                    'name' => 'Content Editor',
                    'created_at' => '2026-01-01 00:00:00',
                ],
                [
                    'code' => 'user',
                    'name' => 'Standard User',
                    'created_at' => '2026-01-01 00:00:00',
                ],
            ],
        );
    }

    public function down(MigrationBuilder $b): void
    {
        $b->delete(
            table: self::TABLE_NAME,
            condition: ['code' => ['admin', 'editor', 'user']],
        );
    }
}
```

### 6.2. Irreversible One-Way Data Migration

When a data transformation cannot be safely reverted (e.g. data anonymization or destructive cleanup), implement `MigrationInterface` **without** `RevertibleMigrationInterface`:

```php
declare(strict_types=1);

namespace App\Infrastructure\Migration;

use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\MigrationInterface;
use Yiisoft\Db\Migration\TransactionalMigrationInterface;

/**
 * One-way data sanitization migration.
 */
final class M261022160000AnonymizeLegacyUserLogs implements MigrationInterface, TransactionalMigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $b->update(
            table: '{{%audit_log}}',
            columns: ['ip_address' => '0.0.0.0'],
            condition: 'created_at < :cutoff',
            params: [':cutoff' => '2025-01-01 00:00:00'],
        );
    }
}
```

---

## 7. Application Configuration (`config/params.php`)

Configure migration namespaces and paths in your application `config/params.php` under the `'yiisoft/db-migration'` key:

```php
declare(strict_types=1);

return [
    'yiisoft/db-migration' => [
        // Target namespace for newly generated migrations
        'newMigrationNamespace' => 'App\\Infrastructure\\Migration',

        // Path is left empty when namespaced migrations are used!
        'newMigrationPath' => '',

        // Default transaction mode for newly generated migrations
        'newMigrationTransactional' => true,

        // Namespaces to scan for pending migrations (application migrations)
        'sourceNamespaces' => [
            'App\\Infrastructure\\Migration',
        ],

        // Raw directory paths to scan (for non-namespaced vendor migrations).
        // Example: yiisoft/rbac-db ships its migrations as plain, non-namespaced classes
        // in the package's migrations/ directory, so it must be registered as a path.
        'sourcePaths' => [
            dirname(__DIR__) . '/vendor/yiisoft/rbac-db/migrations',
        ],

        // Additional named databases. Each entry is a `Yiisoft\Db\Migration\DatabaseConfig`
        // constructor argument set: 'db' is the DI service ID of its ConnectionInterface,
        // plus optional per-database migration sources and options ('newMigrationNamespace',
        // 'newMigrationPath', 'sourceNamespaces', 'sourcePaths', 'historyTable',
        // 'migrationNameLimit', 'useTablePrefix', 'maxSqlOutputLength',
        // 'newMigrationTransactional'). The name 'default' is reserved.
        'databases' => [
            'maps' => [
                'db' => 'db.maps',
                'newMigrationPath' => dirname(__DIR__, 2) . '/src/Infrastructure/Migration/Maps',
            ],
        ],
    ],
];
```

> [!CAUTION]
> **Mutual Exclusivity Rule in `migrate:create`:**
> `newMigrationNamespace` and `newMigrationPath` are mutually exclusive when generating a migration. If both are non-empty, `migrate:create` aborts with:
> "Only one of `newMigrationNamespace` or `newMigrationPath` should be specified."
> Always leave `newMigrationPath => ''` when using modern PSR-4 namespaced migrations.

---

## 8. Console Migration Commands

Yii3 console commands follow **Symfony Console** standards, using **colon notation** (`migrate:up`, NOT `migrate/up`).

```bash
# 1. Generate new migrations
./yii migrate:create user --command=table                    # Generates M...CreateUserTable
./yii migrate:create CreatePostTable                         # Blank migration skeleton
./yii migrate:create post --command=table --fields="title:string(255):notNull,body:text"

# 2. Apply pending migrations
./yii migrate:up                                             # Apply all pending migrations
./yii migrate:up --limit=3                                   # Apply next 3 migrations
./yii migrate:up --namespace=App\\Infrastructure\\Migration  # Apply from a specific namespace

# 3. Roll back migrations
./yii migrate:down                                           # Revert the last applied migration
./yii migrate:down --limit=2                                 # Revert the last 2 applied migrations
./yii migrate:down --all                                     # Revert ALL applied migrations

# 4. Redo migrations (revert then re-apply)
./yii migrate:redo                                           # Redo the last applied migration
./yii migrate:redo --limit=3                                 # Redo the last 3 migrations

# 5. Inspection commands
./yii migrate:history                                        # List the last 10 applied migrations
./yii migrate:history --all                                  # List complete migration history
./yii migrate:new                                            # List pending migrations not yet applied

# 6. History synchronization (changes history records only, never executes SQL)
./yii migrate:mark M261022120000CreateUserTable              # Set history at the target version (marks pending migrations up to it as applied, or drops later entries)
./yii migrate:mark --clear                                   # Remove all migration history entries
```

> [!WARNING]
> **`migrate:mark` changes history records without executing or checking any SQL.**
> A later `migrate:up` will execute migrations whose records were removed, and `migrate:down` can revert migrations marked as applied even though `migrate:mark` never executed them. Use it only when adopting migrations for an existing database or repairing a known history desync.

---

## 9. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| **`class M... extends \yii\db\Migration`** | Yii2 legacy base class; not present in Yii3. Results in `Class not found` fatal error. | Implement `RevertibleMigrationInterface` and inject `MigrationBuilder $b`. |
| **`addForeignKey(..., refTable: '...', refColumns: '...')`** | Parameter names in Yii3 `MigrationBuilder` are `$referenceTable` and `$referenceColumns`. PHP 8 named argument throws fatal `Error: Unknown named parameter`. | Use `referenceTable:` and `referenceColumns:` named arguments. |
| **Underscore in timestamp: `M261022_120000_Create...`** | `MigrationService` regex is `/^(M(\d{12}).*)\.php$/s`. The underscore breaks the 12-digit match, causing Yii3 to ignore the migration. | Use 12 contiguous digits without an underscore: `M261022120000Create...`. |
| **Slash in console command: `./yii migrate/up`** | Yii3 console uses Symfony Console syntax with colons. Slash commands fail with `Command not found`. | Use `./yii migrate:up`, `./yii migrate:create`, `./yii migrate:down`. |
| **`$b->batchInsert($table, $columns, $rows)`** | `batchInsert()` is deprecated and parameters changed order. | Use `$b->insertBatch(table: $table, rows: $rows, columns: $columns)`. |
| **Setting both `newMigrationNamespace` and `newMigrationPath`** | `MigrationService::before('migrate:create')` validates that only one is specified, failing with `Command::INVALID`. | Set `newMigrationNamespace` and leave `newMigrationPath => ''`. |
| **Empty `down()` for irreversible migrations** | Falsely claims the migration is reversible. If rolled back, schema/data is left in a broken, half-reverted state. | Implement `MigrationInterface` without `RevertibleMigrationInterface`. `DownRunner` will safely reject rollback. |
| **Raw table names: `'user'`** | Bypasses database prefix configuration (`tbl_user`). | Always wrap table names in prefix tokens: `'{{%user}}'`. |
| **`Yii::$app->db` inside migration** | Static service locator removed in Yii3. | Use `$b->getDb()` or methods on `$b`. |
| **Omitting indexes on foreign key columns** | Causes table lock escalations on updates/deletes and degrades JOIN performance. | Explicitly call `$b->createIndex()` on foreign key columns. |
| **Assuming MySQL/MariaDB DDL rolls back on failure** | MySQL/MariaDB executes implicit commits on DDL statements, defeating transactions. | Write small, atomic migrations and design cleanup scripts for partial failures on MySQL. |
| **Registering vendor migrations as a namespace, e.g. `'Yiisoft\Rbac\Db\Migrations'`** | Such vendor namespaces do not exist: `yiisoft/rbac-db` autoloads only `Yiisoft\Rbac\Db\` (its `src/`) and ships non-namespaced migration classes in its `migrations/` directory. The scanner finds nothing and reports no new migrations. | Register the package's directory in `sourcePaths` (e.g. `dirname(__DIR__) . '/vendor/yiisoft/rbac-db/migrations'`); reserve `sourceNamespaces` for PSR-4 autoloaded application migrations. |
| **Using `migrate:mark` as a shortcut for applying migrations** | `migrate:mark` only rewrites history rows and never executes SQL: the schema stays untouched while history claims the migrations are applied, and later migrations build on missing tables/columns. | Use `migrate:up`/`migrate:down` to change the schema. Reserve `migrate:mark` for adopting an existing database or repairing a known history desync. |
| **Hardcoding raw SQL types for standard columns** | Leads to incompatible migrations across different database drivers (e.g. PostgreSQL vs SQLite vs MySQL). | Use `$b->columnBuilder()` (`$columns::string()`, `$columns::json()`, `$columns::timestamp()`). |

---

## 10. Related Topic Guides

- [Database Persistence Guide](persistence-db.md) — Low-level `yiisoft/db` Connection, Query Builder, Transactions, and Data Readers.
- [Active Record Persistence Guide](persistence-active-record.md) — Active Record models, relations, lifecycle, and LazyLoadGuard.
- [Cycle ORM Persistence Guide](persistence-cycle-orm.md) — Clean Data Mapper persistence with Cycle ORM (`#[Entity]`, `EntityReader`).
- [Console Commands Guide](commands.md) — Running migration commands (`./yii migrate:*`) and console runners.

