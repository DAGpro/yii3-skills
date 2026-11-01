# Architecture Alignment & Structural Conventions

> Decides WHERE code and configuration land. Enforces dependency boundaries and package placement across AI Factory workflows: `aif-plan`, `aif-implement`, `aif-improve`, `aif-fix`, `aif-review`, and `aif-verify`.

---

## Table of Contents
- [1. Resolve the Architecture Source (in this order)](#1-resolve-the-architecture-source-in-this-order)
- [2. Map Yii 3 Artifacts onto the Architecture](#2-map-yii-3-artifacts-onto-the-architecture)
- [3. Conflicts and Architecture Drift](#3-conflicts-and-architecture-drift)
- [4. Pattern Placement Tables (aif-architecture)](#4-pattern-placement-tables-aif-architecture)
  - [4.1. Pattern → Folder Structure](#41-pattern--folder-structure)
  - [4.2. Package Categories → Placement per Pattern](#42-package-categories--placement-per-pattern)
  - [4.3. Dependency Rules per Pattern](#43-dependency-rules-per-pattern)
  - [4.4. Universal Dependency Invariants (All Patterns)](#44-universal-dependency-invariants-all-patterns)
  - [4.5. Reference: Responsibility → Package Categories](#45-reference-responsibility--package-categories)
- [5. Multi-Placement & Shared Packages Disambiguation](#5-multi-placement--shared-packages-disambiguation)
  - [5.1. `yiisoft/aliases`: Composition Root vs. Infrastructure](#51-yiisoftaliases-composition-root-vs-infrastructure)
  - [5.2. `yiisoft/data-response`: Presentation vs. Application](#52-yiisoftdata-response-presentation-vs-application)
  - [5.3. `yiisoft/profiler`: Infrastructure vs. Dev/QA Tooling](#53-yiisoftprofiler-infrastructure-vs-devqa-tooling)
- [6. Anti-Hallucination & Framework Guardrails](#6-anti-hallucination--framework-guardrails)
  - [6.1. Yii 2 vs. Yii 3 Critical Invariants](#61-yii-2-vs-yii-3-critical-invariants)
  - [6.2. Non-Existent & Deprecated APIs](#62-non-existent--deprecated-apis)
- [7. Canonical Vertical Slice Reference (`UserManagement`)](#7-canonical-vertical-slice-reference-usermanagement)
  - [7.1. Directory Structure](#71-directory-structure)
  - [7.2. Domain Layer (Pure Entities, Ports, Events)](#72-domain-layer-pure-entities-ports-events)
  - [7.3. Application Layer (Commands & Handlers)](#73-application-layer-commands--handlers)
  - [7.4. Infrastructure Layer (Persistence Adapters)](#74-infrastructure-layer-persistence-adapters)
  - [7.5. Presentation Layer (Controllers, Requests, Views)](#75-presentation-layer-controllers-requests-views)
  - [7.6. Configuration & Composition Root Wiring](#76-configuration--composition-root-wiring)

---

## 1. Resolve the Architecture Source (in this order)

Before creating, moving, or refactoring files, agents must identify the project's governing architectural authority using the following strict hierarchy:

1. **Architecture Artifact (`.ai-factory/ARCHITECTURE.md`)**:
   - Base AI Factory workflows (`aif-plan`, `aif-implement`) load this file automatically.
   - Default path: `.ai-factory/ARCHITECTURE.md` (or the path defined in `paths.architecture` inside `.ai-factory/config.yaml`).
   - If present, it is the **supreme authority** for folder structure, layer boundaries, dependency directions, and naming schemes.
2. **Project Rules (`paths.rules_file`, `rules.<area>`, `AGENTS.md`)**:
   - Loaded by base skills; project rules refine and override extension defaults whenever they are explicit.
3. **Existing Codebase Layout (`src/` and `config/`)**:
   - If no architecture artifact exists, the project's actual folder tree is the governing authority.
   - Inspect 2–3 existing, similar features (e.g., an action, its input DTO, its service/repository, its route and DI definitions) and replicate their layout, naming, namespaces, and wiring.
4. **Fallback Conventions ([Conventions](conventions.md))**:
   - Used only for structural gaps not addressed by the sources above, or when bootstrapping an empty project.

> [!TIP]
> State the resolved architecture in the task summary or implementation log, e.g.:  
> `Architecture: .ai-factory/ARCHITECTURE.md (Explicit Architecture - Vertical Slice)` or `Architecture: inferred from src/Web/`.

---

## 2. Map Yii 3 Artifacts onto the Architecture

Before creating a file, verify its exact classification and destination within the target architecture:

| Yii 3 Artifact | Structural Role | Standard Target Location |
|---|---|---|
| **Action / Controller** | Inbound HTTP transport adapter | `Controllers/`, `Presentation/Controller/`, or `Api/` |
| **Input DTO / Form** | Transport data carrier + validation rules | `Request/`, `Forms/`, or `Presentation/Request/` |
| **Domain Entity / Value Object** | Pure business model & state | `Models/`, `Domain/Model/`, or `Domain/ValueObject/` |
| **Domain Service / Use Case** | Business orchestration & logic | `Services/`, `Application/Command/`, or `Application/Query/` |
| **Domain Port (Interface)** | Boundary contract for I/O | `Domain/Repository/` or `Application/Port/` |
| **Repository Adapter** | Outbound persistence implementation | `Repositories/` or `Infrastructure/Persistence/` |
| **ActiveRecord Model** | DB data mapper / active record | `Models/` (Layered) or `Infrastructure/Persistence/ActiveRecord/` |
| **Domain / System Event** | PSR-14 event notification | `Domain/Event/` or `Events/` |
| **Event Listener / Subscriber**| Reactive side-effect handler | `Listeners/`, `Application/EventHandler/`, or `Infrastructure/` |
| **Console Command** | CLI entry point | `Commands/`, `Console/`, or `Presentation/Console/` |
| **Database Migration** | Schema definition | `migrations/` or `src/Infrastructure/Migration/` |
| **View Template / Layout** | UI rendering markup | `views/`, `templates/`, or `Presentation/View/` |
| **Tests** | Test suite covering the mapped artifacts | `tests/` |
| **DI Definitions & Params** | Container configuration & wiring | `config/common/di/`, `config/web/di/`, `config/common/params.php` |

### Architectural Invariants for Yii 3 Artifacts
- **Handlers Depend on Interfaces:** Controllers and CLI commands must inject service or repository interfaces, never concrete infrastructure drivers.
- **Yii 3 Packages are Infrastructure:** Unless an official `yiisoft/*` package explicitly defines a pure contract (e.g., `psr/*`, `yiisoft/friendly-exception`), its classes represent infrastructure and must not leak into pure `Domain/`.
- **Match the Resolved Pattern:** Follow the pattern's placement scheme (layers vs. vertical slices vs. hexagonal ports/adapters). See [Feature Recipes](feature-recipes.md) for layout diagrams.

---

## 3. Conflicts and Architecture Drift

- **Documentation vs. Existing Code Discrepancies:**
  - Follow the **architecture document** for all newly created code.
  - Do NOT refactor existing non-compliant code unless explicitly instructed by the user.
  - Emit an architectural warning in the output: `WARN [architecture-drift]` detailing the mismatch.
- **Documentation vs. Yii 3 Framework Mechanics Conflict:**
  - If a strict architectural rule makes DI wiring impossible (e.g., requiring an action to construct an object without container resolution), preserve the architectural intent by introducing an interface + DI definition. Document the decision in the task summary.
- **No Silent Structural Additions:**
  - Never create a new top-level folder, module directory, or alternative structural pattern silently. If a task requires structural modifications, consult `/aif-architecture`.
- **Maintenance Permissions for `ARCHITECTURE.md`:**
  - Topic-guide skills within this extension must **never** edit `.ai-factory/ARCHITECTURE.md`.
  - Base `/aif-implement` is explicitly authorized to update `.ai-factory/ARCHITECTURE.md` during **Context Maintenance** (`aif-implement/SKILL.md:781–792`) when new modules, contexts, or structural folders are created.

---

## 4. Pattern Placement Tables (aif-architecture)

The pattern definitions below map the 7 standard architectural patterns generated by `/aif-architecture` onto concrete Yii 3 directory structures and package categories.

### 4.1. Pattern → Folder Structure

| Pattern (aif-architecture option) | Folder Structure (Yii 3) |
|---|---|
| **Layered** | `src/Controllers/`, `src/Services/`, `src/Models/`, `src/Repositories/`, `src/Routes/` (or `config/routes.php`), `src/Middleware/`, `src/Utils/` |
| **Structured Modules (Technical Layer)** | `src/[ModuleName]/{Controllers,Services,Repositories,Models}/`, `src/Infrastructure/{Types,Utils,Middleware,Config}/` |
| **Structured Modules (Vertical Slices By Entity)** | `src/[ModuleName]/Slices/{[EntityName]/, [ProcessName]/}`, `src/[ModuleName]/{Models,Infrastructure}/`, `src/Infrastructure/`<br>*Note:* Entity slices contain `{Controller, Service, Repository}`; Process slices contain `{Controller, Service}` (no Repository). |
| **Explicit Architecture (Technical Layer)** | `src/[ContextName]/{Domain,Application,Infrastructure,Presentation}/`, `src/Infrastructure/` |
| **Explicit Architecture (Vertical Slice By Entity)** | `src/[ContextName]/{Domain, Slices/{[EntityName], [ProcessName]}/{Application,Infrastructure,Presentation}, Infrastructure/}`, `src/Infrastructure/` |
| **Explicit Architecture (Flat Vertical Slice - Simplified)** | `src/[ContextName]/{Domain, Slices/{[EntityName]/{Controller,Service,Repository}, [ProcessName]/{Controller,Service}}, Infrastructure/}`, `src/Infrastructure/` |
| **Microservices** | Per service: `src/{Api,Application,Domain,Infrastructure,Config}/`<br>Monorepo root: `Libs/{Contracts,Common,Testing}/`, optional `Gateway/`, `Infra/{docker-compose.yml, Deploy/}` |

#### Structural Placeholders
- `[ModuleName]`: Feature module (e.g., `Catalog`, `Billing`).
- `[ContextName]`: Bounded context (e.g., `Identity`, `OrderProcessing`).
- `[EntityName]`: Core domain aggregate or entity (e.g., `User`, `Invoice`).
- `[ProcessName]`: Cross-entity or multi-step workflow/process (e.g., `Checkout`, `Registration`).
- `[FeatureName]`: A use case scoped to a single entity (e.g., `ResetPassword`, `UpdateProfile`).
- `[ServiceName]`: Microservice boundary (e.g., `NotificationService`, `AuthService`).

---

### 4.2. Package Categories → Placement per Pattern

The table below defines where each category of `yiisoft/*` packages lands across the architectural patterns:

| Package Category | Layered | Structured Modules | Explicit Architecture | Microservices |
|---|---|---|---|---|
| **DI & Configuration**<br>(`di`, `config`, `aliases`, `definitions`, `factory`, `injector`) | Root `config/` + `Routes/` | `Infrastructure/Config/` + root `config/` | Composition Root (`config/`, DI definitions, `public/index.php`) | Per-service `Config/` + root `config/` |
| **HTTP Routing & Middleware**<br>(`router`, `router-fastroute`, `router-composer-attribute-collector`, `file-router`, `middleware-dispatcher`, `http-middleware`, `yii-middleware`, `session`, `cookies`, `csrf`, `request-body-parser`, `request-provider`, `response-download`, `psr-emitter`; CORS via `http-middleware`/`yii-middleware`) | `Routes/`, `Middleware/`, `Controllers/` | `[Module]/Controllers/`, `Infrastructure/Middleware/` | `[Context]/Presentation/` | `Api/` + service boundary middleware |
| **Input DTOs & Validation**<br>(`form-model`, `input-http`, `hydrator`, `hydrator-validator`, `validator`) | `Controllers/`, `Services/` | `[Module]/Controllers/`, `[Module]/Services/` | Bridge: DTOs in `Presentation/`, execution in `Application/` | Bridge: DTOs in `Api/`, execution in `Application/` |
| **Rendering & UI Presentation**<br>(`view`, `html`, `yii-view-renderer`, `widget`, `yii-widgets`, `assets`, `bootstrap5`, `yii-bulma`, `view-twig`, `yii-twig`, `yii-dataview`) | Strictly `Controllers/` & view templates | Strictly `[Module]/Controllers/` & view templates | Strictly `[Context]/Presentation/` | Strictly `Api/` or dedicated frontend |
| **Data Presentation & HTTP Responses**<br>(`data-response`) | `Controllers/` | `[Module]/Controllers/` | `[Context]/Presentation/` | `Api/` |
| **Use Cases, DTOs & Domain Events**<br>(`data`, `event-dispatcher`, `yii-event`, `queue`, `mailer`, `translator`, `i18n`, `log`, `cache`, `mutex`) | `Services/` | `[Module]/Services/` | `[Context]/Application/` | `Application/` |
| **Persistence & Outbound Adapters**<br>(`db`, `active-record`, `db-migration`, `db-*`, `data-db`, `yii-cycle`, `data-cycle`, cache stores, log targets, `mailer-symfony`, PSR-18 client) | `Repositories/` (+ `Models/` for AR data) | `[Module]/Repositories/`, `[Module]/Infrastructure/` | `[Context]/Infrastructure/` implementing Domain ports | `Infrastructure/{Persistence,External,Messaging}/` |
| **Domain & Business Rules**<br>(`friendly-exception`, port interfaces, PSR-14 events, domain value objects) | `Models/` (shared data structures) | `[Module]/Models/` (rich models) | `[Context]/Domain/` (pure, zero framework deps) | `Domain/` (pure, zero framework deps) |
| **Application Runners & Event Map**<br>(`yii-runner-*`, `yii-event`) | Root entry points (`public/index.php`, `yii`) | `Infrastructure/Config/` + root | Composition Root (`public/index.php`, `yii`) | Root entry points per service |
| **Auth & RBAC Boundary**<br>(`user`, `auth`, `security`, `rbac-*`, `auth-jwt`) | `Middleware/`, `Controllers/` | `[Module]/Controllers/`, `Infrastructure/Middleware/` | `Presentation/` (boundary) + `Application/` (`CurrentUser`) + `Domain/` (ports) | `Api/` (boundary) + `Application/` (`CurrentUser`) + `Domain/` (ports) |

---

### 4.3. Dependency Rules per Pattern

| Pattern | Dependency Flow | Key Invariants |
|---|---|---|
| **Layered** | `Routes → Controllers → Services → Repositories → Database` | Strict downward dependency flow; no layer skipping. `Models/` are shared data structures (DTOs, entities) consumed by Services and Repositories — not a separate layer and not "rich" models (per the resolved architecture artifact, `.ai-factory/ARCHITECTURE.md`). Business logic lives in Services. `Middleware/` and `Utils/` are cross-cutting. |
| **Structured Modules** | `Controllers → Services → Repositories`; Modules depend only on root `Infrastructure/` and public APIs of other modules | Rich `Models/` encapsulate business rules. Services act as Application Services orchestrating workflows. No layer skipping within modules. Process slices coordinate cross-entity workflows without owning tables. |
| **Explicit Architecture** | `Presentation → Application → Domain ← Infrastructure`; Composition Root wires ports to adapters | Clean / Hexagonal architecture. Inward dependencies pointing to pure `Domain/`. Domain has zero framework dependencies. Outbound infrastructure adapters implement ports defined in Domain or Application. |
| **Microservices** | Contract-first API; per-service internal architecture; isolated persistence | Each microservice defines its own internal pattern (`Api`, `Application`, `Domain`, `Infrastructure`). Monorepo shares contracts via `Libs/Contracts/`. No direct database sharing across services. |

---

### 4.4. Universal Dependency Invariants (All Patterns)

The following 6 invariants hold across **every** architectural pattern:

1. **Business Rules & Framework Isolation:**
   - In **Explicit Architecture** and **Microservices**, `Domain/` entities, value objects, and domain services are pure PHP objects (POPOs) with **zero framework dependencies**. They must never import `yiisoft/db`, `yiisoft/active-record`, `yiisoft/yii-http`, `yiisoft/view`, `yiisoft/html`, or `yiisoft/yii-view-renderer`.
   - In **Layered** and **Structured Modules** utilizing Active Record, models inherit from `Yiisoft\ActiveRecord\ActiveRecord` and interact with `ConnectionInterface`. However, application services and domain port interfaces must **never** import raw `yiisoft/db` query builder or connection classes directly.
2. **Use-Case Code Relies on Ports (Abstract Contracts):**
   - Application use-case services must type-hint abstract ports (e.g., `UserRepositoryInterface`, `CacheInterface`, `MailerInterface`, `QueueProducerInterface`, `LoggerInterface`), never concrete infrastructure adapters (`DbUserRepository`, `RedisCache`, `SymfonyMailer`, `QueueRedisTransport`).
3. **Presentation Isolation from Persistence:**
   - Presentation layer artifacts (controllers, actions, middleware, view templates) must never execute database queries, instantiate query builders, or access database connections directly. All data access must pass through Application services or Repository ports.
4. **Rendering Packages Belong Exclusively to Presentation:**
   - Packages responsible for HTML generation and view rendering (`yiisoft/view`, `yiisoft/html`, `yiisoft/yii-view-renderer`, `yiisoft/widget`, `yiisoft/assets`, `yiisoft/bootstrap5`, `yiisoft/yii-bulma`, `yiisoft/view-twig`, `yiisoft/yii-dataview`) belong strictly to Presentation (`Controllers/`, view templates, `Presentation/`, `Api/`).
   - Injecting view renderers or HTML formatters into Domain entities or Application services is a severe architectural violation.
5. **Composition Root & Wiring Placement:**
   - Dependency injection configuration, alias definitions, and environment group mappings belong exclusively to the pattern's designated configuration directory (e.g., `config/` or `Infrastructure/Config/`). Application logic must never configure the container at runtime.
6. **No Direct Outbound-to-Outbound Coupling:**
   - Outbound infrastructure adapters must not chain directly into other outbound adapters without application mediation. For example, a queue consumer adapter (`queue-redis`) must not call a database repository directly; it must dispatch through an Application message handler (`HandlerInterface`).

---

### 4.5. Reference: Responsibility → Package Categories

When selecting packages for a task, classify them by architectural responsibility:

| Responsibility | Architectural Placement | Allowed Packages |
|---|---|---|
| **Domain / Business Rules** | `[Context]/Domain/` or `Models/` | Pure PHP classes, domain value objects, domain events, domain exceptions. Port interfaces only: `psr/event-dispatcher`, `yiisoft/friendly-exception`, `yiisoft/access`, `yiisoft/rbac` contracts and value objects (`Permission`, `Role`, `Assignment`), `yiisoft/auth` contracts (`IdentityInterface`, `IdentityRepositoryInterface`). *No concrete framework implementations.* |
| **Application / Use Cases** | `[Context]/Application/` or `Services/` | Use-case orchestration, domain services, application DTOs, data readers/paginators (`yiisoft/data`), user session service (`Yiisoft\User\CurrentUser`), token factories, async queue producer & handler ports (`yiisoft/queue`), mail notification ports (`yiisoft/mailer`), translation ports (`yiisoft/translator`, `yiisoft/i18n`), logging ports (`psr/log`, `yiisoft/log`), event dispatcher (`psr/event-dispatcher`, `yiisoft/event-dispatcher`), caching contracts (`psr/simple-cache`, `yiisoft/cache`), synchronization (`yiisoft/mutex`). |
| **Input & Validation (Bridge)** | DTOs in `Presentation/`, validation execution in `Application/` | Request hydration and DTO validation (`yiisoft/form-model`, `yiisoft/input-http`, `yiisoft/hydrator`, `yiisoft/hydrator-validator`, `yiisoft/validator`). Input DTO definitions and HTTP attributes sit in Presentation; validation execution and domain rule evaluation sit in Application. |
| **Presentation / Inbound** | `[Context]/Presentation/` or `Controllers/` | HTTP routing (`router`, `router-fastroute`, `router-composer-attribute-collector`, `file-router`, `yii-http`), middleware pipeline (`middleware-dispatcher`, `http-middleware`, `yii-middleware`, `request-body-parser`, `request-provider`, `response-download`, `psr-emitter`; CORS via `http-middleware`/`yii-middleware`), HTTP state (`cookies`, `session`, `rate-limiter`, `proxy-middleware`), web entry protection (`csrf`, `security`, `auth-jwt`), auth boundary (`auth`, `user` middleware), UI rendering (`view`, `html`, `yii-view-renderer`, `widget`, `yii-widgets`, `assets`, `bootstrap5`, `yii-bulma`, `view-twig`, `yii-twig`), data formatting & HTTP responses (`yii-dataview`, `data-response`), CLI commands & runners (`yii-console`), API documentation (`yii-swagger`), error handling presentation (`error-handler`, `friendly-exception`), localization output (`translator`, `i18n`, `translator-extractor`). |
| **Infrastructure / Outbound** | `[Context]/Infrastructure/` or `Repositories/` | Persistence drivers & ORM (`db`, `active-record`, `db-migration`, `db-mysql`, `db-pgsql`, `db-sqlite`, `db-oracle`, `db-mssql`, `data-db`), Cycle ORM stack (`data-cycle`, `yii-cycle`), RBAC storage adapters (`rbac-db`, `rbac-php`, `rbac-cycle-db`), cache storage adapters (`cache-*`), mutex drivers (`mutex-*`), queue transport drivers (`queue-*`), mail transport adapters (`mailer-symfony`), log targets (`log-target-*`), external HTTP clients & API adapters (`yii-auth-client`, `network-utilities`, `json`), filesystem utilities (`files`, `arrays`, `strings`, `var-dumper`, `classifier`, `aliases`), runtime profiling (`profiler`). |
| **Composition Root / Wiring** | Root `config/`, entry points (`public/index.php`, `yii`) | DI container core (`di`, `factory`, `definitions`, `injector`, `proxy`), configuration management (`config`, `aliases`, `requirements`), application runners & entry points (`yii-runner`, `yii-runner-http`, `yii-runner-console`, `yii-runner-frankenphp`, `yii-runner-roadrunner`), event mapping (`yii-event`). |
| **Dev / QA (require-dev only)** | Dev environment configuration & test suites | Debug toolbar & API (`yii-debug`, `yii-debug-api`, `yii-debug-viewer`), code generation (`yii-gii`, `yii-dev-tool`, `code-style`), monitoring & APM (`yii-sentry`), test suites & fixtures (`test-support`, `yii-testing`). |

---

## 5. Multi-Placement & Shared Packages Disambiguation

Certain `yiisoft/*` packages span multiple categories depending on whether they are being configured or consumed at runtime.

### 5.1. `yiisoft/aliases`: Composition Root vs. Infrastructure
`yiisoft/aliases` appears in two distinct roles:
1. **Composition Root (Configuration):**
   - Root path aliases (`@root`, `@runtime`, `@views`, `@vendor`, `@assets`) are defined in `config/common/params.php` and initialized in DI container bindings (`config/common/di/application.php`). Here, `Aliases` functions as part of the composition root wiring.
2. **Infrastructure (Runtime Filesystem Resolution):**
   - At runtime, `Yiisoft\Aliases\Aliases` is injected into infrastructure adapters (asset managers, file log targets, view renderers, file cache stores) to resolve logical aliases into physical filesystem paths (e.g., `$aliases->get('@runtime/logs')`).
- **Purity Rule:** Pure `Domain/` entities and Application services must **never** inject or depend on `Yiisoft\Aliases\Aliases`.

### 5.2. `yiisoft/data-response`: Presentation vs. Application
- `Yiisoft\DataResponse\DataResponse` implements `Psr\Http\Message\ResponseInterface` and couples directly to HTTP transport primitives (`psr/http-message`, `yiisoft/http`, `yiisoft/json`).
- **Application use cases** must remain transport-agnostic and return domain entities, scalar DTOs, or `yiisoft/data` readers.
- **Presentation controllers/actions** receive application DTOs and wrap them into a `DataResponse` using `Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface`.
- **Classification:** `yiisoft/data-response` belongs exclusively to **Presentation**.

### 5.3. `yiisoft/profiler`: Infrastructure vs. Dev/QA Tooling
- `yiisoft/profiler` is a lightweight runtime performance measurement library requiring only `psr/log`, `yiisoft/files`, and `yiisoft/strings`. It has no dev-only restrictions and can execute safely in production environments.
- In development environments, `yiisoft/yii-debug` consumes `yiisoft/profiler` targets to collect timeline traces for the debug panel.
- **Classification:** Canonical placement is **Infrastructure** (runtime profiling adapter); its dev-only appearance is strictly through its primary consumer `yii-debug`.

---

## 6. Anti-Hallucination & Framework Guardrails

### 6.1. Yii 2 vs. Yii 3 Critical Invariants

| Concept | Legacy Yii 2 (FORBIDDEN) | Idiomatic Yii 3 (GROUNDED TRUTH) | Verification Proof |
|---|---|---|---|
| **Application Context** | `Yii::$app->...` | PSR-11 Container / Constructor Injection | `vendor/yiisoft/di/src/Container.php` |
| **Path Resolution** | `Yii::getAlias('@views')` | Injected `Yiisoft\Aliases\Aliases::get('@views')` | `vendor/yiisoft/aliases/src/Aliases.php:148` |
| **AR Table Name** | `public static function tableName(): string` | `public function tableName(): string` (**INSTANCE METHOD!**) | `vendor/yiisoft/active-record/src/ActiveRecordInterface.php:222` |
| **AR Persistence** | `if ($model->save())` (returns `bool`) | `$model->save()` returns `void` (throws exceptions on failure) | `vendor/yiisoft/active-record/src/ActiveRecordInterface.php:553` |
| **AR Insertion** | `if ($model->insert())` (returns `bool`) | `$model->insert()` returns `void` (throws exceptions on failure) | `vendor/yiisoft/active-record/src/ActiveRecordInterface.php:375` |
| **AR Model Validation** | Built-in `rules()` and `validate()` | AR has **NO** validation. Use `yiisoft/validator` or `form-model`. | `vendor/yiisoft/active-record/src/AbstractActiveRecord.php` |
| **AR Finder Methods** | Static `find()`, `findOne()` built-in | Must explicitly `use Yiisoft\ActiveRecord\Trait\RepositoryTrait;` | `vendor/yiisoft/active-record/src/Trait/RepositoryTrait.php:38` |
| **Query Construction** | `new Query()` without arguments | `new Query(ConnectionInterface $db)` or `$db->createQuery()` | `vendor/yiisoft/db/src/Query/Query.php:121` |
| **Query `where()` Immutability** | Chaining `->where()` replaces condition | Chaining `->where()` throws `LogicException`; use `setWhere()`. | `vendor/yiisoft/db/src/Query/Query.php:771-775` |
| **Query Result Caching** | Built-in `Query::cache()` | Does not exist; cache results explicitly via PSR-16 `psr/simple-cache`. | `vendor/yiisoft/db/src/Query/Query.php` |

---

### 6.2. Non-Existent & Deprecated APIs

- **`QueueInterface` and `JobInterface` DO NOT EXIST in Yii 3:**
  - They are legacy Yii 2 constructs.
  - Yii 3 decomposes queues into dedicated single-responsibility contracts:
    - **Producer Port:** `Yiisoft\Queue\QueueProducerInterface::push(MessageInterface $message): MessageInterface`
    - **Message DTO:** `Yiisoft\Queue\Message\MessageInterface`
    - **Consumer Handler:** `Yiisoft\Queue\Message\Handler\HandlerInterface::handle(MessageInterface $message): void`
    - **Consumer Runner:** `Yiisoft\Queue\QueueConsumerInterface::run(int $max = 0): int` or `listen(): void`
    - **Transport Adapter:** `Yiisoft\Queue\Adapter\AdapterInterface`
- **`MatchingResult::process()` DOES NOT EXIST:**
  - Dispatched exclusively through PSR-15 middleware: `Yiisoft\Router\Middleware\Router`.
- **Deprecated ViewRenderer Contract:**
  - `Yiisoft\Yii\View\Renderer\ViewRenderer` is formally `@deprecated` as of v7.4.0.
  - Use `Yiisoft\Yii\View\Renderer\WebViewRenderer` (`vendor/yiisoft/yii-view-renderer/src/WebViewRenderer.php:41`).
- **Deprecated Authenticator Interface:**
  - `Yiisoft\Auth\AuthenticationMethodInterface` is `@deprecated`.
  - Use `Yiisoft\Auth\AuthenticatorInterface` or `Yiisoft\Auth\AuthenticatorWithChallengeInterface`.
- **Deprecated DataResponseFactory Interface:**
  - `Yiisoft\DataResponse\DataResponseFactoryInterface` in the root namespace is `@deprecated`.
  - Use `Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface`.

---

## 7. Canonical Vertical Slice Reference (`UserManagement`)

The reference slice below demonstrates concrete file placement and idiomatic code for a feature slice in an **Explicit Architecture (Vertical Slice By Entity)**.

### 7.1. Directory Structure

```
src/UserManagement/
├── Domain/
│   ├── Model/
│   │   ├── UserId.php                    # Domain Value Object
│   │   └── User.php                      # Pure Domain Entity (implements Yiisoft\Auth\IdentityInterface)
│   ├── Repository/
│   │   └── UserRepositoryInterface.php   # Domain Port (extends IdentityRepositoryInterface)
│   └── Event/
│       └── UserRegistered.php            # PSR-14 Domain Event
├── Application/
│   └── Command/
│       ├── RegisterUserCommand.php       # Application Command DTO
│       └── RegisterUserHandler.php       # Application Service (orchestrator)
├── Infrastructure/
│   └── Persistence/
│       └── DbUserRepository.php          # Outbound Adapter (implements UserRepositoryInterface)
└── Presentation/
    ├── Controller/
    │   └── RegisterUserController.php    # Inbound HTTP Adapter
    ├── Request/
    │   └── RegisterUserRequest.php       # Validated Input DTO (bridges Presentation & Validation)
    └── View/
        └── register.php                  # Presentation View Template
```

---

### 7.2. Domain Layer (Pure Entities, Ports, Events)

#### `src/UserManagement/Domain/Model/UserId.php`
```php
<?php

declare(strict_types=1);

namespace App\UserManagement\Domain\Model;

use InvalidArgumentException;

final class UserId
{
    public function __construct(
        private readonly string $value,
    ) {
        if ($this->value === '') {
            throw new InvalidArgumentException('User ID cannot be empty.');
        }
    }

    public function getValue(): string
    {
        return $this->value;
    }

    public function asString(): string
    {
        return $this->value;
    }

    public function equals(self $other): bool
    {
        return $this->value === $other->value;
    }
}
```

#### `src/UserManagement/Domain/Model/User.php`
```php
<?php

declare(strict_types=1);

namespace App\UserManagement\Domain\Model;

use Yiisoft\Auth\IdentityInterface;

final class User implements IdentityInterface
{
    public function __construct(
        private readonly UserId $id,
        private string $email,
        private string $name,
        private readonly int $createdAt,
    ) {
    }

    public function getId(): ?string
    {
        return $this->id->asString();
    }

    public function getUserId(): UserId
    {
        return $this->id;
    }

    public function getEmail(): string
    {
        return $this->email;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getCreatedAt(): int
    {
        return $this->createdAt;
    }

    public function changeEmail(string $newEmail): void
    {
        $this->email = $newEmail;
    }
}
```

#### `src/UserManagement/Domain/Repository/UserRepositoryInterface.php`
```php
<?php

declare(strict_types=1);

namespace App\UserManagement\Domain\Repository;

use App\UserManagement\Domain\Model\User;
use App\UserManagement\Domain\Model\UserId;
use Yiisoft\Auth\IdentityRepositoryInterface;
use Yiisoft\Data\Reader\DataReaderInterface;

interface UserRepositoryInterface extends IdentityRepositoryInterface
{
    public function findById(UserId $id): ?User;

    public function findByEmail(string $email): ?User;

    /**
     * @return DataReaderInterface<array-key, User>
     */
    public function findAll(): DataReaderInterface;

    public function save(User $user): void;

    public function delete(User $user): void;
}
```

#### `src/UserManagement/Domain/Event/UserRegistered.php`
```php
<?php

declare(strict_types=1);

namespace App\UserManagement\Domain\Event;

use App\UserManagement\Domain\Model\UserId;

final class UserRegistered
{
    public function __construct(
        public readonly UserId $userId,
        public readonly string $email,
        public readonly int $occurredAt,
    ) {
    }
}
```

---

### 7.3. Application Layer (Commands & Handlers)

#### `src/UserManagement/Application/Command/RegisterUserCommand.php`
```php
<?php

declare(strict_types=1);

namespace App\UserManagement\Application\Command;

final class RegisterUserCommand
{
    public function __construct(
        public readonly string $id,
        public readonly string $email,
        public readonly string $name,
    ) {
    }
}
```

#### `src/UserManagement/Application/Command/RegisterUserHandler.php`
```php
<?php

declare(strict_types=1);

namespace App\UserManagement\Application\Command;

use App\UserManagement\Domain\Event\UserRegistered;
use App\UserManagement\Domain\Model\User;
use App\UserManagement\Domain\Model\UserId;
use App\UserManagement\Domain\Repository\UserRepositoryInterface;
use Psr\EventDispatcher\EventDispatcherInterface;
use RuntimeException;

use function time;

final class RegisterUserHandler
{
    public function __construct(
        private readonly UserRepositoryInterface $userRepository,
        private readonly EventDispatcherInterface $eventDispatcher,
    ) {
    }

    public function handle(RegisterUserCommand $command): User
    {
        if ($this->userRepository->findByEmail($command->email) !== null) {
            throw new RuntimeException('A user with this email address already exists.');
        }

        $userId = new UserId($command->id);
        $user = new User(
            id: $userId,
            email: $command->email,
            name: $command->name,
            createdAt: time(),
        );

        $this->userRepository->save($user);

        $this->eventDispatcher->dispatch(
            new UserRegistered(
                userId: $userId,
                email: $user->getEmail(),
                occurredAt: $user->getCreatedAt(),
            )
        );

        return $user;
    }
}
```

---

### 7.4. Infrastructure Layer (Persistence Adapters)

#### `src/UserManagement/Infrastructure/Persistence/DbUserRepository.php`
```php
<?php

declare(strict_types=1);

namespace App\UserManagement\Infrastructure\Persistence;

use App\UserManagement\Domain\Model\User;
use App\UserManagement\Domain\Model\UserId;
use App\UserManagement\Domain\Repository\UserRepositoryInterface;
use Yiisoft\Auth\IdentityInterface;
use Yiisoft\Data\Db\QueryDataReader;
use Yiisoft\Data\Reader\DataReaderInterface;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;

final class DbUserRepository implements UserRepositoryInterface
{
    private const TABLE_NAME = '{{%user}}';

    public function __construct(
        private readonly ConnectionInterface $db,
    ) {
    }

    public function findIdentity(string $id): ?IdentityInterface
    {
        return $this->findById(new UserId($id));
    }

    public function findById(UserId $id): ?User
    {
        $query = (new Query($this->db))
            ->from(self::TABLE_NAME)
            ->where(['id' => $id->asString()]);

        /** @var array{id: string, email: string, name: string, created_at: int|string}|false $row */
        $row = $query->one();

        if ($row === false) {
            return null;
        }

        return $this->hydrate($row);
    }

    public function findByEmail(string $email): ?User
    {
        $query = (new Query($this->db))
            ->from(self::TABLE_NAME)
            ->where(['email' => $email]);

        /** @var array{id: string, email: string, name: string, created_at: int|string}|false $row */
        $row = $query->one();

        if ($row === false) {
            return null;
        }

        return $this->hydrate($row);
    }

    public function findAll(): DataReaderInterface
    {
        $query = (new Query($this->db))->from(self::TABLE_NAME);

        return new QueryDataReader($query);
    }

    public function save(User $user): void
    {
        $exists = (new Query($this->db))
            ->from(self::TABLE_NAME)
            ->where(['id' => $user->getId()])
            ->exists();

        if ($exists) {
            $this->db->createCommand()
                ->update(
                    self::TABLE_NAME,
                    [
                        'email' => $user->getEmail(),
                        'name' => $user->getName(),
                    ],
                    ['id' => $user->getId()]
                )
                ->execute();
            return;
        }

        $this->db->createCommand()
            ->insert(
                self::TABLE_NAME,
                [
                    'id' => $user->getId(),
                    'email' => $user->getEmail(),
                    'name' => $user->getName(),
                    'created_at' => $user->getCreatedAt(),
                ]
            )
            ->execute();
    }

    public function delete(User $user): void
    {
        $this->db->createCommand()
            ->delete(self::TABLE_NAME, ['id' => $user->getId()])
            ->execute();
    }

    /**
     * @param array{id: string, email: string, name: string, created_at: int|string} $row
     */
    private function hydrate(array $row): User
    {
        return new User(
            id: new UserId((string) $row['id']),
            email: (string) $row['email'],
            name: (string) $row['name'],
            createdAt: (int) $row['created_at'],
        );
    }
}
```

---

### 7.5. Presentation Layer (Controllers, Requests, Views)

#### `src/UserManagement/Presentation/Request/RegisterUserRequest.php`
```php
<?php

declare(strict_types=1);

namespace App\UserManagement\Presentation\Request;

use Yiisoft\Input\Http\AbstractInput;
use Yiisoft\Input\Http\Attribute\Data\FromBody;
use Yiisoft\Validator\Rule\Email;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;

#[FromBody]
final class RegisterUserRequest extends AbstractInput
{
    #[Required]
    #[Length(min: 2, max: 100)]
    public string $name = '';

    #[Required]
    #[Email]
    public string $email = '';
}
```

#### `src/UserManagement/Presentation/Controller/RegisterUserController.php`
```php
<?php

declare(strict_types=1);

namespace App\UserManagement\Presentation\Controller;

use App\UserManagement\Application\Command\RegisterUserCommand;
use App\UserManagement\Application\Command\RegisterUserHandler;
use App\UserManagement\Presentation\Request\RegisterUserRequest;
use Psr\Http\Message\ResponseInterface;
use Throwable;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Security\Random;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final class RegisterUserController
{
    public function __construct(
        private readonly RegisterUserHandler $handler,
        private readonly WebViewRenderer $viewRenderer,
        private readonly DataResponseFactoryInterface $responseFactory,
    ) {
    }

    public function showForm(): ResponseInterface
    {
        return $this->viewRenderer->render('register');
    }

    public function register(RegisterUserRequest $request): ResponseInterface
    {
        $validationResult = $request->getValidationResult();
        if (!$validationResult->isValid()) {
            return $this->responseFactory->createResponse(
                [
                    'success' => false,
                    'errors' => $validationResult->getErrorMessagesIndexedByProperty(),
                ],
                Status::UNPROCESSABLE_ENTITY,
            );
        }

        try {
            $command = new RegisterUserCommand(
                id: Random::string(32),
                email: $request->email,
                name: $request->name,
            );

            $user = $this->handler->handle($command);

            return $this->responseFactory->createResponse(
                [
                    'success' => true,
                    'user' => [
                        'id' => $user->getId(),
                        'email' => $user->getEmail(),
                        'name' => $user->getName(),
                    ],
                ],
                Status::CREATED,
            );
        } catch (Throwable $e) {
            return $this->responseFactory->createResponse(
                [
                    'success' => false,
                    'message' => $e->getMessage(),
                ],
                Status::BAD_REQUEST,
            );
        }
    }
}
```

#### `src/UserManagement/Presentation/View/register.php`
```php
<?php

declare(strict_types=1);

use Yiisoft\Html\Html;

/**
 * @var Yiisoft\View\WebView $this
 */

$this->setTitle('Register New User');
?>
<h1><?= Html::encode($this->getTitle()) ?></h1>

<form method="post" action="/users/register">
    <div>
        <label for="name">Name</label>
        <input type="text" id="name" name="name" required>
    </div>
    <div>
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required>
    </div>
    <button type="submit">Register</button>
</form>
```

---

### 7.6. Configuration & Composition Root Wiring

#### `config/common/di/user-management.php`
```php
<?php

declare(strict_types=1);

use App\UserManagement\Domain\Repository\UserRepositoryInterface;
use App\UserManagement\Infrastructure\Persistence\DbUserRepository;

return [
    UserRepositoryInterface::class => DbUserRepository::class,
];
```

#### `config/common/routes.php`
```php
<?php

declare(strict_types=1);

use App\UserManagement\Presentation\Controller\RegisterUserController;
use Yiisoft\Router\Route;

return [
    Route::get('/users/register')
        ->action([RegisterUserController::class, 'showForm'])
        ->name('user/register-form'),
    Route::post('/users/register')
        ->action([RegisterUserController::class, 'register'])
        ->name('user/register'),
];
```
