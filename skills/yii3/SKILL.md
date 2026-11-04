---
name: yii3
description: >-
  Yii 3 (PHP 8.2+, yiisoft/* packages) end-to-end development workflow: mission bootstrap, bottom-up implementation stages, deterministic verification, production readiness gate. Use when user says "Yii3", "Yii 3", "yiisoft", "yii3 action", "yii3 route", "yii3 DI configuration", "yii3 migration", "yii3 middleware", "yii3 console command", "yii3 CRUD", "yii3 form validation", "yiisoft/db", "yiisoft/validator", "PSR-14 events in Yii3", "yii3 vertical slice".
---

# Yii3 development

End-to-end Yii 3 workflow: bootstrap the mission, implement bottom-up, verify to done.

## Mode selection: Light vs Full

Pick the mode at Stage 0 and print it.

- **Light** — small, contained edits: a single route, config/DI change, one-file refactor or fix, a guide lookup. Flow: Stage 0 (guard + archetype) → only the stages actually touched → deterministic gate → the touched Chain Integrity lines. The extended Finale (`references/core-definition-of-done.md`) is skipped.
- **Full** — everything else, default. New features and tasks touching runtime, auth, queues, or infrastructure run the full Mission Workflow and Finale with `references/core-definition-of-done.md`.

## AI Factory mode

All workflow-integration specifics live here; the rest of this skill reads without them.

- The skill was loaded by the `yii3` injection inside an `aif-*` workflow (`/aif-plan`, `/aif-implement`, `/aif-verify`, …): Stage 0 detects what the workflow already resolved (`.ai-factory/config.yaml` paths when present, architecture artifact, rules file — never redo).
- `HANDOFF_MODE=1`: never ask the user — prefer what the project already uses, else the `yiisoft/*` default; record the decision or report blocked.
- The Finale hands control to `/aif-verify` (findings merge into its `aif-gate-result`); Standalone runs close the Finale themselves.

## Stage 0 — Mission Bootstrap

Run first, in every mode. If the target project's `composer.json` contains no `yiisoft/*` packages, this skill does not apply — stop and report inapplicability.

1. **Bootstrap checklist** (skip items the running workflow already resolved — never redo):
   - Architecture source: the project's architecture artifact if present (`references/core-architecture-alignment.md`); otherwise mirror the real `src/` + `config/` layout and 2–3 similar existing features (Core rule 3).
   - Rules: the configured rules file(s), else the project's existing conventions.
   - `composer.json` + `composer.lock`: installed `yiisoft/*` packages — re-anchor the SSOT hierarchy (Core rule 2) and check against `references/package-catalog.md`.
2. **Cross-milestone consistency:** past milestones fixed the stack — exactly one DB driver, one persistence path, one queue/cache/mutex driver, one RBAC storage, one translator message storage, one test runner; dev tools stay in `require-dev`. Never introduce a second mechanism next to the existing one.
3. **Lifecycle position** — detect and print one of:
   - **(a) Plan task:** a plan artifact of the current milestone exists → execute the task per its phases (6-phase contract, see Mission Workflow).
   - **(b) Standalone feature** → full Mission Workflow route.
   - **(c) Bug / diagnostics:** root-cause checklist, in order: DI & configuration → input hydration & validation → routing & middleware → API signatures in `vendor/yiisoft/<pkg>/src`. No Yii2 facades as workarounds.
4. **Archetype & mode:** classify the task via the Task & Intent Routing Matrix; print `Light` or `Full`.
5. **Mission plan** — print before implementing: `Architecture: <source>`, guides to load, Finale gate scripts.

## Mission Workflow (Stages 1–7)

For business features execute the stages strictly bottom-up. Plan tasks decompose into the 6 phases below — the single authoritative phase → stage mapping (plan artifacts say "phases", execution says "stages"):

| Plan phase | Execution stages |
|---|---|
| 1 Migration & Schema | Stage 1 |
| 2 Domain Entity & Repository Interface | Stage 2 |
| 3 Repository Implementation | Stage 3 |
| 4 Use Case Handler & Events | Stage 4 |
| 5 Input DTO & Single-Action Handler | Stage 5 |
| 6 Wiring & Tests | Stages 6–7 |

Never implement an Action or Controller before its Input DTO, Repository Interface, and Use Case exist. Decompose per `references/core-feature-recipes.md` (§6 Chain Integrity Checklist) and `examples/crud-slice/README.md`. Install missing packages per `references/core-dependency-protocol.md` before writing code that uses them.

**Mandatory Signature Lookup Protocol:** before calling any `yiisoft/*` method or constructor with more than 1 argument, look up the actual installed signature in `vendor/yiisoft/<pkg>/src`; never invent method names or copy Yii2 APIs. If `vendor/` is absent, request `composer install` first; when that is impossible, flag every API used as "not verified against sources" in the final report.

- **Stage 1 — Migration & Schema (Phase 1).** Tables, indexes, foreign keys via `yiisoft/db-migration`; every migration implements a reversible `down()`. Guides: `references/persistence-migrations.md`, `references/persistence-db.md`.
- **Stage 2 — Domain Entity & Repository Interface (Phase 2).** Pure aggregate, value objects, PSR-14 domain events, repository contract. Guides: `references/core-feature-recipes.md`, `references/core-events-and-listeners.md`.
- **Stage 3 — Repository Implementation (Phase 3).** Strictly the project's one persistence path (`yiisoft/db` / Active Record / Cycle); wrap multi-step persistence in transactions. Guides: the matching persistence row in the matrix.
- **Stage 4 — Use Case Handler & Events (Phase 4).** Use case command & handler; domain checks → `ConnectionInterface::transaction()` → PSR-14 listeners dispatched strictly after the transaction returns. Guides: `references/core-feature-recipes.md`, `references/core-events-and-listeners.md`.
- **Stage 5 — Input DTO & Single-Action Handler (or Console Command) (Phase 5).** Typed input DTO with `yiisoft/validator` rule attributes (rule names must exist in the installed validator); separate Create/Update DTOs. Thin Action = HTTP orchestration only, returning `ResponseInterface` via `DataResponseFactoryInterface`; thin console command = CLI I/O only (`SymfonyStyle`, `ExitCode`) delegating to use cases. Guides: the matrix row for the archetype.
- **Stage 6 — Config Wiring (Phase 6).** DI bindings in `config/**/di/*.php`; routes in `config/**/routes.php`; console commands in `config/console/params.php` under `'yiisoft/yii-console' => ['commands' => [...]]`; custom RBAC rules in `config/common/params.php` under `'yiisoft/rbac-rules-container'`; events in `config/**/events.php`. Guide: `references/core-di-and-config.md`.
- **Stage 7 — Tests (Phase 6).** Unit tests (use case / domain) + functional/HTTP tests on the project's single test runner. Guides: `references/testing-core.md` + the Testing row of the matrix.

**Per-step wiring gates** — never batched: new `*Interface` → DI binding; new Action → route; new console command → `config/console/params.php`; new RBAC rule → `'yiisoft/rbac-rules-container'`; side-effects → `config/**/events.php`. Every listing/query enforces an `OffsetPaginator` or an explicit SQL `limit`; mutating HTML-form routes carry `CsrfTokenMiddleware` after `SessionMiddleware` and before `Router`.

Non-feature tasks (pure config, docs, refactoring): Stage 0 marks the inapplicable stages; execute only the relevant ones — wiring gates still apply.

## Finale — Definition of Done

Run after the last stage, in every mode.

1. **Deterministic gate** — from the skill package directory, against the target project path: `php scripts/verify-all.php [project-path]` (or individual verifiers). Loop: fix every error and rerun until exit 0. Exit codes and flags: tooling section below; exit 2 means a misconfigured invocation — fix the invocation, never treat it as a pass.
2. **Project checks** per the project's actual configuration: tests, `composer cs-fix`, Psalm/PHPStan, Rector where configured. Packages used in code must be declared in `composer.json`.
3. **Chain Integrity Checklist** (blocking): every new `*Interface` bound in `config/**/di/*.php`; every Action has an active route in `config/**/routes.php`; every console command registered in `config/console/params.php`; every custom RBAC rule registered under `'yiisoft/rbac-rules-container'`; migrations exist for every new table / altered column with a reversible `down()`; side-effects wired in `config/**/events.php` and dispatched outside/after the DB transaction; nothing edited in `vendor/` or `config/.merge-plan.php`.
4. **Runtime smoke** (optional, Full mode, when `vendor/` exists): run `./yii list` from the project root — it must exit 0 and list the new commands; catches container wiring failures the static gate cannot see (`references/infra-runners-and-runtimes.md`).
5. **Load `references/core-definition-of-done.md`** for Full-mode tasks (new features; runtime, auth, queues, infrastructure): Architecture & Decomposition checks, Production Readiness Gate, and the Verification Report format live there. Light mode stops here.

## Core rules

1. **Yii3 is not Yii2.** No `Yii::$app`, no `yii\` namespace, no static facades, no behaviors (`TimestampBehavior`), no `rules()` / `behaviors()` on persistence models. PSR-based, injected.
2. **Source of Truth (SSOT) hierarchy:** Tier 1 — target project codebase (`src/`, `config/`, `composer.json`, architecture artifact); Tier 2 — installed package sources `vendor/yiisoft/<pkg>/src/` (exact signatures, argument order, config defaults); Tier 3 — the skill's `references/*.md` guides. Verify unfamiliar signatures in Tier 2. Inspect `composer.lock` for installed versions — newer majors change syntax.
3. **Architecture decides placement:** the architecture artifact if it exists, otherwise the project's real structure (`src/`, `config/` + similar existing features). See `references/core-architecture-alignment.md`.
4. Every capability goes through `references/core-dependency-protocol.md` before code is written.

### Cross-Cutting Yii 2 Bans

Full grounded matrices: each topic guide's Anti-Pattern Matrix; the scripts below catch the mechanical ones:

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
Load only the active archetype's guides:

| Task Archetype | Primary Guides | Secondary | Template / Gate |
|---|---|---|---|
| **REST API Endpoint / CRUD** | `references/http-actions-and-controllers.md`<br>`references/http-validation-and-forms.md`<br>`references/http-routes.md` | `references/persistence-db.md`<br>`references/infra-error-handling.md` | `examples/crud-slice/README.md`<br>`verify-actions.php` |
| **CLI Command / Worker** | `references/infra-commands.md`<br>`references/infra-queue-jobs.md` | `references/infra-logging.md`<br>`references/core-di-and-config.md`<br>`references/infra-queue-brokers.md` | `check-di-syntax.php` |
| **HTML UI / Forms / Grid** | `references/http-views-and-widgets.md`<br>`references/http-validation-and-forms.md`<br>`references/http-state.md` | `references/http-actions-and-controllers.md`<br>`references/http-file-handling.md`<br>`references/http-dataview-widgets.md` | `verify-actions.php` |
| **Auth / Identity / RBAC** | `references/infra-auth-and-rbac.md`<br>`references/http-middlewares.md` | `references/http-state.md`<br>`references/infra-auth-jwt.md`<br>`references/infra-auth-oauth2.md`<br>`references/infra-rbac-storage.md` | `verify-actions.php` |
| **Database & Schema Migrations** | `references/persistence-migrations.md`<br>`references/persistence-db.md` | `references/core-di-and-config.md`<br>`references/persistence-caching.md` | `examples/crud-slice/Migration` |
| **Full Architecture Slices** | `references/core-architecture-alignment.md`<br>`references/core-feature-recipes.md` | `references/core-dependency-protocol.md`<br>`references/core-definition-of-done.md`<br>`references/package-catalog.md` | `examples/crud-slice/README.md` |
| **Email / Notifications** | `references/infra-mailer.md` | `references/core-di-and-config.md`<br>`references/infra-mailer-transports.md` | `check-di-syntax.php` |
| **Testing** | `references/testing-core.md` | `references/testing-http.md`<br>`references/testing-database.md`<br>`references/http-validation-custom-rules.md` | `check-di-syntax.php` |
| **i18n** | `references/http-i18n-translation.md` | `references/http-routes.md`<br>`references/core-di-and-config.md` | `verify-actions.php` |
| **OpenAPI / Swagger** | `references/http-openapi-swagger.md` | `references/http-routes.md` | `verify-routes.php` |
| **Events & Listeners** | `references/core-events-and-listeners.md` | `references/core-di-and-config.md` | `check-di-syntax.php` |
| **Persistence via Active Record** | `references/persistence-active-record.md` | `references/persistence-db.md`<br>`references/persistence-migrations.md` | `examples/crud-slice/Migration` |
| **App Bootstrap / Runners / Workers** | `references/infra-runners-and-runtimes.md` | `references/core-di-and-config.md`<br>`references/infra-state-resetter.md` | `check-di-syntax.php` |
| **Helper Lookup** | `references/core-utilities.md` | `references/package-catalog.md`<br>`references/core-utilities-niche.md`<br>`references/core-friendly-exceptions.md` | Tier 2: `vendor/yiisoft/<pkg>/src/` |

### Core & Architecture
- `references/core-architecture-alignment.md` — vendor boundaries, layer placement, composition root wiring
- `references/core-definition-of-done.md` — Finale extension: architecture checks, Production Readiness Gate, report format
- `references/core-feature-recipes.md` — archetypes, decomposition, directory placement, wiring checklist
- `references/core-dependency-protocol.md` — check, install, wire, learn a package
- `references/package-catalog.md` — packages, capability keys, driver choices
- `references/core-utilities.md`, `core-utilities-niche.md` — ArrayHelper, StringHelper, Inflector, Json; VarDumper, Classifier, network utilities- `references/core-friendly-exceptions.md` — FriendlyException contract, web & console rendering
- `references/core-di-and-config.md` — PSR-11 container, config tree, definition syntax, parameter inheritance
- `references/core-events-and-listeners.md` — PSR-14 architecture, immutable events, post-commit dispatching

### HTTP & Presentation
- `references/http-routes.md` — route syntax, constraints, groups, middleware ordering, URL generation
- `references/http-middlewares.md` — PSR-15 pipeline, official middleware catalog
- `references/http-actions-and-controllers.md` — request parsing, DTO hydration, data-response
- `references/http-openapi-swagger.md` — OpenAPI generation, Swagger UI
- `references/http-validation-and-forms.md` — validator rules, FormModel + FormHydrator
- `references/http-validation-custom-rules.md` — custom rules, handlers, DI wiring
- `references/http-views-and-widgets.md` — view placement, XSS escaping, layouts, assets, widgets
- `references/http-views-twig.md` — Twig renderer, layouts, `WebViewExtension`
- `references/http-views-bootstrap5.md`, `http-views-bulma.md` — CSS framework widget drivers
- `references/http-dataview-widgets.md` — GridView, ListView, DetailView
- `references/http-cache-etag.md` — ETag & conditional requests
- `references/http-state.md` — sessions, flash, cookies, CSRF wiring
- `references/http-file-handling.md` — FileHelper, downloads, uploads
- `references/http-i18n-translation.md` — translator API, message storage, locale routing

### Persistence & Data
- `references/persistence-db.md` — Connection, Command, Query Builder, transactions, pagination, drivers & DSN
- `references/persistence-active-record.md`, `persistence-cycle-orm.md` — Active Record models, queries, relations; Cycle ORM data mapper
- `references/persistence-migrations.md` — schema DDL, reversible migrations, seeding
- `references/persistence-caching.md`, `persistence-cache-drivers.md` — PSR-16 caching, getOrSet, TagDependency; redis/db/APCu/memcached/wincache drivers

### Infrastructure & Async
- `references/infra-runners-and-runtimes.md` — entry points, runners, runtime selection
- `references/infra-runtime-roadrunner.md`, `infra-runtime-frankenphp.md` — worker runtimes
- `references/infra-state-resetter.md` — long-running worker state safety
- `references/infra-commands.md` — thin console commands, SymfonyStyle, ExitCode, registration
- `references/infra-queue-jobs.md` — queue jobs, message DTOs, workers, failure pipelines
- `references/infra-queue-brokers.md`, `infra-queue-mutex.md` — broker adapters (queue-db/redis/amqp, SyncQueue); distributed mutex locks
- `references/infra-auth-and-rbac.md` — identity, session lifecycle, RBAC rules, route protection
- `references/infra-auth-jwt.md`, `infra-auth-oauth2.md` — JWT authentication; OAuth2/OIDC clients
- `references/infra-rbac-storage.md` — rbac-db, rbac-php, rbac-cycle-db drivers
- `references/infra-mailer.md` — email composition, sending, templating, testing
- `references/infra-mailer-transports.md`, `infra-mailer-async-queue.md` — transports & DSN; async queue sending
- `references/infra-logging.md` — PSR-3 injection, targets, context providers
- `references/infra-error-handling.md` — ErrorCatcher, ProblemDetails renderers, Sentry
- `references/testing-core.md` — test architecture, PHPUnit canon, PSR test doubles, mocking rules
- `references/testing-testo.md`, `testing-codeception.md`, `testing-infection.md`, `testing-console.md` — alternative runners, mutation gate, console tests
- `references/testing-http.md`, `testing-database.md` — functional HTTP testing & middleware testing; transactional DB testing, SQLite fixtures, repository tests

## Deterministic tooling

All scripts are dependency-free token-level static analyzers run from this skill package directory; they require **PHP 8.1+** and accept `[project-path]`, `[--format=text|json]`, `[--quiet]`, `[--verbose]`. Exit codes (all scripts): **0** = pass or warnings only · **1** = at least one error (blocking) · **2** = fatal invocation error (PHP guard, wrong scan path / nothing to scan, `--file` not found). Warnings never block.

- `scripts/verify-all.php` — runs all checkers below in one pass.
- `scripts/check-di-syntax.php` — DI files (`config/**/di/*.php`) and `params.php`: config-key typos, PHP syntax, legacy `'__class'`; self-binding (`Interface => Interface`) is an error; unmapped references and closures in `params.php` are warnings; reflection checks when `vendor/autoload.php` exists.
- `scripts/verify-actions.php` — Actions: `declare(strict_types=1);` first, strict `ResponseInterface` returns, Thin Action rule (no SQL/DB injection in presentation), legacy Yii 2 constructs, traps (`Cookie::create()`, `->send()`, output statements `echo`/`print`/`die`/`exit`); deprecated `DataResponse` factory import is a warning.
- `scripts/verify-routes.php` — `routes.php`: `declare(strict_types=1);`, legacy `<id:\d+>` syntax, duplicate route names, string action targets, static facades, legacy static route factories `Route::get/post/...()` / `Group::create()` (error on router ≥ 4.0.3; warning when `composer.lock` proves an older router).
- `scripts/selftest.php` — regression self-test of the verifiers against `scripts/fixtures/` (positives exit 0; negatives report expected rule codes); optional step of the extension validator (skipped when PHP is absent).

These are static heuristics: a green result never proves that DI wiring resolves or routes match at runtime.

## Canonical examples

- `examples/crud-slice/README.md` — canonical vertical slice template for new Yii 3 features, bottom-up: `Migration/` (ColumnBuilder DDL) → `Domain/` (aggregate with factory methods, `assignId()` guard, `PostStatus` enum, `PostCreated` event, repository contract) → `Persistence/` (`ConnectionInterface` + `Query` adapter) → `Application/` (command, handler: domain checks → `transaction()` → post-commit dispatch, listener) → `Presentation/` (thin actions, input DTO) → `Config/` (DI, events, routes) → `Tests/` (handler unit tests).
