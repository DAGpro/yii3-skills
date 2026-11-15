# Yii3 Persistence: Database, Query Builder & Transactions

> **Grounding:** APIs in `vendor/yiisoft/<pkg>/src/`, patterns in this guide, conventions in architecture artifact (SKILL.md Core rule 2).

> Practical guide for low-level database operations, explicit Query Builder queries, atomic transactions, memory-safe data streaming, and paginated data readers using `yiisoft/db` and `yiisoft/data-db`.
>
> Persistence details should remain isolated from business logic; keep database operations within dedicated repositories or data mappers.

This topic is split into two focused guides — load the one that matches the task:

- [Connection, Query Builder & Transactions](persistence-db-connection-and-queries.md) — repository implementation, `CommandInterface` mutations, Query Builder, transaction boundaries & isolation (§1–§4).
- [Data Readers, Pagination & Drivers](persistence-db-readers-and-drivers.md) — `yiisoft/data-db` readers, `OffsetPaginator`/`KeysetPaginator`, driver packages & DSN, PHP 8 named-arguments reference (§5–§7).

Read this file for the anti-pattern matrix (§8) and related guides (§9).

### Choosing Your Persistence Paradigm: Active Record vs Cycle ORM vs DBAL Query Builder

- **Existing codebase (features and fixes):** Never mix persistence engines within the same bounded context. Inspect `composer.json` and follow the active engine (`yiisoft/active-record`, `cycle/orm`, or raw `yiisoft/db`).
- **New project bootstrap:** Choose strictly one primary persistence paradigm based on domain complexity and operational runtime:

| Persistence Strategy | Primary Packages | Architectural Sweet Spot | Choose when… | Trade-offs & Caveats |
|---|---|---|---|---|
| **1. Active Record** | `yiisoft/active-record`<br>`yiisoft/db` | **Pragmatic** (`layers`) & **Balanced** (`structured*`) | Standard web apps, rapid CRUD, admin panels, teams transitioning from Yii 2/Laravel, where entity models closely match database tables. | Coupling between DB schema and model; no Unit of Work (each `save()` executes SQL immediately); higher memory than DBAL; requires `LazyLoadGuard` to avoid N+1 queries. |
| **2. Cycle ORM Data Mapper** | `cycle/orm`<br>`cycle/annotated`<br>`yiisoft/yii-cycle`<br>`yiisoft/data-cycle` | **Strict** (`explicit*`) & **Balanced** (`structured*`) | Complex business domains, strict DDD (pure POPO entities), rich object graphs, multi-entity atomic transactions via Unit of Work. | Higher conceptual complexity; uses external `cycle/*` ecosystem; requires compiled schema in production (`php yii cycle:schema:php`); **mandatory** `$entityManager->clean()` in long-running workers (RoadRunner/FrankenPHP) to prevent heap leaks. |
| **3. Raw DBAL & Query Builder** | `yiisoft/db`<br>`yiisoft/data-db`<br>`yiisoft/hydrator` | **Strict** (`explicit*`) or **High-Throughput Services** | High-performance APIs, microservices, read-heavy reporting/dashboards, or batch data ingestion pipelines. | Maximum execution speed and minimal memory footprint; zero ORM overhead; requires explicit manual SQL mapping or `yiisoft/hydrator` boilerplate; no automatic relationship resolution. |

### Query Engines Comparison: Hydration, Performance & Memory

| Metric / Feature | `Yiisoft\Db\Query\Query` | `Yiisoft\ActiveRecord\ActiveQuery` | `Cycle\ORM\Select` |
|---|---|---|---|
| **Return Type (`one()`)** | `array<string, mixed>\|null` | `ActiveRecordInterface\|null` (or array with `asArray()`) | Entity POPO / Proxy `object\|null` |
| **Return Type (`all()`)** | `list<array<string, mixed>>` | `list<ActiveRecordInterface>` | `list<object>` |
| **Hydration Mechanism** | None (raw PDO rows) or via `yiisoft/hydrator` | Instantiates model class, assigns attributes, tracks old state | Cycle Hydrator assigns properties directly or via reflection |
| **Identity Map (Deduplication)** | ❌ No | ❌ No (queries instantiate duplicate objects) | ✅ Yes (`Cycle\ORM\Heap` deduplicates by PK) |
| **Change Tracking** | ❌ None | Attribute array diff (`getDirtyAttributes()`) | Unit of Work state engine |
| **Eager Loading Relations** | Manual SQL `JOIN` | `->with('relation1', 'relation2')` | `->load('relation1')` |
| **Memory Footprint (10k rows)**| **Minimal (~2–4 MB)** | **Moderate (~15–25 MB)** | **High (~30–50 MB)** |
| **Data Reader Package** | `yiisoft/data-db` (`QueryDataReader`) | `yiisoft/data-db` (`QueryDataReader`) | `yiisoft/data-cycle` (`EntityReader`) |
| **Worker Safety Requirement** | Safe (stateless) | Call `LazyLoadGuard::resetCounters()` if strict | **Mandatory** `$entityManager->clean()` |

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
| ❌ **Dispatching events/queues inside `$db->transaction()`** | If transaction rolls back, side effects (emails, messages) cannot be revoked. | Collect domain events on the aggregate and dispatch strictly post-commit — see [Events & Listeners Guide, §5](core-events-design.md#5-mandatory-post-commit-event-dispatching-rule). |
| ❌ **Executing DB queries inside HTTP Actions** | Couples HTTP transport directly to SQL, making actions brittle and difficult to test. | Inject repository or query interfaces into Action constructors. |
| ❌ **Raw SQL concatenation (`WHERE id = ' . $id`)** | Severe SQL injection vulnerability. | Always use parameter binding (`[':id' => $id]`) or Query Builder condition arrays (`['id' => $id]`). |
| ❌ **Hardcoding table names as plain strings `'user'`** | Prevents automatic table prefixing (`tbl_user`) and schema quoting. | Always use table prefix brackets: `'{{%user}}'`. Wrap column identifiers in `[[column]]`. |
| ❌ **Multi-table mutations without a transaction** | Partial failure leaves the database in an inconsistent or orphaned state. | Always wrap multi-repository updates in `$db->transaction(...)`. |

---

## 9. Related Topic Guides

- [Active Record Persistence Guide](persistence-active-record.md) — Active Record models, relations, lifecycle, and LazyLoadGuard.
- [Cycle ORM Persistence Guide](persistence-cycle-orm.md) — Clean Data Mapper persistence with Cycle ORM (`#[Entity]`, `EntityReader`).
- [Database Migrations Guide](persistence-migrations.md) — Schema DDL, ColumnBuilder, foreign keys, and migration CLI commands.
- [Testing Database Guide](testing-database.md) — Ephemeral in-memory SQLite, test fixtures, and transactional rollbacks.
- [Actions & Controllers Guide](http-actions-and-controllers.md) — Consuming repositories and data queries in HTTP actions.
- [Caching Guide](persistence-caching.md) — Application-level PSR-16 caching (`getOrSet()`), stampede prevention, and tag-based invalidation.
- [Events & Listeners Guide](core-events-and-listeners.md) — Domain events, the aggregate event-recording pattern, and the post-commit dispatch rule.