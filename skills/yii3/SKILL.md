---
name: yii3
description: >-
  Yii 3 (PHP 8.2+, yiisoft/* packages) end-to-end development workflow:
  mission bootstrap, bottom-up implementation stages, production readiness
  gate. Use when user says "Yii3", "Yii 3", "yiisoft", "yii3 action",
  "yii3 route", "yii3 DI configuration", "yii3 migration", "yii3 middleware",
  "yii3 console command", "yiisoft/db", "yiisoft/validator".
---

# Yii3 development

End-to-end Yii 3 workflow: bootstrap the mission, implement bottom-up, verify to done.

## Mode selection: Light vs Full

Pick and print the mode at Stage 0.

- **Light** — a single route, config/DI change, small fix, or guide lookup. Flow: Stage 0 → touched stages → touched Chain Integrity lines; the extended Finale (`references/core-definition-of-done.md`) is skipped.
- **Full** — everything else, default: new features and runtime/auth/queue/infrastructure tasks run the full Mission Workflow and Finale with `references/core-definition-of-done.md`.

## AI Factory mode

Integration specifics live here; the rest of the skill is mode-neutral. "External workflow" means the skill was loaded by a workflow step (an `aif-*` command or any other automation) rather than invoked directly by the user.

- The skill was loaded by the `yii3` injection inside an `aif-*` workflow: Stage 0 detects what the workflow already resolved (`.ai-factory/config.yaml` paths when present — including the configured plans directory — architecture artifact, rules file; never redo).
- `HANDOFF_MODE=1`: never ask the user — prefer what the project already uses, else the `yiisoft/*` default; record the decision or report blocked. This is the non-interactive contract; the same behavior applies to any external workflow that cannot ask questions.
- Plan artifacts: an external workflow supplies the active plan from its own configured plans location; without it, Stage 0 falls back to the standalone resolution order in item 3(a).
- The Finale hands control to `/aif-verify` (findings merge into `aif-gate-result`); a direct invocation closes the Finale itself.

## Stage 0 — Mission Bootstrap

Run first, in every mode. If the target project's `composer.json` contains no `yiisoft/*` packages, this skill does not apply — stop and report inapplicability.

1. **Bootstrap checklist** (skip items the running workflow already resolved — never redo):
   - Architecture source: the project's architecture artifact if present (`references/core-architecture-alignment.md`); otherwise guide placement rules — check 2–3 similar existing features as integration context (Core rule 3).
   - Rules: the configured rules file(s), else the project's existing conventions.
   - `composer.json` + `composer.lock`: installed `yiisoft/*` packages — re-anchor SSOT (Core rule 2), check against `references/package-catalog.md`.
2. **Cross-milestone consistency:** past milestones fixed the stack — exactly one DB driver, one persistence path, one queue/cache/mutex driver, one RBAC storage, one translator message storage, one test runner; dev tools stay in `require-dev`. Never introduce a second mechanism next to the existing one.
3. **Lifecycle position** — detect and print one of:
   - **(a) Plan task:** a plan artifact exists → execute the task per its phases (6-phase contract, see Mission Workflow). Resolution order, first match wins — print the chosen path: (1) a plan file explicitly passed by the user or the invoking command (argument, path, or link); (2) `PLAN.md` at the project root; (3) the most recently modified `*.md` under `docs/plans/` or `docs/plan/`. Nothing matched → treat as (b). An external workflow overrides this with its own plan location (see AI Factory mode).
   - **(b) Standalone feature** → full Mission Workflow route.
   - **(c) Bug / diagnostics:** root-cause checklist, in order: DI & configuration → input hydration & validation → routing & middleware → API signatures in `vendor/yiisoft/<pkg>/src`. No Yii2 facade workarounds.
4. **Archetype & mode:** classify the task via the Task & Intent Routing Matrix; print `Light` or `Full`.
5. **Mission plan** — print before implementing: `Architecture: <source>`, guides to load, Finale gate.

## Mission Workflow (Stages 1–7)

For business features execute the stages strictly bottom-up. Plan tasks decompose into the 6 phases below — the single authoritative phase → stage mapping (plans say "phases", execution says "stages"):

| Plan phase | Execution stages |
|---|---|
| 1 Migration & Schema | Stage 1 |
| 2 Domain Entity & Repository Interface | Stage 2 |
| 3 Repository Implementation | Stage 3 |
| 4 Use Case Handler & Events | Stage 4 |
| 5 Input DTO & Single-Action Handler | Stage 5 |
| 6 Wiring & Tests | Stages 6–7 |

Never implement an Action or Controller before its Input DTO, Repository Interface, and Use Case exist. Decompose per `references/core-feature-recipes.md` (§6 Chain Integrity Checklist). Install missing packages per `references/core-dependency-protocol.md` before writing code that uses them.

**Mandatory Signature Lookup Protocol:** before calling any `yiisoft/*` method or constructor with more than 1 argument, look up the installed signature in `vendor/yiisoft/<pkg>/src` (Core rule 2, API row); never invent method names or copy Yii2 APIs. If `vendor/` is absent, request `composer install` first; when that is impossible, flag every API used as "not verified against sources" in the final report.

- **Stage 1 — Migration & Schema (Phase 1).** Tables, indexes, foreign keys via `yiisoft/db-migration`; every migration implements a reversible `down()`. Guides: `references/persistence-migrations-schema.md`, `references/persistence-migrations-operations.md`, `references/persistence-db.md`.
- **Stage 2 — Domain Entity & Repository Interface (Phase 2).** Pure aggregate, value objects, PSR-14 domain events, repository contract. Guides: `references/core-feature-recipes.md`, `references/core-events-design.md`.
- **Stage 3 — Repository Implementation (Phase 3).** Strictly the project's one persistence path (`yiisoft/db` / Active Record / Cycle); wrap multi-step persistence in transactions. Guides: the matching persistence row in the matrix.
- **Stage 4 — Use Case Handler & Events (Phase 4).** Use case command & handler; domain checks → `ConnectionInterface::transaction()` → PSR-14 listeners dispatched strictly after the transaction returns. Guides: `references/core-feature-recipes.md`, `references/core-events-design.md`.
- **Stage 5 — Input DTO & Single-Action Handler (or Console Command) (Phase 5).** Typed input DTO with `yiisoft/validator` rule attributes (rule names must exist in the installed validator); separate Create/Update DTOs. Thin Action = HTTP orchestration only, returning `ResponseInterface` via `DataResponseFactoryInterface`; thin console command = CLI I/O only (`SymfonyStyle`, `ExitCode`) delegating to use cases. Guides: the matrix row for the archetype.
- **Stage 6 — Config Wiring (Phase 6).** DI bindings in `config/**/di/*.php`; routes in `config/**/routes.php`; console commands in `config/console/params.php` under `'yiisoft/yii-console' => ['commands' => [...]]`; custom RBAC rules in `config/common/params.php` under `'yiisoft/rbac-rules-container'`; events in `config/**/events.php`. Guide: `references/core-di-and-config.md`.
- **Stage 7 — Tests (Phase 6).** Unit tests (use case / domain) + functional/HTTP tests on the project's single test runner. Guides: `references/testing-core.md` + the Testing row of the matrix.

**Per-step wiring gates** — never batched: new `*Interface` → DI binding; new Action → route; new console command → `config/console/params.php`; new RBAC rule → `'yiisoft/rbac-rules-container'`; side-effects → `config/**/events.php`. Every listing/query enforces an `OffsetPaginator` or an explicit SQL `limit`; mutating HTML-form routes carry `CsrfTokenMiddleware` after `SessionMiddleware` and before `Router`.

Non-feature tasks (pure config, docs, refactoring): Stage 0 marks the inapplicable stages; execute only the relevant ones — wiring gates still apply.

## Finale — Definition of Done

Run after the last stage, in every mode.

1. **Project checks** per the project's actual configuration: tests, `composer cs-fix`, Psalm/PHPStan, Rector where configured. Used packages must be declared in `composer.json`.
2. **Chain Integrity Checklist** (blocking): every new `*Interface` bound in `config/**/di/*.php`; every Action has an active route in `config/**/routes.php`; every console command registered in `config/console/params.php`; every custom RBAC rule registered under `'yiisoft/rbac-rules-container'`; migrations exist for every new table / altered column with a reversible `down()`; side-effects wired in `config/**/events.php` and dispatched outside/after the DB transaction; nothing edited in `vendor/` or `config/.merge-plan.php`.
3. **Runtime smoke** (optional, Full mode, `vendor/` present): `./yii list` must exit 0 and list the new commands — catches wiring failures the checklist review cannot see (`references/infra-runners-and-runtimes.md`).
4. **Load `references/core-definition-of-done.md`** for Full-mode tasks (new features; runtime, auth, queues, infrastructure): Architecture & Decomposition checks, Production Readiness Gate, and the Verification Report format live there. Light mode stops here.

## Core rules

1. **Yii3 is not Yii2.** No `Yii::$app`, no `yii\` namespace, no static facades, no behaviors (`TimestampBehavior`), no `rules()` / `behaviors()` on persistence models. PSR-based, injected.
2. **Source of truth — split by question type:**

   | Question | Authority (highest first) |
   |---|---|
   | **API** — signatures, config keys, package behavior | Installed `vendor/yiisoft/<pkg>/src/` (versions: `composer.lock`; version-gated: `references/core-version-notes.md`) → guides → model memory; project code is not an API authority. |
   | **Implementation patterns** — transactions, events, thin actions, DTOs | Skill guides (`references/*.md`); project divergence = `legacy drift` — flag, never copy. |
   | **Project conventions** — namespaces, layout, naming, chosen DB/cache/queue drivers | Architecture artifact when present; else dominant style of existing `src/` — new code continues it. |

   **Conflict rule:** a project convention that contradicts a guide wins unless correctness or security is violated (e.g. event dispatch inside a transaction) — then follow the guide and, in interactive runs, ask the user first (inside an external workflow, record the decision and continue; see AI Factory mode). Record every divergence in the report.
3. **Placement:** per `references/core-architecture-alignment.md`; a resolved architecture artifact overrides guide defaults. Existing `src/` + `config/` are drift checks for rows 1–2 and the convention source for row 3.
4. Every capability goes through `references/core-dependency-protocol.md` before code is written.

### Cross-Cutting Yii 2 Bans (Quick Guard List)

Full grounded matrices: each guide's Anti-Pattern Matrix:

| # | Forbidden Legacy / Anti-Pattern | Mandatory Idiomatic Yii 3 Replacement |
|---|---|---|
| 1 | `Yii::$app->...` or any static facade | Inject PSR / Yiisoft interfaces via constructor DI |
| 2 | `class SiteController extends Controller` with `actionIndex()` | `final readonly class IndexAction` with `__invoke()` |
| 3 | `$this->render('index', $data)` inside controllers | Inject `WebViewRenderer` and return `$this->viewRenderer->render(...)` |
| 4 | `$request->post('name')` / `$request->get('id')` | PSR-7 `getParsedBody()` or typed DTOs (`yiisoft/input-http`); route args via `CurrentRoute` |
| 5 | `rules()` and `behaviors()` on ActiveRecord models | Validation attributes on DTOs; PSR-14 events replace behaviors |
| 6 | `ActiveForm::begin()` in templates | `Html::form()->post()->csrf($csrf)->open()` and `Field::text(...)` |
| 7 | `Route::get('/path')` / `Group::create()` (deprecated since router 4.0.3 — `references/core-version-notes.md`) | `new \Yiisoft\Router\Route\Get('/path')`, `new \Yiisoft\Router\Group()` |
| 8 | `./yii migrate/up` (slash separator) | `./yii migrate:up` (colon separator) |
| 9 | Editing `vendor/` or `config/.merge-plan.php` | Edit `config/**/params.php` / `di/*.php`, then `composer yii-config-rebuild` |
| 10 | `echo`, `print`, `die()`, `exit()` in actions | Return a PSR-7 `ResponseInterface` instance |
| 11 | Mixing Active Record and Cycle ORM | Choose strictly one persistence stack |
| 12 | `$session->getFlash(...)` / `$session->setFlash(...)` | Inject `FlashInterface` separately |
| 13 | `if ($currentUser->getIdentity() === null)` | `$currentUser->isGuest()` — `getIdentity()` never returns null |
| 14 | `symplify/easy-coding-standard` (ecs) | `friendsofphp/php-cs-fixer` with `yiisoft/code-style` |
| 15 | `#[Override]` attribute on methods | Omit it — forbidden by Yii 3 conventions, stripped by Rector (`RemoveOverrideAttributeRector`) |

## Task & Intent Routing Matrix

Load only the archetype's guides:

| Task Archetype | Primary Guides | Secondary |
|---|---|---|
| **REST API Endpoint / CRUD** | `references/http-actions-and-controllers.md`<br>`references/http-validation-rules.md`<br>`references/http-forms-and-hydration.md`<br>`references/http-routes-definition.md` | `references/persistence-db-connection-and-queries.md`<br>`references/infra-error-handling.md`<br>`references/http-validation-advanced.md`<br>`references/http-routes-url-and-middleware.md` |
| **CLI Command / Worker** | `references/infra-commands.md`<br>`references/infra-queue-jobs.md` | `references/infra-logging.md`<br>`references/core-di-and-config.md`<br>`references/infra-queue-brokers.md` |
| **HTML UI / Forms / Grid** | `references/http-views.md`<br>`references/http-widgets-and-assets.md`<br>`references/http-forms-and-hydration.md`<br>`references/http-state.md` | `references/http-actions-and-controllers.md`<br>`references/http-validation-rules.md`<br>`references/http-file-handling.md`<br>`references/http-dataview-widgets.md` |
| **Auth / Identity / RBAC** | `references/infra-auth-and-rbac.md`<br>`references/http-middlewares.md` | `references/http-state.md`<br>`references/infra-auth-jwt.md`<br>`references/infra-auth-oauth2.md`<br>`references/infra-rbac-storage.md` |
| **Database & Schema Migrations** | `references/persistence-migrations-schema.md`<br>`references/persistence-migrations-operations.md`<br>`references/persistence-db-connection-and-queries.md` | `references/core-di-and-config.md`<br>`references/persistence-caching.md` |
| **Full Architecture Slices** | `references/core-architecture-alignment.md`<br>`references/core-feature-recipes.md` | `references/core-dependency-protocol.md`<br>`references/core-definition-of-done.md`<br>`references/package-catalog.md` |
| **Email / Notifications** | `references/infra-mailer.md` | `references/core-di-and-config.md`<br>`references/infra-mailer-transports.md` |
| **Testing** | `references/testing-core.md` | `references/testing-http.md`<br>`references/testing-database.md`<br>`references/http-validation-custom-rules.md` |
| **i18n** | `references/http-i18n-translation.md` | `references/http-routes-url-and-middleware.md`<br>`references/core-di-and-config.md` |
| **OpenAPI / Swagger** | `references/http-openapi-setup.md`<br>`references/http-openapi-endpoints.md` | `references/http-routes.md`<br>`references/http-openapi-ui-and-ops.md` |
| **Events & Listeners** | `references/core-events-design.md` | `references/core-events-reference.md`<br>`references/core-di-and-config.md` |
| **Active Record** | `references/persistence-active-record.md` | `references/persistence-db-connection-and-queries.md`<br>`references/persistence-migrations-schema.md` |
| **Bootstrap / Runners / Workers** | `references/infra-runners-and-runtimes.md` | `references/core-di-and-config.md`<br>`references/infra-state-resetter.md` |
| **Helper Lookup** | `references/core-utilities.md` | `references/package-catalog.md`<br>`references/core-utilities-niche.md`<br>`references/core-friendly-exceptions.md` · Tier 2: `vendor/yiisoft/<pkg>/src/` |

## References (read on demand)

### Core & Architecture
- `references/core-architecture-alignment.md` — vendor boundaries, layer placement, composition root wiring
- `references/core-definition-of-done.md` — architecture checks, Production Readiness Gate, report format
- `references/core-feature-recipes.md` — archetypes, decomposition, directory placement, wiring checklist
- `references/core-dependency-protocol.md` — check, install, wire, learn a package
- `references/package-catalog.md` — packages, capability keys, driver choices
- `references/core-utilities.md` — ArrayHelper, StringHelper, Inflector, Json
- `references/core-utilities-niche.md` — VarDumper, Classifier, network utilities
- `references/core-friendly-exceptions.md` — FriendlyException contract, web & console rendering
- `references/core-di-and-config.md` — PSR-11 container, config tree, definition syntax, parameter inheritance
- `references/core-events-and-listeners.md` — split index: anti-pattern matrix
- `references/core-events-design.md` — PSR-14 architecture, event/listener design, config, post-commit rule
- `references/core-events-reference.md` — framework events catalog, signatures reference, testing
- `references/core-version-notes.md` — version-gated behavior catalog with `composer.lock` verification

### HTTP & Presentation
- `references/http-routes.md` — split index: worker-environment caveats, anti-pattern matrix, related guides
- `references/http-routes-definition.md` — route syntax & verb classes, FastRoute patterns, groups, route arguments
- `references/http-routes-url-and-middleware.md` — route middleware ordering, URL generation, file routing
- `references/http-middlewares.md` — PSR-15 pipeline, official middleware catalog
- `references/http-actions-and-controllers.md` — request parsing, DTO hydration, data-response
- `references/http-openapi-swagger.md` — split index: anti-patterns, related guides
- `references/http-openapi-setup.md` — architecture, installation, DI params, serving documentation
- `references/http-openapi-endpoints.md` — PHP 8 attribute annotations, multi-version API docs
- `references/http-openapi-ui-and-ops.md` — CLI spec generator, Swagger UI customization, env protection & caching
- `references/http-validation-and-forms.md` — split index: decision matrix, anti-pattern matrix, related guides
- `references/http-validation-rules.md` — validator package architecture, core engine, declaring rules
- `references/http-validation-advanced.md` — custom rules, file/image validation, cross-property, messages & i18n
- `references/http-forms-and-hydration.md` — FormModel + FormHydrator, ValidatingHydrator, input-http
- `references/http-validation-custom-rules.md` — custom rules, handlers, DI wiring
- `references/http-views-and-widgets.md` — split index: anti-pattern matrix, related guides, child guides
- `references/http-views.md` — WebViewRenderer pipeline, template anatomy, XSS escaping, layouts, theming
- `references/http-widgets-and-assets.md` — asset bundles, widgets, CSS-framework drivers, HTML form rendering
- `references/http-views-twig.md` — Twig renderer, layouts, `WebViewExtension`
- `references/http-views-bootstrap5.md` — Bootstrap 5 CSS framework widget driver
- `references/http-views-bulma.md` — Bulma CSS framework widget driver
- `references/http-dataview-widgets.md` — GridView, ListView, DetailView
- `references/http-cache-etag.md` — ETag & conditional requests
- `references/http-state.md` — sessions, flash, cookies, CSRF wiring
- `references/http-file-handling.md` — FileHelper, downloads, uploads
- `references/http-i18n-translation.md` — translator API, message storage, locale routing

### Persistence & Data
- `references/persistence-db.md` — split index: anti-pattern matrix, related guides
- `references/persistence-db-connection-and-queries.md` — Connection, Command, Query Builder, transactions
- `references/persistence-db-readers-and-drivers.md` — pagination & data readers, drivers & DSN, signatures
- `references/persistence-active-record.md` — Active Record models, queries, relations
- `references/persistence-cycle-orm.md` — Cycle ORM data mapper
- `references/persistence-migrations.md` — split index: schema vs operations guides
- `references/persistence-migrations-schema.md` — migration contracts, naming, ColumnBuilder, FKs, DDL, seeding
- `references/persistence-migrations-operations.md` — params config, console command catalog, CI automation
- `references/persistence-caching.md` — PSR-16 caching, getOrSet, TagDependency
- `references/persistence-cache-drivers.md` — redis/db/APCu/memcached/wincache drivers

### Infrastructure & Async
- `references/infra-runners-and-runtimes.md` — entry points, runners, runtime selection
- `references/infra-runtime-roadrunner.md` — RoadRunner worker runtime
- `references/infra-runtime-frankenphp.md` — FrankenPHP worker runtime
- `references/infra-state-resetter.md` — long-running worker state safety
- `references/infra-commands.md` — thin console commands, SymfonyStyle, ExitCode, registration
- `references/infra-queue-jobs.md` — queue jobs, message DTOs, workers, failure pipelines
- `references/infra-queue-brokers.md` — broker adapters (queue-db/redis/amqp, SyncQueue)
- `references/infra-queue-mutex.md` — distributed mutex locks
- `references/infra-auth-and-rbac.md` — identity, session lifecycle, RBAC rules, route protection
- `references/infra-auth-jwt.md` — JWT authentication
- `references/infra-auth-oauth2.md` — OAuth2/OIDC clients
- `references/infra-rbac-storage.md` — rbac-db, rbac-php, rbac-cycle-db drivers
- `references/infra-mailer.md` — email composition, sending, templating, testing
- `references/infra-mailer-transports.md` — transports & DSN
- `references/infra-mailer-async-queue.md` — async queue sending
- `references/infra-logging.md` — PSR-3 injection, targets, context providers
- `references/infra-error-handling.md` — ErrorCatcher, ProblemDetails renderers, Sentry
- `references/testing-core.md` — test architecture, PHPUnit canon, PSR test doubles, mocking rules
- `references/testing-testo.md` — Testo alternative runner
- `references/testing-codeception.md` — Codeception alternative runner
- `references/testing-infection.md` — mutation testing gate
- `references/testing-console.md` — console command tests
- `references/testing-http.md` — functional HTTP testing & middleware testing
- `references/testing-database.md` — transactional DB testing, SQLite fixtures, repository tests
