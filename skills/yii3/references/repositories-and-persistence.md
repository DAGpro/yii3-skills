# Yii3 Repositories & Persistence Guide

> Practical patterns for database access, the Repository pattern, and transaction management across `yiisoft/db`, `yiisoft/active-record`, `yiisoft/yii-cycle`, and `yiisoft/data-db`.
>
> **Source of Truth & Verification Rule for AI Models:**
> In projects using this extension, always verify exact method signatures, constructor arguments, and options directly in `vendor/yiisoft/<package>/src/` for installed packages.
> When generating code, if an installed package's method signature or property is unfamiliar or in doubt, **read its source files in `vendor/yiisoft/<package>/src/`** rather than guessing or relying on Yii2 habits.
> Persistence details belong strictly to the Infrastructure Layer; Domain Entities and Application Use Cases must never execute raw database operations directly.

---

## Table of Contents
- [1. Clean Architecture Persistence Boundaries](#1-clean-architecture-persistence-boundaries)
- [2. Implementation Approaches](#2-implementation-approaches)
- [3. Transaction Management & Boundaries](#3-transaction-management--boundaries)
- [4. Paginated Queries & Data Readers](#4-paginated-queries--data-readers)
- [5. PHP 8 Named Arguments & Signatures Reference](#5-php-8-named-arguments--signatures-reference)
- [6. Anti-Pattern Matrix: Repositories & Persistence](#6-anti-pattern-matrix-repositories--persistence)

---

## 1. Clean Architecture Persistence Boundaries

In Yii3, business rules and domain logic are decoupled from persistence engines (SQL, Active Record, Cycle ORM, Mongo, or memory). Persistence details belong strictly in the **Infrastructure Layer**.

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
        ├── Db/
        │   └── DbUserRepository.php    # Implements interface via yiisoft/db Query Builder
        ├── ActiveRecord/
        │   ├── UserRecord.php          # ActiveRecord schema model
        │   └── ArUserRepository.php    # Implements interface via yiisoft/active-record
        └── Cycle/
            └── CycleUserRepository.php # Implements interface via yiisoft/yii-cycle
```

### 1.1. Domain Value Object (`src/Domain/Model/UserId.php`)
```php
declare(strict_types=1);

namespace App\Domain\Model;

use Stringable;

final readonly class UserId implements Stringable
{
    public function __construct(
        public string $value,
    ) {}

    public function __toString(): string
    {
        return $this->value;
    }
}
```

### 1.2. Pure Domain Entity (`src/Domain/Model/User.php`)
```php
declare(strict_types=1);

namespace App\Domain\Model;

use DateTimeImmutable;

final class User
{
    /**
     * @var list<object>
     */
    private array $recordedEvents = [];

    public function __construct(
        private UserId $id,
        private string $name,
        private string $email,
        private ?DateTimeImmutable $createdAt = null,
        private ?DateTimeImmutable $updatedAt = null,
    ) {}

    public function getId(): UserId
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getEmail(): string
    {
        return $this->email;
    }

    public function getCreatedAt(): ?DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): ?DateTimeImmutable
    {
        return $this->updatedAt;
    }

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

    public function recordEvent(object $event): void
    {
        $this->recordedEvents[] = $event;
    }

    /**
     * @return list<object>
     */
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

---

## 2. Implementation Approaches

Yii3 supports three primary persistence mechanisms:
1. **Plain Query Builder (`yiisoft/db`)** — Recommended for high-performance APIs, microservices, and fine-grained SQL optimization.
2. **Active Record (`yiisoft/active-record`)** — Recommended for rapid CRUD, admin panels, and active record workflows.
3. **Cycle ORM (`yiisoft/yii-cycle`)** — Recommended for complex DDD domains requiring Data Mapper separation and automated schema migrations.

---

### 2.1. Plain DB Query Builder (`yiisoft/db`)

High-performance, explicit SQL query building with automatic parameter binding.

#### Key Architectural Rules in `yiisoft/db`:
- **`Query::one()` returns `array|object|null`:** In Yii3, `Query::one()` returns `null` when no record matches (never `false` like in legacy Yii2).
- **`ConnectionInterface::createQuery()` or `new Query($db)`:** Query instances require `ConnectionInterface` passed to constructor or instantiated via `$db->createQuery()`.
- **Atomic Upsert:** Use `$command->upsert()` for atomic insert-or-update queries instead of checking `exists()` manually.
- **Strict Parameter Quoting:** Table names should use prefix syntax like `{{%user}}`.

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

        // Atomic upsert avoids race conditions
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
            ->delete(
                table: '{{%user}}',
                condition: ['id' => $user->getId()->value],
            )
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

#### Optional: Hydration via `yiisoft/hydrator`
When entities map 1:1 with database attributes or DTOs, `HydratorInterface::create()` instantiates the object through
its constructor and maps data keys to constructor parameter names. Already-constructed objects (e.g. `UserId`) are
passed through as-is when they match the declared parameter type:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\Db;

use App\Domain\Model\User;
use App\Domain\Model\UserId;
use App\Domain\Repository\UserRepositoryInterface;
use DateTimeImmutable;
use Yiisoft\Hydrator\HydratorInterface;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;

final readonly class HydratedDbUserRepository implements UserRepositoryInterface
{
    public function __construct(
        private ConnectionInterface $db,
        private HydratorInterface $hydrator,
    ) {}

    public function findById(UserId $id): ?User
    {
        /** @var array<string, mixed>|null $row */
        $row = (new Query($this->db))
            ->from('{{%user}}')
            ->where(['id' => $id->value])
            ->one();

        return $row !== null ? $this->hydrateRow($row) : null;
    }

    public function findByEmail(string $email): ?User
    {
        /** @var array<string, mixed>|null $row */
        $row = (new Query($this->db))
            ->from('{{%user}}')
            ->where(['email' => mb_strtolower($email)])
            ->one();

        return $row !== null ? $this->hydrateRow($row) : null;
    }

    public function save(User $user): void
    {
        // Persistence is identical to DbUserRepository::save() shown above.
    }

    public function delete(User $user): void
    {
        // Persistence is identical to DbUserRepository::delete() shown above.
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

### 2.2. Active Record (`yiisoft/active-record`)

In Yii3, `ActiveRecord` is significantly refactored compared to Yii2:
1. **No Database Injected in Constructor:** `ActiveRecord` defines **no constructor at all**. PHP silently discards extra arguments passed to a constructor-less class, so `new UserRecord($db)` does **not** fail — the connection argument is simply **ignored**, misleading you into believing a custom connection was applied. Connection resolution always goes through `ConnectionProvider` (see rule 2); to use a non-default connection, either register it with `Yiisoft\Db\Connection\ConnectionProvider::set($connection, $name)` or add `Yiisoft\ActiveRecord\Trait\CustomConnectionTrait` to the record and call `(new UserRecord())->withConnectionName($name)` before saving.
2. **Connection Resolution via `ConnectionProvider`:** `AbstractActiveRecord::db()` resolves the database connection via `Yiisoft\Db\Connection\ConnectionProvider::get()` (the name parameter defaults to `ConnectionProvider::DEFAULT`). If a custom connection is needed, override `public function db(): ConnectionInterface` or use `CustomConnectionTrait`.
3. **`ActiveQuery` Constructor takes only `$modelClass`:** `new ActiveQuery(UserRecord::class)` takes only the model class string or model instance. Do not pass `$db` as a second argument!
4. **`save()` returns `void`:** In Yii3, `$record->save()` has a `void` return type (not `bool`). It throws exceptions on SQL errors. There is no internal validation engine inside `ActiveRecord::save()`; validation is performed separately via `yiisoft/validator`.
5. **Typed Properties:** Declare public/protected typed properties on the record class for static analysis, PHP 8.2+ compatibility, and performance.
6. **`RepositoryTrait`:** Adding `use RepositoryTrait;` enables static finder methods: `UserRecord::find()`, `UserRecord::findOne()`, `UserRecord::findByPk()`, and `UserRecord::findAll()`.

#### Active Record Schema Class (`src/Infrastructure/Persistence/ActiveRecord/UserRecord.php`)
```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\ActiveRecord;

use Yiisoft\ActiveRecord\ActiveQueryInterface;
use Yiisoft\ActiveRecord\ActiveRecord;
use Yiisoft\ActiveRecord\Trait\LazyLoadGuardTrait;
use Yiisoft\ActiveRecord\Trait\RepositoryTrait;

/**
 * Schema record for table '{{%user}}'.
 */
final class UserRecord extends ActiveRecord
{
    use RepositoryTrait;
    use LazyLoadGuardTrait;

    public ?string $id = null;
    public string $name = '';
    public string $email = '';
    public ?string $created_at = null;
    public ?string $updated_at = null;

    public static function tableName(): string
    {
        return '{{%user}}';
    }

    /**
     * Declaring a 1:N relation with OrderRecord.
     */
    public function getOrders(): ActiveQueryInterface
    {
        return $this->hasMany(OrderRecord::class, ['user_id' => 'id']);
    }
}
```

#### Repository Implementation using Active Record (`src/Infrastructure/Persistence/ActiveRecord/ArUserRepository.php`)
```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\ActiveRecord;

use App\Domain\Model\User;
use App\Domain\Model\UserId;
use App\Domain\Repository\UserRepositoryInterface;
use DateTimeImmutable;
use Yiisoft\ActiveRecord\ActiveQuery;

final readonly class ArUserRepository implements UserRepositoryInterface
{
    public function findById(UserId $id): ?User
    {
        /** @var UserRecord|null $record */
        $record = (new ActiveQuery(UserRecord::class))
            ->where(['id' => $id->value])
            ->one();

        return $record !== null ? $this->toDomain($record) : null;
    }

    public function findByEmail(string $email): ?User
    {
        /** @var UserRecord|null $record */
        $record = UserRecord::find(['email' => mb_strtolower($email)])->one();

        return $record !== null ? $this->toDomain($record) : null;
    }

    public function save(User $user): void
    {
        /** @var UserRecord|null $record */
        $record = (new ActiveQuery(UserRecord::class))
            ->where(['id' => $user->getId()->value])
            ->one();

        $now = (new DateTimeImmutable())->format('Y-m-d H:i:s');

        if ($record === null) {
            $record = new UserRecord();
            $record->id = $user->getId()->value;
            $record->created_at = $user->getCreatedAt()?->format('Y-m-d H:i:s') ?? $now;
        }

        $record->name = $user->getName();
        $record->email = $user->getEmail();
        $record->updated_at = $now;

        // save() returns void in Yii3; throws exception on DB failure
        $record->save();
    }

    public function delete(User $user): void
    {
        /** @var UserRecord|null $record */
        $record = (new ActiveQuery(UserRecord::class))
            ->where(['id' => $user->getId()->value])
            ->one();

        $record?->delete();
    }

    private function toDomain(UserRecord $record): User
    {
        return new User(
            id: new UserId((string) $record->id),
            name: $record->name,
            email: $record->email,
            createdAt: $record->created_at !== null
                ? new DateTimeImmutable($record->created_at)
                : null,
            updatedAt: $record->updated_at !== null
                ? new DateTimeImmutable($record->updated_at)
                : null,
        );
    }
}
```

#### Eager Loading & N+1 Query Detection (`LazyLoadGuard`)
To eliminate N+1 queries when loading relational Active Record data:
- Always eager-load relations using `with()`:
  ```php
  $users = UserRecord::query()->with('orders')->all();
  ```
- In development/testing environments, configure `LazyLoadGuard` to detect or prohibit lazy loading:
  ```php
  use Yiisoft\ActiveRecord\LazyLoadGuard;
  use Yiisoft\ActiveRecord\LazyLoadGuardMode;

  // Strict mode throws LazyLoadException on detected N+1 lazy loads
  LazyLoadGuard::set(LazyLoadGuardMode::Strict);
  ```

> **Hidden traps:**
> - The guard only inspects records whose class uses `Yiisoft\ActiveRecord\Trait\LazyLoadGuardTrait` (see `UserRecord`
>   above). Without the trait, `LazyLoadGuard::set()` has no effect on that model — lazy loads are silently permitted.
> - The default mode is `LazyLoadGuardMode::Log`, which only writes a PSR-3 warning to the optional logger passed as
>   the second argument of `LazyLoadGuard::set()`.
> - `Strict` mode throws `LazyLoadException` only when **two or more records of the same result set** lazy-load the
>   same relation — that is the N+1 signature. A single record loading its relation lazily is not reported.

---

### 2.3. Cycle ORM (`yiisoft/yii-cycle`)

Cycle ORM decouples schema entities from persistence using the **Data Mapper** pattern. Domain entities can be mapped directly using PHP 8 attributes without framework inheritance. Attribute-based schema building is the default mode of `yiisoft/yii-cycle` (schema is built from attributes found in your project entities, configured via the `entity-paths` param and cached via schema providers).

> **External package notice:** the mapping attributes come from the `cycle/annotated` package (`Cycle\Annotated\Annotation\*`), and runtime classes (`Cycle\ORM\Select`, `Cycle\ORM\EntityManager`, repositories) come from `cycle/orm`. These are Cycle packages, **not** `yiisoft/*` packages — always verify their exact attribute arguments and method signatures in `vendor/cycle/annotated/src/` and `vendor/cycle/orm/src/` for the installed versions.

#### Cycle Entity (`src/Domain/Model/User.php`)
```php
declare(strict_types=1);

namespace App\Domain\Model;

use Cycle\Annotated\Annotation\Column;
use Cycle\Annotated\Annotation\Entity;
use DateTimeImmutable;

#[Entity(table: 'users')]
class User
{
    #[Column(type: 'string(36)', primary: true)]
    private string $id;

    #[Column(type: 'string(128)')]
    private string $name;

    #[Column(type: 'string(255)', unique: true)]
    private string $email;

    #[Column(type: 'datetime', nullable: true)]
    private ?DateTimeImmutable $createdAt;

    #[Column(type: 'datetime', nullable: true)]
    private ?DateTimeImmutable $updatedAt;

    public function __construct(string $id, string $name, string $email)
    {
        $this->id = $id;
        $this->name = $name;
        $this->email = mb_strtolower($email);
        $this->createdAt = new DateTimeImmutable();
        $this->updatedAt = new DateTimeImmutable();
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getEmail(): string
    {
        return $this->email;
    }

    public function getCreatedAt(): ?DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): ?DateTimeImmutable
    {
        return $this->updatedAt;
    }

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

#### Cycle Repository via `EntityManagerInterface` + `EntityReader` (`src/Infrastructure/Persistence/Cycle/CycleUserRepository.php`)
Reads go through `Yiisoft\Data\Cycle\Reader\EntityReader`, which wraps a `Cycle\ORM\Select` and integrates with the
`yiisoft/data` filter/sort ecosystem. Writes go through `Cycle\ORM\EntityManagerInterface`, followed by an explicit
`run()` call — `persist()` and `delete()` only stage the operation.

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\Cycle;

use App\Domain\Model\User;
use App\Domain\Model\UserId;
use App\Domain\Repository\UserRepositoryInterface;
use Cycle\ORM\EntityManagerInterface;
use Cycle\ORM\ORMInterface;
use Cycle\ORM\Select;
use Yiisoft\Data\Cycle\Reader\EntityReader;
use Yiisoft\Data\Reader\Filter\Equals;

final readonly class CycleUserRepository implements UserRepositoryInterface
{
    public function __construct(
        private ORMInterface $orm,
        private EntityManagerInterface $entityManager,
    ) {}

    public function findById(UserId $id): ?User
    {
        $select = new Select($this->orm, User::class);

        /** @var User|null $user */
        $user = (new EntityReader($select))
            ->withFilter(new Equals('id', $id->value))
            ->readOne();

        return $user;
    }

    public function findByEmail(string $email): ?User
    {
        $select = new Select($this->orm, User::class);

        /** @var User|null $user */
        $user = (new EntityReader($select))
            ->withFilter(new Equals('email', mb_strtolower($email)))
            ->readOne();

        return $user;
    }

    public function save(User $user): void
    {
        $this->entityManager->persist($user);
        $this->entityManager->run();
    }

    public function delete(User $user): void
    {
        $this->entityManager->delete($user);
        $this->entityManager->run();
    }
}
```

> **Note:** `new Select($orm, $role)` accepts the entity class name as the role. The default Cycle repository for an
> entity is also reachable via `$this->orm->getRepository(User::class)`; its query methods belong to the external
> `cycle/orm` package and must be verified in `vendor/cycle/orm/src/` before use.

---

## 3. Transaction Management & Boundaries

Transactions must be handled at the **Application/Use Case Layer**, not inside individual repository methods. This ensures atomic multi-repository mutations and prevents partial writes.

### 3.1. Idiomatic Closure Transaction (`ConnectionInterface::transaction()`)
`$db->transaction()` automatically commits when the closure successfully returns, and automatically rolls back if any `Throwable` is thrown.

> The domain collaborators used below (`CreateOrderCommand`, `Order`, `ProductRepositoryInterface`) are application
> contracts following the same pattern as `UserRepositoryInterface` in section 1.3 — the framework-level API being
> demonstrated is `ConnectionInterface::transaction(closure, isolationLevel)` itself.

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
        // 1. Execute DB changes inside the atomic transaction block
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

### 3.2. Manual Transaction Management (`beginTransaction()`)
For complex multi-stage pipelines where closure boundaries are inconvenient:

```php
declare(strict_types=1);

namespace App\Application\UseCase\Order;

use Throwable;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Transaction\TransactionInterface;

final readonly class ManualTransactionManager
{
    public function __construct(
        private ConnectionInterface $db,
    ) {}

    /**
     * @throws Throwable
     */
    public function runProcess(callable $operation): mixed
    {
        $transaction = $this->db->beginTransaction(
            isolationLevel: TransactionInterface::REPEATABLE_READ,
        );

        try {
            $result = $operation($this->db);
            $transaction->commit();
            return $result;
        } catch (Throwable $e) {
            $transaction->rollBack();
            throw $e;
        }
    }
}
```

### 3.3. Transaction Rules & Isolation Levels
1. **Isolation Level Constants:** Available on `Yiisoft\Db\Transaction\TransactionInterface`:
   - `TransactionInterface::READ_UNCOMMITTED`
   - `TransactionInterface::READ_COMMITTED`
   - `TransactionInterface::REPEATABLE_READ`
   - `TransactionInterface::SERIALIZABLE`
2. **Nested Transactions & Savepoints:** If a transaction is already active, nested calls to `beginTransaction()` or `$db->transaction()` automatically create database savepoints (if supported by DBMS, check `$db->isSavepointEnabled()`).
3. **No Side Effects in Transactions:** Never send emails, invoke third-party HTTP webhooks, or push jobs to external queues inside the `$db->transaction()` block. If the database rolls back, external side effects cannot be recalled.

---

## 4. Paginated Queries & Data Readers

In Yii3, data access for tables and grids is standardized using `DataReaderInterface` from `yiisoft/data`.

### 4.1. Relational DB Pagination (`yiisoft/data-db`)

> **Critical FQCN Notice:**
> The data reader for `yiisoft/db` is `Yiisoft\Data\Db\QueryDataReader` (package `yiisoft/data-db`).
> Do **NOT** use `Yiisoft\DataDb\DataReader\QueryDataReader` (hallucinated namespace).

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

### 4.2. Cycle ORM Pagination (`yiisoft/data-cycle`)
When using Cycle ORM, use `Yiisoft\Data\Cycle\Reader\EntityReader`:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\Cycle;

use App\Domain\Model\User;
use Cycle\ORM\ORMInterface;
use Cycle\ORM\Select;
use Yiisoft\Data\Cycle\Reader\EntityReader;
use Yiisoft\Data\Paginator\OffsetPaginator;
use Yiisoft\Data\Reader\Sort;

final readonly class CycleUserGridQuery
{
    public function __construct(
        private ORMInterface $orm,
    ) {}

    public function getPaginator(int $page = 1, int $pageSize = 20): OffsetPaginator
    {
        /** @var Select<User> $select */
        $select = new Select($this->orm, User::class);

        $dataReader = (new EntityReader($select))
            ->withSort(
                Sort::only(['id', 'name', 'createdAt'])
                    ->withOrderString('-createdAt')
            );

        return (new OffsetPaginator($dataReader))
            ->withPageSize($pageSize)
            ->withCurrentPage($page);
    }
}
```

---

## 5. PHP 8 Named Arguments & Signatures Reference

To eliminate Fatal Errors when invoking methods with PHP 8 named arguments, strictly follow the parameter names defined in `vendor/yiisoft/*/src/`:

```php
declare(strict_types=1);

use Yiisoft\ActiveRecord\ActiveQuery;
use Yiisoft\Data\Db\QueryDataReader;
use Yiisoft\Data\Paginator\OffsetPaginator;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;
use Yiisoft\Db\Transaction\TransactionInterface;

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
$command->insert(
    table: '{{%user}}',
    columns: ['id' => $id, 'name' => $name],
);

$command->update(
    table: '{{%user}}',
    columns: ['name' => $newName],
    condition: ['id' => $id],
    from: null,
    params: [],
);

$command->delete(
    table: '{{%user}}',
    condition: ['id' => $id],
    params: [],
);

$command->upsert(
    table: '{{%user}}',
    insertColumns: $insertData,
    updateColumns: $updateData, // true to update all columns, false to ignore, or array
);

$command->insertBatch(
    table: '{{%user}}',
    rows: [
        ['1', 'Alice', 'alice@example.com'],
        ['2', 'Bob', 'bob@example.com'],
    ],
    columns: ['id', 'name', 'email'],
);

// Yiisoft\Db\Query\Query
$query = (new Query($db))
    ->select(columns: ['id', 'name', 'email'], option: null)
    ->from(tables: '{{%user}}')
    ->where(condition: ['status' => 'active'], params: [])
    ->andWhere(condition: ['>', 'created_at', $timestamp], params: [])
    ->orderBy(columns: ['created_at' => SORT_DESC])
    ->limit(limit: 50)
    ->offset(offset: 0);

// Yiisoft\ActiveRecord\ActiveQuery
$activeQuery = new ActiveQuery(
    modelClass: UserRecord::class, // Accepts ONLY $modelClass (no $db argument!)
);

// Yiisoft\ActiveRecord\ActiveRecord
$record->save(
    properties: null, // null = all properties for new records, changed-only for existing ones
);

$record->hasOne(
    modelClass: ProfileRecord::class,
    link: ['user_id' => 'id'],
);

$record->hasMany(
    modelClass: OrderRecord::class,
    link: ['user_id' => 'id'],
);

// Yiisoft\Data\Db\QueryDataReader
$dataReader = new QueryDataReader(
    query: $query,
    sort: $sort,
    offset: 0,
    limit: 20,
);

// Yiisoft\Data\Paginator\OffsetPaginator
$paginator = (new OffsetPaginator(dataReader: $dataReader))
    ->withPageSize(pageSize: 25)
    ->withCurrentPage(page: 1);

// Yiisoft\Hydrator\HydratorInterface
$entity = $hydrator->create(
    class: User::class,
    data: $row,
);

$hydrator->hydrate(
    object: $existingUser,
    data: $row,
);
```

---

## 6. Anti-Pattern Matrix: Repositories & Persistence

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| ❌ **`new UserRecord($this->db)` or `parent::__construct($db)`** | `ActiveRecord` defines no constructor at all, so PHP silently **discards** the `$db` argument instead of failing — you believe a custom connection is wired in while every query still goes to the default `ConnectionProvider` connection. | ✅ Instantiate with `new UserRecord()`. Connections are resolved via `ConnectionProvider::get()`; register alternatives with `ConnectionProvider::set($connection, $name)` or use `CustomConnectionTrait` + `withConnectionName()`. |
| ❌ **`new ActiveQuery(UserRecord::class, $this->db)`** | `ActiveQuery::__construct()` accepts only 1 parameter (`$modelClass`). Passing `$db` as a second argument fails. | ✅ Call `new ActiveQuery(UserRecord::class)` or `UserRecord::query()`. It gets `$db` internally from the model's `db()` method. |
| ❌ **Calling `$command->batchInsert(...)`** | Phantom method left over from Yii2. `Yiisoft\Db\Command\CommandInterface` has no `batchInsert()` — the call is a fatal `Undefined method` error. | ✅ Use `$command->insertBatch(table: ..., rows: ..., columns: ...)` followed by `->execute()`. |
| ❌ **`if (!$record->save())` expecting boolean** | In Yii3, `ActiveRecord::save()` returns `void`, not `bool`. It throws exceptions on SQL errors. | ✅ Call `$record->save()`. Catch database exceptions if handling errors, and validate beforehand using `yiisoft/validator`. |
| ❌ **Declaring `rules()` in `ActiveRecord`** | Legacy Yii2 feature. Yii3 `ActiveRecord` does not contain a validation engine. | ✅ Decouple validation into Form Models / DTOs using `yiisoft/validator` with PHP 8 attributes. |
| ❌ **`if ($row !== false)` checking `Query::one()`** | Legacy Yii2 habit. In Yii3, `Query::one()` returns `null` when no record is found (never `false`). | ✅ Use strict null check: `if ($row !== null)` or `if ($row === null) return null;`. |
| ❌ **`use Yiisoft\DataDb\DataReader\QueryDataReader;`** | Hallucinated namespace. The class does not exist and throws a fatal ClassNotFound error. | ✅ Import `Yiisoft\Data\Db\QueryDataReader` from `yiisoft/data-db`. |
| ❌ **Dispatching events/queues inside `$db->transaction()`** | If the transaction rolls back due to a later error, external side effects (emails, messages) cannot be revoked. | ✅ Collect domain events inside the entity/aggregate (`recordEvent()`) and dispatch them strictly post-commit. |
| ❌ **Executing DB / ORM queries inside HTTP Actions** | Breaks the Presentation/Infrastructure boundary, making actions un-testable and tightly coupled to the DB. | ✅ Inject Domain Repositories or Application Use Cases into Action constructors. |
| ❌ **Uncontrolled AR relation lazy-loading in loops** | Triggers silent N+1 query storms that degrade API response times and database throughput. | ✅ Use eager loading: `->with('orders')`, add `LazyLoadGuardTrait` to the record class, and enforce `LazyLoadGuard::set(LazyLoadGuardMode::Strict)` in dev/tests — without the trait the guard never inspects the model. |
| ❌ **Relying on dynamic untyped properties in AR** | Deprecated in PHP 8.2+; prevents static analysis tools (Psalm/PHPStan) from catching errors. | ✅ Declare typed public/protected properties on the `ActiveRecord` class (e.g. `public string $name = '';`). |
| ❌ **Raw SQL concatenation (`WHERE id = ' . $id`)** | Severe SQL injection vulnerability. | ✅ Always use parameter binding (`[':id' => $id]`) or structured Query Builder arrays (`['id' => $id]`). |
| ❌ **Mixing Active Record and Cycle in same domain model** | Inconsistent entity state, dual unit-of-work conflicts, cache bugs, and architectural confusion. | ✅ Choose **one** persistence paradigm per bounded context (Clean DDD DataMapper via Cycle ORM or CRUD via AR). |
| ❌ **Multi-table mutations without a transaction** | A failure in the second query leaves the database in an inconsistent, orphaned, or corrupted state. | ✅ Always wrap multi-repository updates in `$db->transaction(...)`. |
| ❌ **Hardcoding table names as plain strings `'user'`** | Prevents automatic prefix resolution (`tbl_user`) and schema quoting. | ✅ Always use table prefix brackets: `'{{%user}}'`. |
| ❌ **Guessing external Cycle ORM APIs (`fetchOne()`, `findByPK()`, ...) from memory** | `cycle/orm` is an external package (not `yiisoft/*`); its API surface drifts between 2.x versions, and unverifiable calls end up as fatal errors or silent misuse. | ✅ Verify every `Cycle\ORM\*` signature in `vendor/cycle/orm/src/` and `vendor/cycle/annotated/src/` before writing code; prefer the yiisoft bridges (`Yiisoft\Data\Cycle\Reader\EntityReader`, `EntityManagerInterface`) documented here. |
