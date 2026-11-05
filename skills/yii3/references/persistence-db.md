# Yii3 Persistence: Database, Query Builder & Transactions

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Practical guide for low-level database operations, explicit Query Builder queries, atomic transactions, memory-safe data streaming, and paginated data readers using `yiisoft/db` and `yiisoft/data-db`.
>
> Persistence details belong strictly to the Infrastructure Layer; Domain Entities and Application Use Cases must never execute raw database operations directly.

This topic is split into two focused guides — load the one that matches the task:

- [Connection, Query Builder & Transactions](persistence-db-connection-and-queries.md) — clean-architecture persistence, `CommandInterface` mutations, Query Builder, transaction boundaries & isolation (§1–§4).
- [Data Readers, Pagination & Drivers](persistence-db-readers-and-drivers.md) — `yiisoft/data-db` readers, `OffsetPaginator`/`KeysetPaginator`, driver packages & DSN, PHP 8 named-arguments reference (§5–§7).

Read this file for the anti-pattern matrix (§8) and related guides (§9).

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