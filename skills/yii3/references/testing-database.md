# Yii3 Testing: Ephemeral Database, Migrations & Transactions

> Practical guide for transactional database integration testing, running migrations in test fixtures, ephemeral in-memory SQLite (`yiisoft/db-sqlite`), data seeding, and repository verification in Yii3.

---

## Table of Contents
- [1. Database Testing Strategy & Isolation](#1-database-testing-strategy--isolation)
- [2. Ephemeral SQLite Configuration (`yiisoft/db-sqlite`)](#2-ephemeral-sqlite-configuration-yiisoftdb-sqlite)
  - [2.1. In-Memory Database DI Configuration](#21-in-memory-database-di-configuration)
  - [2.2. Isolated Test Environment Setup](#22-isolated-test-environment-setup)
- [3. Running Migrations in Test Fixtures](#3-running-migrations-in-test-fixtures)
  - [3.1. DDL Migration Definition with `ColumnBuilder`](#31-ddl-migration-definition-with-columnbuilder)
  - [3.2. Migration Execution with `NullMigrationInformer`](#32-migration-execution-with-nullmigrationinformer)
- [4. Transactional Isolation & Rollback Pattern](#4-transactional-isolation--rollback-pattern)
  - [4.1. The Canonical `DatabaseTestCase` Base Class](#41-the-canonical-databasetestcase-base-class)
  - [4.2. Transaction Lifecycle: `setUp()` vs `tearDown()`](#42-transaction-lifecycle-setup-vs-teardown)
- [5. Test Fixtures & Data Seeding](#5-test-fixtures--data-seeding)
  - [5.1. Direct Table Insertion via Command](#51-direct-table-insertion-via-command)
  - [5.2. Reusable Fixture Method Pattern](#52-reusable-fixture-method-pattern)
- [6. Repository Integration Testing (Zero-Shot Example)](#6-repository-integration-testing-zero-shot-example)
- [7. Critical SQLite In-Memory Rules & Gotchas](#7-critical-sqlite-in-memory-rules--gotchas)
- [8. Database Testing Named Arguments & Signatures Reference](#8-database-testing-named-arguments--signatures-reference)
- [9. Database Anti-Pattern Matrix](#9-database-anti-pattern-matrix)
- [10. Related Guides](#10-related-guides)

---

## 1. Database Testing Strategy & Isolation

Database integration tests verify that queries, migrations, Active Record entities, and repository implementations work against a real SQL engine.

To ensure tests execute within milliseconds and require zero external database containers (MySQL, PostgreSQL), Yii3 projects use **ephemeral in-memory SQLite** (`sqlite::memory:`):

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   Test Method Execution Lifecycle                      │
├────────────────────────────────────────────────────────────────────────┤
│ 1. setUp(): Connect to sqlite::memory:                                 │
│ 2. setUp(): Run Migrations via MigrationBuilder + NullMigrationInformer│
│ 3. setUp(): Begin DB Transaction ($db->beginTransaction())             │
│ 4. Test: Insert fixtures / Execute Repository methods / Assert SQL     │
│ 5. tearDown(): Rollback Transaction ($transaction->rollBack())         │
│ 6. tearDown(): Close Connection ($db->close())                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Ephemeral SQLite Configuration (`yiisoft/db-sqlite`)

### 2.1. In-Memory Database DI Configuration

In the `test` environment (`config/environments/test/di.php`), rebind `ConnectionInterface::class` to an in-memory SQLite connection:

```php
declare(strict_types=1);

use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Sqlite\Connection;
use Yiisoft\Db\Sqlite\Driver;

return [
    ConnectionInterface::class => [
        'class' => Connection::class,
        '__construct()' => [
            'driver' => new Driver('sqlite::memory:'),
        ],
    ],
];
```

### 2.2. Isolated Test Environment Setup

Ensure `test` environment inherits common configurations while disabling file cache and foreign external connections:

```php
// config/environments/test/params.php
return [
    'yiisoft/db-sqlite' => [
        'dsn' => 'sqlite::memory:',
    ],
];
```

---

## 3. Running Migrations in Test Fixtures

### 3.1. DDL Migration Definition with `ColumnBuilder`

Yii3 migrations implement `Yiisoft\Db\Migration\MigrationInterface` and build schemas using `Yiisoft\Db\Schema\Column\ColumnBuilder`:

```php
declare(strict_types=1);

namespace App\Tests\Support\Migration;

use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\MigrationInterface;
use Yiisoft\Db\Schema\Column\ColumnBuilder;

final class M261022120000CreateUserTable implements MigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $b->createTable('user', [
            'id' => ColumnBuilder::primaryKey(),
            'name' => ColumnBuilder::string(128)->notNull(),
            'email' => ColumnBuilder::string(255)->notNull(),
            'created_at' => ColumnBuilder::integer()->notNull(),
        ]);

        $b->createIndex('idx_user_email', 'user', 'email', unique: true);
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropTable('user');
    }
}
```

### 3.2. Migration Execution with `NullMigrationInformer`

When running migrations inside tests, suppress noisy console stdout by passing `Yiisoft\Db\Migration\Informer\NullMigrationInformer` to `MigrationBuilder`:

```php
use Yiisoft\Db\Migration\Informer\NullMigrationInformer;
use Yiisoft\Db\Migration\MigrationBuilder;

$informer = new NullMigrationInformer();
$builder = new MigrationBuilder(db: $this->db, informer: $informer);

(new M261022120000CreateUserTable())->up($builder);
```

---

## 4. Transactional Isolation & Rollback Pattern

### 4.1. The Canonical `DatabaseTestCase` Base Class

Create a reusable base class that initializes the in-memory SQLite schema and isolates each test within a database transaction:

```php
declare(strict_types=1);

namespace App\Tests\Integration;

use App\Tests\Support\Migration\M261022120000CreateUserTable;
use PHPUnit\Framework\TestCase;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Migration\Informer\NullMigrationInformer;
use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Sqlite\Connection;
use Yiisoft\Db\Sqlite\Driver;

abstract class DatabaseTestCase extends TestCase
{
    protected ConnectionInterface $db;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Establish SQLite in-memory connection
        $this->db = new Connection(new Driver('sqlite::memory:'));

        // 2. Instantiate MigrationBuilder with NullMigrationInformer
        $informer = new NullMigrationInformer();
        $builder = new MigrationBuilder(db: $this->db, informer: $informer);

        // 3. Execute migration DDL schema (12 contiguous digits in class name)
        (new M261022120000CreateUserTable())->up($builder);

        // 4. Begin transaction for test isolation
        $this->db->beginTransaction();
    }

    protected function tearDown(): void
    {
        // 5. Rollback test mutations to keep database pristine
        if ($this->db->getTransaction() !== null) {
            $this->db->getTransaction()->rollBack();
        }

        $this->db->close();
        parent::tearDown();
    }
}
```

### 4.2. Transaction Lifecycle: `setUp()` vs `tearDown()`

1. **`setUp()`:** Begins the transaction. Any `INSERT`, `UPDATE`, or `DELETE` executed during the test runs inside this transaction.
2. **`tearDown()`:** Rolls back the transaction if one is active. This guarantees that test state never leaks between tests, even if an assertion fails midway.
3. **Closing connection:** `$this->db->close()` closes the PDO connection, releasing memory.

---

## 5. Test Fixtures & Data Seeding

### 5.1. Direct Table Insertion via Command

Use `$this->db->createCommand()->insert(...)` to seed prerequisite data cleanly without depending on domain repositories:

```php
protected function seedUser(string $name, string $email, int $id = 1): void
{
    $this->db->createCommand()->insert('user', [
        'id' => $id,
        'name' => $name,
        'email' => $email,
        'created_at' => time(),
    ])->execute();
}
```

### 5.2. Reusable Fixture Method Pattern

Group standard fixtures into trait or helper methods for test readability:

```php
trait UserFixtureTrait
{
    protected function loadStandardUsers(): void
    {
        $this->db->createCommand()->insertBatch(table: 'user', rows: [
            [1, 'Alice Smith', 'alice@example.com', 1700000000],
            [2, 'Bob Jones', 'bob@example.com', 1700000100],
        ], columns: ['id', 'name', 'email', 'created_at'])->execute();
    }
}
```

---

## 6. Repository Integration Testing (Zero-Shot Example)

Below is a complete, compilable integration test verifying a repository against in-memory SQLite:

```php
declare(strict_types=1);

namespace App\Tests\Integration\Repository;

use App\Tests\Integration\DatabaseTestCase;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;

// 1. Domain Entity & Repository Interface
final class UserRecord
{
    public function __construct(
        public readonly int $id,
        public readonly string $name,
        public readonly string $email,
        public readonly int $createdAt,
    ) {}
}

interface UserRepositoryInterface
{
    public function findById(int $id): ?UserRecord;
    public function save(UserRecord $user): void;
    public function existsByEmail(string $email): bool;
}

// 2. Concrete Repository using Yiisoft\Db
final class SqliteUserRepository implements UserRepositoryInterface
{
    public function __construct(private ConnectionInterface $db) {}

    public function findById(int $id): ?UserRecord
    {
        /** @var array{id: int, name: string, email: string, created_at: int}|false $row */
        $row = (new Query($this->db))
            ->from('user')
            ->where(['id' => $id])
            ->one();

        if ($row === false) {
            return null;
        }

        return new UserRecord(
            id: (int) $row['id'],
            name: (string) $row['name'],
            email: (string) $row['email'],
            createdAt: (int) $row['created_at'],
        );
    }

    public function save(UserRecord $user): void
    {
        $this->db->createCommand()->insert('user', [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'created_at' => $user->createdAt,
        ])->execute();
    }

    public function existsByEmail(string $email): bool
    {
        return (new Query($this->db))
            ->from('user')
            ->where(['email' => $email])
            ->exists();
    }
}

// 3. Integration Test
final class SqliteUserRepositoryTest extends DatabaseTestCase
{
    private SqliteUserRepository $repository;

    protected function setUp(): void
    {
        parent::setUp();
        $this->repository = new SqliteUserRepository($this->db);
    }

    public function testSaveAndFindUser(): void
    {
        $user = new UserRecord(
            id: 10,
            name: 'Charlie Brown',
            email: 'charlie@example.com',
            createdAt: 1700000200,
        );

        $this->repository->save($user);

        $found = $this->repository->findById(10);
        $this->assertNotNull($found);
        $this->assertSame('Charlie Brown', $found->name);
        $this->assertSame('charlie@example.com', $found->email);
        $this->assertTrue($this->repository->existsByEmail('charlie@example.com'));
        $this->assertFalse($this->repository->existsByEmail('nonexistent@example.com'));
    }

    public function testFindReturnsNullWhenNotFound(): void
    {
        $this->assertNull($this->repository->findById(9999));
    }
}
```

---

## 7. Critical SQLite In-Memory Rules & Gotchas

> [!CAUTION]
> ### ⚠️ Mandatory SQLite In-Memory Rules
> 1. **Single PDO Connection Lifecycle:** `sqlite::memory:` databases belong strictly to a single PDO connection. If the connection is closed or garbage-collected, the in-memory database and all schemas are destroyed instantly. Never instantiate multiple separate `Connection` instances expecting them to share in-memory tables.
> 2. **`MigrationBuilder` Constructor Arguments:** `MigrationBuilder::__construct()` strictly requires **2 mandatory arguments**: `ConnectionInterface $db` and `MigrationInformerInterface $informer`. Passing only `$db` throws a fatal `ArgumentCountError`.
> 3. **`ColumnBuilder` vs Yii2 Methods:** In Yii3 migrations, column definitions must use `ColumnBuilder::primaryKey()`, `ColumnBuilder::string(...)` from `Yiisoft\Db\Schema\Column\ColumnBuilder` or abstract type strings (`'pk'`, `'string not null'`). `$b->primaryKey()` and `$b->string()` are legacy Yii2 methods and do not exist on `MigrationBuilder`.
> 4. **Strict 12-Digit Migration Class Naming:** Migration class names must follow the strict 12-digit format `M<YYMMDDHHMMSS><Name>` without underscores (e.g. `M261022120000CreateUserTable`). Class names with underscores like `M261022_120000_...` violate the migration scanner regex and will not be executed.

---

## 8. Database Testing Named Arguments & Signatures Reference

| Class / Method | Signature & Named Parameters |
|---|---|
| `Yiisoft\Db\Migration\MigrationBuilder::__construct` | `__construct(ConnectionInterface $db, MigrationInformerInterface $informer, ?int $maxSqlOutputLength = null)` |
| `Yiisoft\Db\Sqlite\Driver::__construct` | `__construct(string\|Stringable $dsn, string $username = '', string $password = '', array $attributes = [])` |
| `Yiisoft\Db\Sqlite\Connection::__construct` | `__construct(PdoDriverInterface $driver, SchemaCache $schemaCache = new SchemaCache(), ?ColumnFactoryInterface $columnFactory = null)` |
| `Yiisoft\Db\Command::insert` | `insert(string $table, array\|QueryInterface $columns): static` |
| `Yiisoft\Db\Command::insertBatch` | `insertBatch(string $table, iterable $rows, array $columns = []): static` |
| `Yiisoft\Db\Query\Query::from` | `from(array\|string $tables): static` |
| `Yiisoft\Db\Query\Query::where` | `where(array\|string\|ExpressionInterface $condition, array $params = []): static` |

---

## 9. Database Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| **Global state: `Yii::$app->db`** | Yii3 has no global state or `Yii::$app`. Calling it throws `Error: Class "Yii" not found`. | Inject `ConnectionInterface` via constructor or pass `$this->db` in fixtures. |
| **Calling legacy Yii2 methods on `MigrationBuilder`: `$b->primaryKey()`, `$b->string()`** | `MigrationBuilder` in Yii3 does not have `$b->primaryKey()`, `$b->string()`, etc.; throws fatal `Error: Call to undefined method`. | Use `ColumnBuilder::primaryKey()`, `ColumnBuilder::string(...)` from `Yiisoft\Db\Schema\Column\ColumnBuilder` or abstract strings (`'pk'`, `'string not null'`). |
| **Incomplete `MigrationBuilder` constructor: `new MigrationBuilder($db)`** | `MigrationBuilder` constructor requires `MigrationInformerInterface $informer` as 2nd parameter; throws `ArgumentCountError`. | Instantiate with `new MigrationBuilder(db: $db, informer: new NullMigrationInformer())`. |
| **Yii2 migration naming with underscore: `M261021_120000_Create...`** | Yii3 migration scanner regex strictly requires 12 contiguous digits (`/^(M(\d{12}).*)\.php$/s`). | Use 12 contiguous digits: `M261021120000CreateUserTable`. |
| **Assuming `sqlite::memory:` persists across separate connections** | Each new PDO connection to `sqlite::memory:` gets an isolated, empty database. | Keep the connection instance alive across the fixture lifecycle, or use a SQLite file path (`runtime/test.sq3`). |
| **Forgetting transaction rollback in `tearDown()`** | Data leaks between tests, causing intermittent order-dependent test failures in CI. | Always call `if ($this->db->getTransaction() !== null) { $this->db->getTransaction()->rollBack(); }` in `tearDown()`. |
| **Hardcoding SQL with variable interpolation: `where("id = $id")`** | SQL injection hazard and misses Query Builder cross-database SQL compilation. | Use parameterized arrays: `->where(['id' => $id])` or `->where('id = :id', [':id' => $id])`. |

---

## 10. Related Guides
- [`testing-core.md`](testing-core.md) — Testing architecture, test runners (PHPUnit, Testo), and PSR test doubles.
- [`testing-http.md`](testing-http.md) — Functional HTTP testing, middleware pipelines, and endpoints.
- [`persistence-migrations.md`](persistence-migrations.md) — Database schema DDL migrations, column types, and indexing.
- [`persistence-db.md`](persistence-db.md) — Low-level `yiisoft/db` Connection, Query Builder, Transactions, and Data Readers.
- [`persistence-active-record.md`](persistence-active-record.md) — Active Record models, relations, lifecycle, and LazyLoadGuard.
- [`persistence-cycle-orm.md`](persistence-cycle-orm.md) — Clean Data Mapper persistence with Cycle ORM (`#[Entity]`, `EntityReader`).
- [`core-di-and-config.md`](core-di-and-config.md) — Environment configuration and container definitions for `test`.
