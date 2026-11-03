# Yii3 Persistence: Active Record Models & Relations

> Practical guide for `yiisoft/active-record` model definition, typed properties, static finder traits, relation definitions, lifecycle events, streaming, concurrency control, and N+1 prevention with `LazyLoadGuard`.
>
> Persistence details belong strictly to the Infrastructure Layer; Active Record models must never be used as pure Domain Entities or coupled to Presentation Actions.

---

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
- [3. `ActiveQuery` & Query Engine](#3-activequery--query-engine)
  - [3.1. Single-Argument Constructor Rule](#31-single-argument-constructor-rule)
  - [3.2. Query Execution & Return Semantics](#32-query-execution--return-semantics)
  - [3.3. Strict Condition Guard on `Query::where()` (`LogicException`)](#33-strict-condition-guard-on-querywhere-logicexception)
  - [3.4. Memory-Safe Query Streams (`each()`, `batch()`) & Hydration Bypass (`asArray()`)](#34-memory-safe-query-streams-each-batch--hydration-bypass-asarray)
  - [3.5. Query Result Caching Architecture (Absence of `Query::cache()`)](#35-query-result-caching-architecture-absence-of-querycache)
- [4. Lifecycle, Persistence, Mutations & Concurrency](#4-lifecycle-persistence-mutations--concurrency)
  - [4.1. Mutation Return Types & Exception Handling](#41-mutation-return-types--exception-handling)
  - [4.2. State Inspection & Change Tracking Methods](#42-state-inspection--change-tracking-methods)
  - [4.3. Absence of Validation Engine (Decoupling `rules()`)](#43-absence-of-validation-engine-decoupling-rules)
  - [4.4. Event Lifecycle Handlers (`EventsTrait`, Timestamps & Soft Delete)](#44-event-lifecycle-handlers-eventstrait-timestamps--soft-delete)
  - [4.5. Optimistic Concurrency Control (`OptimisticLockInterface`)](#45-optimistic-concurrency-control-optimisticlockinterface)
  - [4.6. Explicit Transaction Demarcation](#46-explicit-transaction-demarcation)
- [5. Relation Definitions & Queries](#5-relation-definitions--queries)
  - [5.1. Explicit Relation Resolution via `relationQuery()` vs `MagicRelationsTrait`](#51-explicit-relation-resolution-via-relationquery-vs-magicrelationstrait)
  - [5.2. `hasOne` and `hasMany` Link Syntax](#52-hasone-and-hasmany-link-syntax)
  - [5.3. Many-to-Many via Intermediate Model (`via()`) and Junction Table (`viaTable()`)](#53-many-to-many-via-intermediate-model-via-and-junction-table-viatable)
  - [5.4. Filtering & Sorting Relations with `joinWith()` and `innerJoinWith()`](#54-filtering--sorting-relations-with-joinwith-and-innerjoinwith)
- [6. Eager Loading, N+1 Prevention & Worker Isolation](#6-eager-loading-n1-prevention--worker-isolation)
  - [6.1. Eager Loading with `with()`](#61-eager-loading-with-with)
  - [6.2. Strict N+1 Detection with `LazyLoadGuard` & Trait Requirement](#62-strict-n1-detection-with-lazyloadguard--trait-requirement)
  - [6.3. Long-Running Worker Isolation (RoadRunner / Swoole State Reset)](#63-long-running-worker-isolation-roadrunner--swoole-state-reset)
- [7. Grid Pagination & Sorting (`QueryDataReader` & `OffsetPaginator`)](#7-grid-pagination--sorting-querydatareader--offsetpaginator)
  - [7.1. Hydrated Data Reader Pipeline (`QueryDataReader`)](#71-hydrated-data-reader-pipeline-querydatareader)
  - [7.2. Whitelist Sorting with `Sort::only()`](#72-whitelist-sorting-with-sortonly)
- [8. PHP 8 Named Arguments & Signatures Reference](#8-php-8-named-arguments--signatures-reference)
- [9. Anti-Pattern Matrix: Active Record](#9-anti-pattern-matrix-active-record)
- [10. Related Topic Guides](#10-related-topic-guides)

---

## 1. Clean Architecture Persistence with Active Record

### 1.1. Architecture Placement & Boundary Separation

In Yii3 Clean Architecture, `ActiveRecord` models serve strictly as **Infrastructure Schema Data Structures**. They must never contain business domain logic and should remain isolated from Domain Entities:

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
- `AbstractActiveRecord::db()` calls `Yiisoft\Db\Connection\ConnectionProvider::get(ConnectionProvider::DEFAULT)`.
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

## 3. `ActiveQuery` & Query Engine

### 3.1. Single-Argument Constructor Rule

> [!IMPORTANT]
> `ActiveQuery::__construct(ActiveRecordInterface|string $modelClass)` takes **strictly one argument**.
> Passing `$db` as a second argument (`new ActiveQuery(UserRecord::class, $db)`) triggers a fatal PHP `ArgumentCountError`.

```php
declare(strict_types=1);

use App\Infrastructure\Persistence\ActiveRecord\UserRecord;
use Yiisoft\ActiveRecord\ActiveQuery;

// Instantiation passing the model class name:
$query = new ActiveQuery(UserRecord::class);

// Or via static factory on the record (available on all ActiveRecord subclasses):
$query = UserRecord::query();
```

To implement custom domain query scopes, subclass `ActiveQuery` and override `Model::query()`:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\ActiveRecord;

use Yiisoft\ActiveRecord\ActiveQuery;
use Yiisoft\ActiveRecord\ActiveQueryInterface;
use Yiisoft\ActiveRecord\ActiveRecord;

final class CustomerQuery extends ActiveQuery
{
    public function active(): self
    {
        return $this->andWhere(['status' => 'active']);
    }
}

final class CustomerRecord extends ActiveRecord
{
    public function tableName(): string
    {
        return '{{%customer}}';
    }

    public static function query(ActiveRecord|string|null $modelClass = null): ActiveQueryInterface
    {
        return new CustomerQuery($modelClass ?? static::class);
    }
}
```

### 3.2. Query Execution & Return Semantics

`ActiveQuery` inherits from `Yiisoft\Db\Query\Query` and hydrates database rows into model instances:

```php
declare(strict_types=1);

use App\Infrastructure\Persistence\ActiveRecord\UserRecord;
use Yiisoft\ActiveRecord\ActiveQuery;

// 1. Fetch single hydrated record (UserRecord|null)
$user = (new ActiveQuery(UserRecord::class))
    ->where(['email' => $email])
    ->one();

// 2. Fetch list of hydrated records (list<UserRecord>)
$users = (new ActiveQuery(UserRecord::class))
    ->where(['status' => 'active'])
    ->orderBy(['created_at' => SORT_DESC])
    ->limit(20)
    ->all();

// 3. Query scalar count without hydrating objects
$count = (new ActiveQuery(UserRecord::class))
    ->where(['status' => 'active'])
    ->count();

// 4. Check existence without fetching row data
$hasInactive = (new ActiveQuery(UserRecord::class))
    ->where(['status' => 'inactive'])
    ->exists();
```

### 3.3. Strict Condition Guard on `Query::where()` (`LogicException`)

In Yii3 DBAL, `Query::where()` guards against accidental condition overwrites:

```php
// In Yiisoft\Db\Query\Query::where():
if ($this->where !== null) {
    throw new \LogicException(
        'The `where` condition was set earlier. Use the `setWhere()`, `andWhere()` or `orWhere()` method.',
    );
}
```

To manipulate conditions cleanly:
- Use `setWhere()` when intentionally replacing the entire condition.
- Use `andWhere()` or `orWhere()` when chaining additional criteria.
- Use `andFilterWhere()` to append conditions only when values are not null/empty.

```php
declare(strict_types=1);

use App\Infrastructure\Persistence\ActiveRecord\UserRecord;

$query = UserRecord::query()->where(['status' => 'active']);

// Calling where() again throws \LogicException:
// $query->where(['role' => 'admin']); // ERROR: throws LogicException!

// Correct: append conditions using andWhere() or replace using setWhere()
$query->andWhere(['role' => 'admin']);
$query->setWhere(['status' => 'archived']); // Overwrites cleanly
```

### 3.4. Memory-Safe Query Streams (`each()`, `batch()`) & Hydration Bypass (`asArray()`)

For high-volume data sets or heavy CLI batch jobs, avoid loading all rows into memory at once with `all()`:

```php
declare(strict_types=1);

use App\Infrastructure\Persistence\ActiveRecord\UserRecord;

// 1. Streaming one record at a time with constant memory usage
// ActiveQuery::each() takes 0 arguments in Yii3! Returns DataReaderInterface
foreach (UserRecord::query()->where(['status' => 'active'])->each() as $user) {
    /** @var UserRecord $user */
    processUser($user);
}

// 2. Chunked batch processing (yields array of hydrated models per batch)
// ActiveQuery::batch(int $batchSize = 100) returns BatchQueryResultInterface
foreach (UserRecord::query()->where(['status' => 'active'])->batch(500) as $batch) {
    /** @var list<UserRecord> $batch */
    foreach ($batch as $user) {
        processUser($user);
    }
}

// 3. Hydration bypass: returns raw associative arrays instead of model objects
// Essential for read-only high-performance API endpoints
$rawRows = UserRecord::query()
    ->where(['status' => 'active'])
    ->asArray(true)
    ->all();
```

### 3.5. Query Result Caching Architecture (Absence of `Query::cache()`)

> [!NOTE]
> **No `Query::cache()` or `Query::noCache()` in Yii3:**
> In legacy Yii2, `Query` provided query result caching. In Yii3 DBAL, query result caching is completely absent from `Query` and `ActiveQuery`.
> The DBAL only provides `SchemaCache` (`Yiisoft\Db\Cache\SchemaCache`) for caching database schema metadata.
> Result set caching must be implemented at the application service or repository layer using PSR-16 (`Psr\SimpleCache\CacheInterface` or `Yiisoft\Cache\CacheInterface`).

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\ActiveRecord;

use App\Domain\Model\User;
use App\Domain\Model\UserId;
use App\Domain\Repository\UserRepositoryInterface;
use Psr\SimpleCache\CacheInterface;

final readonly class CachedArUserRepository implements UserRepositoryInterface
{
    public function __construct(
        private ArUserRepository $innerRepository,
        private CacheInterface $cache,
    ) {}

    public function findById(UserId $id): ?User
    {
        $cacheKey = 'user:' . $id->value;

        if ($this->cache->has($cacheKey)) {
            /** @var User|null */
            return $this->cache->get($cacheKey);
        }

        $user = $this->innerRepository->findById($id);
        $this->cache->set($cacheKey, $user, 3600);

        return $user;
    }

    public function save(User $user): void
    {
        $this->innerRepository->save($user);
        $this->cache->delete('user:' . $user->getId()->value);
    }

    public function delete(User $user): void
    {
        $this->innerRepository->delete($user);
        $this->cache->delete('user:' . $user->getId()->value);
    }
}
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

## 5. Relation Definitions & Queries

### 5.1. Explicit Relation Resolution via `relationQuery()` vs `MagicRelationsTrait`

In Yii3 Active Record, relation discovery does not rely on magic getter prefixes by default.

#### The Canonical Explicit Pattern (No Magic Traits)
Override `public function relationQuery(string $name): ActiveQueryInterface` using a PHP 8 `match` expression:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\ActiveRecord;

use Yiisoft\ActiveRecord\ActiveQueryInterface;
use Yiisoft\ActiveRecord\ActiveRecord;
use Yiisoft\ActiveRecord\Trait\LazyLoadGuardTrait;
use Yiisoft\ActiveRecord\Trait\RepositoryTrait;

final class UserRecord extends ActiveRecord
{
    use RepositoryTrait;
    use LazyLoadGuardTrait;

    public ?string $id = null;
    public string $name = '';

    public function tableName(): string
    {
        return '{{%user}}';
    }

    /**
     * Canonical relation resolution without magic traits.
     */
    public function relationQuery(string $name): ActiveQueryInterface
    {
        return match ($name) {
            'profile' => $this->hasOne(ProfileRecord::class, ['user_id' => 'id']),
            'orders' => $this->hasMany(OrderRecord::class, ['user_id' => 'id']),
            default => parent::relationQuery($name),
        };
    }
}
```

#### The Magic Relations Trait Alternative (`MagicRelationsTrait`)
If prefer method-based declarations, import `Yiisoft\ActiveRecord\Trait\MagicRelationsTrait`. Methods **must** be suffixed with `Query`:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\ActiveRecord;

use Yiisoft\ActiveRecord\ActiveQueryInterface;
use Yiisoft\ActiveRecord\ActiveRecord;
use Yiisoft\ActiveRecord\Trait\MagicRelationsTrait;

final class UserRecord extends ActiveRecord
{
    use MagicRelationsTrait;

    public ?string $id = null;

    public function tableName(): string
    {
        return '{{%user}}';
    }

    /**
     * Suffix 'Query' is mandatory when using MagicRelationsTrait!
     */
    public function getProfileQuery(): ActiveQueryInterface
    {
        return $this->hasOne(ProfileRecord::class, ['user_id' => 'id']);
    }

    public function getOrdersQuery(): ActiveQueryInterface
    {
        return $this->hasMany(OrderRecord::class, ['user_id' => 'id']);
    }
}
```

### 5.2. `hasOne` and `hasMany` Link Syntax

The `$link` array defines the relation column mapping:
`['related_model_property' => 'this_model_property']`

- **1:1 HasOne (`User` $\rightarrow$ `Profile`):**
  `$this->hasOne(ProfileRecord::class, ['user_id' => 'id'])` (`user_id` on ProfileRecord, `id` on UserRecord).
- **1:1 BelongsTo (`Profile` $\rightarrow$ `User`):**
  `$this->hasOne(UserRecord::class, ['id' => 'user_id'])` (`id` on UserRecord, `user_id` on ProfileRecord).
- **1:N HasMany (`User` $\rightarrow$ `Order`):**
  `$this->hasMany(OrderRecord::class, ['user_id' => 'id'])` (`user_id` on OrderRecord, `id` on UserRecord).

### 5.3. Many-to-Many via Intermediate Model (`via()`) and Junction Table (`viaTable()`)

#### Option A: M:N via Intermediate Active Record Model (`via()`)
When the junction table requires its own Active Record model (e.g. tracking additional metadata like `assigned_at`):

```php
public function relationQuery(string $name): ActiveQueryInterface
{
    return match ($name) {
        'userRoles' => $this->hasMany(UserRoleRecord::class, ['user_id' => 'id']),
        'roles' => $this->hasMany(RoleRecord::class, ['id' => 'role_id'])->via('userRoles'),
        default => parent::relationQuery($name),
    };
}
```

#### Option B: M:N Directly via Junction Table (`viaTable()`)
When the junction table is purely a linkage table without requiring a dedicated Active Record model:

```php
public function relationQuery(string $name): ActiveQueryInterface
{
    return match ($name) {
        'roles' => $this->hasMany(RoleRecord::class, ['id' => 'role_id'])
            ->viaTable('{{%user_role}}', ['user_id' => 'id']),
        default => parent::relationQuery($name),
    };
}
```

### 5.4. Filtering & Sorting Relations with `joinWith()` and `innerJoinWith()`

`joinWith()` joins related tables into the primary SQL query to filter or sort by related columns while simultaneously eager loading related models into memory:

```php
declare(strict_types=1);

use App\Infrastructure\Persistence\ActiveRecord\UserRecord;

// 1. LEFT JOIN related orders and filter primary users by order properties
$users = UserRecord::query()
    ->joinWith('orders')
    ->where(['orders.status' => 'paid'])
    ->all();

// 2. INNER JOIN profile and sort by profile country
$users = UserRecord::query()
    ->innerJoinWith('profile')
    ->orderBy(['profile.country' => SORT_ASC])
    ->all();

// 3. Join with disabled eager loading (joins table strictly for filtering/sorting)
$users = UserRecord::query()
    ->joinWith('orders', eagerLoading: false)
    ->where(['orders.total' => 1000])
    ->all();
```

---

## 6. Eager Loading, N+1 Prevention & Worker Isolation

### 6.1. Eager Loading with `with()`

Always eager-load relations when querying multiple records to prevent N+1 query storms. Eager loading runs a single additional `IN (...)` query and maps related records into memory:

```php
declare(strict_types=1);

use App\Infrastructure\Persistence\ActiveRecord\UserRecord;

// Eager loads orders and profile in 2 additional IN (...) queries instead of N queries
$users = UserRecord::query()
    ->with('orders', 'profile')
    ->where(['status' => 'active'])
    ->all();
```

Nested and constrained eager loading:

```php
$users = UserRecord::query()
    ->with([
        'profile',
        'orders' => static fn(ActiveQuery $query) => $query->andWhere(['status' => 'paid']),
        'orders.items', // Eager load nested items relation
    ])
    ->all();
```

### 6.2. Strict N+1 Detection with `LazyLoadGuard` & Trait Requirement

`LazyLoadGuard` intercepts relation calls at runtime to detect and eliminate lazy-loading bottlenecks:

```php
declare(strict_types=1);

use Yiisoft\ActiveRecord\LazyLoadGuard;
use Yiisoft\ActiveRecord\LazyLoadGuardMode;

// Configure strict N+1 detection during bootstrap (throws LazyLoadException on violations)
LazyLoadGuard::set(LazyLoadGuardMode::Strict);
```

> [!CRITICAL]
> **Guard Invariants & Detection Semantics:**
> 1. **Trait Requirement:** The guard **only inspects records whose class uses `Yiisoft\ActiveRecord\Trait\LazyLoadGuardTrait`**. Without this trait on the model class, `LazyLoadGuard::set()` has no effect — lazy loads continue undetected.
> 2. **Detection Semantics:** `Strict` mode throws `LazyLoadException` only when **two or more records of the same result set** lazy-load the same relation. A single record lazy-loading a relation is allowed.
> 3. **Modes:** `LazyLoadGuardMode` has only two cases: `LazyLoadGuardMode::Strict` and `LazyLoadGuardMode::Log`. There is no `Off` mode.

### 6.3. Long-Running Worker Isolation (RoadRunner / Swoole State Reset)

In persistent PHP runtimes (RoadRunner, Swoole, FrankenPHP, Workerman), in-memory state accumulates across requests. Active Record maintains static counters and reflection caches that must be cleared between requests:

```php
declare(strict_types=1);

use Yiisoft\ActiveRecord\Event\EventDispatcherProvider;
use Yiisoft\ActiveRecord\LazyLoadGuard;

// Inside the long-running worker request loop (finally block):
try {
    $response = $application->handle($request);
    $worker->respond($response);
} finally {
    // 1. Clears result set counters and WeakMap while PRESERVING mode and logger
    LazyLoadGuard::resetCounters();

    // 2. Clears cached attribute reflection listener collections
    EventDispatcherProvider::reset();
}
```

> [!IMPORTANT]
> Always call `LazyLoadGuard::resetCounters()` rather than `reset()`. `resetCounters()` purges the static `WeakMap` and iteration counters while preserving the configured `Strict` mode and logger. `reset()` resets the mode back to `Log` and the logger to `null`.

---

## 7. Grid Pagination & Sorting (`QueryDataReader` & `OffsetPaginator`)

### 7.1. Hydrated Data Reader Pipeline (`QueryDataReader`)

`Yiisoft\Data\Db\QueryDataReader` natively accepts any `ActiveQuery` instance. Under the hood, `ActiveQuery::index()` overrides `Query::index()` to invoke `$this->populate($rows)` $\rightarrow$ `$this->createModels($rows)`.
Therefore, `QueryDataReader::read()` yields **fully hydrated Active Record model instances** with relations preloaded via `with()`:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\ActiveRecord;

use App\Infrastructure\Persistence\ActiveRecord\UserRecord;
use Yiisoft\ActiveRecord\ActiveQuery;
use Yiisoft\Data\Db\QueryDataReader;
use Yiisoft\Data\Paginator\OffsetPaginator;
use Yiisoft\Data\Reader\Sort;

final readonly class UserGridProvider
{
    /**
     * @return array{items: list<UserRecord>, totalItems: int, totalPages: int, currentPage: int}
     */
    public function getUsers(int $page = 1, int $pageSize = 20, ?string $sortParam = '-created_at'): array
    {
        // 1. Whitelist allowable sort columns
        $sort = Sort::only(['id', 'email', 'created_at']);
        if ($sortParam !== null) {
            $sort = $sort->withOrderString($sortParam);
        }

        // 2. Build ActiveQuery with eager-loaded relations
        $query = (new ActiveQuery(UserRecord::class))
            ->where(['status' => 'active'])
            ->with('profile');

        // 3. Wrap query in QueryDataReader
        $dataReader = (new QueryDataReader($query))->withSort($sort);

        // 4. Wrap data reader in OffsetPaginator
        $paginator = (new OffsetPaginator($dataReader))
            ->withPageSize($pageSize)
            ->withCurrentPage($page);

        return [
            // Iterating yields hydrated UserRecord instances!
            'items' => iterator_to_array($paginator->read()),
            'totalItems' => $paginator->getTotalItems(),
            'totalPages' => $paginator->getTotalPages(),
            'currentPage' => $paginator->getCurrentPage(),
        ];
    }
}
```

### 7.2. Whitelist Sorting with `Sort::only()`

`Sort::only()` prevents SQL injection and column name enumeration by strictly discarding sort parameters that are not explicitly whitelisted:

```php
declare(strict_types=1);

use Yiisoft\Data\Reader\Sort;

$sort = Sort::only([
    'id',
    'email',
    'created_at' => [
        'asc' => ['created_at' => SORT_ASC],
        'desc' => ['created_at' => SORT_DESC],
        'default' => 'desc',
    ],
]);
```

---

## 8. PHP 8 Named Arguments & Signatures Reference

```php
declare(strict_types=1);

use App\Infrastructure\Persistence\ActiveRecord\OrderRecord;
use App\Infrastructure\Persistence\ActiveRecord\ProfileRecord;
use App\Infrastructure\Persistence\ActiveRecord\UserRecord;
use Psr\Log\LoggerInterface;
use Yiisoft\ActiveRecord\ActiveQuery;
use Yiisoft\ActiveRecord\LazyLoadGuard;
use Yiisoft\ActiveRecord\LazyLoadGuardMode;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Connection\ConnectionProvider;

/** @var ConnectionInterface $db */
/** @var LoggerInterface $logger */

// 1. Registering connections in ConnectionProvider
ConnectionProvider::set(
    connection: $db,
    name: ConnectionProvider::DEFAULT,
);

// 2. ActiveQuery Constructor (strictly 1 argument: $modelClass)
$query = new ActiveQuery(
    modelClass: UserRecord::class,
);

// 3. Eager Loading relations
$query->with(
    'orders',
    'profile',
);

// 4. ActiveQuery Joining relations
$query->joinWith(
    with: 'orders',
    eagerLoading: true,
    joinType: 'LEFT JOIN',
);

// 5. ActiveQuery Direct Table Junction
$query->viaTable(
    tableName: '{{%user_role}}',
    link: ['user_id' => 'id'],
);

// 6. Active Record Mutations
$record = new UserRecord();
$record->save(
    properties: null, // null saves all attributes or changed properties
);
$record->update(
    properties: null,
);
$record->delete(); // returns int (number of deleted rows)

// 7. Active Record Relation Definitions
$record->hasOne(
    modelClass: ProfileRecord::class,
    link: ['user_id' => 'id'],
);
$record->hasMany(
    modelClass: OrderRecord::class,
    link: ['user_id' => 'id'],
);

// 8. LazyLoadGuard Configuration & Worker Reset
LazyLoadGuard::set(
    mode: LazyLoadGuardMode::Strict,
    logger: $logger,
);
LazyLoadGuard::resetCounters();
```

---

## 9. Anti-Pattern Matrix: Active Record

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| ❌ **`new UserRecord($this->db)`** | `ActiveRecord` has no constructor. Extra arguments are silently discarded by PHP; the model still binds to default `ConnectionProvider`. | Instantiate `new UserRecord()`. Wire connections via `ConnectionProvider::set()` or `CustomConnectionTrait` + `withConnectionName()`. |
| ❌ **`new ActiveQuery(UserRecord::class, $this->db)`** | `ActiveQuery::__construct()` accepts only 1 parameter (`$modelClass`). Passing `$db` throws `ArgumentCountError`. | Call `new ActiveQuery(UserRecord::class)` or `UserRecord::query()`. It gets `$db` internally from the model's `db()`. |
| ❌ **`public static function tableName(): string`** | `ActiveRecordInterface::tableName(): string` is non-static. Making it static throws a fatal PHP compile-time error. | Declare `public function tableName(): string`. |
| ❌ **`UserRecord::findOne('uuid-123')` or `findOne($id)`** | Passes scalar directly to SQL `WHERE (uuid-123)` without column mapping, risking SQL syntax errors and condition injection. | Call `UserRecord::findByPk($id)` or `UserRecord::findOne(['id' => $id])`. |
| ❌ **`if (!$record->save())` expecting boolean** | In Yii3, `ActiveRecord::save()` returns `void`, not `bool`. It throws exceptions on SQL errors. | Call `$record->save()`. Catch database exceptions on error, and validate input beforehand using `yiisoft/validator`. |
| ❌ **`if (!$record->delete())` expecting boolean** | `delete()` returns `int` (affected row count). | Call `$deletedCount = $record->delete();` or simply `$record->delete();`. |
| ❌ **`$record->isNewRecord` or `$record->isNewRecord()`** | Legacy Yii2 property/method. Does not exist in Yii3. | Call `$record->isNew(): bool`. |
| ❌ **Declaring `rules()` in `ActiveRecord`** | Legacy Yii2 feature. Yii3 `ActiveRecord` contains no validation engine; `rules()` is ignored. | Decouple validation into Form Models / DTOs using `yiisoft/validator` with PHP 8 attributes. |
| ❌ **Lifecycle attributes without `EventsTrait`** | Base `ActiveRecord` does not dispatch events. `#[SoftDelete]`, `#[DefaultDateTimeOnInsert]`, etc. fail silently. | Add `use Yiisoft\ActiveRecord\Trait\EventsTrait;` to the Active Record model class. |
| ❌ **`#[SoftDelete(column: 'is_deleted')]`** | `SoftDelete` constructor has no `$column` parameter. Throws PHP 8 `Error: Unknown named parameter $column`. | Use class-level `#[SoftDelete(true, 'is_deleted')]` or property-level `#[SoftDelete(true)] public ?bool $is_deleted = null;` (nullable sentinel, default `null`). |
| ❌ **Plain relation getters like `getProfile()` without `relationQuery()`** | Without `relationQuery()` or `MagicRelationsTrait`, relation resolution fails with `InvalidArgumentException`. | Override `relationQuery(string $name)` with `match ($name)`, or use `MagicRelationsTrait` with `getProfileQuery()`. |
| ❌ **Uncontrolled AR relation lazy-loading in loops** | Triggers silent N+1 query storms that degrade database throughput. | Use eager loading `->with('orders')`, add `LazyLoadGuardTrait` to model, and enforce `LazyLoadGuard::set(LazyLoadGuardMode::Strict)`. |
| ❌ **Calling `Query::where()` multiple times** | DBAL guards against condition overwrite by throwing `\LogicException`. | Use `andWhere()` / `orWhere()` to combine conditions, or `setWhere()` to intentionally overwrite. |
| ❌ **Calling `ActiveQuery::cache()` or `Query::cache()`** | DBAL has no query result caching methods, and `Query` defines no `__call()` fallback; the call fails with a fatal `Error: Call to undefined method`. | Implement caching at the application / repository layer using PSR-16 (`CacheInterface`). The DBAL only provides `Yiisoft\Db\Cache\SchemaCache` (schema metadata caching). |
| ❌ **Passing non-Closure to `$record->db()->transaction()`** | Parameter is strictly typed `\Closure`, not a generic `callable`. Passing array callable throws `TypeError`. | Use `static function (ConnectionInterface $db) { ... }`. |
| ❌ **Dynamic untyped properties on AR class** | Deprecated in PHP 8.2+; prevents static analysis tools from catching errors. | Declare typed public properties on the record class (e.g. `public string $name = '';`). |
| ❌ **Forgetting worker resets in daemon loops** | Leaks memory in static `WeakMap` and caches invalid event listeners between worker requests. | Call `LazyLoadGuard::resetCounters()` and `EventDispatcherProvider::reset()` in the worker loop `finally` block. |
| ❌ **Using Active Record models as Domain Entities** | Tightly couples business logic and domain tests to database schema and active connection. | Keep pure Domain Entities in `Domain/Model/` and use Active Record strictly in `Infrastructure/Persistence/ActiveRecord/`. |
| ❌ **Executing AR queries inside HTTP Actions** | Breaks the Presentation/Infrastructure boundary, making actions un-testable. | Inject Domain Repositories or Application Use Cases into Action constructors. |

---

## 10. Related Topic Guides

- [Database Persistence Guide](persistence-db.md) — Low-level `yiisoft/db` Connection, Query Builder, Transactions, and Data Readers.
- [Cycle ORM Persistence Guide](persistence-cycle-orm.md) — Clean Data Mapper persistence with Cycle ORM (`#[Entity]`, `EntityReader`).
- [Database Migrations Guide](persistence-migrations.md) — Schema DDL, ColumnBuilder, foreign keys, and migration CLI commands.
- [Testing Database Guide](testing-database.md) — Ephemeral in-memory SQLite, test fixtures, and transactional rollbacks.
- [Validation & Forms Guide](http-validation-and-forms.md) — Form models, validation rules, and input DTOs.
- [Actions & Controllers Guide](http-actions-and-controllers.md) — Consuming repositories inside Use Cases and Presentation Actions.
- [Events & Listeners Guide](core-events-and-listeners.md) — Active Record lifecycle events (`EventsTrait`, `EventDispatcherProvider`, all 14 event classes).
