---
name: yii3
description: >-
  Architect, develop, test, and verify applications using modern Yii 3 (PHP 8.2+,
  yiisoft/* packages). Enforces bottom-up implementation stages, mandatory signature
  inspection in vendor sources, per-step wiring gates, and production readiness checks.
  Use when user says "Yii3", "Yii 3", "yiisoft", or asks for Yii 3 actions, routes,
  DI configuration, migrations, middleware, console commands, database persistence
  (yiisoft/db), or validation rules (yiisoft/validator).
---

# Yii3 development

End-to-end Yii 3 workflow: bootstrap the mission, implement bottom-up, verify to done.

## Mode & Decomposition Selection

Pick and print the mode and decomposition tier at Stage 0 before writing code.

### Mode (Execution Scope)
- **Light** — a single route, config/DI change, small fix, or guide lookup. Flow: Stage 0 → touched stages → touched Chain Integrity lines; the extended Finale (`references/core-definition-of-done.md`) is skipped.
- **Full** — everything else, default: new business features and runtime/auth/queue/infrastructure tasks run the full Mission Workflow and Finale with `references/core-definition-of-done.md`.

### Decomposition Intensity (Architectural Tiers)
- **Lightweight** — targeted change (single route, config/DI edit, single bugfix, docs/guide lookup). Touched stages only; skips domain layers and extended definition-of-done.
- **Standard** — regular business feature or CRUD without complex domain invariants (simple admin dictionary, lookup tables, settings toggles). Actions strictly remain thin (HTTP validation, request hydration, response building only). Domain abstractions may collapse: an Application Service or single Use Case handler directly interacts with a concrete repository class without separate pure domain aggregate entities or repository interfaces — only when the project's architecture artifact does not mandate the layered shape (Core rule 3). Application Services and Use Case Handlers are two structural forms of the same Application Layer (Strict prefers single-purpose Use Case Handlers; Balanced and Pragmatic permit cohesive Application Services grouping related operations or Use Case Handlers). Actions never absorb direct SQL, persistence, or transactions. Mandatory invariants: thin Actions, Input DTOs + validation, DB transactions in handlers, per-step wiring gates, tests. The plan marks folded domain artifacts `collapsed — <reason>`. Print any collapse in the Stage 0 mission plan (`Decomposition: Standard (collapsed — <reason>)`).
- **Full** — complex domain processes, state machines, multi-step transactions, async jobs/events, auth/security, or infrastructure slices. Full DDD bottom-up graph: Aggregate Entity, Value Objects, Repository Interface + Impl, Use Case, Events, Input DTOs, Actions, Tests, and Production Readiness Gate.

## AI Factory Adapter (Workflow Integration)

When executing inside an automated AI Factory workflow (`aif-plan`, `aif-implement`, `aif-verify`, `aif-fix`, `aif-review`, `aif-improve`), this adapter governs inter-agent coordination:

- The skill was loaded by the `yii3` injection inside an `aif-*` workflow: Stage 0 detects what the workflow already resolved (`.ai-factory/config.yaml` paths when present — including the configured plans directory — architecture artifact, rules file; never redo).
- `HANDOFF_MODE=1`: never ask the user — prefer what the project already uses, else the `yiisoft/*` default; record the decision or report blocked. This is the non-interactive contract; the same behavior applies to any external workflow that cannot ask questions.
- **Workflow Lifecycle Contract (`plan → implement → verify → fix → verify`):**
  - **`aif-plan`:** Reads prompt/requirements + architecture source; outputs 6 canonical plan phases with target file paths, package requirements, and initializes the durable `### Execution State` block in the plan artifact.
  - **`aif-implement`:** Consumes active plan; executes stages sequentially bottom-up; enforces per-step wiring gates; marks task checkboxes `- [x]`; updates `### Execution State` (Artifacts, Wiring, Verification, Next Stage).
  - **`aif-verify`:** Read-only gate; runs project checks + Chain Integrity + DoD; writes findings to `aif-gate-result` (`blockers`, `affected_files`); updates plan `### Execution State` (`Status: COMPLETE` or `BLOCKED`).
  - **`aif-fix`:** Consumes `aif-gate-result` blockers; targets root causes per Stage 0 item 3(c); updates affected code and plan `### Execution State`; hands off to `/aif-verify`.
- **Durable Plan State (`### Execution State`):** The active plan artifact (`.ai-factory/plans/*.md` or `PLAN.md`) is the durable state carrier across workflow sessions. Update checkboxes `- [x]` and append or update the execution record:
  ```markdown
  ### Execution State
  - **Stage:** <Current Stage number and name>
  - **Status:** <IN PROGRESS | COMPLETE | BLOCKED>
  - **Artifacts:**
    - `<path/to/file.php>` (<Role / Layer>)
  - **Wiring Gates:**
    - DI bindings: <PASS | PENDING | N/A>
    - Routes / CLI: <PASS | PENDING | N/A>
    - Events / Migrations: <PASS | PENDING | N/A>
  - **Verification:**
    - Syntax / Project Checks: <PASS | FAIL | NOT RUN>
    - Unit / HTTP Tests: <PASS | FAIL | NOT RUN | BLOCKED>
  - **Open Issues:** <None | description>
  - **Next Stage:** <Next Stage number and name | Finale>
  ```
- The Finale hands control to `/aif-verify` (findings merge into `aif-gate-result`); a direct standalone invocation closes the Finale itself.

## Stage 0 — Mission Bootstrap

Run first, in every mode. **Applicability guard:** this skill applies to Yii 3 applications — at least one `yiisoft/yii-*` package (app/runtime stack: `yiisoft/yii-runner*`, `yiisoft/yii-http`, `yiisoft/yii-console`, `yiisoft/yii-event`, ...; `yiisoft/yii2` excluded) in `composer.json` or `composer.lock`. A Yii 2 project (`yiisoft/yii2` present), a Yii-ecosystem library project (base `yiisoft/*` packages only — `yiisoft/di`, `yiisoft/strings`, ... — with no `yiisoft/yii-*`), or a non-Yii project: stop and report inapplicability — never apply Yii 3 rules to them. Unknown project state (missing `composer.lock`, contradictory evidence): report and ask before applying; autonomous runs report the task blocked.

1. **Bootstrap checklist** (skip items the running workflow already resolved — never redo):
   - Architecture source: the project's architecture artifact if present (`references/core-architecture-alignment.md`); otherwise guide placement rules — check 2–3 similar existing features as integration context (Core rule 3).
   - Rules: the configured rules file(s), else the project's existing conventions.
   - `composer.json` + `composer.lock`: installed `yiisoft/*` packages — re-anchor SSOT (Core rule 2), check against `references/package-catalog.md`.
2. **Cross-milestone consistency:** past milestones fixed the stack — exactly one DB driver, one persistence path, one queue/cache/mutex driver, one RBAC storage, one translator message storage, one test runner; dev tools stay in `require-dev`. Never introduce a second mechanism next to the existing one.
3. **Lifecycle position** — detect and print one of:
   - **(a) Plan task:** a plan artifact exists → execute the task per its phases (6-phase contract, see Mission Workflow). Resolution order, first match wins — print the chosen path: (1) a plan file explicitly passed by the user or the invoking command (argument, path, or link); (2) `PLAN.md` at the project root; (3) the most recently modified `*.md` under `docs/plans/` or `docs/plan/`. Nothing matched → treat as (b). An external workflow overrides this with its own plan location (see AI Factory Adapter).
   - **(b) Standalone feature** → full Mission Workflow route.
   - **(c) Bug / diagnostics:** root-cause checklist, in order: DI & configuration → input hydration & validation → routing & middleware → API signatures in `vendor/yiisoft/<pkg>/src`. No Yii2 facade workarounds.
4. **Archetype, Mode & Decomposition:** classify the task via the Task & Intent Routing Matrix; print `Mode: Light` or `Mode: Full`, and `Decomposition: Lightweight`, `Standard`, or `Full`.
5. **Mission plan & state tracker** — print before implementing to establish the explicit mission state:
   - For **Full / Standard** tasks:
     ```markdown
     ### Mission State
     - **Mode:** <Light | Full>
     - **Decomposition:** <Lightweight | Standard (collapsed — reason) | Full>
     - **Architecture:** <project source | convention fallback>
     - **Guides to load:** <primary guides>
     - **Stage Progress:**
       - Stage 1 [Migration & Schema]: <pending | skipped — reason>
       - Stage 2 [Domain Entity & Repository Contract]: <pending | skipped — reason>
       - Stage 3 [Repository Implementation]: <pending | skipped — reason>
       - Stage 4 [Use Case & Domain Events]: <pending | skipped — reason>
       - Stage 5 [Input DTO & Action / Command]: <pending | skipped — reason>
       - Stage 6 [Config Audit & Wiring Gate]: pending
       - Stage 7 [Tests & Quality Gate]: pending
     ```
   - For **Lightweight** tasks (single route, one-file fix, docs lookup):
     ```markdown
     ### Mission State
     - **Mode:** Light
     - **Decomposition:** Lightweight
     - **Architecture:** <project source | convention fallback>
     - **Touched Stages:** <e.g. Stage 5 (Action) | Stage 6 (Routes)>
     - **Wiring Gate:** pending
     ```
   *Plan artifact persistence:* when working from an approved plan (`.ai-factory/plans/*.md` or `PLAN.md`), the plan is the durable carrier of mission state across AI Factory workflow sessions — update task checkboxes `- [x]` as phases land and record stage completion so subsequent workflows have complete visibility.

## Mission Workflow (Stages 1–7)

For business features execute the stages strictly bottom-up, wiring each artifact the moment it is created — a stage is complete only when its per-step wiring gate (below) has landed. Plan tasks decompose into the 6 phases below — the single authoritative phase → stage mapping (plans say "phases", execution says "stages"):

| Plan phase | Execution stages |
|---|---|
| 1 Migration & Schema | Stage 1 |
| 2 Domain Entity & Repository Interface | Stage 2 |
| 3 Repository Implementation | Stage 3 |
| 4 Use Case Handler & Events | Stage 4 |
| 5 Input DTO & Single-Action Handler | Stage 5 |
| 6 Wiring & Tests | Stages 6–7 |

Never implement an Action or Controller before its Input DTO, Repository Interface, and Use Case exist — unless the decomposition-intensity rule above collapses the layers for a Standard-tier pass-through feature. Decompose per `references/core-feature-recipes.md` (§6 Chain Integrity Checklist). Install missing packages per `references/core-dependency-protocol.md` before writing code that uses them.

**Mission State execution discipline:**
1. Progress through active stages sequentially bottom-up.
2. Complete each stage's per-step wiring gate immediately upon creating an artifact — never batch wiring.
3. For multi-stage tasks, record stage transitions as they occur:
   `Stage N complete: <artifacts created> | Wiring gate: pass`
4. Stage 6 (Config Audit) verifies that all per-step wiring gates landed and reconciles cross-artifact configuration. Never begin Stage 6 while prior active stages remain incomplete.

**Mandatory Signature Lookup Protocol:** before calling any `yiisoft/*` method or constructor with more than 1 argument, look up the installed signature in `vendor/yiisoft/<pkg>/src` (Core rule 2, API row); never invent method names or copy Yii2 APIs. If `vendor/` is absent, request `composer install` first; when that is impossible, flag every API used as "not verified against sources" in the final report.

- **Stage 1 — Migration & Schema (Phase 1).** Tables, indexes, foreign keys via `yiisoft/db-migration`; every migration implements a reversible `down()`. Guides: `references/persistence-migrations-schema.md`, `references/persistence-migrations-operations.md`, `references/persistence-db.md`.
- **Stage 2 — Domain Entity & Repository Interface (Phase 2).** Pure aggregate, value objects, PSR-14 domain events, repository contract. Guides: `references/core-feature-recipes.md`, `references/core-events-design.md`.
- **Stage 3 — Repository Implementation (Phase 3).** Strictly the project's one persistence path (`yiisoft/db` / Active Record / Cycle); wrap multi-step persistence in transactions. Guides: the matching persistence row in the matrix.
- **Stage 4 — Use Case Handler & Events (Phase 4).** Use case command & handler (or cohesive Application Service methods in Balanced/Pragmatic tiers; Strict prefers dedicated single-responsibility Use Case Handlers); domain checks → `ConnectionInterface::transaction()` → PSR-14 listeners dispatched strictly after the transaction returns. Guides: `references/core-feature-recipes.md`, `references/core-events-design.md`.
- **Stage 5 — Input DTO & Single-Action Handler (or Console Command) (Phase 5).** Typed input DTO with `yiisoft/validator` rule attributes (rule names must exist in the installed validator); separate Create/Update DTOs. Thin Action = HTTP transport orchestration only, returning `Psr\Http\Message\ResponseInterface` via the archetype's response adapter (`WebViewRenderer` for HTML views, `DataResponseFactoryInterface` for REST/JSON API data responses, PSR-7 `ResponseFactoryInterface` for redirects/downloads); thin console command = CLI I/O only (`SymfonyStyle`, `ExitCode`) delegating to use cases. Actions never act as Application Services or execute direct queries. Guides: the matrix row for the archetype.
- **Stage 6 — Config Audit & Consolidation (Phase 6).** Final configuration pass: wiring already landed per step (wiring gates above) — verify every gate and add only cross-artifact config that no single step owns. Where things live: DI bindings in `config/**/di/*.php`; routes in `config/**/routes.php`; console commands in `config/console/params.php` under `'yiisoft/yii-console' => ['commands' => [...]]`; custom RBAC rules in `config/common/params.php` under `'yiisoft/rbac-rules-container'`; events in `config/**/events.php`. Guide: `references/core-di-and-config.md`.
- **Stage 7 — Tests (Phase 6).** Unit tests (use case / domain) + functional/HTTP tests on the project's single test runner. Guides: `references/testing-core.md` + the Testing row of the matrix.

**Per-step wiring gates** — never batched: new `*Interface` → DI binding; new Action → route; new console command → `config/console/params.php`; new RBAC rule → `'yiisoft/rbac-rules-container'`; side-effects → `config/**/events.php`. Every listing/query enforces an `OffsetPaginator` or an explicit SQL `limit`; mutating HTML-form routes carry `CsrfTokenMiddleware` after `SessionMiddleware` and before `Router`.

Non-feature tasks (pure config, docs, refactoring): Stage 0 marks the inapplicable stages; execute only the relevant ones — wiring gates still apply.

## Finale — Definition of Done

Run after the last stage, in every mode.

1. **Project checks** per the project's actual configuration: tests, `composer cs-fix`, Psalm/PHPStan, Rector where configured. Used packages must be declared in `composer.json`.
2. **Chain Integrity & Mission State Checklist** (blocking): all active stages in the Mission State tracker completed; every new `*Interface` bound in `config/**/di/*.php`; every Action has an active route in `config/**/routes.php`; every console command registered in `config/console/params.php`; every custom RBAC rule registered under `'yiisoft/rbac-rules-container'`; migrations exist for every new table / altered column with a reversible `down()`; side-effects wired in `config/**/events.php` and dispatched outside/after the DB transaction; nothing edited in `vendor/` or `config/.merge-plan.php`.
3. **Runtime smoke** (optional, Full mode, `vendor/` present):
   - Console (`yiisoft/yii-console` installed): `./yii list` must exit 0 and list newly registered commands (`references/infra-runners-and-runtimes.md`).
   - HTTP (adapt to project's installed runner): SAPI (`yiisoft/yii-runner-http`) boots without config errors and ping route responds; RoadRunner (`yiisoft/yii-runner-roadrunner`) or FrankenPHP (`yiisoft/yii-runner-frankenphp`) worker scripts initialize cleanly.
4. **Load `references/core-definition-of-done.md`** for Full-mode tasks (new features; runtime, auth, queues, infrastructure): Architecture & Decomposition checks, Multi-Dimensional Quality Evaluation Matrix, Production Readiness Gate, and the Verification Report format live there. Light mode stops here.
5. **Final report** — the closing answer must end with the verification report block from `references/core-definition-of-done.md` §4, one line each: `Mode: <Light|Full>`, `Decomposition: <Lightweight|Standard|Full>`, `Architecture: <source>`, fixes applied, tests (`pass | fail | not run | blocked (<reason>) | n/a`), static analysis (`pass | fail | not run | blocked (<reason>) | n/a`), packages added, config files changed, and `production readiness gate: pass | fail (<items>)` — Light mode prints `n/a`. This block is part of the deliverable: a code summary without it is an incomplete task.

## Core rules

1. **Yii3 is not Yii2.** No `Yii::$app`, no `yii\` namespace, no static facades, no behaviors (`TimestampBehavior`), no `rules()` / `behaviors()` on persistence models. PSR-based, injected.
2. **Source of truth — split by question type:**

   | Question | Authority (highest first) |
   |---|---|
   | **API** — signatures, config keys, package behavior | Installed `vendor/yiisoft/<pkg>/src/` (versions: `composer.lock`; version-gated: `references/core-version-notes.md`) → guides → model memory; project code is not an API authority. |
   | **Implementation patterns** — transactions, events, thin actions, DTOs | Skill guides (`references/*.md`); project divergence = `legacy drift` — flag, never copy. |
   | **Project conventions** — namespaces, layout, naming, chosen DB/cache/queue drivers | Architecture artifact when present; else dominant style of existing `src/` — new code continues it. |

   **Conflict rule:** A project convention wins strictly for question type 3 (**Project conventions** — directory layout, namespaces, naming conventions, chosen cache/queue/DB driver) unless correctness or security is violated (e.g. event dispatch inside a transaction) — then follow the guide and, in interactive runs, ask the user first (inside an external workflow, record the decision and continue; see AI Factory Adapter). Divergence in question type 2 (**Implementation patterns** — transactions, event timing, thin actions, DTO validation) is strictly `legacy drift`: **flag in the report, never copy into new code**.
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
| 7 | `Route::get('/path')` / `Group::create()` (deprecated since router 4.0.3 — `references/core-version-notes.md#r1-router-static-route--group-factories-deprecated-router-403`) | `new \Yiisoft\Router\Route\Get('/path')`, `new \Yiisoft\Router\Group()` |
| 8 | `./yii migrate/up` (slash separator) | `./yii migrate:up` (colon separator — `references/core-version-notes.md#r8-console-migration-commands-use-colon-names-db-migration`) |
| 9 | Editing `vendor/` or `config/.merge-plan.php` | Edit `config/**/params.php` / `di/*.php`, then `composer yii-config-rebuild` |
| 10 | `echo`, `print`, `die()`, `exit()` in actions | Return a PSR-7 `ResponseInterface` instance |
| 11 | Mixing Active Record and Cycle ORM | Choose strictly one persistence stack |
| 12 | `$session->getFlash(...)` / `$session->setFlash(...)` | Inject `FlashInterface` separately |
| 13 | `if ($currentUser->getIdentity() === null)` | `$currentUser->isGuest()` — `getIdentity()` never returns null (`references/core-version-notes.md#r7-currentusergetidentity-never-returns-null-user`) |
| 14 | `symplify/easy-coding-standard` (ecs) | `friendsofphp/php-cs-fixer` with `yiisoft/code-style` |
| 15 | `#[Override]` attribute on methods | Omit it in new code — Yii 3 convention: `yiisoft/code-style` ships `RemoveOverrideAttributeRector` in the `YII_CORE` set (`references/core-version-notes.md#r10-override-attribute-ban-code-style-yii_core-set`). Tooling-dependent enforcement: report a convention suggestion, never a blocking error, unless the project's Rector preset enables the rule (R10 verify step) |

## Task & Intent Routing Matrix

Load only the archetype's guides:

| Task Archetype | Primary Guides | Secondary |
|---|---|---|
| **REST API Endpoint / CRUD** | `references/http-actions-core.md`<br>`references/http-validation-rules.md`<br>`references/http-forms-and-hydration.md`<br>`references/http-routes-definition.md` | `references/persistence-db-connection-and-queries.md`<br>`references/infra-error-handling-web.md#3-exception-mapping-with-exceptionresponder`<br>`references/http-validation-advanced.md`<br>`references/http-routes-url-and-middleware.md` |
| **CLI Command / Worker** | `references/infra-commands.md`<br>`references/infra-queue-jobs.md` | `references/infra-logging.md`<br>`references/core-di-and-config.md`<br>`references/infra-queue-brokers.md` |
| **HTML UI / Forms / Grid** | `references/http-views.md`<br>`references/http-widgets-and-assets.md`<br>`references/http-forms-and-hydration.md`<br>`references/http-state.md` | `references/http-actions-concerns.md`<br>`references/http-validation-rules.md`<br>`references/http-file-handling.md`<br>`references/http-dataview-widgets.md` |
| **Auth / Identity / RBAC** | `references/infra-auth-and-rbac.md`<br>`references/http-middlewares.md` | `references/http-state.md#2-sessions-yiisoftsession`<br>`references/infra-auth-jwt.md`<br>`references/infra-auth-oauth2.md`<br>`references/infra-rbac-storage.md` |
| **Database & Schema Migrations** | `references/persistence-migrations-schema.md`<br>`references/persistence-migrations-operations.md`<br>`references/persistence-db-connection-and-queries.md` | `references/core-di-and-config.md`<br>`references/persistence-caching.md` |
| **Full Architecture Slices** | `references/core-architecture-alignment.md`<br>`references/core-feature-recipes.md` | `references/core-dependency-protocol.md`<br>`references/core-definition-of-done.md`<br>`references/package-catalog.md` |
| **Email / Notifications** | `references/infra-mailer.md` | `references/core-di-and-config.md`<br>`references/infra-mailer-transports.md` |
| **Testing** | `references/testing-core.md` | `references/testing-http.md`<br>`references/testing-database.md`<br>`references/http-validation-custom-rules.md` |
| **i18n** | `references/http-i18n-translation-api.md`<br>`references/http-i18n-storage-and-locale.md` | `references/http-routes-url-and-middleware.md`<br>`references/core-di-and-config.md` |
| **OpenAPI / Swagger** | `references/http-openapi-setup.md`<br>`references/http-openapi-endpoints.md` | `references/http-routes.md`<br>`references/http-openapi-ui-and-ops.md` |
| **Events & Listeners** | `references/core-events-design.md` | `references/core-events-reference.md`<br>`references/core-di-and-config.md` |
| **Active Record** | `references/persistence-active-record.md` | `references/persistence-db-connection-and-queries.md`<br>`references/persistence-migrations-schema.md` |
| **Bootstrap / Runners / Workers** | `references/infra-runners-and-runtimes.md` | `references/core-di-and-config.md`<br>`references/infra-state-resetter.md` |
| **Helper Lookup** | `references/core-utilities.md` | `references/package-catalog.md`<br>`references/core-utilities-niche.md`<br>`references/core-friendly-exceptions.md` · Tier 2: `vendor/yiisoft/<pkg>/src/` |

## References (read on demand)

Load targeted topic guides via the Task & Intent Routing Matrix above. The complete categorized catalog of specialized topic guides with descriptions is maintained in [`references/INDEX.md`](references/INDEX.md).
