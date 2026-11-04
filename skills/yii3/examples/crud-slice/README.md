# Canonical Yii 3 CRUD Vertical Slice

> Minimal reference implementation of a complete vertical feature slice in Yii 3.
> Designed as an immediate template for AI models and developers when generating or refactoring domain features.
>
> **Scope note:** the slice follows the skill's stage contract (bottom-up: Migration → Domain → Persistence → Application → Presentation → Wiring & Tests), but it is intentionally simplified — see [§5 Known Simplifications](#5-known-simplifications) before treating any single file as production advice.

---

## Contents (Table of Contents)
- [1. Overview & Architecture](#1-overview--architecture)
- [2. Directory Layout](#2-directory-layout)
- [3. Layer Contracts & Responsibilities](#3-layer-contracts--responsibilities)
  - [3.1. Migration Layer](#31-migration-layer-migration)
  - [3.2. Domain Layer](#32-domain-layer-domain)
  - [3.3. Persistence Layer](#33-persistence-layer-persistence)
  - [3.4. Application Layer](#34-application-layer-application)
  - [3.5. Presentation Layer](#35-presentation-layer-presentation)
  - [3.6. Configuration Layer](#36-configuration-layer-config)
- [4. Replication Protocol for AI Agents](#4-replication-protocol-for-ai-agents)
- [5. Known Simplifications](#5-known-simplifications)

---

## 1. Overview & Architecture

This slice demonstrates the **Explicit Architecture / Vertical Slice** pattern applied to Yii 3:
- **Clean Architecture Boundaries:** Domain models, domain events, and the repository interface have **zero** dependencies on HTTP, database drivers, or framework internals. The Application layer depends only on the Domain layer and PSR interfaces (`Psr\EventDispatcher\*`) plus `Yiisoft\Db\Connection\ConnectionInterface` as the transaction boundary.
- **Thin Actions:** Action classes handle HTTP orchestration only (request extraction, DTO hydration, validation, command construction, and PSR-7 response composition). They never construct entities, execute SQL queries, or manage transactions directly — that is the use case handler's job.
- **Use Case over Action:** state-changing business processes live in an application-layer handler (`CreatePostHandler`), never in the Action, so the same process can be invoked from HTTP, console, or queue contexts.
- **Post-Commit Event Dispatching:** domain events are recorded inside the aggregate, persisted inside `ConnectionInterface::transaction()`, and dispatched strictly after `transaction()` returns (commit guaranteed). Listeners can never fire for a rolled-back write.
- **Encapsulated Identity:** the entity has no public `setId()`; the repository assigns the database identity once, via `Post::assignId()`, which rejects a second call.
- **Typed Domain:** status is a string-backed enum (`PostStatus`), validated at the edge with `yiisoft/validator`'s `InEnum` rule — no bare status strings cross a layer boundary.
- **Strict Typing:** every file enforces `declare(strict_types=1);` with explicit parameter and return types.
- **PSR-7 & PSR-11 Standards:** strict compliance with PSR-7 HTTP messages and PSR-11 container abstractions.
- **Zero Yii 2 Constructs:** no static facades (`Yii::$app`), no `yii\*` namespaces, and no ActiveForm magic.

---

## 2. Directory Layout

```text
examples/crud-slice/
├── README.md                                 # This reference guide & replication protocol
├── Migration/
│   └── M261026120000CreatePostTable.php      # Reversible DDL migration with ColumnBuilder
├── Domain/
│   ├── Post.php                              # Pure aggregate root: factory methods, assignId() guard, event recording, releaseEvents()
│   ├── PostStatus.php                        # String-backed enum of the publication lifecycle
│   ├── PostCreated.php                       # Immutable domain event DTO (recorded by Post::create())
│   └── PostRepositoryInterface.php           # Domain persistence contract (port)
├── Persistence/
│   └── DbPostRepository.php                  # Infrastructure adapter using yiisoft/db; assigns identity after INSERT
├── Application/
│   ├── CreatePostCommand.php                 # Intent DTO consumed by the handler
│   ├── CreatePostHandler.php                 # Use case: domain checks -> transaction() -> post-commit dispatch
│   └── Listener/
│       └── LogPostCreatedListener.php        # PSR-14 listener (PSR-3 logger)
├── Presentation/
│   ├── CreatePostDto.php                     # Input DTO with #[Required] / #[Length] / #[InEnum] rules
│   ├── CreatePostAction.php                  # Invokable thin POST action (HTTP 201/409/422)
│   └── ViewPostAction.php                    # Invokable thin GET action with CurrentRoute (HTTP 200/400/404)
├── Config/
│   ├── di.php                                # Interface-to-implementation DI mapping (port -> adapter)
│   ├── events.php                            # Declarative PSR-14 event mapping (event class -> listeners)
│   └── routes.php                            # Modern route group with dedicated verb classes
└── Tests/
    ├── CreatePostHandlerTest.php             # Handler unit tests: save -> commit -> dispatch order, rollback, pre-check
    └── Support/
        ├── FakeConnection.php                # ConnectionInterface double: transaction timeline, rollback simulation
        └── SpyPostRepository.php             # PostRepositoryInterface double: save recording, failure & duplicate seeding
```

---

## 3. Layer Contracts & Responsibilities

Dependency direction (outer layers may import inner layers, never the reverse):

```text
Presentation -> Application -> Domain <- Persistence
```

### 3.1. Migration Layer (`Migration/`)
- **File:** `M261026120000CreatePostTable.php`
- **Interfaces:** Implements `RevertibleMigrationInterface` and `TransactionalMigrationInterface`.
- **Naming:** Follows the strict Yii 3 regex `/^(M(\d{12}).*)\.php$/s` (`M<YYMMDDHHMMSS><Name>.php`).
- **Column Definition:** Uses modern `$b->columnBuilder()` methods (`primaryKey()`, `string()`, `text()`, `timestamp()`) rather than raw string definitions.

### 3.2. Domain Layer (`Domain/`)
- **Files:** `Post.php`, `PostStatus.php`, `PostCreated.php`, `PostRepositoryInterface.php`
- **Purity Rule:** Contains **no imports** from `Yiisoft\Db\*`, `Psr\Http\*`, or external libraries.
- **Aggregate Anatomy (`Post.php`):**
  - Private constructor; `Post::create(...)` is the only supported way to create a new post (records the `PostCreated` event inside the aggregate), `Post::restore(...)` is reserved for repository rehydration.
  - `assignId(int $id): void` is the single identity-assignment point; a second call throws `LogicException`. There is no `setId()`.
  - State changes go through intent methods (`update()`, `publish()`, `archive()`), never through setters.
  - `releaseEvents(): list<object>` drains recorded events exactly once — the handler calls it only after the transaction has committed.
- **Event Payload (`PostCreated.php`):** immutable DTO carrying the facts known at creation time (`title`, `status`). The auto-increment identity is deliberately not part of the payload (it does not exist when the event is recorded).
- **Repository Interface:** Declares storage-agnostic domain contracts (`findById()`, `findAll()`, `existsByTitle()`, `save()`, `delete()`). `save()` inserts new aggregates and assigns their identity; updates are performed by mutating the aggregate and persisting it in a later slice stage (see §5).

### 3.3. Persistence Layer (`Persistence/`)
- **File:** `DbPostRepository.php`
- **Contract:** Implements `PostRepositoryInterface`.
- **Dependencies:** Injects `Yiisoft\Db\Connection\ConnectionInterface`.
- **Querying:** Uses `Yiisoft\Db\Query\Query` (`one()`, `all()`, `exists()`) and prepared statement commands (`insert()`, `delete()`).
- **Identity Assignment:** After a successful INSERT, reads `ConnectionInterface::getLastInsertId()` (returns `string`, cast to `int`) and calls `Post::assignId()` — the repository is the only writer of the identity.
- **Hydration:** Maps raw database rows into pure `Post` aggregates via `Post::restore()`; the `status` column is converted with `PostStatus::from()`.

### 3.4. Application Layer (`Application/`)
- **Command (`CreatePostCommand.php`):** readonly intent DTO (`title`, `content`, `PostStatus`); built by the Action from the validated input DTO.
- **Handler (`CreatePostHandler.php`) — strict three-step anatomy:**
  1. **Domain checks** before any write: uniqueness pre-check via `PostRepositoryInterface::existsByTitle()`; failure throws `DomainException` before the transaction is even opened.
  2. **Transaction:** aggregate creation (`Post::create()`, which records the domain event) + `save()` run inside `ConnectionInterface::transaction()`, which commits before it returns and rolls back + re-throws on any `Throwable`.
  3. **Post-commit dispatch:** `releaseEvents()` is drained and each event passed to `Psr\EventDispatcher\EventDispatcherInterface::dispatch()` strictly after `transaction()` has returned — i.e. only after a successful commit.
- **Listener (`Listener/LogPostCreatedListener.php`):** invokable PSR-14 listener resolved and autowired from the DI container; stateless (safe for long-running workers); performs side-effects via constructor-injected `Psr\Log\LoggerInterface`.

### 3.5. Presentation Layer (`Presentation/`)
- **Input DTO (`CreatePostDto.php`):**
  - Uses `Yiisoft\Validator\Rule\Required`, `Length`, `StringValue`, and `InEnum` PHP 8 attributes.
  - `status` is validated against `PostStatus` enum values, so the action's `PostStatus::from()` conversion can never receive an unknown value.
- **Create Action (`CreatePostAction.php`):**
  - Injects `HydratorInterface`, `ValidatorInterface`, `DataResponseFactoryInterface`, and `CreatePostHandler` — nothing else. No repository, no entity construction.
  - Converts parsed body into strongly-typed DTO via `$hydrator->create(CreatePostDto::class, $data)`.
  - Validates input; on failure returns HTTP 422 (`Status::UNPROCESSABLE_ENTITY`) with indexed errors.
  - Builds `CreatePostCommand` and delegates to the handler; a thrown `DomainException` maps to HTTP 409 (`Status::CONFLICT`).
  - On success returns HTTP 201 (`Status::CREATED`) with the persisted aggregate's array representation.
- **View Action (`ViewPostAction.php`):**
  - Injects `CurrentRoute`, `DataResponseFactoryInterface`, and `PostRepositoryInterface` (read-only repository access is acceptable in query actions).
  - Reads route argument via `$currentRoute->getArgument('id')`.
  - Returns HTTP 404 (`Status::NOT_FOUND`) if entity does not exist, or HTTP 200 (`Status::OK`) with entity data.

### 3.6. Configuration Layer (`Config/`)
- **DI (`di.php`):**
  - Returns mapping: `PostRepositoryInterface::class => DbPostRepository::class` (port → adapter).
  - `CreatePostHandler`, `LogPostCreatedListener`, and the actions need no explicit definitions — autowired by `yiisoft/di`; `LoggerInterface` / `EventDispatcherInterface` bindings come from the installed package configurations.
- **Events (`events.php`):**
  - Maps `PostCreated::class => [LogPostCreatedListener::class]` — the declarative PSR-14 format consumed by `yiisoft/yii-event`.
  - In a real application this file lives at `config/common/events.php` and is mapped into the `events` group in `config/configuration.php` (`'events' => 'common/events.php'`), then rebuilt via `composer yii-config-rebuild`.
- **Routes (`routes.php`):**
  - Instantiates modern `Group` and dedicated HTTP verb classes (`Get`, `Post`).
  - Attaches `RequestBodyParser` middleware for JSON body parsing on POST endpoints.
  - Assigns unique route names (`api/post/create`, `api/post/view`).

---

## 4. Replication Protocol for AI Agents

When asked to create a new Yii 3 feature (e.g. `User`, `Product`, `Order`), follow these steps in the skill's strict bottom-up order:
1. Copy the structure of this slice to the project's target feature folder (adjusting namespaces to match target `composer.json` PSR-4 root, e.g. `App\Feature\Product\...`).
2. Generate the migration class with 12-digit timestamp and matching column definitions (reversible `down()`).
3. Write the pure domain aggregate (factory method + `assignId()` guard + event recording), the status/enum value object, the immutable domain event, and the repository interface.
4. Implement the repository adapter using `ConnectionInterface` and `Query`; it assigns identities via the aggregate's guard method.
5. Create the use case command and handler with the strict three-step anatomy: domain checks → `transaction()` → post-commit dispatch. Wire every listener in `config/**/events.php` immediately.
6. Create the input DTO with PHP 8 validator attributes (`InEnum` for enum-backed fields) and the thin single-action invokable class that builds the command and calls the handler.
7. Register the repository port in `config/**/di/*.php` and routes in `config/**/routes.php` the moment the artifacts appear.
8. Write unit tests for the handler proving the invariants: save → commit → dispatch order; no dispatch on rollback; nothing written when a domain check fails.
9. Verify actions with `php scripts/verify-actions.php` and DI with `php scripts/check-di-syntax.php`.

---

## 5. Known Simplifications

This slice is a **teaching template**, not a production blueprint. Honest list of what is simplified and where to look instead:

| # | Simplification | Why | Where to look instead |
|---|---|---|---|
| 1 | `PostCreated` does not carry the database ID | The event is recorded by the aggregate before the auto-increment identity is assigned | Listeners needing the ID can read the persisted aggregate (returned by the handler) or the slice can be extended to enrich events post-assignment |
| 2 | No `update()`/`archive()` persistence path | `save()` inserts new aggregates only; update flows (UPDATE statements) are left out to keep the slice minimal | Add an `update` flow in the repository and a corresponding command/handler pair following the same three-step anatomy |
| 3 | Single listener, logging only | Demonstrates wiring with zero external side-effects | See `references/core-events-and-listeners.md` for mailer/queue listener recipes |
| 4 | No authorization, no user ownership | Keeps the domain pure and focused on the CRUD mechanics | See `references/infra-auth-and-rbac.md` and `references/core-feature-recipes.md` §3 |
| 5 | Uniqueness check is not race-proof | `existsByTitle()` before the transaction does not guard against concurrent inserts under isolation levels that allow phantoms | Enforce a DB-level UNIQUE constraint on `title` in the migration for hard guarantees |
| 6 | Handler test doubles are hand-rolled | Keeps the example dependency-free; a real project would use an ephemeral SQLite connection or a mocking library | See `references/testing-database.md` and `references/testing-core.md` |
| 7 | No error/exception middleware or ProblemDetails rendering | HTTP error mapping is reduced to a single `DomainException` catch | See `references/infra-error-handling.md` |
| 8 | `existsByTitle()` reads all-candidate titles without pagination | Uniqueness pre-check is a scalar `exists()`; listing endpoints in real apps must paginate | See `references/persistence-db.md` (QueryDataReader / `OffsetPaginator`) |
