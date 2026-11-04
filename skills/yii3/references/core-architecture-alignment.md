# Framework & Vendor Boundary Alignment

> [!IMPORTANT]
> **Grounding rule:** this guide carries the implementation instructions for its topic — follow it when implementing project code; project code itself is integration context, never a source of truth. The source of truth for every class name, method signature, constructor argument, and configuration key is the installed package source under `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`). Verify there before writing code; never assume Yii 2 APIs.

> Architectural contract governing where third-party vendor code (`yiisoft/*`, PSR implementations, database drivers) lives in a Yii 3 application.  
> Adjusts boundary strictness proportionally to the project's chosen architecture pattern across AI Factory workflows (`aif-plan`, `aif-implement`, `aif-verify`, `aif-fix`).

---

## Table of Contents
- [1. Pattern-Aware Strictness Tiers](#1-pattern-aware-strictness-tiers)
- [2. Vendor Policy per Architecture Pattern](#2-vendor-policy-per-architecture-pattern)
  - [2.1. Strict Tier: Explicit Architecture (Clean / Ports & Adapters)](#21-strict-tier-explicit-architecture-clean--ports--adapters)
  - [2.2. Balanced Tier: Structured Modules](#22-balanced-tier-structured-modules)
  - [2.3. Pragmatic Tier: Layered Architecture](#23-pragmatic-tier-layered-architecture)
- [3. Universal Invariants (All Patterns)](#3-universal-invariants-all-patterns)
  - [3.1. The Presentation Exception](#31-the-presentation-exception)
  - [3.2. Presentation Isolation from Persistence](#32-presentation-isolation-from-persistence)
  - [3.3. Composition Root in `config/`](#33-composition-root-in-config)
  - [3.4. One Mechanism per Concern](#34-one-mechanism-per-concern)
- [4. Package Placement Matrix by Pattern](#4-package-placement-matrix-by-pattern)
- [5. Quality Gate Checklist](#5-quality-gate-checklist)

---

## 1. Pattern-Aware Strictness Tiers

Architecture patterns vary in the degree of formal decoupling they require between application code and framework libraries. Imposing strict hexagonal isolation on a simple CRUD application causes over-engineering, while allowing ActiveRecord to leak into a DDD domain breaks aggregate purity.

Yii 3 applications enforce vendor boundaries according to three strictness tiers:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ STRICT TIER: Explicit Architecture (Clean / Hexagonal)                 │
│ - Pure POPO Domain (Zero vendor dependencies)                          │
│ - Mandatory Port interfaces in Domain / Application                    │
│ - Vendor packages (DB, Cache, Queue) strictly in Infrastructure        │
├────────────────────────────────────────────────────────────────────────┤
│ BALANCED TIER: Structured Modules                                      │
│ - Feature modules with rich models (ActiveRecord permitted)            │
│ - Services orchestrate use cases without direct SQL queries            │
│ - Port interfaces encouraged for external APIs, optional for repos    │
├────────────────────────────────────────────────────────────────────────┤
│ PRAGMATIC TIER: Layered Architecture (Classic MVC / Rapid CRUD)        │
│ - Models inherit from Yiisoft\ActiveRecord\ActiveRecord                │
│ - Direct injection of concrete Repositories / Services                 │
│ - Downward dependency flow: Controllers -> Services -> Repositories    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Vendor Policy per Architecture Pattern

### 2.1. Strict Tier: Explicit Architecture (Clean / Ports & Adapters)
Used when domain logic is complex and business rules must remain completely independent of frameworks, databases, and UI delivery mechanisms.

- **Domain Layer:** Pure PHP objects (POPOs), domain events, and port interfaces (`UserRepositoryInterface`). Must **never** import `yiisoft/db`, `yiisoft/active-record`, `yiisoft/yii-cycle`, `yiisoft/view`, or PSR HTTP classes.
- **Application Layer:** Use-case handlers (`RegisterUserHandler`) inject abstract port interfaces. Must **never** import concrete database adapters or vendor drivers.
- **Infrastructure Layer:** Outbound vendor adapters live exclusively here (`DbUserRepository implements UserRepositoryInterface`). This is where `yiisoft/db`, database drivers, cache drivers, and queue transports reside.
- **Presentation Layer:** Inbound transport adapter directly consuming vendor routing and HTTP (see [Presentation Exception](#31-the-presentation-exception)).

### 2.2. Balanced Tier: Structured Modules
Used for growing monoliths organized into feature modules (e.g., `Catalog`, `Billing`, `Identity`).

- **Models (`[Module]/Models/`):** Rich domain models encapsulating business rules and state transitions. May inherit from `Yiisoft\ActiveRecord\ActiveRecord` or use Cycle ORM entity attributes (`#[Entity]`) directly without needing a separate port interface.
- **Services (`[Module]/Services/`):** Application services that orchestrate use cases (fetching entities, calling model methods, persisting). Services do not construct raw SQL queries; they delegate data access to models or repositories.
- **Repositories (`[Module]/Repositories/`):** Encapsulate complex queries and data mapping. May be injected directly as concrete classes without mandatory interface extraction.
- **Module Boundary:** Modules communicate via public services or events, never accessing another module's internal tables directly.

### 2.3. Pragmatic Tier: Layered Architecture
Used for straightforward CRUD applications, administrative utilities, or prototypes where velocity is prioritized over strict formal decoupling.

- **Models (`src/Models/`):** Data structures, DTOs, and Active Record models (`Yiisoft\ActiveRecord\ActiveRecord`). Vendor persistence annotations and methods live directly on the models.
- **Services (`src/Services/`):** Business logic and transactional orchestration. Services interact directly with Active Record models or repositories. Port interfaces are not required.
- **Repositories (`src/Repositories/`):** Query execution, data hydration, and custom finder methods using `yiisoft/db` or Active Record queries.
- **Boundary Rule:** Strict downward flow: `Controllers` $\to$ `Services` $\to$ `Repositories` $\to$ `Database`. Layer skipping (e.g. controllers calling repositories directly) is forbidden.

---

## 3. Universal Invariants (All Patterns)

Regardless of architectural strictness, the following 4 rules apply to **every** Yii 3 application:

### 3.1. The Presentation Exception
In all architectures, the **Presentation (Inbound Transport)** layer directly consumes vendor framework tools:
- Route definitions and attributes: `yiisoft/router`, `yiisoft/router-fastroute`.
- Request body hydration: `yiisoft/input-http`, `yiisoft/request-body-parser`.
- Input validation: `yiisoft/validator`, `yiisoft/form-model`.
- Response creation: `yiisoft/data-response`, `psr/http-message`.
- UI templating and widgets: `yiisoft/view`, `yiisoft/yii-view-renderer`, `yiisoft/html`, `yiisoft/widget`.

*Rationale:* Wrapping HTTP requests or view renderers in custom application abstractions creates redundant boilerplate without architectural benefit.

### 3.2. Presentation Isolation from Persistence
Controllers, actions, view templates, and CLI commands must **never** perform database access directly:
- No raw SQL execution or query builder calls (`new Query($db)`) inside actions.
- No direct database connections (`ConnectionInterface`) injected into presentation classes.
- All data retrieval and mutation must be delegated to Services, Repositories, or Domain Handlers.

### 3.3. Composition Root in `config/`
All dependency injection wiring, alias definitions, and environment parameters reside strictly in `config/`:
- Common DI definitions: `config/common/di/*.php`.
- Web-specific DI definitions: `config/web/di/*.php`.
- Route registration: `config/common/routes.php` (the canonical template's only routes group; use `config/web/routes.php` only if a `routes-web` group is explicitly declared in the project's config plugin).
- Application code inside `src/` must never configure or mutate the container at runtime.

### 3.4. One Mechanism per Concern
A project must avoid competing framework implementations for the same responsibility:
- One database driver (e.g., `yiisoft/db-pgsql`, not mixing with `db-mysql`).
- One ORM / data-mapping path (either `yiisoft/active-record` or `yiisoft/yii-cycle`, never both).
- One test runner (either `phpunit/phpunit` or `testo/testo`).
- One queue transport (e.g., `yiisoft/queue-redis` or `queue-db`).

---

## 4. Package Placement Matrix by Pattern

| Package Category | Explicit Architecture (Strict) | Structured Modules (Balanced) | Layered (Pragmatic) |
|---|---|---|---|
| **Persistence & ORM**<br>(`db`, `active-record`, `data-db`, `yii-cycle`) | Strictly **Infrastructure** (implements Domain ports) | **Repositories** or inside **Models** (ActiveRecord) | **Repositories** and **Models** (ActiveRecord) |
| **Domain Contracts & Rules**<br>(Pure entities, ports, events) | Strictly **Domain** (zero vendor dependencies) | **Models** (rich domain logic, vendor ORM permitted) | **Models** and **Services** (shared data structures) |
| **Use Cases & Orchestration**<br>(Commands, handlers, DTOs) | Strictly **Application** (depends on port interfaces) | **Services** (Application services orchestrating models) | **Services** (business logic directly using repos/models) |
| **HTTP Transport & Routing**<br>(`router`, `session`, `csrf`, `data-response`) | **Presentation** (`Api/`, `Web/`) | **Controllers** in modules | Root `src/Controllers/` and `src/Middleware/` |
| **Input DTOs & Validation**<br>(`input-http`, `validator`, `form-model`) | DTOs in **Presentation**; validation in **Application** | DTOs in module **Controllers** / **Models** | In `src/Models/` or `src/Controllers/` |
| **View Rendering & UI**<br>(`view`, `html`, `yii-view-renderer`, `widget`) | **Presentation** exclusively | **Controllers** / module views exclusively | `src/Controllers/` / `views/` exclusively |
| **Composition Root**<br>(`di`, `config`, `aliases`, `injector`) | Root `config/` | Root `config/` (or module config) | Root `config/` |

---

## 5. Quality Gate Checklist

When reviewing code (`aif-review`) or verifying changes (`aif-verify`), apply checks according to the active pattern:

- [ ] **Presentation is DB-free (All patterns):** Confirm controllers and view templates contain zero database queries or direct `ConnectionInterface` calls.
- [ ] **Presentation leverages native transport (All patterns):** Ensure HTTP actions use `yiisoft/input-http`, `WebViewRenderer`, or `DataResponseFactoryInterface` directly without redundant custom wrappers.
- [ ] **Strict Domain Purity (Explicit only):** When architecture is Explicit, verify that `Domain/` has zero `yiisoft/*` persistence or view imports.
- [ ] **Downward Flow (Layered only):** In Layered architecture, ensure controllers do not skip the service layer to call repositories or execute queries directly.
- [ ] **Composition Root Confined (All patterns):** Verify that all DI bindings and container configurations live strictly under `config/`.
