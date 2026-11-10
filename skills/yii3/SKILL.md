---
name: yii3
description: >-
  Architect, develop, test, and verify applications using modern Yii 3 (PHP 8.2+,
  yiisoft/* packages). Enforces bottom-up stages, mandatory signature lookup in
  vendor sources, per-step wiring gates, and production readiness checks.
  Use when user says "Yii3", "Yii 3", "yiisoft", or asks to build, refactor, or test
  Yii 3 features: REST API endpoints, CRUD, thin actions, PSR-7/PSR-15 routes,
  middleware, DI wiring, database migrations, queries, Active Record, Cycle ORM,
  input DTOs, hydrator, validator, forms, views, widgets, console commands,
  queue jobs, cache, events, logging, error handling, auth, and RBAC.
  Accepts --mode=patch|feature|enterprise.
---

# Yii3 development

End-to-end Yii 3 workflow: bootstrap the mission, implement bottom-up, verify to done.

## Mode Selection & User Override

Pick and print the execution mode at Stage 0 before writing code:

- **User Mode Override:** The user can explicitly select the mode via command flag `--mode=<patch|feature|enterprise>`, prompt flags (`+patch`, `+feature`, `+enterprise`), or natural language (e.g. "in patch mode", "enterprise mode"). When specified, the requested mode strictly takes precedence.
- **Automatic Classification (Default: `Feature`):**
  - **1. Patch Mode (`Mode: Patch`):**
    - **Scope & Use:** Targeted surgical micro-tasks (isolated 1–3 files, single route addition, bugfix, pure config/DI edit, docs/guide lookup). Touched stages only; bypasses domain layer overhead; skips schema migrations ONLY when the patch does not require schema changes; skips extended Definition of Done (`references/core-definition-of-done.md`). Flow: Stage 0 → touched stages → touched wiring lines.
  - **2. Feature Mode (`Mode: Feature`) — Canonical Default:**
    - **Scope & Use:** Regular business features, CRUD endpoints, data listings, and Active Record / Cycle flows (~80% of daily tasks). Runs full 7-stage Mission Workflow and standard Definition of Done.
    - **Pragmatic Architecture:** Actions strictly remain thin HTTP transport adapters (hydration, validation, response building only). Business features follow standard layered idioms: Application Service, Use Case Handler, or direct Repository/ActiveRecord model without forced decoupled domain aggregate entities or interface indirection unless project architecture mandates them. Zero SQL, persistence, or transactions in presentation. Invariants: thin Actions, Input DTOs with Validator attributes, transactions in services/handlers, per-step wiring gates, tests.
  - **3. Enterprise Mode (`Mode: Enterprise`):**
    - **Scope & Use:** Complex business domains, multi-step transactions, state machines, async event pipelines, auth/security cores, or reusable infrastructure slices. Full DDD bottom-up graph: pure Aggregate Entities, Value Objects, Repository Interfaces + implementations, dedicated single-responsibility Use Case Handlers, domain events, and complete Production Readiness Gate.

**Architectural Alignment (independent axis from execution mode, maps 1:1 to `/aif-architecture` types, detailed in [`references/core-architecture-alignment.md`](references/core-architecture-alignment.md)):**
Execution mode (Patch / Feature / Enterprise) and architectural tier (Pragmatic / Balanced / Strict) are two independent orthogonal axes (all 9 combinations valid). The project's architecture tier dictates file placement and layer boundaries without restricting execution mode:
- **Layered Architecture (`layers`, Pragmatic Tier):** standard horizontal layers, actions consuming Application Services or repositories/Active Record models directly.
- **Structured Modules (`structured*`, Balanced Tier):** feature modules, rich models with Active Record / Cycle permitted, interfaces at module boundaries.
- **Explicit Architecture (`explicit*`, Strict Tier):** pure domain aggregates, decoupled ports, dedicated single-responsibility Use Case Handlers.
*Universal Invariant:* In all three modes and across all architectural tiers, Actions strictly remain thin HTTP transport adapters; zero direct SQL, persistence, or transaction management in presentation.

## AI Factory Adapter (Workflow Integration)

This skill is designed primarily as an AI Factory extension, with standalone chat execution as an adaptive fallback:

- **Path Resolution:** Detect and respect what the workflow already resolved via target `.ai-factory/config.yaml` (`paths.plans`, `paths.architecture`, `paths.rules_file`). Standalone fallback: `PLAN.md` or `docs/plans/`.
- **Autonomous Mode (`HANDOFF_MODE=1`):** In automated runs, interactive prompts are forbidden — adopt project conventions or `yiisoft/*` defaults; report `Status: BLOCKED` if ambiguous.
- **Durable State & Zero-Ambiguity Handoff:** Maintain task checkboxes `- [x]` and the `### Execution State` record in the active plan artifact. Every workflow transition must leave a fully self-contained artifact state without missing context.
- **Full Lifecycle Specification:** See [`references/aif-adapter.md`](references/aif-adapter.md) for the complete inter-agent coordination contract (`plan → implement → verify → fix → verify`), boundary matrix, and handoff rules. In AI Factory mode, the Finale hands control to `/aif-verify`; direct standalone invocation concludes at the Finale itself.

## Stage 0 — Mission Bootstrap

Run first, in every mode. **Applicability guard:** this skill applies to Yii 3 applications — at least one `yiisoft/yii-*` package (application/runtime stack: `yiisoft/yii-runner-http`, `yiisoft/yii-runner-console`, `yiisoft/yii-http`, `yiisoft/yii-console`, ...; `yiisoft/yii2` excluded) in `composer.json` or `composer.lock`. A Yii 2 project (`yiisoft/yii2` present), a Yii-ecosystem library project (base `yiisoft/*` packages only — `yiisoft/di`, `yiisoft/strings`, ... — without application runtime stack), or a non-Yii project: stop and report inapplicability — never apply Yii 3 rules to them. Unknown project state (neither composer.json nor composer.lock present, contradictory evidence): report and ask before applying; autonomous runs report the task blocked (`composer.json` declares intent; `composer.lock` confirms installed versions).

1. **Bootstrap checklist** (skip items the running workflow already resolved — never redo):
   - Architecture source: the project's architecture artifact if present (`references/core-architecture-alignment.md`); otherwise guide placement rules — check 2–3 similar existing features as integration context (Core rule 3).
   - Rules: the configured rules file(s), else the project's existing conventions.
   - `composer.json` + `composer.lock`: installed `yiisoft/*` packages — re-anchor SSOT (Core rule 2), check against `references/package-catalog.md`.
2. **Cross-milestone consistency:** past milestones fixed the stack — exactly one DB driver, one persistence path, one queue/cache/mutex driver, one RBAC storage, one translator message storage, one test runner; dev tools stay in `require-dev`. Never introduce a second mechanism next to the existing one.
3. **Lifecycle position** — detect and print one of:
   - **(a) Plan task:** a plan artifact exists → execute the task per its phases (6-phase contract, see Mission Workflow). Resolution order, first match wins — print the chosen path: (1) a plan file explicitly passed by the user or the invoking command (argument, path, or link); (2) `PLAN.md` at the project root; (3) the most recently modified `*.md` under `docs/plans/` or `docs/plan/`. Nothing matched → treat as (b). An external workflow overrides this with its own plan location (see AI Factory Adapter).
   - **(b) Standalone feature** → full Mission Workflow route.
   - **(c) Bug / diagnostics:** root-cause checklist, in order: DI & configuration → input hydration & validation → routing & middleware → API signatures in `vendor/yiisoft/<pkg>/src`. No Yii2 facade workarounds.
4. **Mode Selection:** check for explicit user override (`--mode=patch|feature|enterprise`, `+patch`, `+feature`, `+enterprise`, or prompt instruction). If not specified, classify automatically via the Task & Intent Routing Matrix (default: `Feature`; 1-route/fix: `Patch`; complex domain core: `Enterprise`). Print `Mode: Feature` (or `Patch`, `Enterprise`).
5. **Mission plan & state tracker** — print before implementing to establish the explicit mission state:
   - For **Feature (default) / Enterprise** tasks:
     ```markdown
     ### Mission State
     - **Mode:** <Feature (default) | Enterprise>
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
   - For **Patch** tasks (single route, one-file fix, docs lookup):
     ```markdown
     ### Mission State
     - **Mode:** Patch
     - **Architecture:** <project source | convention fallback>
     - **Touched Stages:** <e.g. Stage 5 (Action) | Stage 6 (Routes)>
     - **Wiring Gate:** pending
     ```

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

Never implement an Action or Controller before its Input DTO and service/repository dependencies exist. In Feature mode (canonical default), Actions depend directly on the application service, handler, or repository/model; in Enterprise mode, on repository interfaces and dedicated use case handlers. Actions never absorb persistence logic, SQL, or transaction boundaries. Decompose per `references/core-feature-recipes.md` (§6 Chain Integrity Checklist). Install missing packages per `references/core-dependency-protocol.md` before writing code that uses them.

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
2. **Chain Integrity & Code-to-Reference Compliance Audit** (blocking):
   - **Chain Integrity:** all active stages in the Mission State tracker completed; every new `*Interface` bound in `config/**/di/*.php`; every Action has an active route in `config/**/routes.php`; every console command registered in `config/console/params.php`; every custom RBAC rule registered under `'yiisoft/rbac-rules-container'`; migrations exist for every new table / altered column with a reversible `down()`; side-effects wired in `config/**/events.php` and dispatched outside/after the DB transaction; nothing edited in `vendor/` or `config/.merge-plan.php`.
   - **Code-to-Reference Guide Compliance (per `references/core-definition-of-done.md` §1):** for every generated or modified file (Action, Middleware, Command, Migration, Job, Listener, Service, Repository, DTO, Config, View, or Test), resolve its governing guide in `references/` and audit the code directly against that guide's Anti-Pattern Matrix and idiomatic recipes. Zero forbidden anti-patterns permitted (e.g. actions: thin, no SQL/transactions; use cases: transactions, post-commit events; repositories: isolated SQL, typed returns; middlewares: PSR-15 pipeline order; queue jobs: message DTOs; DI: constructor injection without ContainerInterface; DTOs: validator attributes).
3. **Runtime smoke** (optional, Feature or Enterprise mode, `vendor/` present):
   - Console (`yiisoft/yii-console` installed): `./yii list` must exit 0 and list newly registered commands (`references/infra-runners-and-runtimes.md`).
   - HTTP (adapt to project's installed runner): SAPI (`yiisoft/yii-runner-http`) boots without config errors and ping route responds; RoadRunner (`yiisoft/yii-runner-roadrunner`) or FrankenPHP (`yiisoft/yii-runner-frankenphp`) worker scripts initialize cleanly.
4. **Load `references/core-definition-of-done.md`** for Feature & Enterprise tasks: Enterprise tasks (stateful domain features, runtime, auth, queues, infrastructure slices) run all sections including the Production Readiness Gate (§3); Feature tasks (business features, CRUD, dictionaries) run Architecture & Quality Matrix checks (§1–§2) and report `production readiness gate: n/a`. Patch mode stops here.
5. **Final report** — the closing answer must end with the verification report block from `references/core-definition-of-done.md` §4, one line each: `Mode: <Patch|Feature|Enterprise>`, `Architecture: <source>`, fixes applied, tests (`pass | fail | not run | blocked (<reason>) | n/a`), static analysis (`pass | fail | not run | blocked (<reason>) | n/a`), packages added, config files changed, and `production readiness gate: pass | fail (<items>)` — Patch and Feature modes print `n/a` for production readiness gate. This block is part of the deliverable: a code summary without it is an incomplete task.

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
| **Testing** | `references/testing-core.md` | `references/testing-http.md`<br>`references/testing-database.md`<br>`references/testing-psr-doubles.md`<br>`references/http-validation-custom-rules.md` |
| **i18n** | `references/http-i18n-translation-api.md`<br>`references/http-i18n-storage-and-locale.md` | `references/http-routes-url-and-middleware.md`<br>`references/core-di-and-config.md` |
| **OpenAPI / Swagger** | `references/http-openapi-setup.md`<br>`references/http-openapi-endpoints.md` | `references/http-routes.md`<br>`references/http-openapi-ui-and-ops.md` |
| **Events & Listeners** | `references/core-events-design.md` | `references/core-events-reference.md`<br>`references/core-di-and-config.md` |
| **Active Record** | `references/persistence-active-record.md`<br>`references/persistence-active-record-relations.md` | `references/persistence-db-connection-and-queries.md`<br>`references/persistence-migrations-schema.md` |
| **Bootstrap / Runners / Workers** | `references/infra-runners-and-runtimes.md` | `references/core-di-and-config.md`<br>`references/infra-state-resetter.md` |
| **Helper Lookup** | `references/core-utilities.md` | `references/package-catalog.md`<br>`references/core-utilities-niche.md`<br>`references/core-friendly-exceptions.md` · Tier 2: `vendor/yiisoft/<pkg>/src/` |

## References (read on demand)

Load targeted topic guides via the Task & Intent Routing Matrix above. The complete categorized catalog of specialized topic guides with descriptions is maintained in [`references/INDEX.md`](references/INDEX.md).
