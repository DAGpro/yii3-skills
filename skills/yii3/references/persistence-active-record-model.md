# Yii3 Persistence: Active Record Models & Lifecycle

> **Grounding:** APIs in `vendor/yiisoft/<pkg>/src/`, patterns in this guide, conventions in architecture artifact (SKILL.md Core rule 2).

> Clean Architecture boundaries, repository implementation, domain entity reconstitution with `yiisoft/hydrator`, model definitions, typed properties, lifecycle events, mutations, and optimistic locking in Yii3 Active Record.

## Table of Contents

- [1. Clean Architecture Persistence with Active Record](#1-clean-architecture-persistence-with-active-record)
  - [1.1. Architecture Placement & Boundary Separation](#11-architecture-placement--boundary-separation)
  - [1.2. Active Record Repository Implementation (`ArUserRepository.php`)](#12-active-record-repository-implementation-aruserrepositoryphp)
  - [1.3. Clean Domain Entity Reconstitution with `yiisoft/hydrator`](#13-clean-domain-entity-reconstitution-with-yiisofthydrator)
- [2. Active Record Model Definition](#2-active-record-model-definition)
  - [2.1. The Constructor-Less Rule & Connection Resolution](#21-the-constructor-less-rule--connection-resolution)
  - [2.2. Table Name Method Contract (Non-Static Rule) & Typed Properties](#22-table-name-method-contract-non-static-rule--typed-properties)
  - [2.3. Static Finder Methods via `RepositoryTrait`](#23-static-finder-methods-via-repositorytrait)
  - [2.4. Custom Connection Routing via `CustomConnectionTrait`](#24-custom-connection-routing-via-customconnectiontrait)
- [4. Lifecycle, Persistence, Mutations & Concurrency](#4-lifecycle-persistence-mutations--concurrency)
  - [4.1. Mutation Return Types & Exception Handling](#41-mutation-return-types--exception-handling)
  - [4.2. State Inspection & Change Tracking Methods](#42-state-inspection--change-tracking-methods)
  - [4.3. Absence of Validation Engine (Decoupling `rules()`)](#43-absence-of-validation-engine-decoupling-rules)
  - [4.4. Event Lifecycle Handlers (`EventsTrait`, Timestamps & Soft Delete)](#44-event-lifecycle-handlers-eventstrait-timestamps--soft-delete)
  - [4.5. Optimistic Concurrency Control (`OptimisticLockInterface`)](#45-optimistic-concurrency-control-optimisticlockinterface)
  - [4.6. Explicit Transaction Demarcation](#46-explicit-transaction-demarcation)

## 1. Clean Architecture Persistence with Active Record

### 1.1. Architecture Placement & Boundary Separation

Match Active Record placement to the project's **Architecture Pattern** (`core-architecture-alignment.md` §1–§2): continue the existing `src/` style on feature/patch tasks, and never inject or query Active Record models inside HTTP Presentation Actions or View templates (`core-architecture-alignment.md` §3.2).

| Placement Option | Active Pattern(s) | Structure & Flow | Trade-offs |
|---|---|---|---|
| **Option A — Schema Adapter + POPO Entity** | **Explicit Architecture** (`explicit*`) | `UserRecord extends ActiveRecord` in `Infrastructure/Persistence/ActiveRecord/` + `ArUserRepository implements UserRepositoryInterface` + `Hydrator` reconstituting pure POPO `User`. | Pure vendor-free Domain with repository ports; higher mapping boilerplate (§1.2–§1.3). |
| **Option B — Rich Active Record Model** | **Structured Modules** (`structured*`) & **Layered** (`layers`) | `User extends ActiveRecord` lives as a rich Model (optionally with `RepositoryTrait` finders or a concrete repository for complex queries), consumed directly by Application Services. | Zero duplicate POPO mapping; binds Domain model directly to `yiisoft/active-record`. |

**Option A Reference Layout (Explicit Architecture):**

```text
src/
├── Domain/
│   ├── Model/
│   │   ├── User.php                    # Pure Domain Entity (immutable, business logic)
│   │   └── UserId.php                  # Domain Value Object
│   └── Repository/
│       └── UserRepositoryInterface.php # Pure Domain repository contract
└── Infrastructure/
    └── Persistence/
        └── ActiveRecord/
            ├── UserRecord.php          # Schema model mapped to {{%user}}
            └── ArUserRepository.php    # Infrastructure adapter implementing UserRepositoryInterface
```

### 1.2. Active Record Repository Implementation (`ArUserRepository.php`)

The Active Record repository implements the domain repository contract by translating between domain calls and Active Record persistence:

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
        $record = UserRecord::findOne(['email' => mb_strtolower($email)]);

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

        // save() returns void in Yii3; throws Throwable on database errors
        $record->save();
    }

    public function delete(User $user): void
    {
        /** @var UserRecord|null $record */
        $record = (new ActiveQuery(UserRecord::class))
            ->where(['id' => $user->getId()->value])
            ->one();

        // delete() returns int (number of deleted rows)
        $record?->delete();
    }

    private function toDomain(UserRecord $record): User
    {
        return new User(
            id: new UserId((string) $record->id),
            name: $record->name,
            email: $record->email,
            createdAt: $record->created_at !== null ? new DateTimeImmutable($record->created_at) : null,
            updatedAt: $record->updated_at !== null ? new DateTimeImmutable($record->updated_at) : null,
        );
    }
}
```

### 1.3. Clean Domain Entity Reconstitution with `yiisoft/hydrator`

To eliminate manual getter-to-constructor boilerplate in `toDomain()`, integrate `Yiisoft\Hydrator\HydratorInterface`. The Active Record model exports its current column values via `$record->propertyValues()`, and the hydrator populates the immutable domain entity:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\ActiveRecord;

use App\Domain\Model\User;
use App\Domain\Model\UserId;
use App\Domain\Repository\UserRepositoryInterface;
use Yiisoft\ActiveRecord\ActiveQuery;
use Yiisoft\Hydrator\HydratorInterface;

final readonly class ArUserRepository implements UserRepositoryInterface
{
    public function __construct(
        private HydratorInterface $hydrator,
    ) {}

    public function findById(UserId $id): ?User
    {
        /** @var UserRecord|null $record */
        $record = (new ActiveQuery(UserRecord::class))
            ->where(['id' => $id->value])
            ->one();

        if ($record === null) {
            return null;
        }

        // propertyValues() returns raw scalars; HydratorTypeCaster casts arrays to
        // objects only — pre-instantiate the Value Object for object-typed properties
        // (see Database Persistence Guide §1.5).
        $data = $record->propertyValues();
        $data['id'] = new UserId((string) $data['id']);

        // Hydrates constructor arguments and typed properties directly
        return $this->hydrator->create(User::class, $data);
    }

    public function save(User $user): void
    {
        /** @var UserRecord|null $record */
        $record = (new ActiveQuery(UserRecord::class))
            ->where(['id' => $user->getId()->value])
            ->one() ?? new UserRecord();

        $record->id = $user->getId()->value;
        $record->name = $user->getName();
        $record->email = $user->getEmail();
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
}
```

When designing Domain Entities for `HydratorInterface::create()`, use parameter attributes to automate conversion:

```php
declare(strict_types=1);

namespace App\Domain\Model;

use DateTimeImmutable;
use Yiisoft\Hydrator\Attribute\Parameter\Data;
use Yiisoft\Hydrator\Attribute\Parameter\ToDateTime;

final readonly class User
{
    public function __construct(
        public UserId $id,
        public string $name,
        public string $email,
        #[ToDateTime(format: 'Y-m-d H:i:s')]
        #[Data('created_at')]
        public ?DateTimeImmutable $createdAt = null,
        #[ToDateTime(format: 'Y-m-d H:i:s')]
        #[Data('updated_at')]
        public ?DateTimeImmutable $updatedAt = null,
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
}
```

---

## 2. Active Record Model Definition

### 2.1. The Constructor-Less Rule & Connection Resolution

> [!CAUTION]
> **No Database Injected in Constructor:**
> `ActiveRecord` defines **no constructor at all**. In PHP, passing arguments to a class without a constructor succeeds silently — PHP simply **discards** extra arguments.
> Calling `new UserRecord($db)` succeeds silently without error, but `$db` is completely **ignored**. All queries continue executing against the default connection provider!

Connection resolution delegates to the static registry `ConnectionProvider`:
- `AbstractActiveRecord::db()` calls `Yiisoft\Db\Connection\ConnectionProvider::get()` with no argument — the default connection name (`ConnectionProvider::DEFAULT`, i.e. `'default'`) is the method's parameter default.
- If a custom connection is needed (e.g. read replica or sharded database), register it via `ConnectionProvider::set($connection, 'my-connection')` or use `CustomConnectionTrait`.

### 2.2. Table Name Method Contract (Non-Static Rule) & Typed Properties

> [!CRITICAL]
> **`tableName()` is an Instance Method, NOT Static:**
> In `ActiveRecordInterface::tableName(): string` and `AbstractActiveRecord::tableName(): string`, the method is non-static.
> Declaring `public static function tableName(): string` triggers a fatal compile-time PHP error:
> `Fatal error: Cannot make non static method Yiisoft\ActiveRecord\ActiveRecordInterface::tableName() static in class UserRecord`.
> Always declare `public function tableName(): string`.

Declare typed public properties for optimal runtime performance, static analysis (`Psalm`/`PHPStan`), and PHP 8.2+ dynamic property deprecation avoidance. Return table names wrapped in prefix brackets `{{%table}}`:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\ActiveRecord;

use Yiisoft\ActiveRecord\ActiveQueryInterface;
use Yiisoft\ActiveRecord\ActiveRecord;
use Yiisoft\ActiveRecord\Trait\EventsTrait;
use Yiisoft\ActiveRecord\Trait\LazyLoadGuardTrait;
use Yiisoft\ActiveRecord\Trait\RepositoryTrait;

/**
 * Schema record for table '{{%user}}'.
 */
final class UserRecord extends ActiveRecord
{
    use RepositoryTrait;
    use LazyLoadGuardTrait;
    use EventsTrait;

    public ?string $id = null;
    public string $name = '';
    public string $email = '';
    public ?string $created_at = null;
    public ?string $updated_at = null;

    /**
     * Instance method defined in ActiveRecordInterface. Do NOT declare static!
     */
    public function tableName(): string
    {
        return '{{%user}}';
    }
}
```

### 2.3. Static Finder Methods via `RepositoryTrait`

Including `use Yiisoft\ActiveRecord\Trait\RepositoryTrait;` provides static finder helpers on the model:

```php
declare(strict_types=1);

use App\Infrastructure\Persistence\ActiveRecord\UserRecord;

// 1. Safe Primary Key lookup (single or composite PK)
$user = UserRecord::findByPk('uuid-123');

// 2. Safe Primary Key lookup throwing Yiisoft\ActiveRecord\NotFoundException if missing
$user = UserRecord::findByPkOrFail('uuid-123');

// 3. Find one record by associative column condition
$user = UserRecord::findOne(['email' => 'alice@example.com']);

// 4. Find one record by condition throwing NotFoundException if missing
$user = UserRecord::findOneOrFail(['email' => 'alice@example.com']);

// 5. Find all records matching condition
$activeUsers = UserRecord::findAll(['status' => 'active']);

// 6. Find all records matching condition throwing NotFoundException if empty
$activeUsers = UserRecord::findAllOrFail(['status' => 'active']);

// 7. Find records via raw SQL statement
$users = UserRecord::findBySql(
    'SELECT * FROM {{%user}} WHERE status = :status ORDER BY created_at DESC',
    [':status' => 'active'],
)->all();

// 8. Create an ActiveQueryInterface instance for chaining
$query = UserRecord::find(['status' => 'active'])->orderBy(['created_at' => SORT_DESC]);
```

> [!WARNING]
> **Condition Injection Hazard in `findOne($scalar)`:**
> In `RepositoryTrait::findOne(array|string|ExpressionInterface|null $condition = null, array $params = [])`, passing a raw scalar string passes it directly to SQL `WHERE (scalar)` as an arbitrary expression, **not** as a primary key lookup!
> Never write `UserRecord::findOne($id)`. Always use `UserRecord::findByPk($id)` or `UserRecord::findOne(['id' => $id])`.

### 2.4. Custom Connection Routing via `CustomConnectionTrait`

When multiple database connections are used (such as read replicas, audit databases, or multi-tenant shards):

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\ActiveRecord;

use Yiisoft\ActiveRecord\ActiveRecord;
use Yiisoft\ActiveRecord\Trait\CustomConnectionTrait;

final class TenantRecord extends ActiveRecord
{
    use CustomConnectionTrait;

    public ?string $id = null;
    public string $data = '';

    public function tableName(): string
    {
        return '{{%tenant_data}}';
    }
}

// Switching connection name at runtime via immutable cloning:
$record = (new TenantRecord())->withConnectionName('tenant_shard_2');
$record->id = 'rec-001';
$record->data = 'payload';
$record->save(); // Executes against ConnectionProvider::get('tenant_shard_2')
```

---

## 4. Lifecycle, Persistence, Mutations & Concurrency

### 4.1. Mutation Return Types & Exception Handling

Yii3 Active Record enforces strict, predictable return types on all mutations:

| Method | Return Type | Failure Handling | Description |
|---|---|---|---|
| `save(?array $properties = null)` | `void` | Throws `\Throwable` | Dispatches `insert()` if new, `update()` if existing. |
| `insert(?array $properties = null)` | `void` | Throws `\Throwable` / `InvalidCallException` | Inserts a new row. Throws `InvalidCallException` if called on an existing record. |
| `update(?array $properties = null)` | `int` | Throws `\Throwable` / `InvalidCallException` | Returns number of affected rows. Throws `InvalidCallException` if called on a new record. |
| `delete()` | `int` | Throws `\Throwable` | Returns number of deleted rows (not `void` and not `bool`). |
| `upsert(?array $insertProperties = null, array\|bool $updateProperties = true)` | `void` | Throws `\Throwable` | Atomic upsert via DBAL driver native upsert SQL. |

```php
declare(strict_types=1);

use App\Infrastructure\Persistence\ActiveRecord\UserRecord;
use Yiisoft\Db\Exception\Exception as DbException;
use Yiisoft\Db\Exception\IntegrityException;

$user = new UserRecord();
$user->id = 'usr-001';
$user->name = 'Bob';
$user->email = 'bob@example.com';

try {
    // save() returns void; failure always throws an exception
    $user->save();
} catch (IntegrityException $e) {
    // Unique key collision or foreign key violation
    throw new DuplicateUserException('Email already registered', previous: $e);
} catch (DbException $e) {
    // General database driver failure
    throw new PersistenceException('Database error occurred', previous: $e);
}
```

### 4.2. State Inspection & Change Tracking Methods

Active Record provides granular methods to inspect persistence state and modified attributes:

```php
declare(strict_types=1);

use App\Infrastructure\Persistence\ActiveRecord\UserRecord;

$record = UserRecord::findByPk('usr-001');

// 1. Record persistence state (replaces legacy isNewRecord)
$isNew = $record->isNew(); // bool

// 2. Change detection across all properties or specific property
$record->name = 'New Name';
$hasChanged = $record->isChanged(); // true
$nameChanged = $record->isPropertyChanged('name'); // true
$emailChanged = $record->isPropertyChanged('email'); // false

// 3. Inspect modified values (replaces legacy getDirtyAttributes)
$dirty = $record->newValues(); // ['name' => 'New Name']

// 4. Inspect snapshot of original values (replaces legacy getOldAttributes)
$oldValues = $record->oldValues(); // ['id' => 'usr-001', 'name' => 'Bob', ...]
$oldName = $record->oldValue('name'); // 'Bob'

// 5. Inspect primary key values
$pk = $record->primaryKeyValue(); // 'usr-001'

// 6. Export all properties as associative array
$allProperties = $record->propertyValues(); // ['id' => 'usr-001', 'name' => 'New Name', ...]
```

### 4.3. Absence of Validation Engine (Decoupling `rules()`)

Yii3 `ActiveRecord` contains **no validation engine**:
- Declaring `public function rules(): array` in `ActiveRecord` is a legacy Yii2 anti-pattern; it is completely ignored.
- Input validation belongs strictly to **Form Models / DTOs** using `yiisoft/validator` with PHP 8 attributes before data reaches persistence.

### 4.4. Event Lifecycle Handlers (`EventsTrait`, Timestamps & Soft Delete)

> [!CRITICAL]
> **Mandatory Trait for Lifecycle Events:**
> Base `ActiveRecord` does **NOT** dispatch events by default.
> For lifecycle attributes (`#[SoftDelete]`, `#[DefaultDateTimeOnInsert]`, `#[SetDateTimeOnUpdate]`) to work, the model class **MUST** declare `use Yiisoft\ActiveRecord\Trait\EventsTrait;`.
> Without `EventsTrait`, lifecycle attributes silently fail to execute!
>
> The full PSR-14 event side — all 14 event classes, emission mechanics, and the `EventDispatcherProvider` wiring paths — is owned by the [Events & Listeners Guide](core-events-and-listeners.md), section 6.6.

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\ActiveRecord;

use DateTimeImmutable;
use Yiisoft\ActiveRecord\ActiveRecord;
use Yiisoft\ActiveRecord\Event\Handler\DefaultDateTimeOnInsert;
use Yiisoft\ActiveRecord\Event\Handler\SetDateTimeOnUpdate;
use Yiisoft\ActiveRecord\Event\Handler\SoftDelete;
use Yiisoft\ActiveRecord\Trait\EventsTrait;
use Yiisoft\ActiveRecord\Trait\LazyLoadGuardTrait;
use Yiisoft\ActiveRecord\Trait\RepositoryTrait;

/**
 * ProductRecord with automatic timestamp management and soft deletion.
 *
 * SoftDelete constructor: __construct(mixed $value = null, string ...$propertyNames)
 * Note: There is NO $column parameter!
 */
final class ProductRecord extends ActiveRecord
{
    use RepositoryTrait;
    use LazyLoadGuardTrait;
    use EventsTrait; // MANDATORY for lifecycle attributes!

    public ?string $id = null;
    public string $title = '';
    public int $price = 0;

    // Nullable sentinel: delete() sets it to `true` ONLY because the current
    // value is `null`. A non-nullable default (e.g. `false`) makes delete()
    // a silent no-op, and the read filter (`IS NULL`) would exclude every row.
    #[SoftDelete(true)]
    public ?bool $is_deleted = null;

    #[DefaultDateTimeOnInsert]
    public ?string $created_at = null;

    #[SetDateTimeOnUpdate]
    public ?string $updated_at = null;

    public function tableName(): string
    {
        return '{{%product}}';
    }
}
```

#### Attribute Configuration Rules:
1. **`#[SoftDelete]`:**
   - Class-level attribute: `#[SoftDelete(true, 'is_deleted')]` marks the record upon `$record->delete()` by setting the `$is_deleted` property to `true` instead of issuing a real `DELETE`.
   - Property-level attribute: `#[SoftDelete(true)] public ?bool $is_deleted = null;` — the attribute attaches to the property it is declared on.
   - Parameterless default: `#[SoftDelete]` targets property `deleted_at` and sets it to a `DateTimeImmutable` instance.
   - **The sentinel property MUST be nullable with default `null`:** the handler assigns the value only when the current property value is exactly `null` (`get($prop) === null`). With a non-nullable default such as `false`, `delete()` becomes a silent no-op.
   - Read filter: automatically appends `WHERE is_deleted IS NULL` (or `deleted_at IS NULL`) to all queries initiated by the model — only rows whose sentinel is still `NULL` are visible. This is the same reason the default must be `null`: a row is "alive" while the property is `NULL`, and `delete()` flips it to the configured value.
2. **`#[DefaultDateTimeOnInsert]`:**
   - Applied to property: sets the current `DateTimeImmutable` upon `insert()`.
   - Class-level default: `#[DefaultDateTimeOnInsert]` automatically populates `created_at` and `updated_at`.
3. **`#[SetDateTimeOnUpdate]`:**
   - Applied to property: updates the property with current `DateTimeImmutable` upon `update()` and `upsert()`.
   - Class-level default: `#[SetDateTimeOnUpdate]` automatically updates `updated_at`.

### 4.5. Optimistic Concurrency Control (`OptimisticLockInterface`)

To prevent lost updates in concurrent environments, implement `Yiisoft\ActiveRecord\OptimisticLockInterface`:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\ActiveRecord;

use Yiisoft\ActiveRecord\ActiveRecord;
use Yiisoft\ActiveRecord\OptimisticLockException;
use Yiisoft\ActiveRecord\OptimisticLockInterface;

final class AccountRecord extends ActiveRecord implements OptimisticLockInterface
{
    public ?string $id = null;
    public int $balance = 0;
    public int $version = 0;

    public function tableName(): string
    {
        return '{{%account}}';
    }

    /**
     * Returns the name of the column storing the optimistic lock version.
     */
    public function optimisticLockPropertyName(): string
    {
        return 'version';
    }
}
```

When updating or deleting an optimistic-locked record, Active Record automatically appends `WHERE version = :currentVersion` to the SQL query and increments the version. If another process updated the record in the meantime, 0 rows are affected and an `OptimisticLockException` is thrown:

```php
declare(strict_types=1);

use App\Infrastructure\Persistence\ActiveRecord\AccountRecord;
use Yiisoft\ActiveRecord\OptimisticLockException;

$account = AccountRecord::findByPk('acc-100');
$account->balance += 500;

try {
    $account->save();
} catch (OptimisticLockException $e) {
    // Concurrent modification detected; handle conflict (e.g. reload and retry)
    throw new ConcurrencyConflictException('Account was modified by another transaction.', previous: $e);
}
```

### 4.6. Explicit Transaction Demarcation

Active Record does not automatically wrap operations in database transactions. When multiple records must be mutated atomically, demarcate the transaction using the connection exposed by the record:

```php
declare(strict_types=1);

use App\Infrastructure\Persistence\ActiveRecord\OrderRecord;
use App\Infrastructure\Persistence\ActiveRecord\PaymentRecord;
use Yiisoft\Db\Connection\ConnectionInterface;

$order = new OrderRecord();
$order->id = 'ord-123';
$order->amount = 1500;

$payment = new PaymentRecord();
$payment->id = 'pay-456';
$payment->order_id = 'ord-123';
$payment->status = 'completed';

// transaction() strictly requires a \Closure and receives ConnectionInterface $db
$order->db()->transaction(static function (ConnectionInterface $db) use ($order, $payment): void {
    $order->save();
    $payment->save();
});
```

---
