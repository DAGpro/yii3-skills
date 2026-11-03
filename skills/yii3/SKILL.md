---
name: yii3
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
1. **Yii3 is not Yii2.** No `Yii::$app`, no `yii\` namespace, no static facades (`Yii::getAlias()`, `Yii::info()`, `ActiveRecord::find()`), no behaviors (`TimestampBehavior`), no `rules()` / `behaviors()` on persistence models. PSR-based, injected.
2. **Source of Truth & Verification Rule (Single Source of Truth / SSOT) — three-tier resolution hierarchy:**
   - **Tier 1 — Target Project Codebase (supreme authority):** `src/`, `config/`, `composer.json`, and the active architecture artifact (`.ai-factory/ARCHITECTURE.md` when present).
   - **Tier 2 — Installed Package Sources (API authority):** `vendor/yiisoft/<pkg>/src/` — exact class names, interfaces, method signatures, argument order, types, and configuration defaults.
   - **Tier 3 — Skill Reference Guides (fallback):** `references/*.md` (authoring synthesis and recipes, e.g. `references/package-catalog.md`, `references/core-api-signatures.md`).
   - In target projects, always verify exact method signatures, constructor arguments, and configuration options directly in `vendor/yiisoft/<package>/src/` for installed packages.
   - When generating or refactoring code, if an installed package's method signature or property is unfamiliar or in doubt, **read its source files in `vendor/yiisoft/<package>/src/`** rather than guessing or relying on legacy Yii2 habits.
   - Zero-hallucination policy: never invent method signatures, configuration keys, or assume Yii2 syntax.
   - **Package version awareness:** inspect `composer.lock` for the installed versions — newer majors change syntax (constructor-based routes in `yiisoft/router` 4.0+ vs older static factories; `WebViewRenderer` vs the deprecated `ViewRenderer`).
3. **Architecture decides placement:** `/aif-architecture` artifact if it exists, otherwise the project's real structure
   (`src/`, `config/` + similar existing features). See `references/core-architecture-alignment.md`.
4. Every capability goes through `references/core-dependency-protocol.md` before code is written.

### Cross-Cutting Yii 2 Bans (Quick Guard List)

The complete matrices with grounding rationale live in each topic guide's Anti-Pattern Matrix; the deterministic scripts (below) catch the mechanical violations. The most frequent ones:

| # | Forbidden Legacy / Anti-Pattern | Mandatory Idiomatic Yii 3 Replacement |
|---|---|---|
| 1 | `Yii::$app->...` or any static facade | Inject PSR / Yiisoft interfaces via constructor DI |
| 2 | `class SiteController extends Controller` with `actionIndex()` | `final readonly class IndexAction` with `__invoke()` |
| 3 | `$this->render('index', $data)` inside controllers | Inject `WebViewRenderer` and return `$this->viewRenderer->render(...)` |
| 4 | `$request->post('name')` / `$request->get('id')` | PSR-7 `getParsedBody()` or typed DTOs via `yiisoft/input-http`; route args via `CurrentRoute` |
| 5 | `rules()` and `behaviors()` on ActiveRecord models | Validation attributes on DTOs; PSR-14 events replace behaviors |
| 6 | `ActiveForm::begin()` in templates | `Html::form()->post()->csrf($csrf)->open()` and `Field::text(...)` |
| 7 | `Route::get('/path')` / `Group::create()` (router ≥ 4.0.3) | `new \Yiisoft\Router\Route\Get('/path')`, `new \Yiisoft\Router\Group()` |
| 8 | `./yii migrate/up` (slash separator) | `./yii migrate:up` (colon separator) |
| 9 | Editing `vendor/` or `config/.merge-plan.php` | Edit `config/**/params.php` / `di/*.php`, then `composer yii-config-rebuild` |
| 10 | `echo`, `print`, `die()`, `exit()` in actions | Return a PSR-7 `ResponseInterface` instance |
| 11 | Mixing Active Record and Cycle ORM | Choose strictly one persistence stack |
| 12 | `$session->getFlash(...)` / `$session->setFlash(...)` | Inject `FlashInterface` separately |
| 13 | `if ($currentUser->getIdentity() === null)` | `$currentUser->isGuest()` — `getIdentity()` never returns null |
| 14 | `symplify/easy-coding-standard` (ecs) | `friendsofphp/php-cs-fixer` with `yiisoft/code-style` |
| 15 | `#[Override]` attribute on methods | Omit it — forbidden by Yii 3 conventions, stripped by Rector (`RemoveOverrideAttributeRector`) |

## Workflow per task
0. Resolve architecture: check `.ai-factory/ARCHITECTURE.md` (or configured path), otherwise inspect existing `src/` and `config/`.
1. Check `composer.json` for installed packages; consult `references/package-catalog.md` and `references/core-feature-recipes.md` for required packages and drivers.
2. For business feature requests, decompose into full artifact graph (Domain, Persistence, Use Case, Presentation, Wiring) via `references/core-feature-recipes.md`; check the Chain Integrity Checklist (§6) there before writing code, and use the canonical slice `examples/crud-slice/README.md` as the decomposition reference.
3. Install/wire missing packages per `references/core-dependency-protocol.md`.
4. Place and write code: architecture source first (rule 3); for file placement and format follow the canonical example `examples/crud-slice/README.md` and the targeted topic guide from the routing matrix below.
5. Verify: run project tests and linters — typically `composer test`, `composer cs-fix`, `./vendor/bin/psalm --no-cache` (or PHPStan), and `./vendor/bin/composer-dependency-analyser` (missing/unused dependencies); Rector where configured. Then run the deterministic gate — the unified validation suite (or individual verifiers, see "Deterministic tooling & validation scripts" below) against the changed scope: fix every reported error and rerun until all exit 0. Exit 2 means a misconfigured invocation (wrong path or PHP guard) — fix the invocation, never treat it as a pass. Warnings exit 0 — report them separately, do not block. Report added packages and changed config files.

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
| **REST API Endpoint / CRUD** | `references/http-actions-and-controllers.md`<br>`references/http-validation-and-forms.md`<br>`references/http-routes.md` | `references/persistence-db.md`<br>`references/infra-error-handling.md` | `examples/crud-slice/README.md`<br>`verify-actions.php` |
| **CLI Command / Worker** | `references/infra-commands.md`<br>`references/infra-queue-jobs.md` | `references/infra-logging.md`<br>`references/core-di-and-config.md` | `check-di-syntax.php` |
| **HTML UI / Forms / Grid** | `references/http-views-and-widgets.md`<br>`references/http-validation-and-forms.md`<br>`references/http-state.md` | `references/http-actions-and-controllers.md`<br>`references/http-file-handling.md` | `verify-actions.php` |
| **Auth / Identity / RBAC** | `references/infra-auth-and-rbac.md`<br>`references/http-middlewares.md` | `references/http-routes.md`<br>`references/http-state.md` | `verify-actions.php` |
| **Database & Schema Migrations** | `references/persistence-migrations.md`<br>`references/persistence-db.md` (or `persistence-cycle-orm.md`) | `references/core-di-and-config.md`<br>`references/persistence-caching.md` | `examples/crud-slice/Migration` |
| **Full Architecture Slices** | `references/core-architecture-alignment.md`<br>`references/core-feature-recipes.md` | `references/core-dependency-protocol.md`<br>`references/package-catalog.md` | `examples/crud-slice/README.md` |
| **Email / Notifications** | `references/infra-mailer.md` | `references/core-di-and-config.md` | `check-di-syntax.php` |
| **Testing** | `references/testing-core.md` | `references/testing-http.md`<br>`references/testing-database.md` | `check-di-syntax.php` |
| **i18n / Localization** | `references/http-i18n-translation.md` | `references/http-routes.md`<br>`references/core-di-and-config.md` | `verify-actions.php` |
| **API Docs (OpenAPI / Swagger)** | `references/http-openapi-swagger.md` | `references/http-routes.md`<br>`references/http-actions-and-controllers.md` | `verify-routes.php` |
| **Events & Listeners** | `references/core-events-and-listeners.md` | `references/core-di-and-config.md`<br>`references/infra-commands.md` | `check-di-syntax.php` |
| **Persistence via Active Record** | `references/persistence-active-record.md` | `references/persistence-db.md`<br>`references/persistence-migrations.md` | `examples/crud-slice/Migration` |
| **App Bootstrap / Runners / Workers** | `references/infra-runners-and-runtimes.md` | `references/core-di-and-config.md`<br>`references/infra-queue-jobs.md` | `check-di-syntax.php` |
| **Cross-cutting API / Helper Lookup** | `references/core-api-signatures.md`<br>`references/core-utilities.md` | `references/package-catalog.md` | — |

### Core & Architecture
- `references/core-architecture-alignment.md` — framework & vendor boundary isolation, layer placement, and composition root wiring
- `references/core-feature-recipes.md` — feature archetypes, decomposition into layers, directory placement styles (vertical slice vs layered), capability inference, wiring checklist
- `references/core-dependency-protocol.md` — check, install, wire, learn a package
- `references/package-catalog.md` — packages, capability keys, driver choices
- `references/core-api-signatures.md` — exact signatures for the most-used Yii3 interfaces and classes
- `references/core-utilities.md` — standalone helper packages: ArrayHelper array access and transformation, StringHelper + Inflector, exception-safe Json, VarDumper/ClosureExporter, Classifier class discovery, and IP/DNS utilities
- `references/core-di-and-config.md` — PSR-11 container, config directory separation, canonical app skeleton & `config/` tree, definition syntax recipes, parameter inheritance, and environment overrides
- `references/core-events-and-listeners.md` — PSR-14 event architecture, immutable domain event DTOs, listener design, event mapping configuration, and post-commit dispatching

### HTTP & Presentation
- `references/http-routes.md` — FastRoute route syntax, regex parameter constraints, nested groups, middleware ordering, FastRoute caching, URL generation, Subfolder and Locale middlewares, declarative redirects, and FileRouter conventions
- `references/http-middlewares.md` — PSR-15 HTTP middleware pipeline, request pre-processing, security post-processing, auth short-circuiting, and official middleware catalog
- `references/http-actions-and-controllers.md` — package usage recommendations in actions/controllers, HTTP request parsing, DTO hydration, validation, security, data-response, and view rendering
- `references/http-openapi-swagger.md` — OpenAPI specification generation with yiisoft/yii-swagger, PHP 8 attributes (OA), Swagger UI asset rendering, and route integration
- `references/http-validation-and-forms.md` — built-in and custom validator rules, skipOnEmpty/when modifiers, message translation, FormModel + FormHydrator, validating hydrator DTOs, and input-http request inputs
- `references/http-views-and-widgets.md` — view placement (colocated action templates or central views directory), PHP view templates, mandatory XSS escaping, layouts, asset bundles, custom widgets, CSS-framework widget drivers (yiisoft/bootstrap5, yiisoft/yii-bulma), HTML forms, and DataView widgets (GridView, ListView, DetailView)
- `references/http-state.md` — sessions and session middleware, flash messages, cookie handling with signing/encryption, and CSRF token implementations with middleware wiring
- `references/http-file-handling.md` — FileHelper filesystem utilities, download responses (sendFile, x-sendfile, byte ranges), and the PSR-7 upload flow with file validation rules
- `references/http-i18n-translation.md` — translator API and category sources, message formatters, PHP/DB/gettext message storage, message extraction, and locale routing middleware

### Persistence & Data
- `references/persistence-db.md` — low-level yiisoft/db Connection, Command, Query Builder, transactions, QueryDataReader pagination, and driver packages (MySQL, PostgreSQL, SQLite, MSSQL, Oracle) with DSN/connection configuration
- `references/persistence-active-record.md` — yiisoft/active-record models, queries, relations, lifecycle, and LazyLoadGuard N+1 prevention
- `references/persistence-cycle-orm.md` — Cycle ORM Data Mapper integration (yiisoft/yii-cycle, cycle/orm, #[Entity], EntityReader/Writer, DBAL, migrations, and yiisoft/rbac-cycle-db)
- `references/persistence-migrations.md` — database schema DDL migrations, typed column definitions, foreign keys, indexes, reversible migrations, and data seeding
- `references/persistence-caching.md` — PSR-16 drivers (file, redis, db, APCu, memcached, wincache), getOrSet stampede prevention, TagDependency invalidation, and HTTP/view fragment caching

### Infrastructure, Async & Operations
- `references/infra-runners-and-runtimes.md` — entry point architecture, HttpApplicationRunner (public/index.php), SapiEmitter response emitting (yiisoft/psr-emitter), ConsoleApplicationRunner (yii CLI), RoadRunner & FrankenPHP workers (incl. rr binary installation), and StateResetter
- `references/infra-commands.md` — thin console commands with Symfony Console, input arguments/options, interactive SymfonyStyle, ExitCode constants, and command registration
- `references/infra-queue-jobs.md` — asynchronous queue jobs, serializable message DTOs, worker handlers, distributed mutex locks, and worker CLI management
- `references/infra-auth-and-rbac.md` — user identity, session lifecycle (login/logout anti-fixation), remember-me cookies, user events, JWT auth, OAuth2/OIDC login (yiisoft/yii-auth-client), RBAC manager with storage drivers (rbac-db, rbac-php, rbac-cycle-db), and route protection
- `references/infra-mailer.md` — email composition, Symfony Mailer DSN transport, HTML view templating, file attachments, inline CID embeddings, and async queue sending
- `references/infra-logging.md` — PSR-3 logger injection, DI binding for LoggerInterface, categories, placeholders, target catalog (file/db/email/syslog/stream), context providers, and flushing
- `references/infra-error-handling.md` — ErrorCatcher middleware, custom HTML/JSON Problem Details renderers, Friendly Exceptions, and Sentry logging
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
