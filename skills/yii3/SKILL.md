---
name: yii3
description: >-
  Architect, develop, test, and verify applications using modern Yii 3 (PHP 8.2+,
  yiisoft/* packages), including opt-in project bootstrap from official templates.
  Enforces bottom-up stages, mandatory signature lookup in vendor sources, per-step
  wiring gates, transactional outbox, and production readiness checks.
  Use when user says "Yii3", "Yii 3", "yiisoft", or asks to create, refactor, or
  test Yii 3 apps and features: REST API endpoints, CRUD, thin actions, routes,
  middleware, DI wiring, migrations, queries, Active Record, Cycle ORM, DTOs,
  hydrator, validator, forms, views, widgets, console commands, queue jobs,
  scheduler, payments, outbox relay, cache, events, logging, error handling, auth, and RBAC.
  Runs as an AI Factory extension by default (aif-* workflows, .ai-factory/ projects);
  standalone when the project has no AI Factory.
license: MIT
metadata:
  author: Yii 3 AI Factory Team
  version: 0.8.0
---

# Yii3 development

## Operating Context Routing

- **AI Factory extension (default):** `aif-*` invocation or `.ai-factory/` exists → load [`core-aif-adapter.md`](references/instructions/core-aif-adapter.md).
- **Standalone fallback:** No AI Factory detected → load [`core-standalone-adapter.md`](references/instructions/core-standalone-adapter.md).

## Stage 0 — Mission Bootstrap

Run first on every invocation:
- **Scope:** Apply this skill to the extent the task touches Yii 3 / `yiisoft/*` packages (zero-Yii3 tasks: note non-applicability briefly and follow project conventions).
1. **Package Check:** Check `composer.json` + `composer.lock` against [`package-catalog.md`](references/package-catalog.md) (skip items already resolved by caller).
2. **Stack Invariants:** Strictly one DB driver, persistence branch (Active Record xor Cycle), queue/cache/mutex driver, RBAC storage, and test runner per [`package-catalog.md`](references/package-catalog.md) §3 ("Pick Exactly ONE per Family").
3. **Lifecycle Position:**
   - (a) Plan task: resolve active plan per adapter §4 and execute its contract.
   - (b) Standalone feature: execute Mission Workflow.
   - (c) Bug / diagnostics: root-cause order: `DI & configuration → input hydration & validation → routing & middleware → signatures in vendor/yiisoft/<pkg>/src` (no Yii2 workarounds).
4. **Signature Grounding:** Verify >1-arg constructors and methods in `vendor/yiisoft/<pkg>/src` ([`core-version-notes.md`](references/instructions/core-version-notes.md)).
5. **Progress Tracking:** Track execution state per active adapter §3 (`### Execution State` in AI Factory plan; `### Mission State` in Standalone).

## Mission Workflow

Every Yii 3 implementation executes in two phases:

### 1. Top-Down Discovery (Trace Dependencies)
- **Entry Point:** Classify the user-facing entry point: HTTP Action/DTO, Console Command, Queue Job, Event Listener, or Migration.
- **Upstream-First Rule (Inter-Context):** If the feature spans multiple Bounded Contexts (e.g. `Order` depends on `Billing`), implement and bind the provider context (`Billing`) before assembling the consumer (`Order`). Communication is strictly via public APIs (`src/<Module>/Api/`) or PSR-14 events; direct cross-context database access or internal model imports are forbidden.
- **Dependency Ripple (Intra-Context):** Trace missing dependencies downward: Transport → Logic (Use Case) → Persistence (Repository) → Schema (Migration).

### 2. Bottom-Up Assembly (Assemble Code)
Assemble components strictly in dependency order so no class references missing symbols:
1. **Schema & Migration:** Tables, indexes, FKs (`yiisoft/db-migration`) implementing `RevertibleMigrationInterface` with working `down()` and table prefix `{{%table}}` ([`persistence-migrations.md`](references/packages/persistence-migrations.md)).
2. **Persistence & Boundary:** Repository port interface and concrete storage implementation ([`core-architecture-alignment.md §6`](references/instructions/core-architecture-alignment.md#6-step-by-pattern-execution-matrix)).
3. **Application & Domain:** Use case handler with `$db->transaction()` and post-commit events ([`core-events-design.md §5`](references/packages/core-events-design.md#5-mandatory-post-commit-event-dispatching-rule)) or Transactional Outbox ([`infra-transactional-outbox.md`](references/packages/infra-transactional-outbox.md)).
4. **Transport & Entry Point:** Thin Action returning PSR-7 `ResponseInterface` with typed DTO (`yiisoft/validator` attributes `#[Required]`) or CLI Command (`SymfonyStyle`, `ExitCode`).
5. **Immediate Wiring:** Wire DI binding (`config/**/di/*.php` default, or service provider per [`core-config-tree.md`](references/packages/core-config-tree.md#26-choosing-how-to-organize-application-configs)), route (`config/**/routes.php` default, or `FileRouter` per [`http-routes-definition.md`](references/packages/http-routes-definition.md#choosing-how-to-route-http-requests)), command (`config/console/params.php`), or event (`config/**/events.php`) immediately upon creating each class.
*(Assemble only the discovered missing dependencies: surgical tasks implement only missing components and their wiring; composite features assemble bottom-up from step 1).*

## Framework Invariants

- **Presentation Isolation:** Actions and commands are thin transport adapters. **Zero SQL, direct persistence, or transactions in presentation.**
- **Category B Manual DI:** Pure libraries (`yiisoft/db-*`, cache, RBAC) mandate manual DI in `config/**/di/*.php` ([`core-dependency-protocol.md`](references/instructions/core-dependency-protocol.md)); Category A packages configure via `.merge-plan.php`.
- **Post-Commit Dispatch:** External side-effects dispatch after `$db->transaction()` commit ([`core-events-design.md §5`](references/packages/core-events-design.md#5-mandatory-post-commit-event-dispatching-rule)).
- **Worker Safety:** Register `'reset'` in DI (`StateResetter` provider) for stateful singletons under RoadRunner/FrankenPHP ([`infra-state-resetter.md`](references/packages/infra-state-resetter.md)).
- **Test Scope Discipline:** In AI Factory (`aif-implement`), write tests ONLY if explicitly scheduled in plan tasks. In Standalone, execute project test runner.
- **Subagent Context Preservation:** When delegating tasks to subagents, the delegation prompt MUST mandate loading the `yii3` skill, explicitly specify the architecture pattern, assign governing topic guides (`references/<topic>.md`), and enforce signature verification in `vendor/yiisoft/` ([`core-aif-adapter.md §7`](references/instructions/core-aif-adapter.md#7-subagent-delegation--context-preservation-protocol)).
- **Root-Cause Analysis:** When addressing bugs in user-visible behavior (UI, console, or external APIs), the root-cause analysis MUST trace upstream through all affected layers: Presentation → Use Case → Repository → Query → Schema ([`core-architecture-alignment.md §6`](references/instructions/core-architecture-alignment.md#6-step-by-pattern-execution-matrix)).

## Finale — Definition of Done

Run after code assembly:
1. **Project Checks:** Linters, `composer cs-fix`, Psalm/PHPStan, Rector; verify used packages are in `composer.json` ([`package-catalog.md`](references/package-catalog.md) §5).
2. **Chain Integrity Audit** *(blocking)*: All routes active, all interfaces bound in DI, commands registered, no cross-module SQL, migrations have reversible `down()`, zero violations against Audit Index Anti-Pattern Matrices ([`core-definition-of-done.md`](references/instructions/core-definition-of-done.md) §1).
3. **Runtime Smoke:** `./yii list` and HTTP boot cleanly without exceptions ([`infra-runners-and-runtimes.md`](references/packages/infra-runners-and-runtimes.md)).
4. **Operating Context Handoff:**
   - **AI Factory:** Delegate verification to `aif-verify` per [`core-aif-adapter.md`](references/instructions/core-aif-adapter.md) (Code-Read-Only gate, machine-readable ````aif-gate-result````, defects routed to `/aif-fix`).
   - **Standalone:** Self-verification audit per [`core-standalone-adapter.md`](references/instructions/core-standalone-adapter.md) §2. Fix defects within blocker perimeter, emit final report block ([`core-definition-of-done.md`](references/instructions/core-definition-of-done.md) §4).

## Core rules

1. **Yii3 is not Yii2.** No `Yii::$app`, no `yii\` namespace, no static facades, no `TimestampBehavior` / model `rules()` / `behaviors()`. Constructor DI everywhere.
2. **Source of truth — split by question type:**

   | Question | Authority (highest first) |
   |---|---|
   | **API** — signatures, config keys, package behavior | Installed `vendor/yiisoft/<pkg>/src/` (`composer.lock` version; `references/instructions/core-version-notes.md`) → guides → memory. |
   | **Implementation patterns** — transactions, events, thin actions, DTOs | Skill guides (`references/*.md`); project divergence = `legacy drift` (flag, never copy). |
   | **Project conventions** — namespaces, layout, naming, chosen DB/cache/queue drivers | Architecture artifact → else dominant style of `src/` (continued for new code). |

   **Conflict rule:** project conventions win strictly for Question Type 3 unless correctness or security breaks (ask interactively; record decision in autonomous mode). Divergence in Question Type 2 is strictly `legacy drift` (**flag, never copy**).
3. **Placement:** per `references/instructions/core-architecture-alignment.md`; architecture artifact overrides guide defaults.
4. Every new capability follows `references/instructions/core-dependency-protocol.md` before code is written.

## Task & Intent Routing Matrix

Load primary leaf guides directly for implementation, secondary guides for adapters/variants, and the **Audit Index** (split-index Anti-Pattern Matrix) during Finale audits:

| Task Archetype | Primary Guides | Secondary / Variants | Audit Index (Anti-Patterns) |
|---|---|---|---|
| **REST API Endpoint / CRUD** | `references/packages/http-actions-core.md`<br>`references/packages/http-validation-rules.md`<br>`references/packages/http-forms-and-hydration.md`<br>`references/packages/http-routes-definition.md` | `references/packages/persistence-db-connection-and-queries.md`<br>`references/packages/persistence-db-readers-and-drivers.md`<br>`references/packages/infra-error-handling-web.md#3-exception-mapping-with-exceptionresponder`<br>`references/packages/http-validation-advanced.md`<br>`references/packages/http-routes-url-and-middleware.md`<br>`references/packages/http-middlewares.md`<br>`references/packages/http-middlewares-protocol.md`<br>`references/packages/http-middlewares-recipes.md`<br>`references/packages/http-cache-etag.md` | `references/packages/http-actions-and-controllers.md`<br>`references/packages/http-routes.md`<br>`references/packages/http-validation-and-forms.md` |
| **CLI Command / Worker** | `references/packages/infra-commands.md`<br>`references/packages/infra-queue-jobs.md` | `references/packages/infra-logging.md`<br>`references/packages/infra-commands-definition.md`<br>`references/packages/infra-commands-execution.md`<br>`references/packages/core-di-definitions.md`<br>`references/packages/infra-queue-brokers.md`<br>`references/packages/infra-state-resetter.md` | `references/packages/core-di-and-config.md`<br>`references/packages/infra-error-handling.md` |
| **Transactional Outbox & Events** | `references/packages/infra-transactional-outbox.md`<br>`references/packages/core-events-design.md` | `references/packages/infra-queue-jobs.md`<br>`references/packages/infra-queue-mutex.md`<br>`references/packages/persistence-migrations-schema.md`<br>`references/packages/persistence-db.md` | `references/packages/core-events-and-listeners.md`<br>`references/packages/persistence-db.md` |
| **HTML UI / Forms / Grid** | `references/packages/http-views.md`<br>`references/packages/http-widgets-and-assets.md`<br>`references/packages/http-forms-and-hydration.md`<br>`references/packages/http-state.md` | `references/packages/http-actions-concerns.md`<br>`references/packages/http-validation-rules.md`<br>`references/packages/http-file-handling.md`<br>`references/packages/http-dataview-widgets.md`<br>`references/packages/http-views-twig.md`<br>`references/packages/http-views-bootstrap5.md`<br>`references/packages/http-views-bulma.md` | `references/packages/http-views-and-widgets.md`<br>`references/packages/http-actions-and-controllers.md`<br>`references/packages/http-validation-and-forms.md` |
| **Auth / Identity / RBAC** | `references/packages/infra-auth-and-rbac.md`<br>`references/packages/infra-auth-session.md`<br>`references/packages/http-middlewares.md` | `references/packages/http-state.md#2-sessions-yiisoftsession`<br>`references/packages/infra-auth-jwt.md`<br>`references/packages/infra-auth-oauth2.md`<br>`references/packages/infra-rbac-storage.md` | `references/packages/http-routes.md`<br>`references/packages/http-actions-and-controllers.md` |
| **DB, Cache & Migrations** | `references/packages/persistence-migrations-schema.md`<br>`references/packages/persistence-migrations-operations.md`<br>`references/packages/persistence-db-connection-and-queries.md` | `references/packages/persistence-migrations-alterations.md`<br>`references/packages/core-di-definitions.md`<br>`references/packages/persistence-db-readers-and-drivers.md`<br>`references/packages/persistence-caching.md`<br>`references/packages/persistence-cache-drivers.md` | `references/packages/persistence-db.md`<br>`references/packages/persistence-migrations.md` |
| **Full Architecture Slices** | `references/instructions/core-architecture-alignment.md`<br>`references/instructions/core-feature-recipes.md` | `references/instructions/core-feature-archetypes.md`<br>`references/instructions/core-dependency-protocol.md`<br>`references/instructions/core-definition-of-done.md`<br>`references/package-catalog.md` | `references/packages/core-di-and-config.md` |
| **New Project Bootstrap** | `references/instructions/core-dependency-protocol.md#23-new-yii3-project-bootstrap-official-app-templates`<br>`references/package-catalog.md` | `references/instructions/core-architecture-alignment.md`<br>`references/packages/core-config-tree.md`<br>`references/packages/infra-runners-and-runtimes.md` | `references/packages/core-di-and-config.md` |
| **Email / Notifications** | `references/packages/infra-mailer.md` | `references/packages/core-di-definitions.md`<br>`references/packages/infra-mailer-transports.md`<br>`references/packages/infra-mailer-async-queue.md` | `references/packages/core-di-and-config.md` |
| **Payment Gateways & Webhooks** | `references/packages/infra-payments.md` | `references/packages/http-actions-core.md`<br>`references/package-catalog.md` | `references/packages/core-di-and-config.md` |
| **Testing** | `references/packages/testing-core.md` | `references/packages/testing-unit-recipes.md`<br>`references/packages/testing-http.md`<br>`references/packages/testing-database.md`<br>`references/packages/testing-console.md`<br>`references/packages/testing-psr-doubles.md`<br>`references/packages/testing-codeception.md`<br>`references/packages/testing-testo.md`<br>`references/packages/testing-infection.md`<br>`references/packages/http-validation-custom-rules.md` | — *(matrices inside guides)* |
| **i18n** | `references/packages/http-i18n-translation-api.md`<br>`references/packages/http-i18n-storage-and-locale.md` | `references/packages/http-routes-url-and-middleware.md`<br>`references/packages/core-config-tree.md` | `references/packages/http-i18n-translation.md` |
| **OpenAPI / Swagger** | `references/packages/http-openapi-setup.md`<br>`references/packages/http-openapi-endpoints.md` | `references/packages/http-openapi-schemas.md`<br>`references/packages/http-routes-definition.md`<br>`references/packages/http-openapi-ui-and-ops.md` | `references/packages/http-openapi-swagger.md` |
| **Events & Listeners** | `references/packages/core-events-design.md` | `references/packages/core-events-reference.md`<br>`references/packages/core-di-definitions.md`<br>`references/packages/infra-transactional-outbox.md` | `references/packages/core-events-and-listeners.md` |
| **Active Record** | `references/packages/persistence-active-record.md`<br>`references/packages/persistence-active-record-relations.md` | `references/packages/persistence-active-record-model.md`<br>`references/packages/persistence-active-record-queries.md`<br>`references/packages/persistence-db-connection-and-queries.md`<br>`references/packages/persistence-migrations-schema.md` | `references/packages/persistence-db.md` |
| **Cycle ORM** | `references/packages/persistence-cycle-orm.md`<br>`references/packages/persistence-cycle-schema-and-cli.md` | `references/packages/persistence-migrations-schema.md`<br>`references/packages/infra-rbac-storage.md` | `references/packages/persistence-db.md` |
| **Runners, DI & Error Ops** | `references/packages/infra-runners-and-runtimes.md`<br>`references/packages/core-config-tree.md` | `references/packages/core-di-container.md`<br>`references/packages/infra-state-resetter.md`<br>`references/packages/infra-runtime-roadrunner.md`<br>`references/packages/infra-runtime-frankenphp.md`<br>`references/packages/infra-error-handling-web.md`<br>`references/packages/infra-error-handling-ops.md` | `references/packages/core-di-and-config.md`<br>`references/packages/infra-error-handling.md` |
| **Helper Lookup** | `references/packages/core-utilities.md` | `references/package-catalog.md`<br>`references/packages/core-utilities-niche.md`<br>`references/packages/core-friendly-exceptions.md` · Tier 2: `vendor/yiisoft/<pkg>/src/` | — |

## References (read on demand)

Load targeted topic guides via the Task & Intent Routing Matrix above. The complete categorized catalog is in [`INDEX.md`](references/INDEX.md).
