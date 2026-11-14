# Yii3 Migrations: Schema Alterations, DDL Operations & Data Seeding

> **Grounding:** APIs in `vendor/yiisoft/<pkg>/src/`, patterns in this guide, conventions in architecture artifact (SKILL.md Core rule 2).

> Schema alterations, column modification DDL, SQLite alteration restrictions & copy-and-rename workaround, reversible data seeding (`insertBatch()`), and high-performance streaming with `Query::batch()`.

## Table of Contents

- [5. Schema Alterations & DDL Operations Reference](#5-schema-alterations--ddl-operations-reference)
  - [5.1. Adding, Dropping, and Altering Columns](#51-adding-dropping-and-altering-columns)
  - [5.2. Complete `MigrationBuilder` DDL Method Signatures](#52-complete-migrationbuilder-ddl-method-signatures)
  - [5.3. SQLite Schema Alteration Restrictions & Copy-and-Rename Workaround](#53-sqlite-schema-alteration-restrictions--copy-and-rename-workaround)
- [6. Data Migrations, Seeding & High-Performance Streaming](#6-data-migrations-seeding--high-performance-streaming)
  - [6.1. Reversible Data Seeding with `insertBatch()`](#61-reversible-data-seeding-with-insertbatch)
  - [6.2. High-Performance Stream & Chunk Processing with `Query::batch()`](#62-high-performance-stream--chunk-processing-with-querybatch)
  - [6.3. Irreversible One-Way Data Migration](#63-irreversible-one-way-data-migration)
  - [6.4. Complete DML API Reference](#64-complete-dml-api-reference)

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

SQLite has severe architectural limitations regarding `ALTER TABLE`. `Yiisoft\Db\Sqlite\DDLQueryBuilder` throws `Yiisoft\Db\Exception\NotSupportedException` on **17 alteration methods** unconditionally (plus `dropTable()` when called with `$cascade = true`), including:
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
        // Inverse operation — `alterColumn()` / `dropColumn()` throw NotSupportedException
        // on SQLite, so down() needs the same driver guard as up().
        $db = $b->getDb();
        $columns = $b->columnBuilder();

        if ($db->getDriverName() === 'sqlite') {
            // Copy-and-Rename inverse: recreate the original schema and copy data back
            $b->createTable(self::NEW_TABLE, [
                'id' => $columns::primaryKey(),
                'username' => $columns::string(64)->notNull(), // original size, no phone column
                'email' => $columns::string(255)->notNull(),
            ]);

            $b->execute('INSERT INTO ' . self::NEW_TABLE . ' (id, username, email) SELECT id, username, email FROM ' . self::OLD_TABLE);

            $b->dropTable(self::OLD_TABLE);
            $b->renameTable(self::NEW_TABLE, self::OLD_TABLE);
        } else {
            $b->alterColumn(self::OLD_TABLE, 'username', $columns::string(64)->notNull());
            $b->dropColumn(self::OLD_TABLE, 'phone');
        }
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
