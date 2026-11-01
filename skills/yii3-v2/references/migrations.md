# Yii3 Database Migrations Guide

> Practical patterns for schema DDL, foreign keys, indexes, data seeding, multi-database management, and reversible migrations using `yiisoft/db-migration` and `yiisoft/db`.

---

## Table of Contents
- [1. Migration Architecture & Interface Contracts](#1-migration-architecture--interface-contracts)
  - [1.1. Core Interface Contracts](#11-core-interface-contracts)
  - [1.2. Dependency Injection in Migrations](#12-dependency-injection-in-migrations)
  - [1.3. Transactional DDL & DBMS Implicit Commits](#13-transactional-ddl--dbms-implicit-commits)
- [2. Migration Class & File Naming Conventions](#2-migration-class--file-naming-conventions)
  - [2.1. Discovery Regex & 12-Digit Timestamp Requirement](#21-discovery-regex--12-digit-timestamp-requirement)
  - [2.2. Directory & Namespace Structure](#22-directory--namespace-structure)
- [3. Schema Construction with Modern ColumnBuilder](#3-schema-construction-with-modern-columnbuilder)
  - [3.1. Complete Reversible Migration Example](#31-complete-reversible-migration-example)
  - [3.2. Complete ColumnBuilder Method Reference](#32-complete-columnbuilder-method-reference)
  - [3.3. Fluent Modifiers & The unsigned() Rejection Invariant](#33-fluent-modifiers--the-unsigned-rejection-invariant)
  - [3.4. DBMS-Specific Column Types & Mappings](#34-dbms-specific-column-types--mappings)
  - [3.5. Schema Qualification Syntax](#35-schema-qualification-syntax)
- [4. Foreign Key Constraints & Cross-DBMS Portability](#4-foreign-key-constraints--cross-dbms-portability)
  - [4.1. Method Signature & Named Arguments Invariant](#41-method-signature--named-arguments-invariant)
  - [4.2. Complete Foreign Key Migration Example](#42-complete-foreign-key-migration-example)
  - [4.3. Referential Actions & Cross-DBMS Compatibility Matrix](#43-referential-actions--cross-dbms-compatibility-matrix)
  - [4.4. Foreign Key Integrity Checks](#44-foreign-key-integrity-checks)
- [5. Schema Alterations & DDL Operations Reference](#5-schema-alterations--ddl-operations-reference)
  - [5.1. Adding, Dropping, and Altering Columns](#51-adding-dropping-and-altering-columns)
  - [5.2. Complete MigrationBuilder DDL Method Signatures](#52-complete-migrationbuilder-ddl-method-signatures)
  - [5.3. SQLite Schema Alteration Restrictions & Copy-and-Rename Workaround](#53-sqlite-schema-alteration-restrictions--copy-and-rename-workaround)
- [6. Data Migrations, Seeding & High-Performance Streaming](#6-data-migrations-seeding--high-performance-streaming)
  - [6.1. Reversible Data Seeding with insertBatch()](#61-reversible-data-seeding-with-insertbatch)
  - [6.2. High-Performance Stream & Chunk Processing with Query::batch()](#62-high-performance-stream--chunk-processing-with-querybatch)
  - [6.3. Irreversible One-Way Data Migration](#63-irreversible-one-way-data-migration)
  - [6.4. Complete DML API Reference](#64-complete-dml-api-reference)
- [7. Application Configuration (config/params.php)](#7-application-configuration-configparamsphp)
  - [7.1. Namespaces vs Paths Configuration](#71-namespaces-vs-paths-configuration)
  - [7.2. Vendor Migrations Scanning Invariant](#72-vendor-migrations-scanning-invariant)
  - [7.3. Multi-Database Configuration (DatabaseConfig)](#73-multi-database-configuration-databaseconfig)
- [8. Console Migration Commands & Automation](#8-console-migration-commands--automation)
  - [8.1. Scaffolding New Migrations (migrate:create)](#81-scaffolding-new-migrations-migratecreate)
  - [8.2. Applying Migrations (migrate:up & CI/CD)](#82-applying-migrations-migrateup--cicd)
  - [8.3. Rolling Back & Redoing Migrations (migrate:down & migrate:redo)](#83-rolling-back--redoing-migrations-migratedown--migrateredo)
  - [8.4. Inspection Commands (migrate:history & migrate:new)](#84-inspection-commands-migratehistory--migratenew)
  - [8.5. History Synchronization (migrate:mark)](#85-history-synchronization-migratemark)
- [9. Anti-Pattern Matrix](#9-anti-pattern-matrix)
- [10. Related Topic Guides](#10-related-topic-guides)

---

## 1. Migration Architecture & Interface Contracts

In Yii3, database migrations are plain PHP classes. They do **not** extend any monolithic framework base class (unlike Yii2's `\yii\db\Migration`).

All migration classes interact with the database via `Yiisoft\Db\Migration\MigrationBuilder`, which is passed as an explicit argument to migration methods (`up()`, `down()`).

> [!TIP]
> Migrations establish and maintain the database schema consumed by `yiisoft/db`, `yiisoft/active-record`, and `yiisoft/yii-cycle` repositories. For query builders, Data Mapper patterns, and transaction management in the application layer, see [Database Persistence Guide](persistence-db.md), [Active Record Persistence Guide](persistence-active-record.md), and [Cycle ORM Persistence Guide](persistence-cycle-orm.md).

### 1.1. Core Interface Contracts

Yii3 decomposes migration responsibilities into three distinct, composable interfaces:

| Interface | FQCN | Purpose |
|---|---|---|
| **`MigrationInterface`** | `Yiisoft\Db\Migration\MigrationInterface` | Defines `up(MigrationBuilder $b): void`. The minimal contract for all migrations (including irreversible one-way migrations). |
| **`RevertibleMigrationInterface`** | `Yiisoft\Db\Migration\RevertibleMigrationInterface` | Extends `MigrationInterface`. Adds `down(MigrationBuilder $b): void`. Mandatory for any migration supporting rollback. |
| **`TransactionalMigrationInterface`** | `Yiisoft\Db\Migration\TransactionalMigrationInterface` | Extends `MigrationInterface`. Empty marker interface (`{}`). When implemented, `Migrator` wraps execution within `$db->transaction()`. |

#### Strict Type Enforcement in Rollbacks
`Yiisoft\Db\Migration\Runner\DownRunner::run()` strictly requires `RevertibleMigrationInterface $migration`. If a migration only implements `MigrationInterface`, the runner rejects rollback attempts before execution with a fatal `RuntimeException`:
```text
RuntimeException: Migration <Class> does not implement RevertibleMigrationInterface.
```
This architectural guard prevents accidental database corruption when rolling back irreversible migrations.

---

### 1.2. Dependency Injection in Migrations

Migration instances are created by `Yiisoft\Db\Migration\Service\MigrationService::makeMigrationInstance()` via `Yiisoft\Injector\Injector::make($class)`.

Because the factory uses `yiisoft/injector`, migrations support full constructor dependency injection autowired from the application's PSR-11 DI container. You can inject loggers, security hashers, file aliases, or external utilities directly into the constructor:

```php
declare(strict_types=1);

namespace App\Infrastructure\Migration;

use Psr\Log\LoggerInterface;
use Yiisoft\Aliases\Aliases;
use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;
use Yiisoft\Db\Migration\TransactionalMigrationInterface;
use Yiisoft\Security\PasswordHasher;

/**
 * Seeds default administrator credentials with autowired services.
 */
final class M261022110000SeedDefaultAdmin implements RevertibleMigrationInterface, TransactionalMigrationInterface
{
    private const TABLE_NAME = '{{%user}}';

    public function __construct(
        private readonly LoggerInterface $logger,
        private readonly PasswordHasher $hasher,
        private readonly Aliases $aliases,
    ) {}

    public function up(MigrationBuilder $b): void
    {
        $this->logger->info('Seeding default administrator into ' . self::TABLE_NAME);

        $b->insert(
            table: self::TABLE_NAME,
            columns: [
                'username' => 'admin',
                'email' => 'admin@example.com',
                'password_hash' => $this->hasher->hash('SecretAdminPass123!'),
                'avatar_path' => $this->aliases->get('@assets/default-avatar.svg'),
                'created_at' => date('Y-m-d H:i:s'),
            ],
        );
    }

    public function down(MigrationBuilder $b): void
    {
        $b->delete(
            table: self::TABLE_NAME,
            condition: ['username' => 'admin'],
        );
    }
}
```

> [!CAUTION]
> **Dependency Injection Invariant:**
> Never inject domain repositories or Active Record models into migration constructors. Domain entities and ORM mappings assume the database schema already exists in its latest state. If an entity accesses a table or column that has not yet been migrated, the migration runner will crash during container instantiation. Inject only low-level infrastructure services (e.g. `LoggerInterface`, `PasswordHasher`, `Aliases`).

---

### 1.3. Transactional DDL & DBMS Implicit Commits

When a migration implements `TransactionalMigrationInterface`, `Yiisoft\Db\Migration\Migrator` wraps `up()` or `down()` along with the migration history record update inside `$db->transaction()`:

```php
match ($migration instanceof TransactionalMigrationInterface) {
    true => $this->db->transaction(fn() => $this->migrateUp($migration)),
    false => $this->migrateUp($migration),
};
```

However, transactional behavior depends on the underlying Database Management System:

- **PostgreSQL, SQLite, MSSQL:** DDL statements (`CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, `CREATE INDEX`) are fully transactional. If any step fails, the entire transaction rolls back cleanly, leaving the database schema and migration history synchronized.
- **MySQL / MariaDB:** DDL statements trigger **implicit commits** (MySQL Server Architecture §13.3.3). When `$b->createTable()` executes, MySQL immediately commits all pending changes to disk. If a subsequent statement in the same migration fails (e.g. invalid foreign key or duplicate index), PHP catches the exception and attempts a rollback, but the created table remains in the database while the migration history row is rolled back.

> [!WARNING]
> **MySQL Implicit Commit Risk:**
> On MySQL/MariaDB, a failure mid-migration leaves the table created on disk while the migration is marked as unapplied. A subsequent `./yii migrate:up` run will fail with `Table '<name>' already exists`.
> For MySQL projects:
> 1. Design small, atomic migrations (one table or one alteration per migration).
> 2. Ensure foreign tables and referenced columns exist before running table migrations.
> 3. Verify foreign key syntax thoroughly before applying migrations to production databases.

---

## 2. Migration Class & File Naming Conventions

### 2.1. Discovery Regex & 12-Digit Timestamp Requirement

Yii3 discovers migrations via `Yiisoft\Db\Migration\Service\MigrationService::loadMigrationClasses()`. It scans files matching the strict regular expression:
```regex
/^(M(\d{12}).*)\.php$/s
```

The timestamp **must contain exactly 12 contiguous digits** (`YYMMDDHHMMSS` in UTC) immediately following the capital letter `M`.

```text
M<YYMMDDHHMMSS><PascalCaseDescription>.php
```

Example file and class:
```text
M261022120000CreateUserTable.php
```

```php
declare(strict_types=1);

namespace App\Infrastructure\Migration;

use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;

final class M261022120000CreateUserTable implements RevertibleMigrationInterface
{
    public function up(MigrationBuilder $b): void {}
    public function down(MigrationBuilder $b): void {}
}
```

> [!CAUTION]
> **Yii2 vs Yii3 Timestamp Naming Trap:**
> In Yii2, migration files used an underscore between the date and time: `m261022_120000_create_user_table.php`.
> In Yii3, an underscore between digits fails the `\d{12}` regex match. **Yii3 will silently ignore the file** and report that there are no new migrations to apply. Always use 12 contiguous digits without underscores.

---

### 2.2. Directory & Namespace Structure

Application migrations are modern PSR-4 classes located in your application namespace:

```text
src/
└── Infrastructure/
    └── Migration/
        ├── M261022120000CreateUserTable.php
        ├── M261022130000CreateOrderTable.php
        └── M261022140000AddPhoneToUserTable.php
```

Configure `config/params.php` to register this namespace:
```php
'yiisoft/db-migration' => [\n    'newMigrationNamespace' => 'App\\Infrastructure\\Migration',
    'newMigrationPath' => '',
    'sourceNamespaces' => [
        'App\\Infrastructure\\Migration',
    ],
],
```

---

## 3. Schema Construction with Modern `ColumnBuilder`

Yii3 provides the fluent `Yiisoft\Db\Schema\Column\ColumnBuilder` as the type-safe, driver-portable mechanism to declare schema definitions.

Obtain the column builder via `$b->columnBuilder()`. This method resolves to the database driver's specific column builder class (e.g. `Yiisoft\Db\Pgsql\Column\ColumnBuilder`, `Yiisoft\Db\Mysql\Column\ColumnBuilder`). All factory methods on `$columns` are invoked **statically**.

### 3.1. Complete Reversible Migration Example

```php
declare(strict_types=1);

namespace App\Infrastructure\Migration;

use Yiisoft\Db\Constant\IndexType;
use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;
use Yiisoft\Db\Migration\TransactionalMigrationInterface;

/**
 * Creates table `{{%user}}` with columns and indexes.
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
        // Revert in strict reverse order of creation
        $b->dropIndex(table: self::TABLE_NAME, name: 'idx_user_status_created_at');
        $b->dropIndex(table: self::TABLE_NAME, name: 'idx_user_email_unique');
        $b->dropTable(table: self::TABLE_NAME);
    }
}
```

---

### 3.2. Complete `ColumnBuilder` Method Reference

The base class `Yiisoft\Db\Schema\Column\ColumnBuilder` defines 29 standard static factory methods:

| Method Signature | Default Arguments | Return Type | Generated SQL Type (PostgreSQL / MySQL / SQLite) |
|---|---|---|---|
| `primaryKey(bool $autoIncrement = true)` | `$autoIncrement = true` | `ColumnInterface` | `serial PRIMARY KEY` / `int AUTO_INCREMENT PRIMARY KEY` / `integer PRIMARY KEY AUTOINCREMENT` |
| `smallPrimaryKey(bool $autoIncrement = true)` | `$autoIncrement = true` | `ColumnInterface` | `smallserial PRIMARY KEY` / `smallint AUTO_INCREMENT PRIMARY KEY` / `integer PRIMARY KEY AUTOINCREMENT` |
| `bigPrimaryKey(bool $autoIncrement = true)` | `$autoIncrement = true` | `ColumnInterface` | `bigserial PRIMARY KEY` / `bigint AUTO_INCREMENT PRIMARY KEY` / `integer PRIMARY KEY AUTOINCREMENT` |
| `uuidPrimaryKey(bool $autoIncrement = true)` | `$autoIncrement = true` | `ColumnInterface` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` / `binary(16) PRIMARY KEY` / `blob(16) PRIMARY KEY` |
| `boolean()` | None | `ColumnInterface` | `boolean` / `bit(1)` / `boolean` |
| `bit(?int $size = null)` | `$size = null` | `ColumnInterface` | `varbit` (`bit`) / `bit` / `bit` |
| `tinyint(?int $size = null)` | `$size = null` | `ColumnInterface` | `smallint` / `tinyint` / `tinyint` |
| `smallint(?int $size = null)` | `$size = null` | `ColumnInterface` | `smallint` / `smallint` / `smallint` |
| `integer(?int $size = null)` | `$size = null` | `ColumnInterface` | `integer` / `int` / `integer` |
| `bigint(?int $size = null, bool $unsigned = false)` | `$size = null, $unsigned = false` | `ColumnInterface` | `bigint` / `bigint [UNSIGNED]` / `bigint` |
| `float(?int $size = null, ?int $scale = null)` | `$size = null, $scale = null` | `ColumnInterface` | `real` / `float` / `float` |
| `double(?int $size = null, ?int $scale = null)` | `$size = null, $scale = null` | `ColumnInterface` | `double precision` / `double` / `double` |
| `decimal(?int $size = 10, ?int $scale = 0)` | `$size = 10, $scale = 0` | `ColumnInterface` | `numeric(10,0)` / `decimal(10,0)` / `decimal(10,0)` |
| `money(?int $size = 19, ?int $scale = 4)` | `$size = 19, $scale = 4` | `ColumnInterface` | `money` / `decimal(19,4)` / `decimal(19,4)` |
| `char(?int $size = 1)` | `$size = 1` | `ColumnInterface` | `char(1)` / `char(1)` / `char(1)` |
| `string(?int $size = 255)` | `$size = 255` | `ColumnInterface` | `varchar(255)` / `varchar(255)` / `varchar(255)` |
| `text(?int $size = null)` | `$size = null` | `ColumnInterface` | `text` / `text` (`tinytext`, `mediumtext`, `longtext`) / `text` |
| `binary(?int $size = null)` | `$size = null` | `ColumnInterface` | `bytea` / `blob` / `blob` |
| `uuid()` | None | `ColumnInterface` | `uuid` / `binary(16)` / `blob(16)` |
| `timestamp(?int $size = 0)` | `$size = 0` | `ColumnInterface` | `timestamp` / `timestamp` / `timestamp` |
| `datetime(?int $size = 0)` | `$size = 0` | `ColumnInterface` | `timestamp` / `datetime` / `datetime` |
| `datetimeWithTimezone(?int $size = 0)` | `$size = 0` | `ColumnInterface` | `timestamptz` / `datetime` / `datetime` |
| `time(?int $size = 0)` | `$size = 0` | `ColumnInterface` | `time` / `time` / `time` |
| `timeWithTimezone(?int $size = 0)` | `$size = 0` | `ColumnInterface` | `timetz` / `time` / `time` |
| `date()` | None | `ColumnInterface` | `date` / `date` / `date` |
| `array(?ColumnInterface $column = null)` | `$column = null` | `ColumnInterface` | `<type>[]` (native PG) / `json` (emulated) / `json` (emulated) |
| `structured(?string $dbType = null, array $columns = [])` | `$dbType = null, $columns = []` | `ColumnInterface` | `jsonb` or custom type / `json` / `json` |
| `json()` | None | `ColumnInterface` | `jsonb` (native PG) / `json` / `json` |
| `enum(?array $values = null, ?string $dbType = null)` | `$values = null, $dbType = null` | `EnumColumn` | `varchar` + CHECK / `enum('a','b')` / `varchar` + CHECK |

---

### 3.3. Fluent Modifiers & The `unsigned()` Rejection Invariant

All columns inherit fluent modifiers from `Yiisoft\Db\Schema\Column\AbstractColumn`:

- `->notNull(bool $notNull = true): static` — sets column `NOT NULL`.
- `->null(): static` — sets column nullable (alias for `notNull(false)`).
- `->defaultValue(mixed $defaultValue): static` — declares the column default value.
- `->unique(bool $unique = true): static` — adds an inline unique constraint.
- `->comment(?string $comment): static` — attaches a column comment.
- `->check(?string $check): static` — attaches an inline SQL `CHECK` constraint.
- `->size(?int $size): static` — overrides the column length/size.
- `->scale(?int $scale): static` — overrides the decimal scale.
- `->dbType(?string $dbType): static` — overrides the raw database data type.
- `->extra(?string $extra): static` — appends raw SQL clauses to the column definition.

> [!CAUTION]
> **The `->unsigned()` Rejection Invariant [MySQL Only]:**
> The `->unsigned(bool $unsigned = true)` modifier is supported **exclusively by `yiisoft/db-mysql`**.
> Calling `->unsigned()` on PostgreSQL, SQLite, MSSQL, or Oracle triggers a fatal, immediate `Yiisoft\Db\Exception\NotSupportedException` during DDL compilation:
> ```text
> Yiisoft\Db\Exception\NotSupportedException: The "unsigned" attribute is not supported by PostgreSQL.
> ```
> **Portable Solutions:**
> 1. Use a check constraint: `$columns::integer()->check('total >= 0')`.
> 2. Or upgrade to a larger integer type: `$columns::bigint()`.
> 3. Only use `->unsigned()` if your application is strictly bound to MySQL/MariaDB.

---

### 3.4. DBMS-Specific Column Types & Mappings

#### PostgreSQL Native Range & Multirange Types (`yiisoft/db-pgsql`)
When connecting to PostgreSQL, `$b->columnBuilder()` resolves to `Yiisoft\Db\Pgsql\Column\ColumnBuilder`, exposing native range and multirange types (PostgreSQL 14+):

```php
// Range Types
'booking_range' => $columns::tsTzRange()->notNull(),  // tstzrange
'price_period'  => $columns::dateRange()->notNull(),  // daterange
'seat_range'    => $columns::int4Range()->notNull(),  // int4range

// Multi-Range Types (PostgreSQL 14+)
'vacation_slots' => $columns::dateMultiRange()->notNull(), // datemultirange
'energy_ranges'  => $columns::numMultiRange()->notNull(),  // nummultirange
```

#### PostgreSQL Array Types
PostgreSQL provides first-class array types. Use `$columns::array()` with an inner column definition:
```php
// 1D array of integers: integer[]
'tag_ids' => $columns::array($columns::integer())->notNull()->defaultValue('{}'),

// 2D matrix of floats: real[][]\n'matrix'  => $columns::array($columns::float())->dimension(2)->null(),
```

#### JSON & UUID Mappings Across Drivers
- **PostgreSQL:**
  - `$columns::json()` maps to native **`jsonb`** by default (supporting GIN indexing and containment operators). If legacy text `json` is required, specify `$columns::string()->dbType('json')`.
  - `$columns::uuid()` maps to native `uuid`. On PostgreSQL 13+, it automatically assigns `DEFAULT gen_random_uuid()`.
- **MySQL:**
  - `$columns::json()` maps to native `json`.
  - `$columns::uuid()` maps to high-performance `binary(16)`. On MySQL 8+, it automatically assigns `DEFAULT (unhex(replace(uuid(),'-','')))`.
- **SQLite:**
  - `$columns::json()` maps to `json`.
  - `$columns::uuid()` maps to `blob(16)` with `DEFAULT (randomblob(16))`.

#### Interval and Custom Types
Yii3 does not provide a `$columns::interval()` factory method. Declare interval or custom composite types via `dbType()`:
```php
'duration' => $columns::string()->dbType('interval')->notNull(),
```

---

### 3.5. Schema Qualification Syntax

When organizing database objects across PostgreSQL or MSSQL schemas (namespaces), use the canonical qualification pattern:
```text
'{{myschema}}.{{%mytable}}'
```

- `'{{myschema}}'` quotes the schema name (`"myschema"`).
- `'{{%mytable}}'` expands the configured table prefix and quotes the table name (`"prefix_mytable"`).
- Result: `"myschema"."prefix_mytable"`.

> [!CAUTION]
> **Schema Qualification Trap:**
> Do NOT write `'{{%myschema.mytable}}'`.
> In Yii3's quoter, placing `%` before the schema causes the table prefix to be attached to the **schema name** (`"prefix_myschema"."mytable"`) or quotes the period inside the table identifier (`"prefix_myschema.mytable"`), resulting in `Schema not found` errors.

#### Creating PostgreSQL Schemas
`MigrationBuilder` does not have a dedicated `createSchema()` method. Create and drop schemas using `$b->execute()`:
```php
public function up(MigrationBuilder $b): void
{
    $b->execute('CREATE SCHEMA IF NOT EXISTS "tenant_a"');
    $b->createTable('{{tenant_a}}.{{%order}}', [
        'id' => $b->columnBuilder()::primaryKey(),
    ]);
}

public function down(MigrationBuilder $b): void
{
    $b->dropTable('{{tenant_a}}.{{%order}}');
    $b->execute('DROP SCHEMA IF EXISTS "tenant_a" CASCADE');
}
```

---

## 4. Foreign Key Constraints & Cross-DBMS Portability

Declare foreign keys using `MigrationBuilder::addForeignKey()`.

### 4.1. Method Signature & Named Arguments Invariant

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
> **Named Argument Invariant:**
> The parameter names in Yii3 `MigrationBuilder::addForeignKey` are **`$referenceTable`** and **`$referenceColumns`** (NOT `$refTable` and NOT `$refColumns`).
> Invoking `addForeignKey(..., refTable: '...', refColumns: '...')` throws a fatal `Error: Unknown named parameter $refTable` in PHP 8.

---

### 4.2. Complete Foreign Key Migration Example

Always index foreign key columns to avoid full table scans during `JOIN` queries and row-level lock escalations during updates and deletes:

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

        // 1. Create child table
        $b->createTable(
            table: self::ORDER_TABLE,
            columns: [
                'id' => $columns::primaryKey(),
                'user_id' => $columns::integer()->notNull(),
                'total_cents' => $columns::bigint()->notNull()->defaultValue(0),
                'created_at' => $columns::timestamp()->notNull(),
            ],
        );

        // 2. Index foreign key column (essential for JOIN performance and lock avoidance)
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
            delete: ReferentialAction::CASCADE,
            update: null, // Recommended for cross-DBMS portability
        );
    }

    public function down(MigrationBuilder $b): void
    {
        // Revert in reverse order: drop foreign key, then index, then table
        $b->dropForeignKey(table: self::ORDER_TABLE, name: 'fk_order_user_id');
        $b->dropIndex(table: self::ORDER_TABLE, name: 'idx_order_user_id');
        $b->dropTable(table: self::ORDER_TABLE);
    }
}
```

---

### 4.3. Referential Actions & Cross-DBMS Compatibility Matrix

Class `Yiisoft\Db\Constant\ReferentialAction` defines standard referential action strings:
- `ReferentialAction::CASCADE` = `'CASCADE'`
- `ReferentialAction::RESTRICT` = `'RESTRICT'`
- `ReferentialAction::SET_NULL` = `'SET NULL'`
- `ReferentialAction::NO_ACTION` = `'NO ACTION'`
- `ReferentialAction::SET_DEFAULT` = `'SET DEFAULT'`

#### Cross-DBMS Referential Compatibility

| DBMS Driver | `ON DELETE` Support | `ON UPDATE` Support | Critical Caveats |
|---|---|---|---|
| **PostgreSQL** (`db-pgsql`) | All actions supported | All actions supported | Fully compliant with ANSI SQL. |
| **MySQL / MariaDB** (`db-mysql`) | All actions supported | All actions supported | InnoDB engine required for foreign key enforcement. |
| **SQLite** (`db-sqlite`) | ❌ `NotSupportedException` | ❌ `NotSupportedException` | SQLite does not support `addForeignKey()` via `ALTER TABLE`. Must define inline in `createTable` or use Copy-and-Rename. |
| **MS SQL Server** (`db-mssql`) | `CASCADE`, `SET NULL`, `NO ACTION`, `SET DEFAULT` | `CASCADE`, `SET NULL`, `NO ACTION`, `SET DEFAULT` | **`RESTRICT` is unsupported in T-SQL.** Passing `delete: ReferentialAction::RESTRICT` produces a fatal syntax error. Use `NO_ACTION` or `null`. |
| **Oracle** (`db-oracle`) | `CASCADE`, `SET NULL` only | ❌ **Completely unsupported** | Passing non-null `$update` throws `Exception: Oracle does not support ON UPDATE clause.`. On delete, passing `RESTRICT` throws `ORA-00905: missing keyword`. |

> [!TIP]
> **Cross-DBMS Foreign Key Rule:**
> For universal migrations running across PostgreSQL, MySQL, MSSQL, and Oracle, leave `$update: null` and use `ReferentialAction::CASCADE` or `ReferentialAction::SET_NULL` for `$delete`. If restrict behavior is desired on MSSQL, use `ReferentialAction::NO_ACTION` or omit `$delete`.

---

### 4.4. Foreign Key Integrity Checks

In Yii 2, developers called `$this->checkIntegrity(false)`.
In Yii 3, `MigrationBuilder` **does not have a `checkIntegrity()` method**. Calling `$b->checkIntegrity(false)` throws a fatal error: `Error: Call to undefined method MigrationBuilder::checkIntegrity()`.

In Yii 3, `checkIntegrity()` belongs to `CommandInterface`. Invoke it through the database connection via `$b->getDb()`:

```php
// Temporarily disable foreign key checks (e.g. for bulk data importing)
$b->getDb()->createCommand()->checkIntegrity(schema: '', table: '', check: false)->execute();

// Re-enable foreign key checks
$b->getDb()->createCommand()->checkIntegrity(schema: '', table: '', check: true)->execute();
```

#### SQLite Foreign Key Enforcement in Tests
SQLite disables foreign key checks by default. To enforce foreign key integrity during test migrations, execute `PRAGMA foreign_keys = ON;`:
```php
$b->getDb()->createCommand('PRAGMA foreign_keys = ON;')->execute();
```

---

## 5. Schema Alterations & DDL Operations Reference

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

        // 1. Add new nullable column
        $b->addColumn(
            table: self::TABLE_NAME,
            column: 'phone',
            type: $columns::string(32)->null()->comment('E.164 phone number'),
        );

        // 2. Alter existing column definition
        $b->alterColumn(
            table: self::TABLE_NAME,
            column: 'username',
            type: $columns::string(100)->notNull(),
        );
    }

    public function down(MigrationBuilder $b): void
    {
        $columns = $b->columnBuilder();

        // Revert altered column back to previous length
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

---

### 5.2. Complete `MigrationBuilder` DDL Method Signatures

All schema manipulation methods on `MigrationBuilder` delegate to the active database connection's `DDLQueryBuilder`:

```php
// --- Table Operations ---
$b->createTable(string $table, array $columns, ?string $options = null): void
$b->dropTable(string $table): void
$b->renameTable(string $table, string $newName): void
$b->truncateTable(string $table): void

// --- Column Operations ---
$b->addColumn(string $table, string $column, ColumnInterface|string $type): void
$b->dropColumn(string $table, string $column): void
$b->alterColumn(string $table, string $column, ColumnInterface|string $type): void
$b->renameColumn(string $table, string $name, string $newName): void

// --- Primary & Foreign Keys ---
$b->addPrimaryKey(string $table, string $name, array|string $columns): void
$b->dropPrimaryKey(string $table, string $name): void
$b->addForeignKey(string $table, string $name, array|string $columns, string $referenceTable, array|string $referenceColumns, ?string $delete = null, ?string $update = null): void
$b->dropForeignKey(string $table, string $name): void

// --- Indexes & Views ---
$b->createIndex(string $table, string $name, array|string $columns, ?string $indexType = null, ?string $indexMethod = null): void
$b->dropIndex(string $table, string $name): void
$b->createView(string $viewName, QueryInterface|string $subQuery): void
$b->dropView(string $viewName): void

// --- Comments ---
$b->addCommentOnTable(string $table, string $comment): void
$b->dropCommentFromTable(string $table): void
$b->addCommentOnColumn(string $table, string $column, string $comment): void
$b->dropCommentFromColumn(string $table, string $column): void

// --- Raw SQL ---
$b->execute(string $sql, array $params = []): void
```

---

### 5.3. SQLite Schema Alteration Restrictions & Copy-and-Rename Workaround

SQLite has severe architectural limitations regarding `ALTER TABLE`. `Yiisoft\Db\Sqlite\DDLQueryBuilder` throws `Yiisoft\Db\Exception\NotSupportedException` on **18 alteration methods**, including:
- `alterColumn()`, `dropColumn()`, `renameColumn()`
- `addForeignKey()`, `dropForeignKey()`
- `addPrimaryKey()`, `dropPrimaryKey()`
- `addCheck()`, `dropCheck()`, `addUnique()`, `dropUnique()`

#### Canonical Table Copy-and-Rename Pattern for SQLite
To alter existing tables in migrations that must support SQLite (e.g. during local tests), use the Copy-and-Rename pattern:

```php
declare(strict_types=1);

namespace App\Infrastructure\Migration;

use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;
use Yiisoft\Db\Migration\TransactionalMigrationInterface;

final class M261022143000ModifyUserTableStructure implements RevertibleMigrationInterface, TransactionalMigrationInterface
{
    private const OLD_TABLE = '{{%user}}';
    private const NEW_TABLE = '{{%user_new}}';

    public function up(MigrationBuilder $b): void
    {
        $db = $b->getDb();
        $columns = $b->columnBuilder();

        if ($db->getDriverName() === 'sqlite') {
            // 1. Create new table with updated schema
            $b->createTable(self::NEW_TABLE, [
                'id' => $columns::primaryKey(),
                'username' => $columns::string(100)->notNull(), // expanded size
                'email' => $columns::string(255)->notNull(),
                'phone' => $columns::string(32)->null(),         // new column
            ]);

            // 2. Copy existing data
            $b->execute('INSERT INTO ' . self::NEW_TABLE . ' (id, username, email) SELECT id, username, email FROM ' . self::OLD_TABLE);

            // 3. Drop old table and rename new table
            $b->dropTable(self::OLD_TABLE);
            $b->renameTable(self::NEW_TABLE, self::OLD_TABLE);

            // 4. Recreate indexes
            $b->createIndex(self::OLD_TABLE, 'idx_user_email_unique', 'email', \Yiisoft\Db\Constant\IndexType::UNIQUE);
        } else {
            // Standard direct DDL for PostgreSQL, MySQL, MSSQL, Oracle
            $b->alterColumn(self::OLD_TABLE, 'username', $columns::string(100)->notNull());
            $b->addColumn(self::OLD_TABLE, 'phone', $columns::string(32)->null());
        }
    }

    public function down(MigrationBuilder $b): void
    {
        // Inverse operation
        $columns = $b->columnBuilder();
        $b->alterColumn(self::OLD_TABLE, 'username', $columns::string(64)->notNull());
        $b->dropColumn(self::OLD_TABLE, 'phone');
    }
}
```

---

## 6. Data Migrations, Seeding & High-Performance Streaming

### 6.1. Reversible Data Seeding with `insertBatch()`

For lookup tables and reference data, use `MigrationBuilder::insertBatch()`.

> [!WARNING]
> **Deprecated Method Warning:**
> In Yii 3, `$b->batchInsert($table, $columns, $rows)` is **@deprecated**.
> Use **`$b->insertBatch($table, $rows, $columns = [])`** instead. Note that `$rows` is now the **second argument**, and `$columns` is optional when passing associative arrays.

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
                ['code' => 'admin',  'name' => 'Administrator',  'created_at' => '2026-01-01 00:00:00'],
                ['code' => 'editor', 'name' => 'Content Editor', 'created_at' => '2026-01-01 00:00:00'],
                ['code' => 'user',   'name' => 'Standard User',  'created_at' => '2026-01-01 00:00:00'],
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

---

### 6.2. High-Performance Stream & Chunk Processing with `Query::batch()`

When transforming or backfilling large datasets (hundreds of thousands or millions of rows), loading all rows into PHP memory causes `Out of Memory` crashes.

Use `$b->getDb()` to initialize `Yiisoft\Db\Query\Query` with `batch()` or `each()` cursors:

```php
declare(strict_types=1);

namespace App\Infrastructure\Migration;

use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\MigrationInterface;
use Yiisoft\Db\Migration\TransactionalMigrationInterface;
use Yiisoft\Db\Query\Query;

/**
 * Streams legacy user records and backfills search tokens in memory-safe chunks.
 */
final class M261022153000BackfillCustomerTokens implements MigrationInterface, TransactionalMigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $db = $b->getDb();

        // Query memory-efficient cursor via batch(500)
        $query = (new Query($db))
            ->select(['id', 'email', 'first_name', 'last_name'])
            ->from('{{%customer}}')
            ->where(['search_token' => null]);

        foreach ($query->batch(500) as $chunk) {
            foreach ($chunk as $row) {
                $token = hash('sha256', strtolower($row['email'] . '|' . $row['first_name'] . '|' . $row['last_name']));

                $b->update(
                    table: '{{%customer}}',
                    columns: ['search_token' => $token],
                    condition: ['id' => $row['id']],
                );
            }
        }
    }
}
```

---

### 6.3. Irreversible One-Way Data Migration

When a data modification cannot be reverted (e.g. destructive cleanup, encryption, or anonymization), implement `MigrationInterface` **without** `RevertibleMigrationInterface`:

```php
declare(strict_types=1);

namespace App\Infrastructure\Migration;

use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\MigrationInterface;
use Yiisoft\Db\Migration\TransactionalMigrationInterface;

/**
 * Irreversible data anonymization migration.
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

### 6.4. Complete DML API Reference

```php
// Single Row Insert
$b->insert(string $table, array $columns): void

// Bulk Insert (Associative Rows or Column Tuples)
$b->insertBatch(string $table, iterable $rows, array $columns = []): void

// Upsert (INSERT ON CONFLICT / ON DUPLICATE KEY UPDATE)
// $updateColumns: true (update all), false (ignore/skip), or associative array
$b->upsert(string $table, array|QueryInterface $insertColumns, array|bool $updateColumns = true): void

// Update Rows Matching Condition
$b->update(string $table, array $columns, array|ExpressionInterface|string $condition = '', array|ExpressionInterface|string|null $from = null, array $params = []): void

// Delete Rows Matching Condition
$b->delete(string $table, array|string $condition = '', array $params = []): void
```

---

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
When multiple databases are configured in `config/params.php`:
- Running `./yii migrate:up` **without** `--db` sequentially applies pending migrations to **all** configured databases in order.
- If `--namespace` or `--path` is passed, `--db` is required to prevent applying targeted migrations to the wrong database.

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
| **Empty `down()` for irreversible migrations** | Falsely claims the migration is revertible. Rollback leaves schema or data in a corrupted state. | Implement `MigrationInterface` without `RevertibleMigrationInterface`. `DownRunner` will safely reject rollback. |
| **Raw table names without tokens: `'user'`** | Bypasses database table prefix configuration (`tbl_user`). | Wrap all table names in prefix tokens: `'{{%user}}'`. |
| **`Yii::$app->db` inside migration** | Static service locator removed in Yii3. | Use `$b->getDb()` to access `ConnectionInterface`. |
| **Omitting indexes on foreign key columns** | Causes full table scans during `JOIN` queries and row lock escalations on updates/deletes. | Call `$b->createIndex()` on foreign key columns before adding foreign key constraints. |
| **Assuming MySQL/MariaDB DDL rolls back on failure** | MySQL executes implicit commits on DDL, leaving tables created while history rolls back. | Write small, atomic migrations and design cleanup scripts for partial failures on MySQL. |
| **`sourcePaths` pointing to vendor parent directory: `'vendor/yiisoft/rbac-db/migrations'`** | `MigrationService` scans non-recursively. Package migrations reside in subdirectories `migrations/items` and `migrations/assignments`. 0 migrations will be found. | Register exact subdirectories in `sourcePaths`: `dirname(__DIR__) . '/vendor/yiisoft/rbac-db/migrations/items'` and `.../assignments`. |
| **Using `migrate:mark` as a substitute for running migrations** | `migrate:mark` only modifies history rows and never executes SQL. The database schema remains untouched while history claims it exists. | Use `migrate:up` to change schema. Reserve `migrate:mark` for baselining existing databases. |
| **Calling `->unsigned()` on PostgreSQL, SQLite, MSSQL, Oracle** | `unsigned()` is supported exclusively by MySQL. All other drivers throw fatal `NotSupportedException`. | Use check constraints (`->check('val >= 0')`) or use `bigint` for portable migrations. |
| **Passing `ReferentialAction::RESTRICT` on MSSQL** | Transact-SQL does not recognize the keyword `RESTRICT`. Produces fatal SQL Server syntax error. | Use `ReferentialAction::NO_ACTION` or omit `$delete`/`$update` (`null`). |
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
- [Console Commands Guide](commands.md) — Running migration commands (`./yii migrate:*`) and console runners.
