---
name: yii3-v2
description: >-
  Architectural guide, code generator, and verification suite for modern Yii 3 applications (PHP 8.2+, yiisoft/* packages; strict zero-Yii2 policy). Provides conventions, package catalogs, layer decomposition, deterministic AST validation scripts, and vertical slice templates. Use when user says "Yii3", "Yii 3", "yiisoft", "create yii3 action", "add repository", "add use case", "add event", "add listener", "add middleware", "configure DI", "register route", "send email", "queue job", "worker command", "mutex lock", "Yii migration", "render view", "custom widget", "gridview", "dataview", "asset bundle", "validate yii3 form", "validation rules", "form model", "PHPUnit", "cache", "query builder", "transactions", "active record", "cycle orm", "login", "JWT", "RBAC", "oauth", "sqlite", "error handling", "PSR-3 logging", "i18n", "flash message", "CSRF", "file upload", "download file", "swagger", "openapi", "layered architecture", "vertical slices".
---

# Yii3 development

## Table of Contents
- [Core rules](#core-rules)
- [Workflow per task](#workflow-per-task)
- [References (read on demand)](#references-read-on-demand)
  - [Task & Intent Routing Matrix](#task--intent-routing-matrix)
  - [Core & Architecture](#core--architecture)
  - [HTTP & Presentation](#http--presentation)
  - [Persistence & Data](#persistence--data)
  - [Infrastructure, Async & Operations](#infrastructure-async--operations)
- [Deterministic tooling & validation scripts](#deterministic-tooling--validation-scripts)
- [Canonical examples & templates](#canonical-examples--templates)

---

## Core rules
1. **Yii3 is not Yii2.** No `Yii::$app`, no `yii\` namespace, no static facades. PSR-based, injected.
2. **Source of Truth & Verification Rule (Single Source of Truth / SSOT):**
   - **Resolution order:** existing project code (`src/`, `config/`) → `vendor/yiisoft/<pkg>/src/` (installed version) → skill reference documentation (`references/conventions.md`, `references/package-catalog.md`, `references/api-signatures.md`, etc.).
   - In target projects, always verify exact method signatures, constructor arguments, and configuration options directly in `vendor/yiisoft/<package>/src/` for installed packages.
   - When generating or refactoring code, if an installed package's method signature or property is unfamiliar or in doubt, **read its source files in `vendor/yiisoft/<package>/src/`** rather than guessing or relying on legacy Yii2 habits.
   - Zero-hallucination policy: never invent method signatures, configuration keys, or assume Yii2 syntax.
3. **Architecture decides placement:** `/aif-architecture` artifact if it exists, otherwise the project's real structure
   (`src/`, `config/` + similar existing features). See `references/architecture-alignment.md`.
4. Every capability goes through `references/dependency-protocol.md` before code is written.

## Workflow per task
0. Resolve architecture: check `.ai-factory/ARCHITECTURE.md` (or configured path), otherwise inspect existing `src/` and `config/`.
1. Check `composer.json` for installed packages; consult `references/package-catalog.md` and `references/feature-recipes.md` for required packages and drivers.
2. For business feature requests, decompose into full artifact graph (Domain, Persistence, Use Case, Presentation, Wiring) via `references/feature-recipes.md`; check the Chain Integrity Checklist (§6) there before writing code, and use the canonical slice `examples/crud-slice/README.md` as the decomposition reference.
3. Install/wire missing packages per `references/dependency-protocol.md`.
4. Place and write code: architecture source first, then `references/conventions.md`; for file placement and format follow the canonical example `examples/crud-slice/README.md`.
5. Verify: run project tests and linters (Psalm/PHPStan, Rector, CS-Fixer, PHPUnit). Then run the deterministic gate — the unified validation suite (or individual verifiers, see "Deterministic tooling & validation scripts" below) against the changed scope: fix every reported error and rerun until all exit 0. Exit 2 means a misconfigured invocation (wrong path or PHP guard) — fix the invocation, never treat it as a pass. Warnings exit 0 — report them separately, do not block. Report added packages and changed config files.

   Step-5 verification report (compact template):

   ```
   verify-all.php <scope> -> exit 1 (1 error)
   - verify-actions.php: config/common/di/db.php:5 — typo_class_key — invalid class key 'classname'
   fixes applied: renamed 'classname' to 'class'
   rerun: verify-all.php <scope> -> exit 0
   warnings (exit 0, non-blocking): params.php:4 — closure_in_params — closure in parameters file
   ```

## References (read on demand)

### Task & Intent Routing Matrix
Load only the targeted reference guides required for the active task archetype:

| Task Archetype | Primary Guides (Start Here) | Secondary / Wiring Guides | Canonical Template / Gate |
|---|---|---|---|
| **REST API Endpoint / CRUD** | `references/actions-and-controllers.md`<br>`references/validation-and-forms.md`<br>`references/routes.md` | `references/persistence-db.md`<br>`references/error-handling.md` | `examples/crud-slice/README.md`<br>`verify-actions.php` |
| **CLI Command / Worker** | `references/commands.md`<br>`references/queue-jobs.md` | `references/logging.md`<br>`references/di-and-config.md` | `check-di-syntax.php` |
| **HTML UI / Forms / Grid** | `references/views-and-widgets.md`<br>`references/validation-and-forms.md`<br>`references/http-state.md` | `references/actions-and-controllers.md`<br>`references/file-handling.md` | `verify-actions.php` |
| **Auth / Identity / RBAC** | `references/auth-and-rbac.md`<br>`references/middlewares.md` | `references/routes.md`<br>`references/http-state.md` | `verify-actions.php` |
| **Database & Schema Migrations** | `references/migrations.md`<br>`references/persistence-db.md` (or `persistence-cycle-orm.md`) | `references/di-and-config.md`<br>`references/caching.md` | `examples/crud-slice/Migration` |
| **Full Architecture Slices** | `references/architecture-alignment.md`<br>`references/feature-recipes.md` | `references/dependency-protocol.md`<br>`references/package-catalog.md` | `examples/crud-slice/README.md` |

### Core & Architecture
- `references/conventions.md` — layout, config, DI, actions, routes, anti-patterns, SSOT verification rule
- `references/architecture-alignment.md` — where code goes + per-pattern placement tables and dependency rules
- `references/feature-recipes.md` — feature archetypes, decomposition into layers, capability inference, wiring checklist
- `references/dependency-protocol.md` — check, install, wire, learn a package
- `references/package-catalog.md` — packages, capability keys, driver choices
- `references/api-signatures.md` — exact signatures for the most-used Yii3 interfaces and classes
- `references/utilities.md` — standalone helper packages: ArrayHelper array access and transformation, StringHelper + Inflector, exception-safe Json, VarDumper/ClosureExporter, Classifier class discovery, and IP/DNS utilities
- `references/di-and-config.md` — PSR-11 container, config directory separation, definition syntax recipes, parameter inheritance, and environment overrides
- `references/events-and-listeners.md` — PSR-14 event architecture, immutable domain event DTOs, listener design, event mapping configuration, and post-commit dispatching

### HTTP & Presentation
- `references/routes.md` — FastRoute route syntax, regex parameter constraints, nested groups, middleware ordering, FastRoute caching, URL generation, Subfolder and Locale middlewares, declarative redirects, and FileRouter conventions
- `references/middlewares.md` — PSR-15 HTTP middleware pipeline, request pre-processing, security post-processing, auth short-circuiting, and official middleware catalog
- `references/actions-and-controllers.md` — package usage recommendations in actions/controllers, HTTP request parsing, DTO hydration, validation, security, data-response, and view rendering
- `references/openapi-swagger.md` — OpenAPI specification generation with yiisoft/yii-swagger, PHP 8 attributes (OA), Swagger UI asset rendering, and route integration
- `references/validation-and-forms.md` — built-in and custom validator rules, skipOnEmpty/when modifiers, message translation, FormModel + FormHydrator, validating hydrator DTOs, and input-http request inputs
- `references/views-and-widgets.md` — view placement (colocated action templates or central views directory), PHP view templates, mandatory XSS escaping, layouts, asset bundles, custom widgets, CSS-framework widget drivers (yiisoft/bootstrap5, yiisoft/yii-bulma), HTML forms, and DataView widgets (GridView, ListView, DetailView)
- `references/http-state.md` — sessions and session middleware, flash messages, cookie handling with signing/encryption, and CSRF token implementations with middleware wiring
- `references/file-handling.md` — FileHelper filesystem utilities, download responses (sendFile, x-sendfile, byte ranges), and the PSR-7 upload flow with file validation rules
- `references/i18n-translation.md` — translator API and category sources, message formatters, PHP/DB/gettext message storage, message extraction, and locale routing middleware

### Persistence & Data
- `references/persistence-db.md` — low-level yiisoft/db Connection, Command, Query Builder, transactions, QueryDataReader pagination, and driver packages (MySQL, PostgreSQL, SQLite, MSSQL, Oracle) with DSN/connection configuration
- `references/persistence-active-record.md` — yiisoft/active-record models, queries, relations, lifecycle, and LazyLoadGuard N+1 prevention
- `references/persistence-cycle-orm.md` — Cycle ORM Data Mapper integration (yiisoft/yii-cycle, cycle/orm, #[Entity], EntityReader/Writer, DBAL, migrations, and yiisoft/rbac-cycle-db)
- `references/migrations.md` — database schema DDL migrations, typed column definitions, foreign keys, indexes, reversible migrations, and data seeding
- `references/caching.md` — PSR-16 drivers (file, redis, db, APCu, memcached, wincache), getOrSet stampede prevention, TagDependency invalidation, and HTTP/view fragment caching

### Infrastructure, Async & Operations
- `references/runners-and-runtimes.md` — entry point architecture, HttpApplicationRunner (public/index.php), SapiEmitter response emitting (yiisoft/psr-emitter), ConsoleApplicationRunner (yii CLI), RoadRunner & FrankenPHP workers (incl. rr binary installation), and StateResetter
- `references/commands.md` — thin console commands with Symfony Console, input arguments/options, interactive SymfonyStyle, ExitCode constants, and command registration
- `references/queue-jobs.md` — asynchronous queue jobs, serializable message DTOs, worker handlers, distributed mutex locks, and worker CLI management
- `references/auth-and-rbac.md` — user identity, session lifecycle (login/logout anti-fixation), remember-me cookies, user events, JWT auth, OAuth2/OIDC login (yiisoft/yii-auth-client), RBAC manager with storage drivers (rbac-db, rbac-php, rbac-cycle-db), and route protection
- `references/mailer.md` — email composition, Symfony Mailer DSN transport, HTML view templating, file attachments, inline CID embeddings, and async queue sending
- `references/logging.md` — PSR-3 logger injection, DI binding for LoggerInterface, categories, placeholders, target catalog (file/db/email/syslog/stream), context providers, and flushing
- `references/error-handling.md` — ErrorCatcher middleware, custom HTML/JSON Problem Details renderers, Friendly Exceptions, and Sentry logging
- `references/testing-core.md` — test architecture, testing pyramid, exclusive runner rule (PHPUnit vs Testo), PSR test doubles (yiisoft/test-support), modern mocking rules, and console command testing
- `references/testing-http.md` — functional HTTP testing with yiisoft/yii-testing, HttpApplicationRunner, isolated PSR-15 middleware testing, session/cookie validation, and ResponseAccessor API
- `references/testing-database.md` — transactional database testing, ephemeral in-memory SQLite (yiisoft/db-sqlite), migration fixtures with MigrationBuilder, and repository integration tests

## Deterministic tooling & validation scripts

All scripts are dependency-free token-level static analyzers, executed from this skill package directory (`${CLAUDE_SKILL_DIR}/scripts` or relative path). They require **PHP 8.1+** — on older versions they print `[FATAL]` to STDERR and exit 2 before any output.

Exit codes (all scripts): **0** = pass or warnings only · **1** = at least one error (blocking) · **2** = fatal invocation error (PHP guard, wrong scan path / nothing to scan, `--file` not found). Warnings never block: they exit 0 and are reported separately from errors.

- `scripts/verify-all.php` — unified orchestrator running all checkers in a single pass with aggregated summary:
  - Run: `php scripts/verify-all.php [project-path] [--format=text|json] [--quiet] [--verbose]`
- `scripts/check-di-syntax.php` — static AST/token validation for DI files (`config/**/di/*.php`) and `params.php`:
  - Catches typos in configuration keys (`'__construct()'`, `'class'`, missing `()` on methods, missing `$` on properties) and PHP syntax errors; requires a returned array (`return [...]`).
  - Detects legacy Yii 2 constructs (`'__class'`).
  - Self-binding (`Interface => Interface`) is an error. Unmapped `Reference::to(Interface)` bindings and closures in `params.php` are warnings (cross-file unbound interface targets remain errors).
  - With `vendor/autoload.php` present: reflection-verifies targets (class not found, abstract target, unimplemented interface) and resolves interfaces beyond the `*Interface` name suffix.
  - Run: `php scripts/check-di-syntax.php [project-path] [--format=text|json] [--quiet]`
- `scripts/verify-actions.php` — static AST/token audit for Actions & Controllers:
  - Enforces `declare(strict_types=1);` as the first statement in action files and strict non-nullable `Psr\Http\Message\ResponseInterface` return types (rejects missing, nullable, primitive, and non-response types).
  - Enforces Thin Action principle (prohibits direct SQL, query builders, transactions, and DB/ORM injection in presentation layer).
  - Blocks legacy Yii 2 constructs (`Yii::$app`, `yii\*` namespaces incl. `extends yii\web\Controller` via import, superglobals, `$model->load()`) and PHP syntax errors.
  - Catches high-frequency Yii 3 traps: `Cookie::create()`, `Yiisoft\Cookies\SameSite` import, `->createToken()` on token factories, `->send()`/`->sendStream()` on download responses, `->withStatus()` on a view renderer.
  - Warning rule: importing the deprecated `Yiisoft\DataResponse\DataResponseFactoryInterface` (use `Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface` instead); everything else is a blocking error.
  - Run: `php scripts/verify-actions.php [project-path] [--format=text|json] [--quiet]`
- `scripts/verify-routes.php` — static token audit for Route configuration files (`routes.php`):
  - Enforces `declare(strict_types=1);` as the first statement in route files.
  - Detects legacy Yii 2 route parameter syntax `<id:\d+>` or `<id>` and requires FastRoute `{id:\d+}`.
  - Detects duplicate route names defined via `->name('...')`.
  - Blocks legacy string action targets (`'site/index'`) and static facades (`Yii::$app`).
  - Run: `php scripts/verify-routes.php [project-path] [--format=text|json] [--quiet]`

## Canonical examples & templates

- `examples/crud-slice/README.md` — minimal canonical vertical slice for generating new Yii 3 features:
  - `Migration/` — schema table creation with `ColumnBuilder` (`M261026120000CreatePostTable.php`).
  - `Domain/` — pure entity (`Post.php`) and repository contract (`PostRepositoryInterface.php`).
  - `Persistence/` — repository implementation using `ConnectionInterface` and `Query` (`DbPostRepository.php`).
  - `Presentation/` — invokable thin actions (`CreatePostAction.php`, `ViewPostAction.php`) and input DTO with validation attributes `#[Required]`, `#[Length]` (`CreatePostDto.php`).
  - `Config/` — DI container mapping (`di.php`) and modern HTTP routing (`routes.php`).
