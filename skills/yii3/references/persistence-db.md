# Yii3 Persistence: Database, Query Builder & Transactions

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Practical guide for low-level database operations, explicit Query Builder queries, atomic transactions, memory-safe data streaming, and paginated data readers using `yiisoft/db` and `yiisoft/data-db`.
>
> Persistence details belong strictly to the Infrastructure Layer; Domain Entities and Application Use Cases must never execute raw database operations directly.

---

## Table of Contents
- [1. Clean Architecture Persistence with `yiisoft/db`](#1-clean-architecture-persistence-with-yiisoftdb)
  - [1.1. Domain Value Object (`UserId.php`)](#11-domain-value-object-srcdomainmodeluseridphp)
  - [1.2. Pure Domain Entity (`User.php`)](#12-pure-domain-entity-srcdomainmodeluserphp)
  - [1.3. Domain Repository Contract (`UserRepositoryInterface.php`)](#13-domain-repository-contract-srcdomainrepositoryuserrepositoryinterfacephp)
  - [1.4. Low-Level Database Repository (`DbUserRepository.php`)](#14-low-level-database-repository-srcinfrastructurepersistencedbdbuserrepositoryphp)
  - [1.5. Hydration via `yiisoft/hydrator` & Nested Value Objects](#15-hydration-via-yiisofthydrator--nested-value-objects)
- [2. Connection, Commands & Mutations (`CommandInterface`)](#2-connection-commands--mutations-commandinterface)
  - [2.1. Parameterized Queries & Table Prefix Syntax](#21-parameterized-queries--table-prefix-syntax)
  - [2.2. Atomic Mutations: Insert, Update, Delete & Batch Insert](#22-atomic-mutations-insert-update-delete--batch-insert)
  - [2.3. Primary Key Retrieval & Generated IDs](#23-primary-key-retrieval--generated-ids)
- [3. Query Builder (`Yiisoft\Db\Query\Query`)](#3-query-builder-yiisoftdbqueryquery)
  - [3.1. Building Select Queries & Conditions](#31-building-select-queries--conditions)
  - [3.2. Advanced Conditions, Subqueries, Joins & Aggregations](#32-advanced-conditions-subqueries-joins--aggregations)
  - [3.3. Fetching Results & Strict Null Return Semantics](#33-fetching-results--strict-null-return-semantics)
  - [3.4. Memory-Safe Cursor Streaming: `each()` & `batch()`](#34-memory-safe-cursor-streaming-each--batch)
- [4. Transaction Management, Boundaries & Resilience](#4-transaction-management-boundaries--resilience)
  - [4.1. Idiomatic Closure Transactions (`transaction()`)](#41-idiomatic-closure-transactions-transaction)
  - [4.2. Manual Transactions & Savepoints](#42-manual-transactions--savepoints)
  - [4.3. Isolation Levels & Post-Commit Event Rule](#43-isolation-levels--post-commit-event-rule)
  - [4.4. Deadlock Retries & Serialization Failures (`SerializationFailureException`)](#44-deadlock-retries--serialization-failures-serializationfailureexception)
- [5. Paginated Queries & Data Readers (`yiisoft/data-db`, `yiisoft/data`)](#5-paginated-queries--data-readers-yiisoftdata-db-yiisoftdata)
  - [5.1. `QueryDataReader` & Sorting (`Sort::only()`, `Sort::any()`)](#51-querydatareader--sorting-sortonly-sortany)
  - [5.2. Offset Pagination (`OffsetPaginator`)](#52-offset-pagination-offsetpaginator)
  - [5.3. Filtering in `QueryDataReader` (`withFilter()`)](#53-filtering-in-querydatareader-withfilter)
  - [5.4. High-Performance Keyset (Cursor) Pagination (`KeysetPaginator`)](#54-high-performance-keyset-cursor-pagination-keysetpaginator)
- [6. Driver Packages: MySQL, PostgreSQL, SQLite, MSSQL & Oracle](#6-driver-packages-mysql-postgresql-sqlite-mssql--oracle)
  - [6.1. Driver Specifications Matrix](#61-driver-specifications-matrix)
  - [6.2. Canonical Connection Configuration](#62-canonical-connection-configuration)
  - [6.3. Driver-Specific Nuances & Version Support](#63-driver-specific-nuances--version-support)
- [7. PHP 8 Named Arguments & Signatures Reference](#7-php-8-named-arguments--signatures-reference)
- [8. Anti-Pattern Matrix: Database & Query Builder](#8-anti-pattern-matrix-database--query-builder)
- [9. Related Topic Guides](#9-related-topic-guides)

---

## 1. Clean Architecture Persistence with `yiisoft/db`

In Yii3 Clean Architecture, business rules and domain logic are decoupled from persistence engines. Persistence details belong strictly in the **Infrastructure Layer**:

```text
src/
├── Domain/
│   ├── Model/
│   │   ├── User.php                    # Pure PHP Domain Entity (no ORM or DB coupling)
│   │   └── UserId.php                  # Domain Value Object (UUID / ULID / typed scalar)
│   └── Repository/
│       └── UserRepositoryInterface.php # Domain contract for persistence operations
├── Application/
│   └── UseCase/
│       └── User/
│           └── CreateUserUseCase.php   # Coordinates repository & transactions
└── Infrastructure/
    └── Persistence/
        └── Db/
            └── DbUserRepository.php    # Implements interface via yiisoft/db Query Builder
```

### 1.1. Domain Value Object (`src/Domain/Model/UserId.php`)

```php
declare(strict_types=1);

namespace App\Domain\Model;

use Stringable;

final readonly class UserId implements Stringable
{
    public function __construct(public string $value) {}
    public function __toString(): string { return $this->value; }
}
```

### 1.2. Pure Domain Entity (`src/Domain/Model/User.php`)

```php
declare(strict_types=1);

namespace App\Domain\Model;

use DateTimeImmutable;

final class User
{
    public function __construct(
        private UserId $id,
        private string $name,
        private string $email,
        private ?DateTimeImmutable $createdAt = null,
        private ?DateTimeImmutable $updatedAt = null,
    ) {}

    public function getId(): UserId { return $this->id; }
    public function getName(): string { return $this->name; }
    public function getEmail(): string { return $this->email; }
    public function getCreatedAt(): ?DateTimeImmutable { return $this->createdAt; }
    public function getUpdatedAt(): ?DateTimeImmutable { return $this->updatedAt; }

    public function rename(string $newName): void
    {
        $this->name = $newName;
        $this->updatedAt = new DateTimeImmutable();
    }

    public function changeEmail(string $newEmail): void
    {
        $this->email = mb_strtolower($newEmail);
        $this->updatedAt = new DateTimeImmutable();
    }
}
```

> [!NOTE]
> The example intentionally omits domain-event recording (`recordEvent()` / `releaseEvents()` members on the aggregate). That pattern — including the mandatory post-commit dispatch rule — is owned by the [Events & Listeners Guide](core-events-and-listeners.md), section 5.

### 1.3. Domain Repository Contract (`src/Domain/Repository/UserRepositoryInterface.php`)

```php
declare(strict_types=1);

namespace App\Domain\Repository;

use App\Domain\Model\User;
use App\Domain\Model\UserId;

interface UserRepositoryInterface
{
    public function findById(UserId $id): ?User;
    public function findByEmail(string $email): ?User;
    public function save(User $user): void;
    public function delete(User $user): void;
}
```

### 1.4. Low-Level Database Repository (`src/Infrastructure/Persistence/Db/DbUserRepository.php`)

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\Db;

use App\Domain\Model\User;
use App\Domain\Model\UserId;
use App\Domain\Repository\UserRepositoryInterface;
use DateTimeImmutable;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;

final readonly class DbUserRepository implements UserRepositoryInterface
{
    public function __construct(
        private ConnectionInterface $db,
    ) {}

    public function findById(UserId $id): ?User
    {
        /** @var array<string, mixed>|null $row */
        $row = (new Query($this->db))
            ->from('{{%user}}')
            ->where(['id' => $id->value])
            ->one();

        return $row !== null ? $this->hydrate($row) : null;
    }

    public function findByEmail(string $email): ?User
    {
        /** @var array<string, mixed>|null $row */
        $row = (new Query($this->db))
            ->from('{{%user}}')
            ->where(['email' => mb_strtolower($email)])
            ->one();

        return $row !== null ? $this->hydrate($row) : null;
    }

    public function save(User $user): void
    {
        $now = (new DateTimeImmutable())->format('Y-m-d H:i:s');
        $id = $user->getId()->value;

        // Atomic upsert avoids concurrency race conditions
        $this->db->createCommand()
            ->upsert(
                table: '{{%user}}',
                insertColumns: [
                    'id' => $id,
                    'name' => $user->getName(),
                    'email' => $user->getEmail(),
                    'created_at' => $user->getCreatedAt()?->format('Y-m-d H:i:s') ?? $now,
                    'updated_at' => $now,
                ],
                updateColumns: [
                    'name' => $user->getName(),
                    'email' => $user->getEmail(),
                    'updated_at' => $now,
                ],
            )
            ->execute();
    }

    public function delete(User $user): void
    {
        $this->db->createCommand()
            ->delete(table: '{{%user}}', condition: ['id' => $user->getId()->value])
            ->execute();
    }

    /**
     * @param array<string, mixed> $row
     */
    private function hydrate(array $row): User
    {
        return new User(
            id: new UserId((string) $row['id']),
            name: (string) $row['name'],
            email: (string) $row['email'],
            createdAt: isset($row['created_at']) && is_string($row['created_at'])
                ? new DateTimeImmutable($row['created_at'])
                : null,
            updatedAt: isset($row['updated_at']) && is_string($row['updated_at'])
                ? new DateTimeImmutable($row['updated_at'])
                : null,
        );
    }
}
```

### 1.5. Hydration via `yiisoft/hydrator` & Nested Value Objects

`yiisoft/hydrator` instantiates objects via constructor reflection and populates properties. To keep Domain Entities clean of framework dependencies, use `Yiisoft\Hydrator\ArrayData` with column mapping in the Infrastructure layer:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\Db;

use App\Domain\Model\User;
use App\Domain\Model\UserId;
use App\Domain\Repository\UserRepositoryInterface;
use DateTimeImmutable;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;
use Yiisoft\Hydrator\ArrayData;
use Yiisoft\Hydrator\HydratorInterface;

final readonly class HydratedDbUserRepository implements UserRepositoryInterface
{
    public function __construct(
        private ConnectionInterface $db,
        private HydratorInterface $hydrator,
    ) {}

    public function findById(UserId $id): ?User
    {
        /** @var array<string, mixed>|null $row */
        $row = (new Query($this->db))->from('{{%user}}')->where(['id' => $id->value])->one();
        return $row !== null ? $this->hydrateRow($row) : null;
    }

    public function findByEmail(string $email): ?User
    {
        /** @var array<string, mixed>|null $row */
        $row = (new Query($this->db))->from('{{%user}}')->where(['email' => mb_strtolower($email)])->one();
        return $row !== null ? $this->hydrateRow($row) : null;
    }

    public function save(User $user): void
    {
        $now = (new DateTimeImmutable())->format('Y-m-d H:i:s');
        $this->db->createCommand()
            ->upsert(
                table: '{{%user}}',
                insertColumns: [
                    'id' => $user->getId()->value,
                    'name' => $user->getName(),
                    'email' => $user->getEmail(),
                    'created_at' => $user->getCreatedAt()?->format('Y-m-d H:i:s') ?? $now,
                    'updated_at' => $now,
                ],
                updateColumns: [
                    'name' => $user->getName(),
                    'email' => $user->getEmail(),
                    'updated_at' => $now,
                ],
            )
            ->execute();
    }

    public function delete(User $user): void
    {
        $this->db->createCommand()
            ->delete(table: '{{%user}}', condition: ['id' => $user->getId()->value])
            ->execute();
    }

    /**
     * @param array<string, mixed> $row
     */
    private function hydrateRow(array $row): User
    {
        // 1. Prepare typed value objects / dates
        $data = [
            'id' => new UserId((string) $row['id']),
            'name' => (string) $row['name'],
            'email' => (string) $row['email'],
            'createdAt' => isset($row['created_at']) && is_string($row['created_at'])
                ? new DateTimeImmutable($row['created_at'])
                : null,
            'updatedAt' => isset($row['updated_at']) && is_string($row['updated_at'])
                ? new DateTimeImmutable($row['updated_at'])
                : null,
        ];

        // 2. Hydrate pure entity instance
        return $this->hydrator->create(User::class, $data);
    }
}
```

> [!NOTE]
> **Ground-Truth Hydrator Attributes & Array Mapping:**
> - When hydrating DTOs or models that accept framework attributes, use canonical attribute `#[Data('column_name')]` (`Yiisoft\Hydrator\Attribute\Parameter\Data`) to map database columns to properties or constructor arguments.
> - Use `#[SkipHydration]` (`Yiisoft\Hydrator\Attribute\SkipHydration`) to ignore internal buffers like `$recordedEvents`.
> - **Anti-Hallucination Invariant:** Attributes `#[DataParam]`, `#[Map]`, and `#[MapInput]` do **NOT** exist in `yiisoft/hydrator`.
> - `Yiisoft\Hydrator\TypeCaster\HydratorTypeCaster` automatically cascades hydration into nested objects when the corresponding data key contains an array. For converting scalar strings into Value Objects (e.g. `string` $\to$ `UserId`), provide pre-instantiated instances in `$data` or register a custom `TypeCasterInterface` in the application container.

---

## 2. Connection, Commands & Mutations (`CommandInterface`)

### 2.1. Parameterized Queries & Table Prefix Syntax

In `yiisoft/db`, SQL statements are prepared and executed via `CommandInterface`. Always use prefix brackets `{{%table}}` to allow automatic table prefix substitution and dialect-specific identifier quoting. Column names wrapped in `[[column]]` are quoted automatically by the driver:

```php
// Creating parameterized commands
$command = $db->createCommand(
    sql: 'SELECT * FROM {{%user}} WHERE [[status]] = :status AND [[created_at]] > :created',
    params: [
        ':status' => 'active',
        ':created' => '2026-01-01 00:00:00',
    ],
);

// Executing queries
$rows = $command->queryAll();     // Returns list<array> (empty list [] if no rows found)
$row = $command->queryOne();       // Returns array|null (strictly null if no row matches)
$count = $command->queryScalar();  // Returns bool|string|int|float|null (returns FALSE if no row matches!)
$emails = $command->queryColumn(); // Returns flat 1D array of values from first column
```

> [!WARNING]
> **Critical Return Value Pitfall: `queryScalar()` Returns `false` on Empty Results:**
> While `Query::one()` returns `null` when no record matches, `CommandInterface::queryScalar()` inherits PDO's `PDOStatement::fetchColumn()` behavior: it returns **`false`** if the result set contains no rows.
> - Checking `if ($command->queryScalar() === null)` when no row exists will fail.
> - Always check `if ($scalar === false)` or `if ($scalar !== false)` when evaluating whether a row was returned.
> - `queryScalar()` returns `null` **only** when a matching row exists and its column value is SQL `NULL`.

### 2.2. Atomic Mutations: Insert, Update, Delete & Batch Insert

Always use native `CommandInterface` mutation helpers instead of manually composing SQL strings:

```php
// 1. Single row insert
$affected = $db->createCommand()->insert(
    table: '{{%user}}',
    columns: ['id' => $id, 'name' => 'Alice', 'email' => 'alice@example.com'],
)->execute();

// 2. Atomic Upsert (cross-platform atomic insert or update)
$db->createCommand()->upsert(
    table: '{{%user}}',
    insertColumns: [
        'id' => $id,
        'name' => 'Alice',
        'email' => 'alice@example.com',
        'updated_at' => $now,
    ],
    updateColumns: [
        'name' => 'Alice',
        'updated_at' => $now,
    ],
)->execute();

// 3. Batch Insert (Yii3 method is insertBatch, NOT legacy batchInsert)
$db->createCommand()->insertBatch(
    table: '{{%user}}',
    rows: [
        ['id-1', 'Alice', 'alice@example.com'],
        ['id-2', 'Bob', 'bob@example.com'],
    ],
    columns: ['id', 'name', 'email'],
)->execute();

// 4. Update & Delete
$db->createCommand()->update(
    table: '{{%user}}',
    columns: ['status' => 'inactive'],
    condition: ['id' => $id],
)->execute();

$db->createCommand()->delete(
    table: '{{%user}}',
    condition: ['status' => 'deleted'],
)->execute();
```

### 2.3. Primary Key Retrieval & Generated IDs

To retrieve auto-generated primary keys after insertion:

```php
// 1. insertReturningPks(): Inserts and returns primary key values directly as an array
/** @var array<string, mixed> $pks */
$pks = $db->createCommand()->insertReturningPks(
    table: '{{%user}}',
    columns: [
        'name' => 'Charlie',
        'email' => 'charlie@example.com',
    ],
);
// Example result: ['id' => 42]

// 2. upsertReturningPks(): Atomic upsert returning primary keys
/** @var array<string, mixed> $upsertPks */
$upsertPks = $db->createCommand()->upsertReturningPks(
    table: '{{%user}}',
    insertColumns: ['email' => 'charlie@example.com', 'name' => 'Charlie'],
    updateColumns: ['name' => 'Charlie Updated'],
);

// 3. getLastInsertId(): Connection helper for auto-increment IDs
// Note: In PostgreSQL and Oracle, a sequence name is MANDATORY.
$lastId = $db->getLastInsertId();

// For PostgreSQL / Oracle, obtain the sequence name from TableSchema:
$tableSchema = $db->getTableSchema('{{%user}}');
$sequenceName = $tableSchema?->getSequenceName();
$pgLastId = $db->getLastInsertId($sequenceName);
```

---

## 3. Query Builder (`Yiisoft\Db\Query\Query`)

### 3.1. Building Select Queries & Conditions

`Yiisoft\Db\Query\Query` builds cross-database SQL queries using immutable fluent methods:

```php
use Yiisoft\Db\Query\Query;

$query = (new Query($db))
    ->select(['id', 'name', 'email'])
    ->distinct()
    ->from('{{%user}}')
    ->where(['status' => 'active'])
    ->andWhere(['>', 'login_count', 5])
    ->orWhere(['role' => 'admin'])
    ->orderBy(['created_at' => SORT_DESC])
    ->limit(50)
    ->offset(0);

// filterWhere() / andFilterWhere(): automatically ignores null, '', and []
$searchQuery = (new Query($db))
    ->from('{{%user}}')
    ->filterWhere(['status' => $statusFilter]) // Discarded if $statusFilter is null or ''
    ->andFilterWhere(['like', 'name', $nameInput]);
```

### 3.2. Advanced Conditions, Subqueries, Joins & Aggregations

`Yiisoft\Db\Query\Query` supports advanced relational operators and subqueries:

```php
use Yiisoft\Db\Expression\Expression;
use Yiisoft\Db\Query\Query;

// 1. Hash conditions with auto-IN expansion
$query->where([
    'status' => 'active',
    'role' => ['admin', 'manager'], // Compiles to: role IN ('admin', 'manager')
]);

// 2. Operator conditions: between, in, like, exists
$query->where(['between', 'age', 18, 65])
    ->andWhere(['in', 'department_id', [10, 20, 30]])
    ->andWhere(['like', 'email', 'example.com'])
    ->andWhere(['not like', 'name', 'bot']);

// 3. Subqueries as QueryInterface instances
$activeOrdersSubQuery = (new Query($db))
    ->select('user_id')
    ->from('{{%order}}')
    ->where(['status' => 'completed']);

$usersWithOrders = (new Query($db))
    ->from('{{%user}}')
    ->where(['in', 'id', $activeOrdersSubQuery]);

// 4. Joins
$query = (new Query($db))
    ->select(['u.id', 'u.name', 'p.bio', 'o.total'])
    ->from(['u' => '{{%user}}'])
    ->leftJoin(['p' => '{{%profile}}'], '[[p.user_id]] = [[u.id]]')
    ->innerJoin(['o' => '{{%order}}'], '[[o.user_id]] = [[u.id]] AND [[o.status]] = :status', [':status' => 'paid']);

// 5. Grouping, Having and Aggregates
$summary = (new Query($db))
    ->select([
        'department_id',
        'employee_count' => new Expression('COUNT(*)'),
        'avg_salary' => new Expression('AVG([[salary]])'),
    ])
    ->from('{{%employee}}')
    ->groupBy(['department_id'])
    ->having(['>', 'COUNT(*)', 5])
    ->andHaving(['>=', 'AVG([[salary]])', 50000])
    ->all();

// 6. Indexing query results by column or closure
$usersById = (new Query($db))
    ->from('{{%user}}')
    ->indexBy('id')
    ->all(); // Result keys will be user IDs instead of 0, 1, 2...

$usersByUuid = (new Query($db))
    ->from('{{%user}}')
    ->indexBy(fn(array $row): string => (string) $row['uuid'])
    ->all();
```

### 3.3. Fetching Results & Strict Null Return Semantics

> [!IMPORTANT]
> **`Query::one()` returns `array|object|null`:**
> In Yii3, `Query::one()` returns `null` when no matching record is found. It **never returns `false`** like legacy Yii2. Checking `if ($row !== false)` or `if ($row == false)` is a bug. Always use `if ($row !== null)`.

```php
// Fetch one record (array|null)
$user = $query->one();
if ($user !== null) {
    echo $user['email'];
}

// Fetch all matching records (list<array>)
$allUsers = $query->all();

// Fetch a single scalar column value or aggregate
$totalCount = (new Query($db))->from('{{%user}}')->where(['status' => 'active'])->count();
$avgSalary = (new Query($db))->from('{{%employee}}')->average('salary');
$maxAge = (new Query($db))->from('{{%user}}')->max('age');

// Fetch flat list of single column values (array<int, mixed>)
$emails = (new Query($db))->select('email')->from('{{%user}}')->column();

// Check existence (bool)
$exists = (new Query($db))->from('{{%user}}')->where(['email' => $email])->exists();
```

### 3.4. Memory-Safe Cursor Streaming: `each()` & `batch()`

When processing large datasets (e.g. exporting 100,000 rows or running data migrations), calling `$query->all()` loads all records into PHP memory simultaneously, causing memory exhaustion (`Allowed memory size exhausted`).

`yiisoft/db` provides two memory-safe streaming methods:

```php
use Yiisoft\Db\Query\Query;

// 1. Query::each(): DataReaderInterface (ZERO arguments!)
// Streams records one by one through an unbuffered cursor with flat O(1) memory consumption.
$userQuery = (new Query($db))
    ->from('{{%user}}')
    ->where(['status' => 'active'])
    ->orderBy(['id' => SORT_ASC]);

/** @var array<string, mixed> $user */
foreach ($userQuery->each() as $index => $user) {
    // Process one user at a time
    processUserData($user);
}

// 2. Query::batch(int $batchSize = 100): BatchQueryResultInterface
// Yields chunks of $batchSize rows at a time, suitable for batch inserts or bulk operations.
/** @var list<array<string, mixed>> $batch */
foreach ($userQuery->batch(500) as $batch) {
    // $batch contains up to 500 records
    exportUsersBatch($batch);
}
```

> [!WARNING]
> **Zero Arguments Invariant for `Query::each()`:**
> In Yii3, `Query::each()` takes **0 arguments** (`each(): DataReaderInterface`). Passing an argument such as `Query::each(100)` throws a PHP 8 fatal `ArgumentCountError`.
> Chunked batch iteration is achieved exclusively via `Query::batch(int $batchSize = 100)`.

---

## 4. Transaction Management, Boundaries & Resilience

Transactions must be handled at the **Application/Use Case Layer**, not inside individual repository methods. This ensures atomic multi-repository mutations and prevents partial writes.

### 4.1. Idiomatic Closure Transactions (`transaction()`)

`$db->transaction()` automatically commits when the closure successfully returns, and automatically rolls back if any `Throwable` is thrown. The closure may be zero-argument; a one-argument closure receives the `ConnectionInterface` instance. The optional second `transaction()` argument (`isolationLevel`) is forwarded verbatim to `beginTransaction()`:

```php
declare(strict_types=1);

namespace App\Application\UseCase\Order;

use App\Domain\Model\Order;
use App\Domain\Repository\OrderRepositoryInterface;
use App\Domain\Repository\ProductRepositoryInterface;
use Throwable;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Transaction\TransactionInterface;

final readonly class CreateOrderUseCase
{
    public function __construct(
        private ConnectionInterface $db,
        private OrderRepositoryInterface $orders,
        private ProductRepositoryInterface $products,
    ) {}

    /**
     * @throws Throwable
     */
    public function execute(CreateOrderCommand $command): Order
    {
        // 1. Execute DB mutations inside the atomic transaction closure
        $order = $this->db->transaction(
            closure: function (ConnectionInterface $db) use ($command): Order {
                $product = $this->products->getByIdForUpdate($command->productId);
                $product->reserveStock($command->quantity);
                $this->products->save($product);

                $order = Order::create(
                    userId: $command->userId,
                    product: $product,
                    quantity: $command->quantity,
                );
                $this->orders->save($order);

                return $order;
            },
            isolationLevel: TransactionInterface::READ_COMMITTED,
        );

        // 2. Dispatch the aggregate's recorded events ONLY here — after transaction()
        //    has returned, which is guaranteed post-commit (see note below).

        return $order;
    }
}
```

> [!IMPORTANT]
> **Strict post-commit dispatch rule:** never send emails, trigger webhooks, or push jobs to external queues inside the transaction closure — if the transaction rolls back, external side effects cannot be recalled. Collect domain events on the aggregate (`recordEvent()`) and dispatch them strictly after `$db->transaction()` returns. The full aggregate event-recording pattern and the `transaction()` commit semantics that enforce it are owned by the [Events & Listeners Guide](core-events-and-listeners.md), section 5.

### 4.2. Manual Transactions & Savepoints

For complex multi-stage pipelines where closure boundaries are inconvenient:

```php
use Throwable;
use Yiisoft\Db\Transaction\TransactionInterface;

$transaction = $db->beginTransaction(
    isolationLevel: TransactionInterface::REPEATABLE_READ,
);

try {
    $db->createCommand()->insert('{{%invoice}}', $invoiceData)->execute();
    $db->createCommand()->update('{{%account}}', ['balance' => $newBalance], ['id' => $accountId])->execute();

    $transaction->commit();
} catch (Throwable $e) {
    $transaction->rollBack();
    throw $e;
}
```

### 4.3. Isolation Levels & Post-Commit Event Rule

1. **Isolation Level Constants:** Defined on `Yiisoft\Db\Transaction\TransactionInterface`:
   - `TransactionInterface::READ_UNCOMMITTED`
   - `TransactionInterface::READ_COMMITTED`
   - `TransactionInterface::REPEATABLE_READ`
   - `TransactionInterface::SERIALIZABLE`
2. **Nested Transactions & Savepoints:** If a transaction is already active, nested calls to `beginTransaction()` or `$db->transaction()` automatically create database savepoints (`SAVEPOINT LEVEL<n>`) when supported by the underlying driver (`$db->isSavepointEnabled()`).
3. **Strict Post-Commit Rule:** Never dispatch external side effects (email, SMS, webhooks, queue jobs) inside `$db->transaction()` — collect domain events on aggregates and dispatch them strictly post-commit. Full pattern: [Events & Listeners Guide](core-events-and-listeners.md), section 5.

### 4.4. Deadlock Retries & Serialization Failures (`SerializationFailureException`)

Under high concurrency, operations modifying overlapping rows may encounter database deadlocks or serialization failures (SQLSTATE code `'40001'`). In `yiisoft/db`, these are converted to `Yiisoft\Db\Exception\SerializationFailureException`.

#### 1. Command-Level Retry Handler (`setRetryHandler`)

`CommandInterface::setRetryHandler(?Closure $handler)` allows registering an automated retry callback. The documented handler contract is `function (Yiisoft\Db\Exception\Exception $e, int $attempt): bool`: the closure receives the `Yiisoft\Db\Exception\Exception` converted from the thrown database exception (not the raw driver exception or an arbitrary `Throwable`) and the current execution attempt, starting from `1`. Returning `true` retries the statement; returning `false` re-throws the exception.

```php
use Yiisoft\Db\Exception\Exception;
use Yiisoft\Db\Exception\SerializationFailureException;

$command = $db->createCommand(
    sql: 'UPDATE {{%seat}} SET [[status]] = :status WHERE [[id]] = :id AND [[status]] = :free',
    params: [':status' => 'reserved', ':id' => $seatId, ':free' => 'available'],
);

// Retry up to 3 times with exponential backoff on serialization failures
$command->setRetryHandler(function (Exception $e, int $attempt): bool {
    if ($e instanceof SerializationFailureException && $attempt < 3) {
        usleep(50000 * (2 ** $attempt)); // Backoff: 50ms, 100ms, 200ms
        return true; // Return true to retry statement execution
    }
    return false; // Re-throw exception
});

$affectedRows = $command->execute();
```

#### 2. Transaction-Level Retry Wrapper Recipe

When an entire transaction must be retried due to deadlocks:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\Db;

use Closure;
use Throwable;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Exception\SerializationFailureException;
use Yiisoft\Db\Transaction\TransactionInterface;

final class TransactionRunner
{
    /**
     * @template T
     * @param Closure(ConnectionInterface): T $closure
     * @return T
     * @throws Throwable
     */
    public static function runWithRetry(
        ConnectionInterface $db,
        Closure $closure,
        ?string $isolationLevel = TransactionInterface::READ_COMMITTED,
        int $maxAttempts = 3,
    ): mixed {
        for ($attempt = 1; $attempt <= $maxAttempts; ++$attempt) {
            try {
                return $db->transaction($closure, $isolationLevel);
            } catch (SerializationFailureException $e) {
                if ($attempt >= $maxAttempts) {
                    throw $e;
                }
                // Jittered backoff: 20ms * attempt + random 1..10ms
                usleep((20000 * $attempt) + random_int(1000, 10000));
            }
        }

        throw new \RuntimeException('Transaction retry failed.');
    }
}
```

---

## 5. Paginated Queries & Data Readers (`yiisoft/data-db`, `yiisoft/data`)

> [!IMPORTANT]
> **Critical FQCN Notice:**
> The data reader for `yiisoft/db` is `Yiisoft\Data\Db\QueryDataReader` (package `yiisoft/data-db`).
> Do **NOT** use `Yiisoft\DataDb\DataReader\QueryDataReader` (hallucinated namespace).

### 5.1. `QueryDataReader` & Sorting (`Sort::only()`, `Sort::any()`)

`QueryDataReader` bridges `Yiisoft\Db\Query\Query` with `yiisoft/data` sorting and pagination abstractions:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\Db;

use Yiisoft\Data\Db\QueryDataReader;
use Yiisoft\Data\Paginator\OffsetPaginator;
use Yiisoft\Data\Reader\Sort;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;

final readonly class UserGridQuery
{
    public function __construct(
        private ConnectionInterface $db,
    ) {}

    public function getPaginator(int $page = 1, int $pageSize = 20): OffsetPaginator
    {
        $query = (new Query($this->db))
            ->select(['id', 'name', 'email', 'created_at'])
            ->from('{{%user}}');

        // 1. Sort::only(): Restricts sorting strictly to allowed logical fields (safe for untrusted input)
        // Note: Sort::__construct is private! Always instantiate via Sort::only() or Sort::any().
        $sort = Sort::only(['id', 'name', 'created_at'])
            ->withOrderString('-created_at'); // Prefix '-' denotes SORT_DESC

        // 2. QueryDataReader: Wraps query and configures sort
        $dataReader = (new QueryDataReader($query))->withSort($sort);

        // 3. OffsetPaginator: 1-based page index
        return (new OffsetPaginator($dataReader))
            ->withPageSize($pageSize)
            ->withCurrentPage($page);
    }
}
```

> [!NOTE]
> **Sorting & Inspection Nuances:**
> - `Sort::only(array $config)` ignores any fields not present in `$config` when building criteria.
> - `Sort::any(array $config = [])` allows sorting by any field, using `$config` for field alias mappings.
> - `Sort` criteria inspection methods: `getOrder()`, `getCriteria()`, `getDefaultOrder()`, `hasFieldInConfig()`. Note: `getOrderConfig()` does **NOT** exist.
> - `QueryDataReader` exposes `withHaving(FilterInterface $having)` to configure HAVING filters, but has **no** `getHaving()` method.

### 5.2. Offset Pagination (`OffsetPaginator`)

`OffsetPaginator` handles page-based navigation:

```php
$paginator = (new OffsetPaginator($dataReader))
    ->withPageSize(25)
    ->withCurrentPage(2);

// Reading items for the current page
/** @var list<array<string, mixed>> $items */
$items = iterator_to_array($paginator->read());

$currentPage = $paginator->getCurrentPage();       // 2
$pageSize = $paginator->getPageSize();             // 25
$totalItems = $paginator->getTotalItems();         // e.g. 150
$totalPages = $paginator->getTotalPages();         // 6
$isOnFirst = $paginator->isOnFirstPage();          // false
$isOnLast = $paginator->isOnLastPage();            // false
$isRequired = $paginator->isPaginationRequired();  // true
```

### 5.3. Filtering in `QueryDataReader` (`withFilter()`)

`QueryDataReader` implements `Yiisoft\Data\Reader\FilterableDataInterface`. You can configure dynamic SQL filtering using framework filter objects from `Yiisoft\Data\Reader\Filter\*`:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\Db;

use Yiisoft\Data\Db\QueryDataReader;
use Yiisoft\Data\Reader\Filter\AndX;
use Yiisoft\Data\Reader\Filter\Between;
use Yiisoft\Data\Reader\Filter\Equals;
use Yiisoft\Data\Reader\Filter\In;
use Yiisoft\Data\Reader\Filter\Like;
use Yiisoft\Data\Reader\Filter\LikeMode;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;

final readonly class FilteredUserSearch
{
    public function __construct(
        private ConnectionInterface $db,
    ) {}

    public function search(?string $status, ?string $term, ?int $minAge, ?int $maxAge): QueryDataReader
    {
        $query = (new Query($this->db))
            ->select(['id', 'name', 'email', 'status', 'age', 'created_at'])
            ->from('{{%user}}');

        $dataReader = new QueryDataReader($query);

        $filters = [];
        if ($status !== null && $status !== '') {
            $filters[] = new Equals('status', $status);
        }
        if ($term !== null && $term !== '') {
            $filters[] = new Like('name', $term, caseSensitive: false, mode: LikeMode::Contains);
        }
        if ($minAge !== null && $maxAge !== null) {
            $filters[] = new Between('age', $minAge, $maxAge);
        }

        if (!empty($filters)) {
            // Apply composite filter via immutable withFilter()
            $dataReader = $dataReader->withFilter(new AndX(...$filters));
        }

        return $dataReader;
    }
}
```

### 5.4. High-Performance Keyset (Cursor) Pagination (`KeysetPaginator`)

On large tables (millions of rows), `OffsetPaginator` degrades severely because `OFFSET 500000` forces the database engine to scan and discard 500,000 index entries. `KeysetPaginator` eliminates this by utilizing index cursor boundaries (`WHERE [[id]] > :token ORDER BY [[id]] ASC LIMIT :limit + 1`):

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\Db;

use Yiisoft\Data\Db\QueryDataReader;
use Yiisoft\Data\Paginator\KeysetPaginator;
use Yiisoft\Data\Paginator\PageToken;
use Yiisoft\Data\Reader\Sort;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;

final readonly class KeysetUserFeed
{
    public function __construct(
        private ConnectionInterface $db,
    ) {}

    public function getFeed(int $limit = 50, ?string $nextTokenValue = null): KeysetPaginator
    {
        $query = (new Query($this->db))
            ->select(['id', 'name', 'email', 'created_at'])
            ->from('{{%user}}');

        // Keyset pagination REQUIRES strict sorting on unique/indexed fields
        $dataReader = (new QueryDataReader($query))
            ->withSort(Sort::only(['id'])->withOrderString('id'));

        $paginator = (new KeysetPaginator($dataReader))
            ->withPageSize($limit);

        // Apply cursor token if navigating from a previous page
        if ($nextTokenValue !== null) {
            $paginator = $paginator->withToken(PageToken::next($nextTokenValue));
        }

        return $paginator;
    }
}

// Consuming KeysetPaginator in an API Action:
$paginator = $feed->getFeed(limit: 20, nextTokenValue: $requestQuery['cursor'] ?? null);

$rows = iterator_to_array($paginator->read());
$nextToken = $paginator->getNextToken(); // ?PageToken

$response = [
    'items' => $rows,
    'next_cursor' => $nextToken?->value, // Extracted cursor string for subsequent requests
    'has_more' => $nextToken !== null,
];
```

---

## 6. Driver Packages: MySQL, PostgreSQL, SQLite, MSSQL & Oracle

`yiisoft/db` provides the abstractions (`ConnectionInterface`, `Query`, `CommandInterface`); a **driver package** provides the concrete PDO connection, dialect-specific `QueryBuilder`/`Schema`/`Quoter`, and column factories. Install exactly one per project (plus `yiisoft/db` itself):

### 6.1. Driver Specifications Matrix

| Driver | Composer Package | PHP Extension | DSN Prefix / Default Port | Identifier Quoting | Custom Quoter Class | Primary Key Retrieval |
|---|---|---|---|---|---|---|
| **MySQL** | `yiisoft/db-mysql` | `pdo_mysql` | `mysql` / `3306` | Backticks (`` ` ``) | `Yiisoft\Db\Mysql\Quoter` | `getLastInsertId()` (auto-increment) |
| **PostgreSQL** | `yiisoft/db-pgsql` | `pdo_pgsql` | `pgsql` / `5432` | Double quotes (`"`) | `Yiisoft\Db\Pgsql\Quoter` | `RETURNING <pks>` (sequence required) |
| **SQLite** | `yiisoft/db-sqlite` | `pdo_sqlite` | `sqlite` / N/A | Double quotes (`"`) | **None** (uses core `Quoter`) | `RETURNING <pks>` or rowid |
| **MSSQL** | `yiisoft/db-mssql` | `pdo_sqlsrv` | `sqlsrv` / `1433` | Brackets (`[ ]`) | `Yiisoft\Db\Mssql\Quoter` | `@temporary_inserted` output |
| **Oracle** | `yiisoft/db-oracle` | `pdo_oci` | `oci` / `1521` | Double quotes (`"`) | `Yiisoft\Db\Oracle\Quoter` | `RETURNING ... INTO ...` (sequence required) |

All five driver packages declare `"provide": {"yiisoft/db-implementation": "1.0.0"}` in their `composer.json`.

### 6.2. Canonical Connection Configuration

Each driver ships typed DSN value objects (`Yiisoft\Db\<Dialect>\Dsn`) that render the PDO DSN string. Canonical configuration in `config/common/params.php` (this is the official shape from the `yiisoft/db` docs; the companion `ConnectionInterface` DI definition is shown in [core-di-and-config.md](core-di-and-config.md), section 4.9):

> [!NOTE]
> `username` / `password` below are schema placeholders. In real applications read them from the environment — `(string) ($_ENV['DB_USERNAME'] ?? '')` / `(string) ($_ENV['DB_PASSWORD'] ?? '')` — never hardcode credentials in params (see the DI & Configuration Guide's anti-pattern matrix).

```php
// 1. MySQL / MariaDB (renders: mysql:host=127.0.0.1;dbname=yiitest;port=3306;charset=utf8mb4)
use Yiisoft\Db\Mysql\Dsn as MysqlDsn;

'yiisoft/db-mysql' => [
    'dsn' => new MysqlDsn('mysql', '127.0.0.1', 'yiitest', '3306', ['charset' => 'utf8mb4']),
    'username' => 'user',       // placeholder — use $_ENV
    'password' => 'secret',     // placeholder — use $_ENV
],

// 2. MySQL Unix Socket (renders: mysql:unix_socket=/var/run/mysqld/mysqld.sock;dbname=yiitest)
use Yiisoft\Db\Mysql\DsnSocket;

'yiisoft/db-mysql' => [
    'dsn' => new DsnSocket('mysql', '/var/run/mysqld/mysqld.sock', 'yiitest'),
    'username' => 'user',       // placeholder — use $_ENV
    'password' => 'secret',     // placeholder — use $_ENV
],

// 3. PostgreSQL (renders: pgsql:host=127.0.0.1;dbname=yiitest;port=5432)
use Yiisoft\Db\Pgsql\Dsn as PgsqlDsn;

'yiisoft/db-pgsql' => [
    'dsn' => new PgsqlDsn('pgsql', '127.0.0.1', 'yiitest', '5432'),
    'username' => 'postgres',   // placeholder — use $_ENV
    'password' => 'secret',     // placeholder — use $_ENV
],

// 4. SQLite: In-Memory (for CI/Testing, renders: sqlite::memory:)
use Yiisoft\Db\Sqlite\Dsn as SqliteDsn;

'yiisoft/db-sqlite' => [
    'dsn' => new SqliteDsn('sqlite', 'memory'),
],

// SQLite: File-Based (renders: sqlite:/path/to/database.sq3)
// Same 'yiisoft/db-sqlite' params group as in-memory (pick one per project) — the DSN alone distinguishes memory vs file storage.
'yiisoft/db-sqlite' => [
    'dsn' => new SqliteDsn('sqlite', '/var/data/app.sq3'),
],

// 5. Microsoft SQL Server (renders: sqlsrv:Server=localhost,1433;Database=yiitest)
use Yiisoft\Db\Mssql\Dsn as MssqlDsn;

'yiisoft/db-mssql' => [
    'dsn' => new MssqlDsn('sqlsrv', 'localhost', 'yiitest', '1433'),
    'username' => 'sa',         // placeholder — use $_ENV
    'password' => 'secret',     // placeholder — use $_ENV
],

// 6. Oracle Database (renders: oci:dbname=localhost:1521/XE;charset=AL32UTF8)
use Yiisoft\Db\Oracle\Dsn as OracleDsn;

'yiisoft/db-oracle' => [
    'dsn' => new OracleDsn('oci', 'localhost', 'XE', '1521', ['charset' => 'AL32UTF8']),
    'username' => 'system',     // placeholder — use $_ENV
    'password' => 'secret',     // placeholder — use $_ENV
],
```

The driver packages ship **no** DI config-plugin of their own. The DI definition mapping `ConnectionInterface::class` to the driver's `Connection` lives in the application (`config/common/di/db-<driver>.php` consuming `$params['yiisoft/db-<driver>']`) — the canonical definition is shown in [core-di-and-config.md](core-di-and-config.md), section 4.9.

### 6.3. Driver-Specific Nuances & Version Support

| Driver | Nuance & Version Support |
|---|---|
| **MySQL** | - Supported versions: MySQL 5.7+, MariaDB 10.4+.<br>- Default charset `utf8mb4`: on connect the driver runs `SET NAMES 'utf8mb4'` unless DSN contains `charset`.<br>- `LIMIT` is never optional in MySQL: `offset()` without `limit()` compiles to `LIMIT 18446744073709551615 OFFSET $offset`.<br>- PDO connections are forced to `ERRMODE_EXCEPTION` and `ATTR_STRINGIFY_FETCHES => true`. |
| **PostgreSQL** | - Supported versions: PostgreSQL 9+ (schema layer requires 9.6+).<br>- `getLastInsertId()` **requires a sequence name**: calling without one throws `InvalidArgumentException('PostgreSQL not support lastInsertId without sequence name.')`.<br>- Default schema is `public` (`Schema::$defaultSchema`).<br>- Upsert compiles to native `INSERT ... ON CONFLICT (...) DO UPDATE`.<br>- Full support for arrays, numeric/timestamp ranges, and structured PostgreSQL columns. |
| **SQLite** | - Supported versions: SQLite 3.34+.<br>- In-memory lifetime protection: `Yiisoft\Db\Sqlite\Connection::__clone()` preserves `$this->pdo` when the DSN starts with `sqlite::memory:`, preventing premature database loss on clone.<br>- **Foreign Keys are disabled by default**: Must execute `PRAGMA foreign_keys = ON;` upon connection initialization.<br>- **Restricted isolation levels**: SQLite transactions only support `SERIALIZABLE` (`PRAGMA read_uncommitted = False;`) and `READ_UNCOMMITTED` (`PRAGMA read_uncommitted = True;`). Any other isolation level throws `NotSupportedException`.<br>- Quoter architecture: SQLite does not define a custom `Quoter` class, instantiating the core `Yiisoft\Db\Schema\Quoter` with double quotes. |
| **MSSQL** | - Supported versions: SQL Server 2017+.<br>- Pagination uses `OFFSET n ROWS FETCH NEXT m ROWS ONLY`. When the query has no `ORDER BY`, the builder automatically injects `ORDER BY (SELECT NULL)` to satisfy SQL Server requirements.<br>- Upsert compiles to atomic `MERGE ... WITH (HOLDLOCK)`.<br>- Booleans are mapped to integer `0`/`1`. Savepoint release is a no-op. |
| **Oracle** | - Supported versions: Oracle 12c – 21c.<br>- `getLastInsertId()` strictly requires a sequence name and queries `SELECT $sequenceName.CURRVAL FROM DUAL`.<br>- Pagination does not use `OFFSET/FETCH`: it compiles to a Common Table Expression using `rownum as rowNumId` (`WITH USER_SQL AS ($sql), PAGINATION AS (SELECT USER_SQL.*, rownum as rowNumId FROM USER_SQL) SELECT * FROM PAGINATION WHERE rowNumId > :offset AND rownum <= :limit`).<br>- On connect, the driver sets session ISO-8601 date formats (`NLS_DATE_FORMAT`, `NLS_TIMESTAMP_FORMAT`). Default schema is the uppercase username. |

---

## 7. PHP 8 Named Arguments & Signatures Reference

```php
declare(strict_types=1);

use Yiisoft\Data\Db\QueryDataReader;
use Yiisoft\Data\Paginator\KeysetPaginator;
use Yiisoft\Data\Paginator\OffsetPaginator;
use Yiisoft\Data\Paginator\PageToken;
use Yiisoft\Data\Reader\Sort;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Exception\Exception;
use Yiisoft\Db\Query\Query;
use Yiisoft\Db\Transaction\TransactionInterface;
use Yiisoft\Hydrator\ArrayData;
use Yiisoft\Hydrator\HydratorInterface;

// 1. ConnectionInterface
$command = $db->createCommand(
    sql: 'SELECT * FROM {{%user}} WHERE [[id]] = :id',
    params: [':id' => $id],
);

$result = $db->transaction(
    closure: function (ConnectionInterface $db): mixed {
        return $db->createCommand(sql: 'SELECT 1')->queryOne();
    },
    isolationLevel: TransactionInterface::READ_COMMITTED,
);

$tx = $db->beginTransaction(
    isolationLevel: TransactionInterface::REPEATABLE_READ,
);

$lastId = $db->getLastInsertId(sequenceName: 'user_id_seq');

// 2. CommandInterface
$command->insert(table: '{{%user}}', columns: ['id' => $id, 'name' => $name]);
$command->update(table: '{{%user}}', columns: ['name' => $newName], condition: ['id' => $id]);
$command->delete(table: '{{%user}}', condition: ['id' => $id]);
$command->upsert(table: '{{%user}}', insertColumns: $insertData, updateColumns: $updateData);
$command->insertBatch(table: '{{%user}}', rows: [['1', 'Alice'], ['2', 'Bob']], columns: ['id', 'name']);
$command->insertReturningPks(table: '{{%user}}', columns: ['name' => 'Alice']);
$command->upsertReturningPks(table: '{{%user}}', insertColumns: $insertData, updateColumns: $updateData);
$command->setRetryHandler(handler: function (Exception $e, int $attempt): bool { return false; });

// 3. Query (Yiisoft\Db\Query\Query)
$query = (new Query($db))
    ->select(columns: ['id', 'name', 'email'])
    ->distinct()
    ->from(tables: '{{%user}}')
    ->where(condition: ['status' => 'active'])
    ->andWhere(condition: ['>', 'created_at', $timestamp])
    ->filterWhere(condition: ['role' => $roleOrNull])
    ->groupBy(columns: ['status'])
    ->having(condition: ['>', 'COUNT(*)', 1])
    ->orderBy(columns: ['created_at' => SORT_DESC])
    ->limit(limit: 50)
    ->offset(offset: 0)
    ->indexBy(column: 'id');

// Memory-safe streaming
$dataReader = $query->each(); // 0 arguments!
$batchResult = $query->batch(batchSize: 500);

// 4. Data Readers & Paginators
$sort = Sort::only(config: ['id', 'name', 'created_at'])->withOrderString(orderString: '-created_at');
$dataReader = (new QueryDataReader(query: $query))->withSort(sort: $sort);

$offsetPaginator = (new OffsetPaginator(dataReader: $dataReader))
    ->withPageSize(pageSize: 25)
    ->withCurrentPage(page: 1);

$keysetPaginator = (new KeysetPaginator(dataReader: $dataReader))
    ->withPageSize(pageSize: 50)
    ->withToken(token: PageToken::next(value: '100'));

// 5. HydratorInterface & ArrayData
$arrayData = new ArrayData(data: $row, map: ['createdAt' => 'created_at']);
$entity = $hydrator->create(class: User::class, data: $arrayData);
```

---

## 8. Anti-Pattern Matrix: Database & Query Builder

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| ❌ **Global state: `Yii::$app->db`** | Yii3 has no global state or `Yii::$app`. Throws `Error: Class "Yii" not found`. | Inject `Yiisoft\Db\Connection\ConnectionInterface` via constructor. |
| ❌ **Calling `$command->batchInsert(...)`** | Legacy Yii2 method name. `CommandInterface` has no `batchInsert()` — fatal `Undefined method` error. | Use `$command->insertBatch(table: ..., rows: ..., columns: ...)` followed by `->execute()`. |
| ❌ **`if ($row !== false)` checking `Query::one()`** | Legacy Yii2 habit. In Yii3, `Query::one()` returns `null` when no record matches (never `false`). | Use strict null check: `if ($row !== null)` or `if ($row === null) return null;`. |
| ❌ **`if ($scalar === null)` on `queryScalar()`** | `CommandInterface::queryScalar()` returns `false` on empty result, NOT `null`. Checking for `null` causes logic bugs. | Use strict boolean check: `if ($scalar !== false)` or `if ($scalar === false)`. |
| ❌ **Passing batch size to `Query::each(100)`** | In Yii3, `Query::each()` takes 0 arguments. Passing arguments throws fatal PHP 8 `ArgumentCountError`. | Call `$query->each()` with no arguments, or call `$query->batch(100)` for chunked batches. |
| ❌ **Instantiating `new Sort(...)` directly** | `Sort::__construct` is `private`. Calling `new Sort()` throws fatal `Error: Call to private constructor`. | Use static factories: `Sort::only(['id', 'name'])` or `Sort::any()`. |
| ❌ **Calling `Sort::getOrderConfig()`** | Method does not exist on `Sort`. Throws fatal `Call to undefined method` error. | Use `$sort->getOrder()`, `$sort->getCriteria()`, or `$sort->hasFieldInConfig()`. |
| ❌ **Calling `QueryDataReader::getHaving()`** | Method does not exist on `QueryDataReader`. Throws fatal `Call to undefined method` error. | Configure having via `$dataReader->withHaving($havingFilter)`. |
| ❌ **Hallucinated Hydrator Attributes `#[Map]`, `#[DataParam]`** | Attributes do not exist in `yiisoft/hydrator`. Throws `ClassNotFoundException`. | Use canonical `#[Data('column_name')]` (`Yiisoft\Hydrator\Attribute\Parameter\Data`), `#[SkipHydration]`, or `ArrayData` mapping. |
| ❌ **Using unsupported SQLite isolation levels** | SQLite driver only supports `SERIALIZABLE` and `READ_UNCOMMITTED`. Other levels throw `NotSupportedException`. | Restrict SQLite transactions to `TransactionInterface::SERIALIZABLE` or `READ_UNCOMMITTED`. |
| ❌ **Calling `getLastInsertId()` without sequence in Postgres/Oracle** | PostgreSQL and Oracle require sequence names. Calling without one throws `InvalidArgumentException`. | Retrieve sequence from `$tableSchema->getSequenceName()` and pass to `$db->getLastInsertId($seq)`. |
| ❌ **Dispatching events/queues inside `$db->transaction()`** | If transaction rolls back, side effects (emails, messages) cannot be revoked. | Collect domain events on the aggregate and dispatch strictly post-commit — see [Events & Listeners Guide](core-events-and-listeners.md), section 5. |
| ❌ **Executing DB queries inside HTTP Actions** | Violates architecture boundaries, making actions un-testable and tightly coupled to SQL. | Inject Domain Repositories or Application Use Cases into Action constructors. |
| ❌ **Raw SQL concatenation (`WHERE id = ' . $id`)** | Severe SQL injection vulnerability. | Always use parameter binding (`[':id' => $id]`) or Query Builder condition arrays (`['id' => $id]`). |
| ❌ **Hardcoding table names as plain strings `'user'`** | Prevents automatic table prefixing (`tbl_user`) and schema quoting. | Always use table prefix brackets: `'{{%user}}'`. Wrap column identifiers in `[[column]]`. |
| ❌ **Multi-table mutations without a transaction** | Partial failure leaves the database in an inconsistent or orphaned state. | Always wrap multi-repository updates in `$db->transaction(...)`. |

---

## 9. Related Topic Guides

- [Active Record Persistence Guide](persistence-active-record.md) — Active Record models, relations, lifecycle, and LazyLoadGuard.
- [Cycle ORM Persistence Guide](persistence-cycle-orm.md) — Clean Data Mapper persistence with Cycle ORM (`#[Entity]`, `EntityReader`).
- [Database Migrations Guide](persistence-migrations.md) — Schema DDL, ColumnBuilder, foreign keys, and migration CLI commands.
- [Testing Database Guide](testing-database.md) — Ephemeral in-memory SQLite, test fixtures, and transactional rollbacks.
- [Actions & Controllers Guide](http-actions-and-controllers.md) — Consuming repositories inside Use Cases and Presentation Actions.
- [Caching Guide](persistence-caching.md) — Query caching and cache invalidation strategies for repositories.
- [Events & Listeners Guide](core-events-and-listeners.md) — Domain events, the aggregate event-recording pattern, and the post-commit dispatch rule.
