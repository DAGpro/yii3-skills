# Yii3 Persistence: Active Record Relations, Eager Loading & N+1 Prevention

> **Package:** `yiisoft/active-record` (PHP 8.2+)  
> **Complements:** [`persistence-active-record.md`](persistence-active-record.md) (Core Models, Repositories & Mutations), [`persistence-db-connection-and-queries.md`](persistence-db-connection-and-queries.md), [`infra-state-resetter.md`](infra-state-resetter.md)

---

## Table of Contents

- [1. Architecture & Relation Philosophy](#1-architecture--relation-philosophy)
- [2. Relation Definitions: `relationQuery()` vs `MagicRelationsTrait`](#2-relation-definitions-relationquery-vs-magicrelationstrait)
  - [2.1. Canonical Explicit Pattern (No Magic Traits)](#21-canonical-explicit-pattern-no-magic-traits)
  - [2.2. Magic Relations Trait Alternative (`MagicRelationsTrait`)](#22-magic-relations-trait-alternative-magicrelationstrait)
- [3. Link Syntax for `hasOne` and `hasMany`](#3-link-syntax-for-hasone-and-hasmany)
- [4. Many-to-Many via `via()` and `viaTable()`](#4-many-to-many-via-via-and-viatable)
  - [4.1. Intermediate Active Record Model (`via()`)](#41-intermediate-active-record-model-via)
  - [4.2. Direct Junction Table (`viaTable()`)](#42-direct-junction-table-viatable)
- [5. Filtering & Sorting Relations with `joinWith()`](#5-filtering--sorting-relations-with-joinwith)
- [6. Eager Loading & N+1 Prevention with `with()`](#6-eager-loading--n1-prevention-with-with)
  - [6.1. Eager Loading Basics](#61-eager-loading-basics)
  - [6.2. Nested and Constrained Eager Loading](#62-nested-and-constrained-eager-loading)
- [7. Strict Runtime N+1 Detection with `LazyLoadGuard`](#7-strict-runtime-n1-detection-with-lazyloadguard)
- [8. Long-Running Worker Isolation (RoadRunner / Swoole)](#8-long-running-worker-isolation-roadrunner--swoole)
- [9. PHP 8 Named Arguments & Signatures Reference](#9-php-8-named-arguments--signatures-reference)
- [10. Anti-Pattern Matrix: Relations & Eager Loading](#10-anti-pattern-matrix-relations--eager-loading)
- [11. Related Topic Guides](#11-related-topic-guides)

---

## 1. Architecture & Relation Philosophy

In Yii 3 Active Record, relation discovery does **not** rely on magic getters or implicit reflection by default. All relations return an `ActiveQueryInterface` instance that represents the relation query.

Key architectural rules:
1. **Explicit over implicit:** Relations are defined explicitly by implementing `public function relationQuery(string $name): ActiveQueryInterface` or using `MagicRelationsTrait` with mandatory `Query` method suffix.
2. **Eager loading by default on lists:** Any query retrieving multiple records MUST eager-load related models using `with(...)` to avoid N+1 database queries.
3. **Runtime N+1 enforcement:** Use `LazyLoadGuard` in tests and development environments to catch un-eager-loaded relation access at runtime.

---

## 2. Relation Definitions: `relationQuery()` vs `MagicRelationsTrait`

### 2.1. Canonical Explicit Pattern (No Magic Traits)

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

### 2.2. Magic Relations Trait Alternative (`MagicRelationsTrait`)

If method-based declarations are preferred, import `Yiisoft\ActiveRecord\Trait\MagicRelationsTrait`. Methods **must** be suffixed with `Query`:

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

---

## 3. Link Syntax for `hasOne` and `hasMany`

The `$link` array defines the relation column mapping:
`['related_model_property' => 'this_model_property']`

- **1:1 HasOne (`User` $\rightarrow$ `Profile`):**
  `$this->hasOne(ProfileRecord::class, ['user_id' => 'id'])` (`user_id` on ProfileRecord, `id` on UserRecord).
- **1:1 BelongsTo (`Profile` $\rightarrow$ `User`):**
  `$this->hasOne(UserRecord::class, ['id' => 'user_id'])` (`id` on UserRecord, `user_id` on ProfileRecord).
- **1:N HasMany (`User` $\rightarrow$ `Order`):**
  `$this->hasMany(OrderRecord::class, ['user_id' => 'id'])` (`user_id` on OrderRecord, `id` on UserRecord).

---

## 4. Many-to-Many via `via()` and `viaTable()`

### 4.1. Intermediate Active Record Model (`via()`)

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

### 4.2. Direct Junction Table (`viaTable()`)

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

---

## 5. Filtering & Sorting Relations with `joinWith()`

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

## 6. Eager Loading & N+1 Prevention with `with()`

### 6.1. Eager Loading Basics

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

### 6.2. Nested and Constrained Eager Loading

Relations can be eagerly loaded with sub-conditions and nested levels:

```php
$users = UserRecord::query()
    ->with([
        'profile',
        'orders' => static fn(ActiveQuery $query) => $query->andWhere(['status' => 'paid']),
        'orders.items', // Eager load nested items relation
    ])
    ->all();
```

---

## 7. Strict Runtime N+1 Detection with `LazyLoadGuard`

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

---

## 8. Long-Running Worker Isolation (RoadRunner / Swoole)

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
>
> For container-level worker state safety, see the [Long-Running Worker Safety & StateResetter Guide](infra-state-resetter.md).

---

## 9. PHP 8 Named Arguments & Signatures Reference

```php
// ActiveQueryInterface relation declarations
public function hasOne(string $class, array $link): ActiveQueryInterface;
public function hasMany(string $class, array $link): ActiveQueryInterface;

// ActiveQuery relation chaining
public function via(string $relationName, ?callable $callable = null): static;
public function viaTable(string $tableName, array $link, ?callable $callable = null): static;

// Eager loading and joins
public function with(array|string ...$with): static;
public function joinWith(array|string $with, array|bool $eagerLoading = true, array|string $joinType = 'LEFT JOIN'): static;
public function innerJoinWith(array|string $with, array|bool $eagerLoading = true): static;

// LazyLoadGuard runtime control
public static function set(LazyLoadGuardMode $mode, ?LoggerInterface $logger = null): void;
public static function resetCounters(): void;
public static function reset(): void;
```

---

## 10. Anti-Pattern Matrix: Relations & Eager Loading

| Anti-Pattern | Why It Fails | Idiomatic Yii3 Replacement |
|---|---|---|
| **Iterating records and accessing `$user->orders` without `with()`** | Triggers N individual SQL queries (N+1 query storm), degrading throughput and latency. | Always declare `UserRecord::query()->with('orders')->all()`. Enforce `LazyLoadGuard::set(LazyLoadGuardMode::Strict)`. |
| **Using `getOrders()` without `Query` suffix when using `MagicRelationsTrait`** | `MagicRelationsTrait` strictly expects `get<Name>Query()` methods. Getter without `Query` fails relation discovery. | Name method `public function getOrdersQuery(): ActiveQueryInterface`. |
| **Omitting `LazyLoadGuardTrait` on ActiveRecord model** | `LazyLoadGuard::set(LazyLoadGuardMode::Strict)` does nothing if model does not use `LazyLoadGuardTrait`. | Add `use LazyLoadGuardTrait;` to every Active Record model class. |
| **Calling `LazyLoadGuard::reset()` in long-running worker loops** | `reset()` clears configured `Strict` mode and resets logger to null. | Call `LazyLoadGuard::resetCounters()`, which flushes WeakMap counters while preserving configuration. |
| **Using `hasOne` with inverted link columns** | Link mapping is `['foreign_key_on_related' => 'primary_key_on_current']`. Inverted mapping causes SQL syntax or join errors. | Check: `$this->hasOne(ProfileRecord::class, ['user_id' => 'id'])`. |

---

## 11. Related Topic Guides

- [Active Record Core Models & Mutations](persistence-active-record.md) — Base models, repository contracts, mutations, and ActiveQuery
- [Database Connection & Queries](persistence-db-connection-and-queries.md) — Connection pooling, raw queries, transactions
- [Database Migrations: Schema](persistence-migrations-schema.md) — Creating tables, columns, indexes, foreign keys
- [Long-Running Worker Safety & StateResetter](infra-state-resetter.md) — Resetting state in RoadRunner/Swoole/FrankenPHP workers
