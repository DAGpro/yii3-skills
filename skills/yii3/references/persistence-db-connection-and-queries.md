# Yii3 DB Persistence: Connection, Query Builder & Transactions

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Part of the [Database Persistence Guide](persistence-db.md) split — the anti-pattern matrix and related guides live there.

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
> The example intentionally omits domain-event recording (`recordEvent()` / `releaseEvents()` members on the aggregate). That pattern — including the mandatory post-commit dispatch rule — is owned by the [Events & Listeners Guide, §5](core-events-design.md#5-mandatory-post-commit-event-dispatching-rule).

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

`Yiisoft\Db\Query\Query` builds cross-database SQL queries using fluent, chainable methods. `Query` is **mutable**: condition/order/limit methods mutate the instance and return it (`$this`); only the `with*()` methods (`withQuery()`, `withQueries()`, `withTypecasting()`) return clones.

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
$query = (new Query($db))
    ->from('{{%user}}')
    ->where([
        'status' => 'active',
        'role' => ['admin', 'manager'], // Compiles to: role IN ('admin', 'manager')
    ]);

// 2. Operator conditions: between, in, like, exists
// Note: `where()` throws a LogicException if a condition was already set on the instance —
// extend with andWhere()/orWhere(), or reset via setWhere().
$query->andWhere(['between', 'age', 18, 65])
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
// Streams records one by one through a forward-only stream of rows with flat O(1) memory consumption.
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
> **Strict post-commit dispatch rule:** never send emails, trigger webhooks, or push jobs to external queues inside the transaction closure — if the transaction rolls back, external side effects cannot be recalled. Collect domain events on the aggregate (`recordEvent()`) and dispatch them strictly after `$db->transaction()` returns. The full aggregate event-recording pattern and the `transaction()` commit semantics that enforce it are owned by the [Events & Listeners Guide, §5](core-events-design.md#5-mandatory-post-commit-event-dispatching-rule).

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
3. **Strict Post-Commit Rule:** Never dispatch external side effects (email, SMS, webhooks, queue jobs) inside `$db->transaction()` — collect domain events on aggregates and dispatch them strictly post-commit. Full pattern: [Events & Listeners Guide, §5](core-events-design.md#5-mandatory-post-commit-event-dispatching-rule).

### 4.4. Deadlock Retries & Serialization Failures (`SerializationFailureException`)

Under high concurrency, operations modifying overlapping rows may encounter database deadlocks or serialization failures (SQLSTATE code `'40001'`). In `yiisoft/db`, these are converted to `Yiisoft\Db\Exception\SerializationFailureException`.

#### 1. Command-Level Retry Handler (`setRetryHandler`)

`CommandInterface::setRetryHandler(?Closure $handler)` allows registering an automated retry callback. The documented handler contract is `function (Yiisoft\Db\Exception\Exception $e, int $attempt): bool`: the closure receives the `Yiisoft\Db\Exception\Exception` converted from the thrown database exception (not the raw driver exception or an arbitrary `Throwable`) and the current execution attempt, starting from `0`. Returning `true` retries the statement; returning `false` re-throws the exception.

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
