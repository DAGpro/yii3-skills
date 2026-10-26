# Yii3 Persistence: Active Record Models & Relations

> Practical guide for `yiisoft/active-record` model definition, typed properties, static finder traits, relation definitions, lifecycle events, and N+1 prevention with `LazyLoadGuard`.
>
> Persistence details belong strictly to the Infrastructure Layer; Active Record models must never be used as pure Domain Entities or coupled to Presentation Actions.

---

## Table of Contents
- [1. Clean Architecture Persistence with Active Record](#1-clean-architecture-persistence-with-active-record)
  - [1.1. Architecture Placement & Boundary Separation](#11-architecture-placement--boundary-separation)
  - [1.2. Active Record Repository Implementation (`ArUserRepository.php`)](#12-active-record-repository-implementation-aruserrepositoryphp)
- [2. Active Record Model Definition](#2-active-record-model-definition)
  - [2.1. The Constructor-Less Rule & Connection Resolution](#21-the-constructor-less-rule--connection-resolution)
  - [2.2. Table Name & Typed Properties](#22-table-name--typed-properties)
  - [2.3. Static Finder Methods via `RepositoryTrait`](#23-static-finder-methods-via-repositorytrait)
  - [2.4. Custom Connection via `CustomConnectionTrait`](#24-custom-connection-via-customconnectiontrait)
- [3. `ActiveQuery` & Querying](#3-activequery--querying)
  - [3.1. Single-Argument Constructor Rule](#31-single-argument-constructor-rule)
  - [3.2. Query Execution & Return Semantics](#32-query-execution--return-semantics)
- [4. Lifecycle, Persistence & Validation](#4-lifecycle-persistence--validation)
  - [4.1. `save()` Returns `void` (Exception Handling)](#41-save-returns-void-exception-handling)
  - [4.2. Absence of Validation Engine (Decoupling `rules()`)](#42-absence-of-validation-engine-decoupling-rules)
  - [4.3. Event Lifecycle Handlers (Timestamps & Soft Delete)](#43-event-lifecycle-handlers-timestamps--soft-delete)
- [5. Relation Definitions & Queries](#5-relation-definitions--queries)
  - [5.1. `hasOne` and `hasMany` Link Syntax](#51-hasone-and-hasmany-link-syntax)
  - [5.2. Junction Relations via `via()`](#52-junction-relations-via-via)
- [6. Eager Loading & N+1 Prevention (`LazyLoadGuard`)](#6-eager-loading--n1-prevention-lazyloadguard)
  - [6.1. Eager Loading with `with()`](#61-eager-loading-with-with)
  - [6.2. Strict Detection with `LazyLoadGuard` & Trait Requirement](#62-strict-detection-with-lazyloadguard--trait-requirement)
- [7. PHP 8 Named Arguments & Signatures Reference](#7-php-8-named-arguments--signatures-reference)
- [8. Anti-Pattern Matrix: Active Record](#8-anti-pattern-matrix-active-record)
- [9. Related Topic Guides](#9-related-topic-guides)

---

## 1. Clean Architecture Persistence with Active Record

### 1.1. Architecture Placement & Boundary Separation

In Yii3 Clean Architecture, `ActiveRecord` models serve strictly as **Infrastructure Schema Data Structures**. They must not contain business domain logic and should remain isolated from Domain Entities:

```text
src/
├── Domain/
│   ├── Model/User.php                  # Pure Domain Entity
│   └── Repository/UserRepositoryInterface.php # Domain contract
└── Infrastructure/
    └── Persistence/
        └── ActiveRecord/
            ├── UserRecord.php          # Schema model mapped to {{%user}}
            └── ArUserRepository.php    # Implements UserRepositoryInterface
```

### 1.2. Active Record Repository Implementation (`ArUserRepository.php`)

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
            createdAt: $record->created_at !== null ? new DateTimeImmutable($record->created_at) : null,
            updatedAt: $record->updated_at !== null ? new DateTimeImmutable($record->updated_at) : null,
        );
    }
}
```

---

## 2. Active Record Model Definition

### 2.1. The Constructor-Less Rule & Connection Resolution

> [!CAUTION]
> **No Database Injected in Constructor:**
> `ActiveRecord` defines **no constructor at all**. In PHP, passing arguments to a class without a constructor does not trigger a runtime error — PHP silently **discards** extra arguments.
> Therefore, calling `new UserRecord($db)` succeeds silently, but the `$db` argument is completely **ignored**. All queries continue executing against the default connection provider!

Connection resolution always delegates to `ConnectionProvider`:
- `AbstractActiveRecord::db()` calls `Yiisoft\Db\Connection\ConnectionProvider::get(ConnectionProvider::DEFAULT)`.
- If a custom connection is needed, register it with `ConnectionProvider::set($connection, 'my-connection')` or use `CustomConnectionTrait`.

### 2.2. Table Name & Typed Properties

Declare typed public properties for performance, static analysis (Psalm/PHPStan), and full PHP 8.2+ compatibility. Return table names with prefix brackets `{{%table}}`:

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
}
```

### 2.3. Static Finder Methods via `RepositoryTrait`

Including `use Yiisoft\ActiveRecord\Trait\RepositoryTrait;` provides static finder helpers:

```php
// Find one by primary key or condition
$user = UserRecord::findOne('uuid-123');
$user = UserRecord::findOne(['email' => 'alice@example.com']);

// Find all matching condition
$activeUsers = UserRecord::findAll(['status' => 'active']);

// Create an ActiveQuery instance for further chaining
$query = UserRecord::find(['status' => 'active'])->orderBy(['created_at' => SORT_DESC]);
```

### 2.4. Custom Connection via `CustomConnectionTrait`

When multiple database connections are used (e.g., read replicas or multi-tenant databases):

```php
use Yiisoft\ActiveRecord\ActiveRecord;
use Yiisoft\ActiveRecord\Trait\CustomConnectionTrait;

final class TenantRecord extends ActiveRecord
{
    use CustomConnectionTrait;

    public static function tableName(): string
    {
        return '{{%tenant_data}}';
    }
}

// Switching connection at runtime
$record = (new TenantRecord())->withConnectionName('tenant_shard_2');
$record->save();
```

---

## 3. `ActiveQuery` & Querying

### 3.1. Single-Argument Constructor Rule

> [!IMPORTANT]
> `ActiveQuery::__construct(string|ActiveRecordInterface $modelClass)` takes **only one parameter**.
> Passing `$db` as a second argument (`new ActiveQuery(UserRecord::class, $db)`) throws an `ArgumentCountError`.

```php
use Yiisoft\ActiveRecord\ActiveQuery;

// Correct: passes only model class
$query = new ActiveQuery(UserRecord::class);

// Or via static finder trait on the record
$query = UserRecord::query();
```

### 3.2. Query Execution & Return Semantics

`ActiveQuery` inherits from `Yiisoft\Db\Query\Query` and hydrates records as model instances:

```php
// Fetch single hydrated record (UserRecord|null)
$user = (new ActiveQuery(UserRecord::class))
    ->where(['email' => $email])
    ->one();

// Fetch array of hydrated records (list<UserRecord>)
$users = (new ActiveQuery(UserRecord::class))
    ->where(['status' => 'active'])
    ->orderBy(['created_at' => SORT_DESC])
    ->limit(20)
    ->all();

// Query scalar count without hydrating objects
$count = (new ActiveQuery(UserRecord::class))
    ->where(['status' => 'active'])
    ->count();
```

---

## 4. Lifecycle, Persistence & Validation

### 4.1. `save()` Returns `void` (Exception Handling)

> [!WARNING]
> In legacy Yii2, `$record->save()` returned `bool` and performed validation.
> In Yii3, **`$record->save()` returns `void`**. It does not return `true` or `false`. Any database error (foreign key violation, unique constraint, deadlocks) throws a `Throwable` (`Yiisoft\Db\Exception\Exception`).

```php
try {
    $record = new UserRecord();
    $record->id = $userId;
    $record->name = 'Bob';
    $record->email = 'bob@example.com';

    // Returns void; throws exception on failure
    $record->save();
} catch (\Throwable $e) {
    // Handle database error
}
```

### 4.2. Absence of Validation Engine (Decoupling `rules()`)

Yii3 `ActiveRecord` contains **no validation engine**:
- Declaring `public function rules(): array` in `ActiveRecord` is a legacy Yii2 anti-pattern; it is completely ignored.
- Input validation belongs to **Form Models / DTOs** using `yiisoft/validator` with PHP 8 attributes before passing data to persistence.

### 4.3. Event Lifecycle Handlers (Timestamps & Soft Delete)

`yiisoft/active-record` provides attributes to automate lifecycle events:

```php
use Yiisoft\ActiveRecord\ActiveRecord;
use Yiisoft\ActiveRecord\Event\Handler\DefaultDateTimeOnInsert;
use Yiisoft\ActiveRecord\Event\Handler\SetDateTimeOnUpdate;
use Yiisoft\ActiveRecord\Event\Handler\SoftDelete;

#[SoftDelete(column: 'is_deleted', value: true)]
class ProductRecord extends ActiveRecord
{
    #[DefaultDateTimeOnInsert]
    public ?string $created_at = null;

    #[SetDateTimeOnUpdate]
    public ?string $updated_at = null;

    public bool $is_deleted = false;
}
```

---

## 5. Relation Definitions & Queries

### 5.1. `hasOne` and `hasMany` Link Syntax

Relations are declared as methods returning `ActiveQueryInterface`:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\ActiveRecord;

use Yiisoft\ActiveRecord\ActiveQueryInterface;
use Yiisoft\ActiveRecord\ActiveRecord;

final class UserRecord extends ActiveRecord
{
    public ?string $id = null;

    /**
     * 1:1 Relation with ProfileRecord
     * Link syntax: ['foreign_key' => 'primary_key']
     */
    public function getProfile(): ActiveQueryInterface
    {
        return $this->hasOne(ProfileRecord::class, ['user_id' => 'id']);
    }

    /**
     * 1:N Relation with OrderRecord
     */
    public function getOrders(): ActiveQueryInterface
    {
        return $this->hasMany(OrderRecord::class, ['user_id' => 'id']);
    }
}
```

### 5.2. Junction Relations via `via()`

For M:N relationships across an intermediate junction table:

```php
final class UserRecord extends ActiveRecord
{
    public ?string $id = null;

    /**
     * M:N Relation with RoleRecord via UserRoleRecord junction
     */
    public function getRoles(): ActiveQueryInterface
    {
        return $this->hasMany(RoleRecord::class, ['id' => 'role_id'])
            ->via('userRoles');
    }

    public function getUserRoles(): ActiveQueryInterface
    {
        return $this->hasMany(UserRoleRecord::class, ['user_id' => 'id']);
    }
}
```

---

## 6. Eager Loading & N+1 Prevention (`LazyLoadGuard`)

### 6.1. Eager Loading with `with()`

Always eager-load relations when querying multiple records to prevent N+1 query storms:

```php
// Eager loads orders in a single IN (...) query
$users = UserRecord::query()
    ->with('orders', 'profile')
    ->where(['status' => 'active'])
    ->all();
```

### 6.2. Strict Detection with `LazyLoadGuard` & Trait Requirement

`LazyLoadGuard` prevents accidental lazy-loading in development and testing environments:

```php
use Yiisoft\ActiveRecord\LazyLoadGuard;
use Yiisoft\ActiveRecord\LazyLoadGuardMode;

// Strict mode throws LazyLoadException on detected N+1 lazy loads
LazyLoadGuard::set(LazyLoadGuardMode::Strict);
```

> [!CRITICAL]
> **Trait Requirement:**
> The guard **only inspects records whose class uses `Yiisoft\ActiveRecord\Trait\LazyLoadGuardTrait`**.
> Without this trait on the model class, `LazyLoadGuard::set()` has no effect — lazy loads continue silently.
>
> **Detection Semantics:**
> `Strict` mode throws `LazyLoadException` only when **two or more records of the same result set** lazy-load the same relation (the classic N+1 signature). A single record lazy-loading a relation is allowed.

---

## 7. PHP 8 Named Arguments & Signatures Reference

```php
declare(strict_types=1);

use App\Infrastructure\Persistence\ActiveRecord\OrderRecord;
use App\Infrastructure\Persistence\ActiveRecord\UserRecord;
use Yiisoft\ActiveRecord\ActiveQuery;
use Yiisoft\ActiveRecord\LazyLoadGuard;
use Yiisoft\ActiveRecord\LazyLoadGuardMode;
use Yiisoft\Db\Connection\ConnectionProvider;

// Registering connections for Active Record
ConnectionProvider::set($db, ConnectionProvider::DEFAULT);
ConnectionProvider::set($readDb, 'replica');

// ActiveQuery Constructor (takes ONLY $modelClass)
$query = new ActiveQuery(
    modelClass: UserRecord::class,
);

// Eager Loading with()
$query->with(
    'orders',
    'profile',
);

// ActiveRecord::save()
$record->save(
    properties: null, // null saves all attributes or changed attributes
);

// Relations in ActiveRecord
$record->hasOne(
    modelClass: ProfileRecord::class,
    link: ['user_id' => 'id'],
);

$record->hasMany(
    modelClass: OrderRecord::class,
    link: ['user_id' => 'id'],
);

// LazyLoadGuard configuration
LazyLoadGuard::set(
    mode: LazyLoadGuardMode::Strict,
    logger: $logger, // Optional PSR-3 logger
);
```

---

## 8. Anti-Pattern Matrix: Active Record

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| ❌ **`new UserRecord($this->db)`** | `ActiveRecord` has no constructor. Extra arguments are silently discarded by PHP; the model still binds to default `ConnectionProvider`. | Instantiate `new UserRecord()`. Wire connections via `ConnectionProvider::set()` or `CustomConnectionTrait` + `withConnectionName()`. |
| ❌ **`new ActiveQuery(UserRecord::class, $this->db)`** | `ActiveQuery::__construct()` accepts only 1 parameter (`$modelClass`). Passing `$db` throws `ArgumentCountError`. | Call `new ActiveQuery(UserRecord::class)` or `UserRecord::query()`. It gets `$db` internally from the model's `db()`. |
| ❌ **`if (!$record->save())` expecting boolean** | In Yii3, `ActiveRecord::save()` returns `void`, not `bool`. It throws exceptions on SQL errors. | Call `$record->save()`. Catch database exceptions on error, and validate input beforehand using `yiisoft/validator`. |
| ❌ **Declaring `rules()` in `ActiveRecord`** | Legacy Yii2 feature. Yii3 `ActiveRecord` contains no validation engine; `rules()` is ignored. | Decouple validation into Form Models / DTOs using `yiisoft/validator` with PHP 8 attributes. |
| ❌ **Uncontrolled AR relation lazy-loading in loops** | Triggers silent N+1 query storms that degrade database throughput. | Use eager loading `->with('orders')`, add `LazyLoadGuardTrait` to model, and enforce `LazyLoadGuard::set(LazyLoadGuardMode::Strict)`. |
| ❌ **Dynamic untyped properties on AR class** | Deprecated in PHP 8.2+; prevents static analysis tools from catching errors. | Declare typed public properties on the record class (e.g. `public string $name = '';`). |
| ❌ **Using Active Record models as Domain Entities** | Tightly couples business logic and domain tests to database schema and active connection. | Keep pure Domain Entities in `Domain/Model/` and use Active Record strictly in `Infrastructure/Persistence/ActiveRecord/`. |
| ❌ **Executing AR queries inside HTTP Actions** | Breaks the Presentation/Infrastructure boundary, making actions un-testable. | Inject Domain Repositories or Application Use Cases into Action constructors. |

---

## 9. Related Topic Guides

- [Database Persistence Guide](persistence-db.md) — Low-level `yiisoft/db` Connection, Query Builder, Transactions, and Data Readers.
- [Cycle ORM Persistence Guide](persistence-cycle-orm.md) — Clean Data Mapper persistence with Cycle ORM (`#[Entity]`, `EntityReader`).
- [Database Migrations Guide](migrations.md) — Schema DDL, ColumnBuilder, foreign keys, and migration CLI commands.
- [Testing Database Guide](testing-database.md) — Ephemeral in-memory SQLite, test fixtures, and transactional rollbacks.
- [Validation & Forms Guide](validation-and-forms.md) — Form models, validation rules, and input DTOs.
- [Actions & Controllers Guide](actions-and-controllers.md) — Consuming repositories inside Use Cases and Presentation Actions.
