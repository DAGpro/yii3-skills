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
  outbox relay, cache, events, logging, error handling, auth, and RBAC.
  Accepts --mode=patch|feature|enterprise.
  Runs as an AI Factory extension by default (aif-* workflows, .ai-factory/ projects);
  standalone when the project has no AI Factory.
license: MIT
metadata:
  author: Yii 3 AI Factory Team
  version: 0.5.0
---

# Yii3 development

End-to-end Yii 3 workflow: bootstrap the mission, implement bottom-up, verify to done.

## Mode Selection & User Override

Pick and print `Mode: <Patch|Feature|Enterprise>` at Stage 0 (user `--mode=<patch|feature|enterprise>`, `+patch` / `+feature` / `+enterprise`, or explicit wording wins):

| Mode | Scope | Pipeline & Verification |
|---|---|---|
| **`Patch`** | Surgical 1–3 file fixes, single route, DI/config tweak, docs lookup | Touched stages & gates only; skip migrations unless schema changes; skip extended DoD ([`references/core-definition-of-done.md`](references/core-definition-of-done.md)) |
| **`Feature`** *(default)* | Standard business features, CRUD, listings, AR/Cycle flows (~80%) | Full Stages 1–7 bottom-up + DoD §1–§2 |
| **`Enterprise`** | High-risk flows, state machines, async/outbox, auth cores, infra | Atomic transactions, post-commit events or Transactional Outbox, idempotency, integration tests, full DoD §1–§3 |

## Operating Context Routing

Detect the operating context at Stage 0 and delegate lifecycle/state/handoff contracts to the matching adapter:

- **AI Factory extension (default):** `aif-*` workflow or `.ai-factory/` exists → [`references/core-aif-adapter.md`](references/core-aif-adapter.md). Execute **only the invoking workflow's role** (scope: adapter §2 matrix; duties: loaded injection); only `aif-implement` runs Stages 1–7.
- **Standalone fallback:** no `.ai-factory/` and no `aif-*` invocation → [`references/core-standalone-adapter.md`](references/core-standalone-adapter.md) (full pipeline: Stages 1–7 → Finale → user report).

## Stage 0 — Mission Bootstrap

Run first in every mode:
- **Scope:** apply this skill to the extent the task touches Yii 3 / `yiisoft/*` (no environment pre-gate).
- **Zero-Yii3 tasks** (neither task nor target stack touches Yii 3 / `yiisoft/*`): note non-applicability briefly and follow project conventions — no Mission Workflow, no Mission State tracker, no Finale/DoD output.

1. **Bootstrap checklist** (skip items resolved by caller):
   - **Architecture & rules:** active adapter §4 artifact (`paths.architecture` / `docs/architecture/` = supreme authority) → else dominant layout of 2–3 `src/` features (`references/core-standalone-adapter.md` §4) → Pragmatic `layers` fallback (Core rule 3).
   - **Packages:** check `composer.json` + `composer.lock` against `references/package-catalog.md`.
2. **Cross-milestone consistency:** preserve the existing stack — strictly one DB driver, persistence branch, queue/cache/mutex driver, RBAC/translator storage, and test runner (`require-dev` stays dev-only).
3. **Lifecycle position** — resolve and print one of:
   - **(a) Plan task:** resolve active plan via adapter §4 (never invent paths in AI Factory mode) and run its 6 phases.
   - **(b) Standalone feature:** full Mission Workflow (Stages 1–7).
   - **(c) Bug / diagnostics:** root-cause order: `DI & configuration → input hydration & validation → routing & middleware → signatures in vendor/yiisoft/<pkg>/src` (no Yii2 workarounds).
4. **Mode Selection:** honor override, else classify from Task & Intent Routing Matrix (default: `Feature`). Print `Mode: <Patch|Feature|Enterprise>`.
5. **Mission State tracker** — print before coding:

```markdown
### Mission State
- **Mode:** <Feature (default) | Enterprise>
- **Context:** <AI Factory extension (default) — role: <aif-*> | Standalone>
- **Architecture:** <project source | convention fallback>
- **Guides to load:** <primary & audit guides>
- **Stage Progress:**
  - Stage 1 [Migration & Schema]: <pending | skipped — reason>
  - Stage 2 [Domain / Model & Repository Boundary]: <pending | skipped — reason>
  - Stage 3 [Repository / Persistence Implementation]: <pending | skipped — reason>
  - Stage 4 [Use Case & Domain Events]: <pending | skipped — reason>
  - Stage 5 [Input DTO & Action / Command]: <pending | skipped — reason>
  - Stage 6 [Config Audit & Wiring Gate]: pending
  - Stage 7 [Tests & Quality Gate]: pending
```
*(In **Patch** mode replace `Stage Progress` with `- **Touched Stages:** <e.g. Stage 5 (Action) | Stage 6 (Routes)>` and `- **Wiring Gate:** pending`.)*

## Mission Workflow (Stages 1–7)

Execution invariants:
- Progress strictly **bottom-up**; never implement an Action before its DTO and dependencies.
- Land each per-step wiring gate immediately — never batch wiring; start Stage 6 only after all prior active stages pass.
- Install missing packages via [`references/core-dependency-protocol.md`](references/core-dependency-protocol.md) first.
- Actions depend on the active tier's service/use-case abstraction and **never contain SQL, direct persistence, or transactions** (`references/core-feature-recipes.md`).
- Check >1-arg methods/constructors in `vendor/yiisoft/<pkg>/src` (Core rule 2; if missing, request `composer install` or flag unverified APIs in report).

| Plan phase | Stage & Required Scope |
|---|---|
| **1 Migration & Schema** | **Stage 1:** tables, indexes, FKs (`yiisoft/db-migration`), reversible `down()` |
| **2 Domain & Boundary** | **Stage 2:** entities/models, domain events, repository ports (`references/core-architecture-alignment.md#6-stage-by-tier-execution-matrix`) |
| **3 Persistence Impl** | **Stage 3:** concrete repository, AR model, or Cycle mapper (satisfied by AR if direct per tier) |
| **4 Use Case & Events** | **Stage 4:** domain checks → `ConnectionInterface::transaction()` → post-commit PSR-14 listeners (`references/core-events-design.md#5-mandatory-post-commit-event-dispatching-rule`) or Enterprise Outbox |
| **5 DTO & Action / CLI** | **Stage 5:** hydrate & validate typed DTO / FormModel (`yiisoft/validator`); thin Action (invokable, `RequestHandlerInterface`, or controller method per style) returning `ResponseInterface` (`WebViewRenderer`, `DataResponseFactoryInterface`, `JsonResponseFactory`, PSR-17); thin CLI (`SymfonyStyle`, `ExitCode`) |
| **6 Wiring & Tests** | **Stage 6:** audit per-step wiring per active config/routing style<br>**Stage 7:** unit + HTTP/DB/console tests on the project's single test runner |

**Per-step wiring gates** (skip unused stages at Stage 0 while keeping gates):
- `*Interface` → DI binding (`config/**/di/*.php` default, or service provider: `references/core-config-tree.md#26-choosing-how-to-organize-application-configs`);
- `Action` → route (`config/**/routes.php` default, or `FileRouter`: `references/http-routes-definition.md#choosing-how-to-route-http-requests`);
- Console command → `config/console/params.php` (`'yiisoft/yii-console'['commands']`);
- RBAC rule → `config/common/params.php` (`'yiisoft/rbac-rules-container'`); event listener → `config/**/events.php` default or `ListenerCollection`;
- Enforce `OffsetPaginator` or SQL `limit` on listings; wrap mutating HTML routes with `CsrfTokenMiddleware` (`SessionMiddleware → CsrfTokenMiddleware → Router`). Record: `Stage N complete: <artifacts> | Wiring gate: pass`.

## Finale — Definition of Done

Run after the final stage in every mode:

1. **Project checks:** run tests, `composer cs-fix`, Psalm/PHPStan, Rector; confirm used packages in `composer.json`.
2. **Chain Integrity & Code-to-Reference Compliance Audit** *(blocking)*:
   - **Chain Integrity:** active stages done; all interfaces/actions/commands/RBAC/events wired; reversible `down()`; events/queues post-commit or Outbox; `vendor/` and `config/.merge-plan.php` untouched.
   - **Code-to-Reference Compliance (`references/core-definition-of-done.md` §1):** zero violations against governing guides and Audit Index Anti-Pattern Matrices.
3. **Runtime smoke** *(optional, Feature/Enterprise, `vendor/` present)*: `./yii list` exits 0; HTTP runner boots cleanly (`references/infra-runners-and-runtimes.md`).
4. **Extended DoD (`references/core-definition-of-done.md`):** Enterprise runs §1–§3 (Production Readiness Gate); Feature runs §1–§2 (`production readiness gate: n/a`); Patch stops at item 2.
5. **Final report:** emit the `references/core-definition-of-done.md` §4 block: `Mode`, `Architecture`, `fixes applied`, `tests` (`pass | fail | not run | blocked (<reason>) | n/a`), `static analysis`, `packages added`, `config files changed`, `production readiness gate`.

## Core rules

1. **Yii3 is not Yii2.** No `Yii::$app`, no `yii\` namespace, no static facades, no `TimestampBehavior` / model `rules()` / `behaviors()`. Constructor DI everywhere.
2. **Source of truth — split by question type:**

   | Question | Authority (highest first) |
   |---|---|
   | **API** — signatures, config keys, package behavior | Installed `vendor/yiisoft/<pkg>/src/` (`composer.lock` version; `references/core-version-notes.md`) → guides → memory. |
   | **Implementation patterns** — transactions, events, thin actions, DTOs | Skill guides (`references/*.md`); project divergence = `legacy drift` (flag, never copy). |
   | **Project conventions** — namespaces, layout, naming, chosen DB/cache/queue drivers | Architecture artifact → else dominant style of `src/` (continued for new code). |

   **Conflict rule:** project conventions win strictly for Question Type 3 unless correctness or security breaks (ask interactively; record decision in autonomous mode). Divergence in Question Type 2 is strictly `legacy drift` (**flag, never copy**).
3. **Placement:** per `references/core-architecture-alignment.md`; architecture artifact overrides guide defaults.
4. Every new capability follows `references/core-dependency-protocol.md` before code is written.

## Task & Intent Routing Matrix

Load primary leaf guides directly for implementation, secondary guides for adapters/variants, and the **Audit Index** (split-index Anti-Pattern Matrix) during Stage 6 / Finale audits:

| Task Archetype | Primary Guides | Secondary / Variants | Audit Index (Anti-Patterns) |
|---|---|---|---|
| **REST API Endpoint / CRUD** | `references/http-actions-core.md`<br>`references/http-validation-rules.md`<br>`references/http-forms-and-hydration.md`<br>`references/http-routes-definition.md` | `references/persistence-db-connection-and-queries.md`<br>`references/persistence-db-readers-and-drivers.md`<br>`references/infra-error-handling-web.md#3-exception-mapping-with-exceptionresponder`<br>`references/http-validation-advanced.md`<br>`references/http-routes-url-and-middleware.md`<br>`references/http-middlewares.md`<br>`references/http-middlewares-protocol.md`<br>`references/http-middlewares-recipes.md`<br>`references/http-cache-etag.md` | `references/http-actions-and-controllers.md`<br>`references/http-routes.md`<br>`references/http-validation-and-forms.md` |
| **CLI Command / Worker** | `references/infra-commands.md`<br>`references/infra-queue-jobs.md` | `references/infra-logging.md`<br>`references/infra-commands-definition.md`<br>`references/infra-commands-execution.md`<br>`references/core-di-definitions.md`<br>`references/infra-queue-brokers.md`<br>`references/infra-state-resetter.md` | `references/core-di-and-config.md`<br>`references/infra-error-handling.md` |
| **Transactional Outbox & Events** | `references/infra-transactional-outbox.md`<br>`references/core-events-design.md` | `references/infra-queue-jobs.md`<br>`references/infra-queue-mutex.md`<br>`references/persistence-migrations-schema.md`<br>`references/persistence-db.md` | `references/core-events-and-listeners.md`<br>`references/persistence-db.md` |
| **HTML UI / Forms / Grid** | `references/http-views.md`<br>`references/http-widgets-and-assets.md`<br>`references/http-forms-and-hydration.md`<br>`references/http-state.md` | `references/http-actions-concerns.md`<br>`references/http-validation-rules.md`<br>`references/http-file-handling.md`<br>`references/http-dataview-widgets.md`<br>`references/http-views-twig.md`<br>`references/http-views-bootstrap5.md`<br>`references/http-views-bulma.md` | `references/http-views-and-widgets.md`<br>`references/http-actions-and-controllers.md`<br>`references/http-validation-and-forms.md` |
| **Auth / Identity / RBAC** | `references/infra-auth-and-rbac.md`<br>`references/infra-auth-session.md`<br>`references/http-middlewares.md` | `references/http-state.md#2-sessions-yiisoftsession`<br>`references/infra-auth-jwt.md`<br>`references/infra-auth-oauth2.md`<br>`references/infra-rbac-storage.md` | `references/http-routes.md`<br>`references/http-actions-and-controllers.md` |
| **DB, Cache & Migrations** | `references/persistence-migrations-schema.md`<br>`references/persistence-migrations-operations.md`<br>`references/persistence-db-connection-and-queries.md` | `references/persistence-migrations-alterations.md`<br>`references/core-di-definitions.md`<br>`references/persistence-db-readers-and-drivers.md`<br>`references/persistence-caching.md`<br>`references/persistence-cache-drivers.md` | `references/persistence-db.md`<br>`references/persistence-migrations.md` |
| **Full Architecture Slices** | `references/core-architecture-alignment.md`<br>`references/core-feature-recipes.md` | `references/core-feature-archetypes.md`<br>`references/core-dependency-protocol.md`<br>`references/core-definition-of-done.md`<br>`references/package-catalog.md` | `references/core-di-and-config.md` |
| **New Project Bootstrap** | `references/core-dependency-protocol.md#23-new-yii3-project-bootstrap-official-app-templates`<br>`references/package-catalog.md` | `references/core-architecture-alignment.md`<br>`references/core-config-tree.md`<br>`references/infra-runners-and-runtimes.md` | `references/core-di-and-config.md` |
| **Email / Notifications** | `references/infra-mailer.md` | `references/core-di-definitions.md`<br>`references/infra-mailer-transports.md`<br>`references/infra-mailer-async-queue.md` | `references/core-di-and-config.md` |
| **Testing** | `references/testing-core.md` | `references/testing-unit-recipes.md`<br>`references/testing-http.md`<br>`references/testing-database.md`<br>`references/testing-console.md`<br>`references/testing-psr-doubles.md`<br>`references/testing-codeception.md`<br>`references/testing-testo.md`<br>`references/testing-infection.md`<br>`references/http-validation-custom-rules.md` | — *(matrices inside guides)* |
| **i18n** | `references/http-i18n-translation-api.md`<br>`references/http-i18n-storage-and-locale.md` | `references/http-routes-url-and-middleware.md`<br>`references/core-config-tree.md` | `references/http-i18n-translation.md` |
| **OpenAPI / Swagger** | `references/http-openapi-setup.md`<br>`references/http-openapi-endpoints.md` | `references/http-openapi-schemas.md`<br>`references/http-routes-definition.md`<br>`references/http-openapi-ui-and-ops.md` | `references/http-openapi-swagger.md` |
| **Events & Listeners** | `references/core-events-design.md` | `references/core-events-reference.md`<br>`references/core-di-definitions.md`<br>`references/infra-transactional-outbox.md` | `references/core-events-and-listeners.md` |
| **Active Record** | `references/persistence-active-record.md`<br>`references/persistence-active-record-relations.md` | `references/persistence-active-record-model.md`<br>`references/persistence-active-record-queries.md`<br>`references/persistence-db-connection-and-queries.md`<br>`references/persistence-migrations-schema.md` | `references/persistence-db.md` |
| **Cycle ORM** | `references/persistence-cycle-orm.md`<br>`references/persistence-cycle-schema-and-cli.md` | `references/persistence-migrations-schema.md`<br>`references/infra-rbac-storage.md` | `references/persistence-db.md` |
| **Runners, DI & Error Ops** | `references/infra-runners-and-runtimes.md`<br>`references/core-config-tree.md` | `references/core-di-container.md`<br>`references/infra-state-resetter.md`<br>`references/infra-runtime-roadrunner.md`<br>`references/infra-runtime-frankenphp.md`<br>`references/infra-error-handling-web.md`<br>`references/infra-error-handling-ops.md` | `references/core-di-and-config.md`<br>`references/infra-error-handling.md` |
| **Helper Lookup** | `references/core-utilities.md` | `references/package-catalog.md`<br>`references/core-utilities-niche.md`<br>`references/core-friendly-exceptions.md` · Tier 2: `vendor/yiisoft/<pkg>/src/` | — |

## References (read on demand)

Load targeted topic guides via the Task & Intent Routing Matrix above. The complete categorized catalog is in [`references/INDEX.md`](references/INDEX.md).
