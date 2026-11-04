---
name: yii3
description: >-
  Yii 3 end-to-end workflow (PHP 8.2+, yiisoft/*): mission bootstrap, routed implementation, verified finale + production readiness gate. Use when user says "Yii3", "Yii 3", "yiisoft", "create yii3 action", "add repository", "add use case", "add event", "add listener", "add middleware", "configure DI", "register route", "send email", "queue job", "worker command", "mutex lock", "roadrunner", "frankenphp", "Yii migration", "render view", "custom widget", "twig", "bootstrap", "bulma", "gridview", "dataview", "asset bundle", "validate yii3 form", "validation rules", "custom rule", "form model", "PHPUnit", "codeception", "testo", "cache", "redis", "query builder", "transactions", "active record", "cycle orm", "login", "JWT", "RBAC", "oauth", "sqlite", "error handling", "PSR-3 logging", "i18n", "flash message", "CSRF", "file upload", "download file", "swagger", "openapi", "layered architecture", "vertical slices", "yii3 workflow", "mission bootstrap", "definition of done", "production readiness".
---

# Yii3 development

End-to-end Yii 3 workflow: bootstrap the mission, implement bottom-up, verify to done.

## Table of Contents
- [Two modes: Standalone & AI Factory](#two-modes-standalone--ai-factory)
- [Stage 0 — Mission Bootstrap](#stage-0--mission-bootstrap)
- [Mission Workflow (Stages 1–7)](#mission-workflow-stages-17)
- [Finale — Definition of Done & Verification Report](#finale--definition-of-done--verification-report)
- [Core rules](#core-rules)
  - [Cross-Cutting Yii 2 Bans (Quick Guard List)](#cross-cutting-yii-2-bans-quick-guard-list)
- [References (read on demand)](#references-read-on-demand)
  - [Task & Intent Routing Matrix](#task--intent-routing-matrix)
  - [Core & Architecture](#core--architecture)
  - [HTTP & Presentation](#http--presentation)
  - [Persistence & Data](#persistence--data)
  - [Infrastructure, Async & Operations](#infrastructure-async--operations)
- [Deterministic tooling & validation scripts](#deterministic-tooling--validation-scripts)
- [Canonical examples & templates](#canonical-examples--templates)

---

## Two modes: Standalone & AI Factory

- **Standalone** — the skill was loaded directly: it leads the agent start-to-finish. Stage 0 bootstraps, Mission Workflow implements, Finale is the closing gate.
- **AI Factory** — the skill was loaded by the `yii3` injection inside an `aif-*` workflow (`/aif-plan`, `/aif-implement`, …). Stage 0 detects the steps the workflow has already done (config + plan resolution, context loading) and continues without redoing them; Finale verifies the same gates and hands control to `/aif-verify` (findings merge into `aif-gate-result`).

The contracts below are identical in both modes; only who closes the Finale gate differs.

## Stage 0 — Mission Bootstrap

Run first, in every mode, before writing any code.

1. **Guard:** if the target project's `composer.json` contains no `yiisoft/*` packages, this skill does not apply — stop and report inapplicability (mirrors the injection guard).
2. **Bootstrap checklist** (in AI Factory mode, skip items the running workflow has already resolved — detect and continue, never redo):
   - `.ai-factory/config.yaml` → `paths.architecture`, `paths.rules_file`, `paths.plans`. The file is optional: when absent use framework defaults; a missing `.ai-factory/` never blocks a standalone mission.
   - Architecture source: `.ai-factory/ARCHITECTURE.md` if present — note its vendor-isolation level (strict: pure POPO core, vendor packages only in infrastructure behind port interfaces; pragmatic: `Models/` may extend `Yiisoft\ActiveRecord\ActiveRecord`); otherwise mirror the real `src/` + `config/` layout and 2–3 similar existing features (Core rule 3).
   - Rules hierarchy: the configured rules file(s), else the project's existing conventions.
   - `composer.json` + `composer.lock`: installed `yiisoft/*` packages and versions — re-anchor the SSOT Tier 1 / Tier 2 hierarchy (Core rule 2) and check `composer.json` against `references/package-catalog.md`.
3. **Cross-milestone consistency:** the stack is fixed by past roadmap milestones — exactly one DB driver, one persistence path, one queue/cache/mutex driver, one RBAC storage, one translator message storage, one test runner; dev tools stay in `require-dev`. Never introduce a second mechanism next to the existing one.
4. **Lifecycle position** — detect and print one of:
   - **(a) Plan task:** a plan artifact of the current roadmap milestone exists → confirm the context and execute the task per its phases (6-phase decomposition contract: Migration & Schema → Domain → Persistence → Application → Presentation → Wiring & Tests).
   - **(b) Standalone feature:** a new feature request → full Mission Workflow route below.
   - **(c) Bug / diagnostics:** root-cause checklist, in order: DI & configuration (`config/**/di/*.php`, `params.php`, `config/.merge-plan.php`) → input hydration & validation (typed DTO properties, rule attributes) → routing & middleware → API signatures in `vendor/yiisoft/<pkg>/src`. Never use a Yii2 static facade as a workaround; keep the fix inside the existing structure.
5. **Archetype:** classify the task via the Task & Intent Routing Matrix below.
6. **Mission plan** — print before implementing:
   - `Architecture: <source>` — the artifact this run loaded;
   - guides to load (from the matrix row for the archetype);
   - gate scripts to run at the Finale.

## Mission Workflow (Stages 1–7)

For business features execute the stages strictly bottom-up — this is the execution refinement of the 6-phase plan contract (phases 2–5 map 1:1 onto stages 2–5; phase 6 "Wiring & Tests" = stages 6+7) and it matches the implement workflow's strict execution order:

> Step 1: Migration -> Step 2: Domain Entity & Repository Interface -> Step 3: Repository Implementation -> Step 4: Use Case Handler & Events -> Step 5: Input DTO & Single-Action Handler (or Console Command) -> Step 6: Config Wiring (DI, Routes, Events) -> Step 7: Tests.

Never implement an Action or Controller before its Input DTO, Repository Interface, and Use Case exist. Decompose per `references/core-feature-recipes.md` — its §6 Chain Integrity Checklist and `examples/crud-slice/README.md` are the canonical decomposition references. Install missing packages per `references/core-dependency-protocol.md` before writing code that uses them. Place every file per the architecture source (Core rule 3) and the targeted topic guide.

**Mandatory Signature Lookup Protocol:** before calling any `yiisoft/*` method or constructor with more than 1 argument, search the actual installed signature in `vendor/yiisoft/<pkg>/src`. Never invent method names from memory or copy Yii2 APIs.

Per-stage guide routing comes from the Task & Intent Routing Matrix below; load only the targeted guides.

- **Stage 1 — Migration & Schema (Phase 1).** Tables, indexes, foreign keys via `yiisoft/db-migration`; every migration implements a working reversible `down()`. Guides: `references/persistence-migrations.md`, `references/persistence-db.md` (or `references/persistence-cycle-orm.md`).
- **Stage 2 — Domain Entity & Repository Interface (Phase 2).** Pure entity/aggregate, value objects, PSR-14 domain events, repository contract. Guides: `references/core-feature-recipes.md`, `references/core-events-and-listeners.md`. Wiring gate: bind the new `*Interface` in `config/**/di/*.php` immediately.
- **Stage 3 — Repository Implementation (Phase 3).** `yiisoft/db` / Active Record / Cycle — strictly the project's one persistence path; wrap multi-step persistence in transactions. Guides: `references/persistence-db.md` / `references/persistence-active-record.md` / `references/persistence-cycle-orm.md`, `references/persistence-caching.md` (+ `references/persistence-cache-drivers.md` for an external cache driver).
- **Stage 4 — Use Case Handler & Events (Phase 4).** Use case command & handler; side-effects via PSR-14 listeners; dispatch events outside/after the DB transaction; run multiple state-modifying DB operations inside `ConnectionInterface::transaction()`. Guides: `references/core-feature-recipes.md`, `references/core-events-and-listeners.md`. Wiring gate: wire listeners in `config/**/events.php` immediately.
- **Stage 5 — Input DTO & Single-Action Handler (or Console Command) (Phase 5).** Typed input DTO with `yiisoft/validator` rule attributes (`#[Required]`, `#[Length]`, `#[StringValue]` — rule names must exist in the installed `yiisoft/validator`); separate Create/Update DTOs. Thin Action = HTTP orchestration only (hydrate DTO → validate → call use case → return `ResponseInterface` via `Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface`); thin console command = CLI I/O only (`SymfonyStyle`, `ExitCode`) delegating to use cases. Guides: the matrix row for the archetype (actions/controllers, validation, views/widgets, commands, mailer, auth, i18n, file handling …).
- **Stage 6 — Config Wiring (Phase 6).** DI bindings in `config/**/di/*.php`; routes in `config/**/routes.php`; console commands in `config/console/params.php` under `'yiisoft/yii-console' => ['commands' => [...]]`; custom RBAC rules in `config/common/params.php` under `'yiisoft/rbac-rules-container'`; events in `config/**/events.php`. Guide: `references/core-di-and-config.md`.
- **Stage 7 — Tests (Phase 6).** Unit tests (use case / domain) + functional/HTTP tests (action / endpoint) on the project's single test runner. Guides: `references/testing-core.md` + the Testing row of the matrix.

Per-step wiring gates — apply the moment the artifact appears, never batched to the end: new `*Interface` → bind in `config/**/di/*.php`; new Action → register route in `config/**/routes.php`; new console command → register in `config/console/params.php`; new RBAC rule → `config/common/params.php`; side-effects → `config/**/events.php` (dispatched outside/after the DB transaction). Every listing/query enforces an `OffsetPaginator` or an explicit SQL `limit`; mutating HTML-form routes carry `CsrfTokenMiddleware` registered after `SessionMiddleware` and before `Router`.

Non-feature tasks (pure config, docs, refactoring): Stage 0 marks the inapplicable stages; execute only the relevant ones — wiring gates still apply wherever wiring is touched.

## Finale — Definition of Done & Verification Report

Run after the last stage, in every mode.

1. **Deterministic gate** — from the skill package directory, against the target project path: `php scripts/verify-all.php [project-path]` (or individual verifiers: `check-di-syntax.php`, `verify-actions.php`, `verify-routes.php`). Loop: run → fix every reported error → rerun → repeat until all exit 0. Exit codes: **0** = pass or warnings only (warnings reported separately, non-blocking); **1** = at least one error (blocking); **2** = misconfigured invocation (wrong scan path or PHP guard) — fix the invocation, never treat it as a pass.
2. **Project checks** per the project's actual configuration: `composer test`, `composer cs-fix`, Psalm/PHPStan, `composer-dependency-analyser`, Rector where configured. Packages used in code must be declared in `composer.json`.
3. **Chain Integrity Checklist** (blocking): every new `*Interface` bound in `config/**/di/*.php`; every Action has an active route in `config/**/routes.php`; every console command registered in `config/console/params.php` under `'yiisoft/yii-console' => ['commands' => [...]]`; every custom RBAC `RuleInterface` registered in `config/common/params.php` under `'yiisoft/rbac-rules-container'`; migrations exist for every new table / altered column with a reversible `down()`; side-effects wired in `config/**/events.php` and dispatched outside/after the DB transaction; nothing edited in `vendor/` or `config/.merge-plan.php`.
4. **Architecture & Decomposition checks** — the same checks the verify workflow runs; most are already covered elsewhere (deterministic gate `verify-actions.php`, Chain Integrity rows above, PRG lines below), so keep an explicit checklist line only for what remains uncovered: thin Actions (no SQL/ActiveRecord persistence, hashing, or notifications in Actions); strict `Psr\Http\Message\ResponseInterface` return; validator rule names from the installed `yiisoft/validator` (`Length`, `StringValue`, `Integer` — not `HasLength`/`IsString`); CSRF middleware order (`CsrfTokenMiddleware` after `SessionMiddleware`, before `Router`; stateless token-authenticated JSON APIs sit outside the CSRF gate); PSR-3 `LoggerInterface` DI-bound with explicit targets; files placed per the architecture source.
5. **Production Readiness Gate** — the difference between "milestone closed" and "product ready". Every item is grounded in an existing guide:
   - runner & entry point configured; long-running workers reset state via `yiisoft/state-resetter` (`references/infra-runners-and-runtimes.md`, `references/infra-state-resetter.md`);
   - ErrorCatcher + ProblemDetails renderers, no debug output in production (`references/infra-error-handling.md`);
   - `LoggerInterface` bound in DI with explicit targets (`references/infra-logging.md`);
   - CSRF on state-changing routes + DTO validation (`references/http-state.md`);
   - auth/RBAC on protected routes (`references/infra-auth-and-rbac.md`);
   - reversible migrations, one persistence branch, transactions in use cases (`references/persistence-migrations.md`, `references/persistence-db.md`);
   - `yii-debug` / `yii-gii` / `code-style` only in `require-dev` (stack invariant via `references/package-catalog.md`);
   - cache on hot paths (`references/persistence-caching.md`) + pagination limits (`references/persistence-db.md`);
   - unit + HTTP tests and static analysis green (`references/testing-core.md`).

   Standalone: execute the gate. AI Factory: verify the checklist and hand it to `/aif-verify`.
6. **Report** — bind the verification report to the Finale and extend it with added packages, changed config files, and the Production Readiness Gate status:

   ```
   verify-all.php <scope> -> exit 1 (1 error)
   - verify-actions.php: config/common/di/db.php:5 — typo_class_key — invalid class key 'classname'
   fixes applied: renamed 'classname' to 'class'
   rerun: verify-all.php <scope> -> exit 0
   warnings (exit 0, non-blocking): params.php:4 — closure_in_params — closure in parameters file
   packages added: <list | none>
   config files changed: <list | none>
   production readiness gate: pass | fail (<items>)
   ```
7. **Handoff:** AI Factory mode → hand control to `/aif-verify` (findings merge into its `aif-gate-result`). Standalone → this Finale is the closing gate.

## Core rules
1. **Yii3 is not Yii2.** No `Yii::$app`, no `yii\` namespace, no static facades (`Yii::getAlias()`, `Yii::info()`, `ActiveRecord::find()`), no behaviors (`TimestampBehavior`), no `rules()` / `behaviors()` on persistence models. PSR-based, injected.
2. **Source of Truth & Verification Rule (Single Source of Truth / SSOT) — three-tier resolution hierarchy:**
   - **Tier 1 — Target Project Codebase (supreme authority):** `src/`, `config/`, `composer.json`, and the active architecture artifact (`.ai-factory/ARCHITECTURE.md` when present).
   - **Tier 2 — Installed Package Sources (API authority):** `vendor/yiisoft/<pkg>/src/` — exact class names, interfaces, method signatures, argument order, types, and configuration defaults.
   - **Tier 3 — Skill Reference Guides (fallback):** `references/*.md` (authoring synthesis and recipes, e.g. `references/package-catalog.md`, `references/core-feature-recipes.md`).
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

## References (read on demand)

### Task & Intent Routing Matrix
Load only the targeted reference guides required for the active task archetype:

| Task Archetype | Primary Guides (Start Here) | Secondary / Wiring Guides | Canonical Template / Gate |
|---|---|---|---|
| **REST API Endpoint / CRUD** | `references/http-actions-and-controllers.md`<br>`references/http-validation-and-forms.md`<br>`references/http-routes.md` | `references/persistence-db.md`<br>`references/infra-error-handling.md`<br>`references/http-cache-etag.md` (if ETag / conditional requests) | `examples/crud-slice/README.md`<br>`verify-actions.php` |
| **CLI Command / Worker** | `references/infra-commands.md`<br>`references/infra-queue-jobs.md` | `references/infra-logging.md`<br>`references/core-di-and-config.md`<br>`references/infra-queue-brokers.md` (broker driver)<br>`references/infra-queue-mutex.md` (locks) | `check-di-syntax.php` |
| **HTML UI / Forms / Grid** | `references/http-views-and-widgets.md`<br>`references/http-validation-and-forms.md`<br>`references/http-state.md` | `references/http-actions-and-controllers.md`<br>`references/http-file-handling.md`<br>`references/http-views-twig.md` (if Twig)<br>`references/http-views-bootstrap5.md` / `http-views-bulma.md` (installed CSS framework)<br>`references/http-dataview-widgets.md` (grid/list/detail tasks) | `verify-actions.php` |
| **Auth / Identity / RBAC** | `references/infra-auth-and-rbac.md`<br>`references/http-middlewares.md` | `references/http-routes.md`<br>`references/http-state.md`<br>`references/infra-auth-jwt.md` (if JWT)<br>`references/infra-auth-oauth2.md` (if OAuth2/OIDC)<br>`references/infra-rbac-storage.md` (RBAC storage driver) | `verify-actions.php` |
| **Database & Schema Migrations** | `references/persistence-migrations.md`<br>`references/persistence-db.md` (or `persistence-cycle-orm.md`) | `references/core-di-and-config.md`<br>`references/persistence-caching.md`<br>`references/persistence-cache-drivers.md` (external cache driver) | `examples/crud-slice/Migration` |
| **Full Architecture Slices** | `references/core-architecture-alignment.md`<br>`references/core-feature-recipes.md` | `references/core-dependency-protocol.md`<br>`references/package-catalog.md` | `examples/crud-slice/README.md` |
| **Email / Notifications** | `references/infra-mailer.md` | `references/core-di-and-config.md`<br>`references/infra-mailer-transports.md` (transport DSN)<br>`references/infra-mailer-async-queue.md` (if queue sending) | `check-di-syntax.php` |
| **Testing** | `references/testing-core.md` | `references/testing-http.md`<br>`references/testing-database.md`<br>`references/http-validation-custom-rules.md`<br>`references/testing-testo.md` (if Testo runner)<br>`references/testing-codeception.md` (if Codeception)<br>`references/testing-infection.md` (mutation gate)<br>`references/testing-console.md` (CLI tests) | `check-di-syntax.php` |
| **i18n / Localization** | `references/http-i18n-translation.md` | `references/http-routes.md`<br>`references/core-di-and-config.md` | `verify-actions.php` |
| **API Docs (OpenAPI / Swagger)** | `references/http-openapi-swagger.md` | `references/http-routes.md`<br>`references/http-actions-and-controllers.md` | `verify-routes.php` |
| **Events & Listeners** | `references/core-events-and-listeners.md` | `references/core-di-and-config.md`<br>`references/infra-commands.md` | `check-di-syntax.php` |
| **Persistence via Active Record** | `references/persistence-active-record.md` | `references/persistence-db.md`<br>`references/persistence-migrations.md` | `examples/crud-slice/Migration` |
| **App Bootstrap / Runners / Workers** | `references/infra-runners-and-runtimes.md` | `references/core-di-and-config.md`<br>`references/infra-queue-jobs.md`<br>`references/infra-runtime-roadrunner.md` (if RoadRunner)<br>`references/infra-runtime-frankenphp.md` (if FrankenPHP)<br>`references/infra-state-resetter.md` (worker state) | `check-di-syntax.php` |
| **Cross-cutting API / Helper Lookup** | `references/core-utilities.md` | `references/package-catalog.md`<br>`references/core-utilities-niche.md` (niche helpers)<br>`references/core-friendly-exceptions.md` | Tier 2: `vendor/yiisoft/<pkg>/src/` |

### Core & Architecture
- `references/core-architecture-alignment.md` — framework & vendor boundary isolation, layer placement, and composition root wiring
- `references/core-feature-recipes.md` — feature archetypes, decomposition into layers, directory placement styles (vertical slice vs layered), capability inference, wiring checklist
- `references/core-dependency-protocol.md` — check, install, wire, learn a package
- `references/package-catalog.md` — packages, capability keys, driver choices
- `references/core-utilities.md` — daily-use helper packages: ArrayHelper array access and transformation, StringHelper + Inflector, and exception-safe Json (niche helpers load separately)
- `references/core-utilities-niche.md` — rarely-needed standalone helpers: VarDumper debug dumping, Classifier class discovery, network-utilities (IpHelper/DnsHelper/IpRanges), and the requirements checker
- `references/core-friendly-exceptions.md` — FriendlyException contract, actionable solutions, and web & console rendering (consolidated single source)
- `references/core-di-and-config.md` — PSR-11 container, config directory separation, canonical app skeleton & `config/` tree, definition syntax recipes, parameter inheritance, and environment overrides
- `references/core-events-and-listeners.md` — PSR-14 event architecture, immutable domain event DTOs, listener design, event mapping configuration, and post-commit dispatching

### HTTP & Presentation
- `references/http-routes.md` — FastRoute route syntax, regex parameter constraints, nested groups, middleware ordering, FastRoute caching, URL generation, Subfolder and Locale middlewares, declarative redirects, and FileRouter conventions
- `references/http-middlewares.md` — PSR-15 HTTP middleware pipeline, request pre-processing, security post-processing, auth short-circuiting, and official middleware catalog
- `references/http-actions-and-controllers.md` — package usage recommendations in actions/controllers, HTTP request parsing, DTO hydration, validation, security, data-response, and view rendering
- `references/http-openapi-swagger.md` — OpenAPI specification generation with yiisoft/yii-swagger, PHP 8 attributes (OA), Swagger UI asset rendering, and route integration
- `references/http-validation-and-forms.md` — built-in validator rules, skipOnEmpty/when modifiers, message translation, FormModel + FormHydrator, validating hydrator DTOs, and input-http request inputs
- `references/http-validation-custom-rules.md` — custom validation rules (RuleInterface), service handlers (RuleHandlerInterface), DI wiring with RuleHandlerContainer, compound rules, and isolated unit testing
- `references/http-views-and-widgets.md` — view placement (colocated action templates or central views directory), PHP view templates, mandatory XSS escaping, layouts, view injections, asset bundles, custom & core widgets, and HTML form rendering (Twig engine and CSS-framework widget drivers load separately)
- `references/http-views-twig.md` — Twig template engine: renderer registration, Twig layout anatomy, `WebViewExtension`, and static-invocation restrictions
- `references/http-views-bootstrap5.md` — Bootstrap 5 widget driver (`yiisoft/bootstrap5`), flash alerts, Bootstrap asset bundles, and form theming presets
- `references/http-views-bulma.md` — Bulma widget driver catalog (`yiisoft/yii-bulma`)
- `references/http-dataview-widgets.md` — DataView widgets (`yiisoft/yii-dataview`): GridView architecture, column catalog, filters, ListView, DetailView, and standalone pagination
- `references/http-cache-etag.md` — HTTP response caching with ETag & conditional requests around the middleware pipeline
- `references/http-state.md` — sessions and session middleware, flash messages, cookie handling with signing/encryption, and CSRF token implementations with middleware wiring
- `references/http-file-handling.md` — FileHelper filesystem utilities, download responses (sendFile, x-sendfile, byte ranges), and the PSR-7 upload flow with file validation rules
- `references/http-i18n-translation.md` — translator API and category sources, message formatters, PHP/DB/gettext message storage, message extraction, and locale routing middleware

### Persistence & Data
- `references/persistence-db.md` — low-level yiisoft/db Connection, Command, Query Builder, transactions, QueryDataReader pagination, and driver packages (MySQL, PostgreSQL, SQLite, MSSQL, Oracle) with DSN/connection configuration
- `references/persistence-active-record.md` — yiisoft/active-record models, queries, relations, lifecycle, and LazyLoadGuard N+1 prevention
- `references/persistence-cycle-orm.md` — Cycle ORM Data Mapper integration (yiisoft/yii-cycle, cycle/orm, #[Entity], EntityReader/Writer, DBAL, migrations, and yiisoft/rbac-cycle-db)
- `references/persistence-migrations.md` — database schema DDL migrations, typed column definitions, foreign keys, indexes, reversible migrations, and data seeding
- `references/persistence-caching.md` — PSR-16 caching architecture, File cache DI, getOrSet stampede prevention, TagDependency invalidation, and view fragment caching (external cache drivers load separately)
- `references/persistence-cache-drivers.md` — external PSR-16 cache driver wiring: redis, db, APCu, memcached, wincache (pick exactly one)

### Infrastructure, Async & Operations
- `references/infra-runners-and-runtimes.md` — entry point architecture, HttpApplicationRunner (public/index.php), SapiEmitter response emitting (yiisoft/psr-emitter), ConsoleApplicationRunner (yii CLI), and the runtime selection matrix (worker runtimes and StateResetter load separately)
- `references/infra-runtime-roadrunner.md` — RoadRunner worker runtime (`yiisoft/yii-runner-roadrunner`): worker loop, worker.php, .rr.yaml, gRPC/Temporal
- `references/infra-runtime-frankenphp.md` — FrankenPHP worker runtime (`yiisoft/yii-runner-frankenphp`): Caddy modes, worker.php, MAX_REQUESTS, Caddyfile
- `references/infra-state-resetter.md` — long-running worker state safety (`yiisoft/state-resetter`): the definition trap, per-service `'reset'` declarations, built-in resetter catalog
- `references/infra-commands.md` — thin console commands with Symfony Console, input arguments/options, interactive SymfonyStyle, ExitCode constants, and command registration
- `references/infra-queue-jobs.md` — asynchronous queue jobs, serializable message DTOs, worker handlers, failure pipelines, and worker CLI management (broker drivers and mutex load separately)
- `references/infra-queue-brokers.md` — queue broker adapter wiring: queue-db, queue-redis, queue-amqp, SyncQueue (pick exactly one)
- `references/infra-queue-mutex.md` — distributed mutex locks & Synchronizer (`yiisoft/mutex`) for concurrency safety in workers and beyond
- `references/infra-auth-and-rbac.md` — user identity, session lifecycle (login/logout anti-fixation), remember-me cookies, user events, RBAC manager & rules, and route protection (JWT, OAuth2/OIDC, and RBAC storage drivers load separately)
- `references/infra-auth-jwt.md` — stateless JWT authentication (`yiisoft/auth`): token issuance via `TokenFactory`, authenticator DI, parsing
- `references/infra-auth-oauth2.md` — OAuth2/OIDC login (`yiisoft/yii-auth-client`): AuthAction, provider clients, state/PKCE
- `references/infra-rbac-storage.md` — RBAC storage drivers: rbac-db, rbac-php, rbac-cycle-db, hybrid (pick exactly one)
- `references/infra-mailer.md` — email composition, sending lifecycle, HTML view templating, file attachments, inline CID embeddings, and testing recipes (transport DSN and async queue sending load separately)
- `references/infra-mailer-transports.md` — Symfony Mailer transport & DSN configuration, `useSendmail`, and full `messageSettings` map
- `references/infra-mailer-async-queue.md` — async queue sending via yiisoft/queue + PSR-14 listeners and BeforeSend/AfterSend lifecycle events
- `references/infra-logging.md` — PSR-3 logger injection, DI binding for LoggerInterface, categories, placeholders, target catalog (file/db/email/syslog/stream), context providers, and flushing
- `references/infra-error-handling.md` — ErrorCatcher middleware, custom HTML/JSON Problem Details renderers, and Sentry logging (Friendly Exceptions live in core-friendly-exceptions.md)
- `references/testing-core.md` — test architecture, testing pyramid, PHPUnit canon, PSR test doubles (yiisoft/test-support), and mocking rules (alternative runners and console testing load separately)
- `references/testing-testo.md` — Testo runner (exclusive alternative to PHPUnit) and the Mockery bridge
- `references/testing-codeception.md` — Codeception framework setup and actor-driven REST API testing
- `references/testing-infection.md` — Infection mutation testing as an optional quality gate
- `references/testing-console.md` — console command testing: CommandTester, exit codes, prompts, autocompletion
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
  - `Domain/` — pure aggregate (`Post.php`: factory method, `assignId()` guard, event recording, `releaseEvents()`), `PostStatus` enum, `PostCreated` domain event, repository contract (`PostRepositoryInterface.php`).
  - `Persistence/` — repository adapter using `ConnectionInterface` and `Query` (`DbPostRepository.php`); assigns the database identity after INSERT via `Post::assignId()`.
  - `Application/` — use case command & handler (`CreatePostCommand.php`, `CreatePostHandler.php`: domain checks → `ConnectionInterface::transaction()` → post-commit event dispatch) and a PSR-14 listener (`Listener/LogPostCreatedListener.php`).
  - `Presentation/` — invokable thin actions (`CreatePostAction.php`, `ViewPostAction.php`) and input DTO with validation attributes `#[Required]`, `#[Length]`, `#[InEnum]` (`CreatePostDto.php`).
  - `Config/` — DI container mapping (`di.php`), declarative PSR-14 event mapping (`events.php`), and modern HTTP routing (`routes.php`).
  - `Tests/` — handler unit tests proving the save → commit → dispatch order, no dispatch on rollback, and no write on failed domain checks (`CreatePostHandlerTest.php` + `Support/` doubles).
