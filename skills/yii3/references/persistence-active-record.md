# Yii3 Persistence: Active Record Models & Relations

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Complete guide to `yiisoft/active-record` in modern Yii3 applications, including Clean Architecture separation, hydrator reconstitution, model definitions, query engine, relations, and Anti-Pattern verification.

This topic is split into focused guides — load the one that matches the task:

- [Active Record Models & Lifecycle](persistence-active-record-model.md) — Clean Architecture boundary separation, AR repository implementation, hydrator reconstitution, model definition, typed properties, lifecycle events, mutations, and optimistic locking (§1, §2, §4).
- [Active Record Queries, Pagination & Signatures](persistence-active-record-queries.md) — `ActiveQuery` mechanics, single-argument constructor rule, strict where guards, stream processing, grid pagination & sorting (`QueryDataReader`), and PHP 8 signature reference (§3, §6, §7).
- [Active Record Relations & Eager Loading](persistence-active-record-relations.md) — `relationQuery`, `hasOne`/`hasMany`, pivot tables via `viaTable`, eager loading, and N+1 query prevention (§5).

## 5. Relations, Eager Loading & N+1 Prevention

Active Record relations in Yii 3 are decoupled from magic getters and require explicit query methods:
- **Canonical declaration:** Override `public function relationQuery(string $name): ActiveQueryInterface` using a PHP 8 `match` expression with `$this->hasOne(...)` or `$this->hasMany(...)`.
- **Alternative with traits:** Use `Yiisoft\ActiveRecord\Trait\MagicRelationsTrait` with mandatory `Query` method suffix (e.g. `getProfileQuery()`).
- **Many-to-Many:** Defined via intermediate models (`->via('userRoles')`) or directly through junction tables (`->viaTable('{{%user_role}}', ['user_id' => 'id'])`).
- **Eager Loading:** Always load related records on lists using `$query->with('orders', 'profile')` to prevent N+1 queries. Filter or sort with `joinWith()`.
- **Runtime N+1 Guard:** Enforce `LazyLoadGuard::set(LazyLoadGuardMode::Strict)` combined with `LazyLoadGuardTrait` on record classes.
- **Worker Isolation:** Call `LazyLoadGuard::resetCounters()` in long-running worker loops (RoadRunner / Swoole).

> [!IMPORTANT]
> For the complete, dedicated guide covering relation syntax, nested eager loading, junction tables, `LazyLoadGuard` runtime mechanics, and anti-patterns, see the companion guide:
> **[`persistence-active-record-relations.md`](persistence-active-record-relations.md)**.

---

## 8. Anti-Pattern Matrix: Active Record

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

## 9. Related Topic Guides

- [Active Record Relations & Optimization](persistence-active-record-relations.md) — Relation definitions, `hasOne`/`hasMany`, intermediate junction tables, eager loading, and N+1 prevention.
- [Database Persistence Guide](persistence-db.md) — Low-level `yiisoft/db` Connection, Query Builder, Transactions, and Data Readers.
- [Cycle ORM Persistence Guide](persistence-cycle-orm.md) — Clean Data Mapper persistence with Cycle ORM (`#[Entity]`, `EntityReader`).
- [Database Migrations Guide](persistence-migrations.md) — Schema DDL, ColumnBuilder, foreign keys, and migration CLI commands.
- [Testing Database Guide](testing-database.md) — Ephemeral in-memory SQLite, test fixtures, and transactional rollbacks.
- [Validation & Forms Guide](http-validation-and-forms.md) — Form models, validation rules, and input DTOs.
- [Actions & Controllers Guide](http-actions-and-controllers.md) — Consuming repositories inside Use Cases and Presentation Actions.
- [Events & Listeners Guide](core-events-and-listeners.md) — Active Record lifecycle events (`EventsTrait`, `EventDispatcherProvider`, all 14 event classes).
