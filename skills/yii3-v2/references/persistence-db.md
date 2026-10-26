# Yii3 Persistence: Database, Query Builder & Transactions

> Practical guide for low-level database operations, explicit Query Builder queries, atomic transactions, and paginated data readers using `yiisoft/db` and `yiisoft/data-db`.
>
> Persistence details belong strictly to the Infrastructure Layer; Domain Entities and Application Use Cases must never execute raw database operations directly.

---

## Table of Contents
- [1. Clean Architecture Persistence with `yiisoft/db`](#1-clean-architecture-persistence-with-yiisoftdb)
  - [1.1. Domain Value Object (`UserId.php`)](#11-domain-value-object-useridphp)
  - [1.2. Pure Domain Entity (`User.php`)](#12-pure-domain-entity-userphp)
  - [1.3. Domain Repository Contract (`UserRepositoryInterface.php`)](#13-domain-repository-contract-userrepositoryinterfacephp)
  - [1.4. Low-Level Database Repository (`DbUserRepository.php`)](#14-low-level-database-repository-dbuserrepositoryphp)
  - [1.5. Optional Hydration via `yiisoft/hydrator`](#15-optional-hydration-via-yiisofthydrator)
- [2. Connection, Commands & Mutations (`CommandInterface`)](#2-connection-commands--mutations-commandinterface)
  - [2.1. Parameterized Queries & Table Prefix Syntax](#21-parameterized-queries--table-prefix-syntax)
  - [2.2. Atomic Upsert & Batch Insert Operations](#22-atomic-upsert--batch-insert-operations)
- [3. Query Builder (`Yiisoft\Db\Query\Query`)](#3-query-builder-yiisoftdbqueryquery)
  - [3.1. Building Select Queries & Conditions](#31-building-select-queries--conditions)
  - [3.2. Fetching Results & Strict Null Return Semantics](#32-fetching-results--strict-null-return-semantics)
- [4. Transaction Management & Boundaries](#4-transaction-management--boundaries)
  - [4.1. Idiomatic Closure Transactions (`transaction()`)](#41-idiomatic-closure-transactions-transaction)
  - [4.2. Manual Transactions & Savepoints](#42-manual-transactions--savepoints)
  - [4.3. Isolation Levels & Post-Commit Event Rule](#43-isolation-levels--post-commit-event-rule)
- [5. Paginated Queries & Data Readers (`yiisoft/data-db`)](#5-paginated-queries--data-readers-yiisoftdata-db)
- [6. PHP 8 Named Arguments & Signatures Reference](#6-php-8-named-arguments--signatures-reference)
- [7. Anti-Pattern Matrix: Database & Query Builder](#7-anti-pattern-matrix-database--query-builder)
- [8. Related Topic Guides](#8-related-topic-guides)

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
    /** @var list<object> */
    private array $recordedEvents = [];

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

    public function recordEvent(object $event): void { $this->recordedEvents[] = $event; }

    /** @return list<object> */
    public function releaseEvents(): array
    {
        $events = $this->recordedEvents;
        $this->recordedEvents = [];
        return $events;
    }
}
```

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

### 1.5. Optional Hydration via `yiisoft/hydrator`

When entities map 1:1 with database attributes, `HydratorInterface::create()` instantiates the object through its constructor and maps data keys to parameter names. Value objects matching parameter types are passed through:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\Db;

use App\Domain\Model\User;
use App\Domain\Model\UserId;
use App\Domain\Repository\UserRepositoryInterface;
use DateTimeImmutable;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;
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
        // Persistence uses db->createCommand()->upsert() identical to DbUserRepository
    }

    public function delete(User $user): void
    {
        // Persistence uses db->createCommand()->delete() identical to DbUserRepository
    }

    /**
     * @param array<string, mixed> $row
     */
    private function hydrateRow(array $row): User
    {
        return $this->hydrator->create(User::class, [
            'id' => new UserId((string) $row['id']),
            'name' => (string) $row['name'],
            'email' => (string) $row['email'],
            'createdAt' => isset($row['created_at']) && is_string($row['created_at'])
                ? new DateTimeImmutable($row['created_at'])
                : null,
            'updatedAt' => isset($row['updated_at']) && is_string($row['updated_at'])
                ? new DateTimeImmutable($row['updated_at'])
                : null,
        ]);
    }
}
```

---

## 2. Connection, Commands & Mutations (`CommandInterface`)

### 2.1. Parameterized Queries & Table Prefix Syntax

In `yiisoft/db`, SQL statements are prepared and executed via `CommandInterface`. Always use prefix brackets `{{%table}}` to allow automatic table prefix substitution and dialect-specific identifier quoting:

```php
// Creating parameterized commands
$command = $db->createCommand(
    sql: 'SELECT * FROM {{%user}} WHERE status = :status AND created_at > :created',
    params: [
        ':status' => 'active',
        ':created' => '2026-01-01 00:00:00',
    ],
);

// Executing queries
$rows = $command->queryAll();     // Returns list of assoc arrays
$row = $command->queryOne();       // Returns array|null
$count = $command->queryScalar();  // Returns scalar|null
```

### 2.2. Atomic Upsert & Batch Insert Operations

Always use native `CommandInterface` mutation helpers instead of manual SQL strings:

```php
// 1. Single row insert
$db->createCommand()->insert(
    table: '{{%user}}',
    columns: ['id' => $id, 'name' => 'Alice', 'email' => 'alice@example.com'],
)->execute();

// 2. Atomic Upsert (replaces legacy manual exists + insert/update)
$db->createCommand()->upsert(
    table: '{{%user}}',
    insertColumns: ['id' => $id, 'name' => 'Alice', 'email' => 'alice@example.com', 'updated_at' => $now],
    updateColumns: ['name' => 'Alice', 'updated_at' => $now],
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
$db->createCommand()->update(table: '{{%user}}', columns: ['status' => 'inactive'], condition: ['id' => $id])->execute();
$db->createCommand()->delete(table: '{{%user}}', condition: ['status' => 'deleted'])->execute();
```

---

## 3. Query Builder (`Yiisoft\Db\Query\Query`)

### 3.1. Building Select Queries & Conditions

`Yiisoft\Db\Query\Query` builds cross-database SQL queries using fluent methods:

```php
use Yiisoft\Db\Query\Query;

$query = (new Query($db))
    ->select(['id', 'name', 'email'])
    ->from('{{%user}}')
    ->where(['status' => 'active'])
    ->andWhere(['>', 'login_count', 5])
    ->orWhere(['role' => 'admin'])
    ->orderBy(['created_at' => SORT_DESC])
    ->limit(50)
    ->offset(0);
```

### 3.2. Fetching Results & Strict Null Return Semantics

> [!IMPORTANT]
> **`Query::one()` returns `array|object|null`:**
> In Yii3, `Query::one()` returns `null` when no matching record is found. It **never returns `false`** like legacy Yii2. Checking `if ($row !== false)` or `if ($row == false)` is a bug. Always use `if ($row !== null)`.

```php
// Fetch one record (array|null)
$user = $query->one();
if ($user !== null) {
    echo $user['email'];
}

// Fetch all matching records (array<array-key, array>)
$allUsers = $query->all();

// Fetch a single scalar column value (scalar|null)
$totalCount = (new Query($db))->from('{{%user}}')->where(['status' => 'active'])->count();

// Fetch flat list of single column values (array)
$emails = (new Query($db))->select('email')->from('{{%user}}')->column();

// Check existence (bool)
$exists = (new Query($db))->from('{{%user}}')->where(['email' => $email])->exists();
```

---

## 4. Transaction Management & Boundaries

Transactions must be handled at the **Application/Use Case Layer**, not inside individual repository methods. This ensures atomic multi-repository mutations and prevents partial writes.

### 4.1. Idiomatic Closure Transactions (`transaction()`)

`$db->transaction()` automatically commits when the closure successfully returns, and automatically rolls back if any `Throwable` is thrown:

```php
declare(strict_types=1);

namespace App\Application\UseCase\Order;

use App\Domain\Model\Order;
use App\Domain\Repository\OrderRepositoryInterface;
use App\Domain\Repository\ProductRepositoryInterface;
use Psr\EventDispatcher\EventDispatcherInterface;
use Throwable;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Transaction\TransactionInterface;

final readonly class CreateOrderUseCase
{
    public function __construct(
        private ConnectionInterface $db,
        private OrderRepositoryInterface $orders,
        private ProductRepositoryInterface $products,
        private EventDispatcherInterface $eventDispatcher,
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

        // 2. CRITICAL: Dispatch external side effects strictly AFTER successful commit!
        foreach ($order->releaseEvents() as $event) {
            $this->eventDispatcher->dispatch($event);
        }

        return $order;
    }
}
```

### 4.2. Manual Transactions & Savepoints

For complex multi-stage pipelines where closure boundaries are inconvenient:

```php
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
2. **Nested Transactions & Savepoints:** If a transaction is already active, nested calls to `beginTransaction()` or `$db->transaction()` automatically create database savepoints when supported by the underlying driver (`$db->isSavepointEnabled()`).
3. **Strict Post-Commit Rule:** Never send emails, trigger webhooks, or push jobs to external queues inside `$db->transaction()`. If the database rolls back, external side effects cannot be recalled. Always collect domain events on aggregates and dispatch them strictly post-commit.

---

## 5. Paginated Queries & Data Readers (`yiisoft/data-db`)

> [!IMPORTANT]
> **Critical FQCN Notice:**
> The data reader for `yiisoft/db` is `Yiisoft\Data\Db\QueryDataReader` (package `yiisoft/data-db`).
> Do **NOT** use `Yiisoft\DataDb\DataReader\QueryDataReader` (hallucinated namespace).

`QueryDataReader` integrates `Yiisoft\Db\Query\Query` with `yiisoft/data` sorting and `OffsetPaginator`:

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

    public function getPaginator(int $page = 1, int $pageSize = 20, ?string $search = null): OffsetPaginator
    {
        $query = (new Query($this->db))
            ->select(['id', 'name', 'email', 'created_at'])
            ->from('{{%user}}');

        if ($search !== null && $search !== '') {
            $query->andWhere([
                'or',
                ['like', 'name', $search],
                ['like', 'email', $search],
            ]);
        }

        // 1. Create QueryDataReader with logical sort mapping
        $dataReader = (new QueryDataReader($query))
            ->withSort(
                Sort::only(['id', 'name', 'created_at'])
                    ->withOrderString('-created_at')
            );

        // 2. Wrap in OffsetPaginator for HTTP grid/API pagination
        return (new OffsetPaginator($dataReader))
            ->withPageSize($pageSize)
            ->withCurrentPage($page);
    }
}
```

---

## 6. PHP 8 Named Arguments & Signatures Reference

```php
declare(strict_types=1);

use Yiisoft\Data\Db\QueryDataReader;
use Yiisoft\Data\Paginator\OffsetPaginator;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;
use Yiisoft\Db\Transaction\TransactionInterface;
use Yiisoft\Hydrator\HydratorInterface;

// Yiisoft\Db\Connection\ConnectionInterface
$db->createCommand(
    sql: 'SELECT * FROM {{%user}} WHERE id = :id',
    params: [':id' => $id],
);

$db->transaction(
    closure: function (ConnectionInterface $db): mixed {
        return $db->createCommand(sql: 'SELECT 1')->queryOne();
    },
    isolationLevel: TransactionInterface::READ_COMMITTED,
);

$db->beginTransaction(
    isolationLevel: TransactionInterface::REPEATABLE_READ,
);

// Yiisoft\Db\Command\CommandInterface
$command->insert(table: '{{%user}}', columns: ['id' => $id, 'name' => $name]);
$command->update(table: '{{%user}}', columns: ['name' => $newName], condition: ['id' => $id]);
$command->delete(table: '{{%user}}', condition: ['id' => $id]);
$command->upsert(table: '{{%user}}', insertColumns: $insertData, updateColumns: $updateData);
$command->insertBatch(table: '{{%user}}', rows: [['1', 'Alice', 'alice@test.com']], columns: ['id', 'name', 'email']);

// Yiisoft\Db\Query\Query
$query = (new Query($db))
    ->select(columns: ['id', 'name', 'email'])
    ->from(tables: '{{%user}}')
    ->where(condition: ['status' => 'active'])
    ->andWhere(condition: ['>', 'created_at', $timestamp])
    ->orderBy(columns: ['created_at' => SORT_DESC])
    ->limit(limit: 50)
    ->offset(offset: 0);

// Yiisoft\Data\Db\QueryDataReader & OffsetPaginator
$dataReader = new QueryDataReader(query: $query, sort: $sort);
$paginator = (new OffsetPaginator(dataReader: $dataReader))
    ->withPageSize(pageSize: 25)
    ->withCurrentPage(page: 1);

// Yiisoft\Hydrator\HydratorInterface
$entity = $hydrator->create(class: User::class, data: $row);
```

---

## 7. Anti-Pattern Matrix: Database & Query Builder

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| ❌ **Global state: `Yii::$app->db`** | Yii3 has no global state or `Yii::$app`. Throws `Error: Class "Yii" not found`. | Inject `Yiisoft\Db\Connection\ConnectionInterface` via constructor. |
| ❌ **Calling `$command->batchInsert(...)`** | Legacy Yii2 method name. `CommandInterface` has no `batchInsert()` — fatal `Undefined method` error. | Use `$command->insertBatch(table: ..., rows: ..., columns: ...)` followed by `->execute()`. |
| ❌ **`if ($row !== false)` checking `Query::one()`** | Legacy Yii2 habit. In Yii3, `Query::one()` returns `null` when no record matches (never `false`). | Use strict null check: `if ($row !== null)` or `if ($row === null) return null;`. |
| ❌ **`use Yiisoft\DataDb\DataReader\QueryDataReader;`** | Hallucinated namespace. Class does not exist; throws fatal ClassNotFound error. | Import `Yiisoft\Data\Db\QueryDataReader` from `yiisoft/data-db`. |
| ❌ **Dispatching events/queues inside `$db->transaction()`** | If transaction rolls back, side effects (emails, messages) cannot be revoked. | Collect domain events on aggregate (`recordEvent()`) and dispatch strictly post-commit. |
| ❌ **Executing DB queries inside HTTP Actions** | Violates architecture boundaries, making actions un-testable and tightly coupled to SQL. | Inject Domain Repositories or Application Use Cases into Action constructors. |
| ❌ **Raw SQL concatenation (`WHERE id = ' . $id`)** | Severe SQL injection vulnerability. | Always use parameter binding (`[':id' => $id]`) or Query Builder condition arrays (`['id' => $id]`). |
| ❌ **Hardcoding table names as plain strings `'user'`** | Prevents automatic table prefixing (`tbl_user`) and schema quoting. | Always use table prefix brackets: `'{{%user}}'`. |
| ❌ **Multi-table mutations without a transaction** | Partial failure leaves the database in an inconsistent or orphaned state. | Always wrap multi-repository updates in `$db->transaction(...)`. |

---

## 8. Related Topic Guides

- [Active Record Persistence Guide](persistence-active-record.md) — Active Record models, relations, lifecycle, and LazyLoadGuard.
- [Cycle ORM Persistence Guide](persistence-cycle-orm.md) — Clean Data Mapper persistence with Cycle ORM (`#[Entity]`, `EntityReader`).
- [Database Migrations Guide](migrations.md) — Schema DDL, ColumnBuilder, foreign keys, and migration CLI commands.
- [Testing Database Guide](testing-database.md) — Ephemeral in-memory SQLite, test fixtures, and transactional rollbacks.
- [Actions & Controllers Guide](actions-and-controllers.md) — Consuming repositories inside Use Cases and Presentation Actions.
- [Caching Guide](caching.md) — Query caching and cache invalidation strategies for repositories.
