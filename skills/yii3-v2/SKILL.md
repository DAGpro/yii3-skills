---
name: yii3-v2
description: >-
  Use when planning, implementing, fixing, reviewing or verifying Yii3 code (requires yiisoft/* with
  yiisoft/config; no yii2). Provides conventions, package catalog, architecture decomposition, and DI/routing.
  Use when user says "Yii3", "Yii 3", "yiisoft", "create yii3 action", "yii3 endpoint", "add repository", "add
  use case", "add event", "add listener", "add middleware", "send email", "queue job", "worker command", "mutex
  lock", "Yii migration", "render view", "custom widget", "gridview", "dataview", "asset bundle", "validate yii3
  form", "validation rules", "form model", "log target", "PSR-3 logging", "translate messages", "i18n", "flash
  message", "CSRF", "file upload", "download file", "swagger", "openapi", "RoadRunner", "FrankenPHP", "worker
  runner", "layered architecture", "vertical slices". Not for Yii2.
---

# Yii3 development

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
2. For business feature requests, decompose into full artifact graph (Domain, Persistence, Use Case, Presentation, Wiring) via `references/feature-recipes.md`.
3. Install/wire missing packages per `references/dependency-protocol.md`.
4. Place and write code: architecture source first, then `references/conventions.md`.
5. Verify: run project tests and linters (Psalm/PHPStan, Rector, CS-Fixer, PHPUnit). Then run the deterministic gate — both validation scripts (see "Deterministic tooling & validation scripts" below) against the changed scope (project root by default): fix every reported error and rerun both until both exit 0. Exit 2 means a misconfigured invocation (wrong path or PHP guard) — fix the invocation, never treat it as a pass. Warnings exit 0 — report them separately, do not block. Report added packages and changed config files.

   Step-5 verification report (compact template):

   ```
   check-di-syntax.php <scope> -> exit 0
   verify-actions.php <scope>  -> exit 1 (1 error)
   issues:
   - config/common/di/db.php:5 — typo_class_key — invalid class key 'classname'
   fixes applied: renamed 'classname' to 'class'
   rerun: check-di-syntax.php -> 0; verify-actions.php -> 0
   warnings (exit 0, non-blocking): params.php:4 — closure_in_params — closure in parameters file
   ```

## References (read on demand)

### Core & Architecture
- `references/conventions.md` — layout, config, DI, actions, routes, anti-patterns, SSOT verification rule
- `references/architecture-alignment.md` — where code goes + per-pattern placement tables and dependency rules
- `references/feature-recipes.md` — feature archetypes, decomposition into layers, capability inference, wiring checklist
- `references/dependency-protocol.md` — check, install, wire, learn a package
- `references/package-catalog.md` — packages, capability keys, driver choices
- `references/api-signatures.md` — exact signatures for top 15 Yii3 interfaces and classes
- `references/di-and-config.md` — PSR-11 container, config directory separation, definition syntax recipes, parameter inheritance, and environment overrides
- `references/events-and-listeners.md` — PSR-14 event architecture, immutable domain event DTOs, listener design, event mapping configuration, and post-commit dispatching

### HTTP & Presentation
- `references/routes.md` — FastRoute route syntax, regex parameter constraints, nested groups, middleware ordering, URL generation, and attribute routes
- `references/middlewares.md` — PSR-15 HTTP middleware pipeline, request pre-processing, security post-processing, auth short-circuiting, and official middleware catalog
- `references/actions-and-controllers.md` — package usage recommendations in actions/controllers, HTTP request parsing, DTO hydration, validation, security, data-response, and view rendering
- `references/openapi-swagger.md` — OpenAPI specification generation with yiisoft/yii-swagger, PHP 8 attributes (OA), Swagger UI asset rendering, and route integration
- `references/validation-and-forms.md` — built-in and custom validator rules, skipOnEmpty/when modifiers, message translation, FormModel + FormHydrator, validating hydrator DTOs, and input-http request inputs
- `references/views-and-widgets.md` — view placement (colocated action templates or central views directory), PHP view templates, mandatory XSS escaping, layouts, asset bundles, custom widgets, HTML forms, and DataView widgets (GridView, ListView, DetailView)
- `references/http-state.md` — sessions and session middleware, flash messages, cookie handling with signing/encryption, and CSRF token implementations with middleware wiring
- `references/file-handling.md` — FileHelper filesystem utilities, download responses (sendFile, x-sendfile, byte ranges), and the PSR-7 upload flow with file validation rules
- `references/i18n-translation.md` — translator API and category sources, message formatters, PHP/DB/gettext message storage, message extraction, and locale routing middleware

### Persistence & Data
- `references/persistence-db.md` — low-level yiisoft/db Connection, Command, Query Builder, transactions, and QueryDataReader pagination
- `references/persistence-active-record.md` — yiisoft/active-record models, queries, relations, lifecycle, and LazyLoadGuard N+1 prevention
- `references/persistence-cycle-orm.md` — Cycle ORM integration (yiisoft/yii-cycle, cycle/orm, #[Entity], EntityReader, and schema CLI migrations)
- `references/migrations.md` — database schema DDL migrations, typed column definitions, foreign keys, indexes, reversible migrations, and data seeding
- `references/caching.md` — PSR-16 drivers, getOrSet stampede prevention, TagDependency invalidation, and HTTP/view fragment caching

### Infrastructure, Async & Operations
- `references/runners-and-runtimes.md` — entry point architecture, HttpApplicationRunner (public/index.php), ConsoleApplicationRunner (yii CLI), RoadRunner & FrankenPHP workers, and StateResetter
- `references/commands.md` — thin console commands with Symfony Console, input arguments/options, interactive SymfonyStyle, ExitCode constants, and command registration
- `references/queue-jobs.md` — asynchronous queue jobs, serializable message DTOs, worker handlers, distributed mutex locks, and worker CLI management
- `references/auth-and-rbac.md` — user identity, session lifecycle (login/logout anti-fixation), remember-me cookies, user events, JWT auth, RBAC manager, and route protection
- `references/mailer.md` — email composition, Symfony Mailer DSN transport, HTML view templating, file attachments, inline CID embeddings, and async queue sending
- `references/logging.md` — PSR-3 logger injection, DI binding for LoggerInterface, categories, placeholders, target catalog (file/db/email/syslog/stream), context providers, and flushing
- `references/error-handling.md` — ErrorCatcher middleware, custom HTML/JSON Problem Details renderers, Friendly Exceptions, and Sentry logging
- `references/testing-core.md` — test architecture, testing pyramid, exclusive runner rule (PHPUnit vs Testo), PSR test doubles (yiisoft/test-support), modern mocking rules, and console command testing
- `references/testing-http.md` — functional HTTP testing with yiisoft/yii-testing, HttpApplicationRunner, isolated PSR-15 middleware testing, session/cookie validation, and ResponseAccessor API
- `references/testing-database.md` — transactional database testing, ephemeral in-memory SQLite (yiisoft/db-sqlite), migration fixtures with MigrationBuilder, and repository integration tests

## Deterministic tooling & validation scripts

Both scripts are dependency-free token-level analyzers, run from this skill package directory. They require **PHP 8.1+** — on older versions they print `[FATAL]` to STDERR and exit 2 before any output (including JSON).

Exit codes (both scripts): **0** = pass or warnings only · **1** = at least one error (blocking) · **2** = fatal invocation error (PHP guard, wrong scan path / nothing to scan, `--file` not found). Warnings never block: they exit 0 and are reported separately from errors.

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

## Canonical examples & templates

- `examples/crud-slice/README.md` — minimal canonical vertical slice for generating new Yii 3 features:
  - `Migration/` — schema table creation with `ColumnBuilder` (`M261026120000CreatePostTable.php`).
  - `Domain/` — pure entity (`Post.php`) and repository contract (`PostRepositoryInterface.php`).
  - `Persistence/` — repository implementation using `ConnectionInterface` and `Query` (`DbPostRepository.php`).
  - `Presentation/` — invokable thin actions (`CreatePostAction.php`, `ViewPostAction.php`) and input DTO with validation attributes `#[Required]`, `#[Length]` (`CreatePostDto.php`).
  - `Config/` — DI container mapping (`di.php`) and modern HTTP routing (`routes.php`).



