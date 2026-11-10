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
---

# Yii3 development

End-to-end Yii 3 workflow: bootstrap the mission, implement bottom-up, verify to done.

## Mode Selection & User Override

Pick and print the execution mode at Stage 0 before writing code:

- **User Mode Override:** `--mode=<patch|feature|enterprise>`, `+patch`/`+feature`/`+enterprise`, or explicit user wording overrides automatic classification.
- **Automatic Classification (Default: `Feature`):**
  - **1. Patch Mode (`Mode: Patch`):** Surgical micro-tasks (1–3 files, single route, bugfix, config/DI edit, docs lookup). Touched stages and wiring gates only; skips schema migrations unless schema changes; skips extended DoD (`references/core-definition-of-done.md`).
  - **2. Feature Mode (`Mode: Feature`) — Default:** Standard business features, CRUD endpoints, listings, and AR/Cycle flows (~80% of tasks). Runs full 7-stage Mission Workflow and DoD (§1–§2).
  - **3. Enterprise Mode (`Mode: Enterprise`):** Mission-critical flows, state machines, async pipelines, outbox messaging, auth/security cores, or reusable infrastructure. Enforces atomic transactions, post-commit events or Transactional Outbox, idempotency, integration tests, and Production Readiness Gate (`references/core-definition-of-done.md` §3).

## Operating Context Routing

At Stage 0, detect the operating context first and route to the matching adapter — each adapter defines the complete contract for its mode (path resolution, durable state, interaction protocol, verification, and output handoff):

- **AI Factory extension (default):** an `aif-*` workflow invokes the skill, or the project contains a `.ai-factory/` directory → follow [`references/core-aif-adapter.md`](references/core-aif-adapter.md). The skill executes **exactly the role of the invoking workflow** — plan, implement, verify, fix, review, improve, roadmap, architecture — detected from the invoking `aif-*` command or the loaded workflow injection. Role scope: the adapter §2 Responsibility & Boundary Matrix; per-role duties: the matching workflow injection. Only the `aif-implement` role runs the full Mission Workflow (Stages 1–7) implementation path; every other role executes its scoped duties and hands off per the adapter.
- **Standalone fallback:** no `.ai-factory/` directory AND no `aif-*` invocation (no workflow injection loaded) → follow [`references/core-standalone-adapter.md`](references/core-standalone-adapter.md) — the skill runs the full self-directed pipeline (Stages 1–7 → self-verification → report).

## Stage 0 — Mission Bootstrap

Run first, in every mode. **Scope:** apply the skill to the extent the user's task touches Yii 3 / `yiisoft/*` packages (topic guides, vendor signature lookup in `vendor/yiisoft/<pkg>/src`, `references/package-catalog.md`); no project-environment classification is performed. **Operating context:** detect first and route per "Operating Context Routing" above (default: AI Factory extension).

1. **Bootstrap checklist** (skip items the caller already resolved):
   - Architecture source: the operating context's architecture artifact per the active adapter (§4) — an existing artifact is the supreme structural authority; absent artifact → dominant layout of 2–3 existing features in `src/` (tier self-derivation: `references/core-standalone-adapter.md` §4) → Pragmatic tier (`layers`) if ambiguous or new (Core rule 3).
   - Rules: the operating context's rules artifact per the active adapter (§4), else existing project conventions.
   - `composer.json` + `composer.lock`: installed `yiisoft/*` packages checked against `references/package-catalog.md`.
2. **Cross-milestone consistency:** past milestones fixed the stack — strictly one DB driver, one persistence path, one queue/cache/mutex driver, one RBAC storage, one translator storage, one test runner; dev tools stay in `require-dev`. Never introduce a second mechanism next to the existing one.
3. **Lifecycle position** — detect and print one of:
   - **(a) Plan task:** resolve first matching plan and execute its 6 phases; the plan location is owned by the operating context's adapter (§4) — AI Factory extension: the invoking workflow's artifact or `paths.plans`, never invented; standalone: explicit argument/link → root `PLAN.md` → newest `*.md` in `docs/plans/` or `docs/plan/`.
   - **(b) Standalone feature** → full Mission Workflow route.
   - **(c) Bug / diagnostics:** root-cause order: DI & config → input hydration & validation → routing & middleware → signatures in `vendor/yiisoft/<pkg>/src`. No Yii2 workarounds.
4. **Mode Selection:** honor user override, else classify from Task & Intent Routing Matrix (default: `Feature`). Print `Mode: <Patch|Feature|Enterprise>`.
5. **Mission plan & state tracker** — print before implementing:
   - **Feature (default) / Enterprise:**
     ```markdown
     ### Mission State
     - **Mode:** <Feature (default) | Enterprise>
     - **Context:** <AI Factory extension (default) — workflow role: <aif-* command> | Standalone>
     - **Architecture:** <project source | convention fallback>
     - **Guides to load:** <primary guides>
     - **Stage Progress:**
       - Stage 1 [Migration & Schema]: <pending | skipped — reason>
       - Stage 2 [Domain / Model & Repository Boundary]: <pending | skipped — reason>
       - Stage 3 [Repository / Persistence Implementation]: <pending | skipped — reason>
       - Stage 4 [Use Case & Domain Events]: <pending | skipped — reason>
       - Stage 5 [Input DTO & Action / Command]: <pending | skipped — reason>
       - Stage 6 [Config Audit & Wiring Gate]: pending
       - Stage 7 [Tests & Quality Gate]: pending
     ```
   - **Patch** (single route, 1–3 file fix, config tweak):
     ```markdown
     ### Mission State
     - **Mode:** Patch
     - **Context:** <AI Factory extension (default) — workflow role: <aif-* command> | Standalone>
     - **Architecture:** <project source | convention fallback>
     - **Touched Stages:** <e.g. Stage 5 (Action) | Stage 6 (Routes)>
     - **Wiring Gate:** pending
     ```

## Mission Workflow (Stages 1–7)

Execute stages bottom-up, landing each per-step wiring gate immediately upon creating the artifact. Plans follow this authoritative phase → stage mapping:

| Plan phase | Execution stages |
|---|---|
| 1 Migration & Schema | Stage 1 |
| 2 Domain / Model & Repository Boundary | Stage 2 |
| 3 Repository / Persistence Implementation | Stage 3 |
| 4 Use Case Handler & Events | Stage 4 |
| 5 Input DTO & Single-Action Handler | Stage 5 |
| 6 Wiring & Tests | Stages 6–7 |

Never implement an Action before its DTO and service dependencies exist. Actions depend on the active tier's service/use-case abstraction and never contain SQL, persistence, or transactions (`references/core-feature-recipes.md`). Install missing packages via `references/core-dependency-protocol.md` before writing code that uses them.

**Mission State execution discipline:**
1. Progress sequentially bottom-up.
2. Land each per-step wiring gate immediately — never batch wiring.
3. Record transitions as stages complete: `Stage N complete: <artifacts created> | Wiring gate: pass`
4. Start Stage 6 only after all prior active stages pass.

**Mandatory Signature Lookup Protocol:** before calling any `yiisoft/*` method or constructor with >1 argument, check its signature in `vendor/yiisoft/<pkg>/src` (Core rule 2). If `vendor/` is absent, request `composer install` first; when offline/impossible, flag unverified APIs in the final report.

- **Stage 1 — Migration & Schema (Phase 1).** Tables, indexes, FKs via `yiisoft/db-migration` with reversible `down()`. Guides: `references/persistence-migrations-schema.md`, `references/persistence-migrations-operations.md`, `references/persistence-db-connection-and-queries.md` (Anti-Pattern Matrix: `references/persistence-db.md`).
- **Stage 2 — Domain / Model & Repository Boundary (Phase 2).** Models/entities, domain events, and repository ports per tier (`references/core-architecture-alignment.md#6-stage-by-tier-execution-matrix`). Guides: `references/core-feature-recipes.md`, `references/core-events-design.md`.
- **Stage 3 — Repository / Persistence Implementation (Phase 3).** Concrete repository, Active Record, or Cycle mapper (mark Stage 3 satisfied by model if AR is consumed directly per tier). Guides: persistence row in matrix.
- **Stage 4 — Use Case Handler & Events (Phase 4).** Domain checks → `ConnectionInterface::transaction()` → PSR-14 listeners post-commit (`references/core-events-design.md#5-mandatory-post-commit-event-dispatching-rule`) or atomic outbox persistence in Enterprise flows (`references/infra-transactional-outbox.md`). Guide: `references/core-feature-recipes.md`.
- **Stage 5 — Input DTO & Single-Action Handler / Command (Phase 5).** Typed DTO with installed `yiisoft/validator` attributes; thin Action returning `Psr\Http\Message\ResponseInterface` (`WebViewRenderer`, `DataResponseFactoryInterface`, or PSR-7 `ResponseFactoryInterface`); thin console command (`SymfonyStyle`, `ExitCode`) delegating to use cases. Guides: matching archetype row.
- **Stage 6 — Config Audit & Consolidation (Phase 6).** Audit per-step gates: DI in `config/**/di/*.php`; routes in `config/**/routes.php`; console commands in `config/console/params.php` (`'yiisoft/yii-console'['commands']`); RBAC rules in `config/common/params.php` (`'yiisoft/rbac-rules-container'`); events in `config/**/events.php`. Guides: `references/core-di-definitions.md`, `references/core-config-tree.md` (Anti-Pattern Matrix: `references/core-di-and-config.md`).
- **Stage 7 — Tests (Phase 6).** Unit + HTTP/DB integration tests on the project's single test runner. Guides: `references/testing-core.md` + Testing row.

**Per-step wiring gates:** `*Interface` → DI binding; Action → route; console command → `config/console/params.php`; RBAC rule → `'yiisoft/rbac-rules-container'`; side-effect → `config/**/events.php`. Enforce `OffsetPaginator` or SQL `limit` on listings; wrap mutating HTML routes with `CsrfTokenMiddleware` after `SessionMiddleware`, before `Router`.

Non-feature tasks skip inapplicable stages at Stage 0 while preserving wiring gates.

## Finale — Definition of Done

Run after the last stage, in every mode.

1. **Project checks:** run project tests, `composer cs-fix`, Psalm/PHPStan, Rector where configured; ensure used packages appear in `composer.json`.
2. **Chain Integrity & Code-to-Reference Compliance Audit** (blocking):
   - **Chain Integrity:** all active stages completed; every `*Interface` DI-bound; every Action routed; every command/RBAC rule/event wired; migrations have reversible `down()`; events/queues dispatched post-commit or via Transactional Outbox; `vendor/` and `config/.merge-plan.php` untouched.
   - **Code-to-Reference Guide Compliance (`references/core-definition-of-done.md` §1):** resolve the governing guide in `references/` for every touched artifact and verify zero matches against its Anti-Pattern Matrix (plus module split-index matrices where applicable).
3. **Runtime smoke** (optional, Feature/Enterprise, `vendor/` present): CLI `./yii list` exits 0 (`yiisoft/yii-console`); HTTP runner boots cleanly (`yiisoft/yii-runner-http`, `yiisoft/yii-runner-roadrunner`, or `yiisoft/yii-runner-frankenphp`) per `references/infra-runners-and-runtimes.md`.
4. **Load `references/core-definition-of-done.md`** for Feature & Enterprise tasks: Enterprise runs all sections including Production Readiness Gate (§3); Feature runs §1–§2 (`production readiness gate: n/a`); Patch stops at Chain Integrity.
5. **Final report** — close with the `references/core-definition-of-done.md` §4 block: `Mode`, `Architecture`, `fixes applied`, `tests` (`pass | fail | not run | blocked (<reason>) | n/a`), `static analysis`, `packages added`, `config files changed`, `production readiness gate`.

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

Load directly the leaf guides for the archetype; split-index guides (`references/INDEX.md`) own module-wide Anti-Pattern Matrices for Stage 6 / Finale audits:

| Task Archetype | Primary Guides | Secondary |
|---|---|---|
| **REST API Endpoint / CRUD** | `references/http-actions-core.md`<br>`references/http-validation-rules.md`<br>`references/http-forms-and-hydration.md`<br>`references/http-routes-definition.md` | `references/persistence-db-connection-and-queries.md`<br>`references/infra-error-handling-web.md#3-exception-mapping-with-exceptionresponder`<br>`references/http-validation-advanced.md`<br>`references/http-routes-url-and-middleware.md` |
| **CLI Command / Worker** | `references/infra-commands.md`<br>`references/infra-queue-jobs.md` | `references/infra-logging.md`<br>`references/core-di-definitions.md`<br>`references/infra-queue-brokers.md`<br>`references/infra-state-resetter.md` |
| **Transactional Outbox & Reliable Events** | `references/infra-transactional-outbox.md`<br>`references/core-events-design.md` | `references/infra-queue-jobs.md`<br>`references/infra-queue-mutex.md`<br>`references/persistence-migrations-schema.md`<br>`references/persistence-db.md` |
| **HTML UI / Forms / Grid** | `references/http-views.md`<br>`references/http-widgets-and-assets.md`<br>`references/http-forms-and-hydration.md`<br>`references/http-state.md` | `references/http-actions-concerns.md`<br>`references/http-validation-rules.md`<br>`references/http-file-handling.md`<br>`references/http-dataview-widgets.md` |
| **Auth / Identity / RBAC** | `references/infra-auth-and-rbac.md`<br>`references/infra-auth-session.md`<br>`references/http-middlewares.md` | `references/http-state.md#2-sessions-yiisoftsession`<br>`references/infra-auth-jwt.md`<br>`references/infra-auth-oauth2.md`<br>`references/infra-rbac-storage.md` |
| **Database & Schema Migrations** | `references/persistence-migrations-schema.md`<br>`references/persistence-migrations-operations.md`<br>`references/persistence-db-connection-and-queries.md` | `references/core-di-definitions.md`<br>`references/persistence-db.md`<br>`references/persistence-caching.md` |
| **Full Architecture Slices** | `references/core-architecture-alignment.md`<br>`references/core-feature-recipes.md` | `references/core-dependency-protocol.md`<br>`references/core-definition-of-done.md`<br>`references/package-catalog.md` |
| **New Project Bootstrap** | `references/core-dependency-protocol.md#23-new-yii3-project-bootstrap-official-app-templates`<br>`references/package-catalog.md` | `references/core-architecture-alignment.md`<br>`references/core-config-tree.md`<br>`references/infra-runners-and-runtimes.md` |
| **Email / Notifications** | `references/infra-mailer.md` | `references/core-di-definitions.md`<br>`references/infra-mailer-transports.md`<br>`references/infra-mailer-async-queue.md` |
| **Testing** | `references/testing-core.md` | `references/testing-http.md`<br>`references/testing-database.md`<br>`references/testing-psr-doubles.md`<br>`references/http-validation-custom-rules.md` |
| **i18n** | `references/http-i18n-translation-api.md`<br>`references/http-i18n-storage-and-locale.md` | `references/http-routes-url-and-middleware.md`<br>`references/core-config-tree.md` |
| **OpenAPI / Swagger** | `references/http-openapi-setup.md`<br>`references/http-openapi-endpoints.md` | `references/http-routes-definition.md`<br>`references/http-openapi-ui-and-ops.md` |
| **Events & Listeners** | `references/core-events-design.md` | `references/core-events-reference.md`<br>`references/core-di-definitions.md`<br>`references/infra-transactional-outbox.md` |
| **Active Record** | `references/persistence-active-record.md`<br>`references/persistence-active-record-relations.md` | `references/persistence-db-connection-and-queries.md`<br>`references/persistence-migrations-schema.md` |
| **Cycle ORM** | `references/persistence-cycle-orm.md`<br>`references/persistence-cycle-schema-and-cli.md` | `references/persistence-migrations-schema.md`<br>`references/infra-rbac-storage.md` |
| **Bootstrap / Runners / Workers** | `references/infra-runners-and-runtimes.md` | `references/core-config-tree.md`<br>`references/infra-state-resetter.md` |
| **Helper Lookup** | `references/core-utilities.md` | `references/package-catalog.md`<br>`references/core-utilities-niche.md`<br>`references/core-friendly-exceptions.md` · Tier 2: `vendor/yiisoft/<pkg>/src/` |

## References (read on demand)

Load targeted topic guides via the Task & Intent Routing Matrix above. The complete categorized catalog of specialized topic guides with descriptions is maintained in [`references/INDEX.md`](references/INDEX.md).
