# Framework & Vendor Boundary Alignment

> **Grounding:** APIs in `vendor/yiisoft/<pkg>/src/`, patterns in this guide, conventions in architecture artifact (SKILL.md Core rule 2).

> Architectural contract governing where third-party vendor code (`yiisoft/*`, PSR implementations, database drivers) lives in a Yii 3 application.  
> Adjusts boundary strictness proportionally to the project's chosen architecture pattern across implementation, review, and verification workflows.

This guide is the authority for **project conventions** (layout, layer placement, composition-root location) — row 3 of the source-of-truth split in SKILL.md Core rule 2. When the project's existing layout or naming differs from the pattern described here and violates no correctness rule, new code continues the project's style and records the divergence; correctness violations (e.g. database access inside presentation) are always fixed per the Universal Invariants in §3.

---

## Table of Contents
- [1. Pattern-Aware Boundary Isolation](#1-pattern-aware-boundary-isolation)
- [2. Vendor Policy per Architecture Pattern](#2-vendor-policy-per-architecture-pattern)
  - [2.1. Explicit Architecture (Clean / Ports & Adapters)](#21-explicit-architecture-clean--ports--adapters)
  - [2.2. Structured Modules](#22-structured-modules)
  - [2.3. Layered Architecture](#23-layered-architecture)
- [3. Universal Invariants (All Patterns)](#3-universal-invariants-all-patterns)
  - [3.1. The Presentation Exception](#31-the-presentation-exception)
  - [3.2. Presentation Isolation from Persistence](#32-presentation-isolation-from-persistence)
  - [3.3. Composition Root in `config/`](#33-composition-root-in-config)
  - [3.4. One Mechanism per Concern](#34-one-mechanism-per-concern)
  - [3.5. Application Layer: Use Case Handlers vs Application Services](#35-application-layer-use-case-handlers-vs-application-services)
  - [3.6. Pre-existing Code & Starter Scaffolding Policy](#36-pre-existing-code--starter-scaffolding-policy)
- [4. Package Placement Matrix by Pattern](#4-package-placement-matrix-by-pattern)
- [5. Quality Gate Checklist](#5-quality-gate-checklist)
- [6. Step-by-Pattern Execution Matrix](#6-step-by-pattern-execution-matrix)
  - [Repository & Persistence Patterns Across Architecture Patterns](#repository--persistence-patterns-across-architecture-patterns)

---

## 1. Pattern-Aware Boundary Isolation

Architecture patterns vary in the degree of formal decoupling they require between application code and framework libraries. Imposing strict hexagonal isolation on a simple CRUD application causes over-engineering, while allowing ActiveRecord to leak into a DDD domain breaks aggregate purity.

The three canonical architecture patterns map directly to three vendor boundary isolation strategies in modern Yii 3:

| Architecture Pattern | Pattern Aliases | Boundary Isolation Level | Core Invariants |
|---|---|---|---|
| **Explicit Architecture** | `explicit`, `explicit-layers`, `explicit-vertical`, `explicit-flat` (aliases: `clean`, `ddd`, `vertical`) | Pure Domain Isolation | Pure POPO Domain; mandatory port interfaces; vendor packages strictly in Infrastructure. |
| **Structured Modules** | `structured`, `structured-layers`, `structured-vertical` (alias: `monolith`) | Module Boundary Encapsulation | Feature modules (`src/<Module>/`); rich models (ActiveRecord permitted); services orchestrate without direct SQL; interfaces at boundaries. |
| **Layered Architecture** | `layers` | Layered Downward Flow | Horizontal layers (`src/Controllers/`, `src/Services/`, `src/Models/`, `src/Repositories/`); downward flow; concrete injection. |

```text
┌────────────────────────────────────────────────────────────────────────┐
│ EXPLICIT ARCHITECTURE (Clean / Hexagonal)                              │
│ - Pure POPO Domain (Zero vendor dependencies)                          │
│ - Mandatory Port interfaces in Domain / Application                    │
│ - Vendor packages (DB, Cache, Queue) strictly in Infrastructure        │
├────────────────────────────────────────────────────────────────────────┤
│ STRUCTURED MODULES (Feature Modules)                                   │
│ - Feature modules with rich models (ActiveRecord permitted)            │
│ - Services orchestrate use cases without direct SQL queries            │
│ - Port interfaces encouraged for external APIs, optional for repos    │
├────────────────────────────────────────────────────────────────────────┤
│ LAYERED ARCHITECTURE (Classic MVC / Rapid CRUD)                        │
│ - Models inherit from Yiisoft\ActiveRecord\ActiveRecord                │
│ - Direct injection of concrete Repositories / Services                 │
│ - Downward dependency flow: Controllers -> Services -> Repositories    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Vendor Policy per Architecture Pattern

### 2.1. Explicit Architecture (Clean / Ports & Adapters)
Corresponds to pattern alias `explicit` (`explicit-layers`, `explicit-vertical`, `explicit-flat`). Used when domain logic is complex and business rules must remain completely independent of frameworks, databases, and UI delivery mechanisms.

- **Domain Layer:** Pure PHP objects (POPOs), domain events, and port interfaces (`UserRepositoryInterface`). Must **never** import `yiisoft/db`, `yiisoft/active-record`, `yiisoft/yii-cycle`, `yiisoft/view`, or PSR HTTP classes.
- **Application Layer:** Use-case handlers (`RegisterUserHandler`) inject abstract port interfaces. Must **never** import concrete database adapters or vendor drivers.
- **Infrastructure Layer:** Outbound vendor adapters live exclusively here (`DbUserRepository implements UserRepositoryInterface`). This is where `yiisoft/db`, database drivers, cache drivers, and queue transports reside.
- **Presentation Layer:** Inbound transport adapter directly consuming vendor routing and HTTP (see [Presentation Exception](#31-the-presentation-exception)).
- **Vertical Slice Subfolder Grouping Rule:** When using vertical slices (including `explicit-flat`), avoid flat-dumping dozens of thin actions, DTOs, and handlers into the root entity folder. Because modern Yii 3 mandates Single-Action classes and dedicated DTOs/handlers, group each use case into its own cohesive feature subfolder inside the slice (`src/<Context>/<Entity>/<FeatureName>/` containing `<FeatureName>Action.php`, `<FeatureName>Dto.php`, `<FeatureName>Handler.php`) per [Feature Recipes, §5 Style 1](core-feature-recipes.md#style-1-vertical-slice-feature-based-common-in-modern-yii3-apps).

### 2.2. Structured Modules
Corresponds to pattern alias `structured` (`structured-layers`, `structured-vertical`). Used for growing monoliths organized into feature modules (e.g., `Catalog`, `Billing`, `Identity`).

- **Models (`[Module]/Models/`):** Rich domain models encapsulating business rules and state transitions. May inherit from `Yiisoft\ActiveRecord\ActiveRecord` or use Cycle ORM entity attributes (`#[Entity]`) directly without needing a separate port interface.
- **Services (`[Module]/Services/`):** Application services that orchestrate use cases (fetching entities, calling model methods, persisting). Services do not construct raw SQL queries; they delegate data access to models or repositories.
- **Repositories (`[Module]/Repositories/`):** Encapsulate complex queries and data mapping. May be injected directly as concrete classes without mandatory interface extraction.
- **Module Boundary:** Modules communicate via public services or events, never accessing another module's internal tables directly.

### 2.3. Layered Architecture
Corresponds to pattern alias `layers`. Used for straightforward CRUD applications, administrative utilities, or prototypes where velocity is prioritized over strict formal decoupling.

- **Models (`src/Models/`):** Data structures, DTOs, and Active Record models (`Yiisoft\ActiveRecord\ActiveRecord`). Vendor persistence annotations and methods live directly on the models.
- **Services (`src/Services/`):** Business logic and transactional orchestration. Services interact directly with Active Record models or repositories. Port interfaces are not required.
- **Repositories (`src/Repositories/`):** Query execution, data hydration, and custom finder methods using `yiisoft/db` or Active Record queries.
- **Boundary Rule:** Strict downward flow: `Controllers` $\to$ `Services` $\to$ `Repositories` $\to$ `Database`. Layer skipping (e.g. controllers calling repositories directly) is forbidden.

---

## 3. Universal Invariants (All Patterns)

Regardless of architectural strictness, the following 4 rules apply to **every** Yii 3 application:

### 3.1. The Presentation Exception
In all architectures, the **Presentation (Inbound Transport)** layer directly consumes vendor framework tools:
- Route definitions and attributes: `yiisoft/router`, `yiisoft/router-fastroute` (or optional `yiisoft/file-router`).
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
All dependency injection wiring, alias definitions, and environment parameters are rooted strictly in `config/` (follow the project's chosen organization per [Configuration Architecture & Parameters, §2.6](core-config-tree.md#26-choosing-how-to-organize-application-configs); template default is `config/common/di/*.php` and `config/web/di/*.php`):
- Route registration: follow the project's routing style ([Routing Guide](http-routes-definition.md#choosing-how-to-route-http-requests); template default is `config/common/routes.php`, or `config/web/routes.php` when `routes-web` is explicitly declared; optional `FileRouter` middleware).
- Application code inside `src/` must never configure or mutate the container at runtime.

### 3.4. One Mechanism per Concern
A project must avoid competing framework implementations for the same responsibility:
- One database driver (e.g., `yiisoft/db-pgsql`, not mixing with `db-mysql`).
- One ORM / data-mapping path (either `yiisoft/active-record` or `yiisoft/yii-cycle`, never both).
- One test runner (either `phpunit/phpunit` or `testo/testo`).
- One queue transport (e.g., `yiisoft/queue-redis` or `queue-db`).

### 3.5. Application Layer: Use Case Handlers vs Application Services

In Yii 3 architectures, **Application Service** and **Use Case Handler** are two structural representations of the same Application Layer:

- **Explicit Architecture:** Prefers single-responsibility **Use Case Handlers** (`CreateUserHandler`, `CheckoutHandler`) where each business action or command is isolated into its own class. This guarantees strict CQRS compliance and decoupled domain port dependencies.
- **Structured Modules & Layered Architecture:** Cohesive **Application Services** (`UserService`, `CatalogService` grouping related entity workflows) or Use Case Handlers are equally valid. In standard feature decomposition, application services may directly consume concrete repositories when domain aggregate abstractions collapse.
- **Presentation Layer Boundary Invariant:** Regardless of architectural pattern or isolation level, HTTP Actions (`*Action`) and Console Commands (`*Command`) belong strictly to the **Presentation Layer**. They orchestrate transport concerns (request parsing, typed DTO validation, status code mapping, response wrapping, or CLI formatting) and delegate to the Application Layer. **Presentation never acts as an Application Service and must never absorb database persistence, raw SQL, or transaction boundaries.**

### 3.6. Pre-existing Code & Starter Scaffolding Policy

When generating or evaluating the project's architecture artifact (`.ai-factory/ARCHITECTURE.md` or `docs/architecture/`), the document establishes the authoritative **target architecture** for all business features. Existing files (whether from starter templates such as `yiisoft/app*` or pre-existing project code) must not distort this target architecture.

Starter templates (`yiisoft/app`, `yiisoft/app-api`, `yiisoft/app-console`) provide baseline scaffolding typically arranged by transport (`src/Web/`, `src/Api/`, `src/Console/`) with basic entry points (e.g., `Index.php`, `SiteController.php`, view layouts, error handlers). When analyzing or generating project architecture (`aif-architecture` or standalone), the model MUST NOT confuse these transport directories with Bounded Contexts or business modules, and MUST present clear architectural strategies for handling them.

In `ARCHITECTURE.md`, pre-existing code that differs from the target pattern is explicitly qualified under one of four strategies:

#### Strategy 1: Isolated Quarantine (Default path under `## Legacy vs New Code Policy`)
- Pre-existing files that do not follow the target pattern are explicitly acknowledged as legacy or pre-architectural code.
- **New features** MUST strictly follow the target architecture (e.g., feature modules in Structured Modules, bounded contexts in Explicit Architecture, or horizontal layers in Layered Architecture).
- **Existing code** is preserved without forced automatic rewrites; new code interacts with it via adapters, interfaces, or public services.

#### Strategy 2: Dedicated Root Context (`src/Main/` or `src/Home/`) & The Anti-Dumping Invariant
- **Intent:** Encapsulate general website presentation and landing scaffolding into a dedicated, cohesive context.
- **Permitted Contents:**
  - Root landing action (e.g., `IndexAction` serving the public homepage).
  - General public static pages (e.g., About, Contact, Terms of Service) without complex domain operations.
  - Root presentation layout (e.g., `layout/main.php`) and site-wide UI widgets.
  - Global web exception/error handler action.
- **CRITICAL: The Anti-Dumping Invariant ("Anti-Junk-Drawer Rule"):**
  - The `Main` (or `Home`) context is strictly a top-level presentation and site-framing root context.
  - **It must NEVER become a "junk drawer" (dumping ground, God-module, or misc context) for code that does not have an obvious home.**
  - ❌ **Forbidden in `Main`:** Domain entities, database persistence, domain event handlers, repositories, application services, or business workflows (such as user authentication, profile management, product catalog, cart, payments, orders).
  - ❌ **Boundary Discipline:** If an action, service, or model manages business state or domain data, it MUST be isolated into its own dedicated feature module or bounded context (`src/User/`, `src/Catalog/`, `src/Order/`).
  - **Disambiguation Rule:** If an agent or developer is unsure where a new business requirement belongs, they MUST create a new focused Bounded Context / Feature Module rather than adding it to `Main`.

#### Strategy 3: Global Web-Shell (Presentation Layer Envelope)
- **Intent:** Treat template scaffolding not as domain modules or technical infrastructure, but as the **Global Web-Shell** (presentation layer envelope) of the application.
- **Rule:** Common view layouts (`layout/main.php`), system error renderers (404/500 handlers), site navigation (header/footer menus), asset bundles, and top-level HTTP middlewares reside in `src/Shared/Web/` (or `src/Web/` designated as the global presentation shell).
- **Presentation Layer Identity:** The web-shell belongs strictly to the **Presentation Layer** — it is NOT an infrastructure component. It provides the visual and transport container that wraps responses produced by business modules.
- **Domain Decoupling:** Business feature modules (`src/<Module>/`) provide their own internal views or response payloads, while the Global Web-Shell provides the overarching application shell and layout scaffolding.

#### Strategy 4: Strangler Fig Migration (On-demand refactoring)
- Legacy endpoints remain in their initial paths until a planned feature modifies or expands their domain area. At that point, the legacy action is extracted and rebuilt inside the target architecture module.

---

## 4. Package Placement Matrix by Pattern

| Package Category | Explicit Architecture | Structured Modules | Layered Architecture |
|---|---|---|---|
| **Persistence & ORM**<br>(`db`, `active-record`, `data-db`, `yii-cycle`) | Strictly **Infrastructure** (implements Domain ports) | **Repositories** or inside **Models** (ActiveRecord) | **Repositories** and **Models** (ActiveRecord) |
| **Domain Contracts & Rules**<br>(Pure entities, ports, events) | Strictly **Domain** (zero vendor dependencies) | **Models** (rich domain logic, vendor ORM permitted) | **Models** and **Services** (shared data structures) |
| **Use Cases & Orchestration**<br>(Commands, handlers, DTOs) | Strictly **Application** (depends on port interfaces) | **Services** (Application services orchestrating models) | **Services** (business logic directly using repos/models) |
| **HTTP Transport & Routing**<br>(`router`, `session`, `csrf`, `data-response`) | **Presentation** (`Api/`, `Web/`) | **Controllers** in modules | Root `src/Controllers/` and `src/Middleware/` |
| **Input DTOs & Validation**<br>(`input-http`, `validator`, `form-model`) | DTOs in **Presentation**; validation in **Application** | DTOs in module **Controllers** / **Models** | In `src/Models/` or `src/Controllers/` |
| **View Rendering & UI**<br>(`view`, `html`, `yii-view-renderer`, `widget`) | **Presentation** exclusively | **Controllers** / module views exclusively | `src/Controllers/` / `views/` exclusively |
| **Composition Root**<br>(`di`, `config`, `aliases`, `injector`) | Root `config/` ([§3.3](#33-composition-root-in-config)) | Root `config/` ([§3.3](#33-composition-root-in-config)) | Root `config/` ([§3.3](#33-composition-root-in-config)) |

---

## 5. Quality Gate Checklist

When reviewing code or verifying changes (`aif-review`, `aif-verify`, or standalone self-verification), apply checks according to the active pattern:

- [ ] **Presentation is DB-free (All patterns):** Confirm controllers and view templates contain zero database queries or direct `ConnectionInterface` calls.
- [ ] **Presentation leverages native transport (All patterns):** Ensure HTTP actions use `yiisoft/input-http`, `WebViewRenderer`, `DataResponseFactoryInterface` (including self-contained `JsonResponseFactory`), or PSR-17 `ResponseFactoryInterface` directly without redundant custom wrappers.
- [ ] **Strict Domain Purity (Explicit only):** When architecture is Explicit, verify that `Domain/` has zero `yiisoft/*` persistence or view imports.
- [ ] **Downward Flow (Layered only):** In Layered architecture, ensure Actions and Controllers do not skip the service layer to call repositories or execute queries directly.
- [ ] **Composition Root Confined (All patterns):** Verify that all DI bindings and container configurations live strictly under `config/`.

---

## 6. Step-by-Pattern Execution Matrix

| Assembly Step | Layered Architecture (`layers`) | Structured Modules (`structured*`) | Explicit Architecture (`explicit*`) |
|---|---|---|---|
| **1. Schema & Migration** | `yiisoft/db-migration` (or `cycle/migrations`) with reversible `down()` | `yiisoft/db-migration` (or `cycle/migrations`) with reversible `down()` | `yiisoft/db-migration` (or `cycle/migrations`) with reversible `down()` |
| **2. Persistence & Boundary** | Validated Model / Entity (POPO, Active Record, or Cycle entity); repository only when needed (no mandatory port interface) | Module Entity / Rich Model (Active Record / Cycle permitted); module-boundary interfaces | Pure Aggregate + Value Objects (zero vendor imports); PSR-14 domain events; explicit `*RepositoryInterface` + `Sql*Repository` adapter |
| **3. Application & Domain** | Cohesive Application Service orchestrating transactions & persistence | Module Service or Use Case Handler + transaction boundary | Dedicated single-responsibility Use Case Handler (`*Command` + `*Handler`) + post-commit PSR-14 events |
| **4. Transport & Entry Point** | Typed Input DTO + thin Action delegating to Application Service | Typed Input DTO + thin Action delegating to Module Service / Use Case | Typed Input DTO + thin Action delegating to Use Case Handler |
| **5. Immediate Wiring** | Root `config/` (DI, routes, console commands, events) | Root `config/` (or module config) | Root `config/` (port interface bindings, routes, commands, events) |
| **Finale — Tests & DoD** | Unit tests (Service) + functional/HTTP tests | Module unit & functional tests | Domain/Use Case unit tests + adapter integration + HTTP tests |

### Repository & Persistence Patterns Across Architecture Patterns

| Architecture Pattern | Active Record Pattern | Cycle ORM Pattern | DBAL Query Builder Pattern |
|---|---|---|---|
| **Layered Architecture** (`layers`) | Rich `UserRecord extends ActiveRecord` in `src/Models/` with static finders (`RepositoryTrait`) or concrete `UserRepository` (no interface). | Annotated `User` entity (`#[Entity]`) in `src/Models/` with concrete `UserRepository` injecting `EntityManagerInterface`. | Concrete `UserRepository` in `src/Repositories/` using `Query` and returning associative arrays or DTOs. |
| **Structured Modules** (`structured*`) | Module model in `src/<Module>/Models/UserRecord.php`. Encapsulated in module `UserRepository` without cross-module leakage. | Module entity in `src/<Module>/Entities/User.php` with `#[Entity]`. Persistence handled by module service/repository. | Module persistence adapter in `src/<Module>/Infrastructure/DbUserRepository.php`. |
| **Explicit Architecture** (`explicit*`) | Pure POPO `Domain\Model\User` + `Domain\Repository\UserRepositoryInterface`. Adapter `ArUserRepository` in `Infrastructure/` maps to/from `UserRecord`. | Pure POPO `User` in `Domain/` with external compiled schema in `Infrastructure/` (or pure annotated entity if attributes allowed). | Pure POPO `Domain\Model\User` + `UserRepositoryInterface`. Adapter `DbUserRepository` in `Infrastructure/` hydrates via `HydratorInterface`. |
