# Yii3 Definition of Done — Architecture Checks, Production Readiness Gate, Verification Report

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

Finale extension for the `yii3` skill: the checks that run only when they earn their cost.
Load this guide at the Finale when the task is a **new feature**, or when it touches **runtime, auth, queues, or infrastructure** (runners, workers, error handling, logging, caching). Small Light-mode tasks (single route, config/DI edit, one-file refactor) stop at the Chain Integrity checklist in `SKILL.md` and skip this guide.

---

## Contents
- [1. Architecture & Decomposition Checks](#1-architecture--decomposition-checks)
- [2. Multi-Dimensional Quality Evaluation Matrix](#2-multi-dimensional-quality-evaluation-matrix)
- [3. Production Readiness Gate](#3-production-readiness-gate)
- [4. Verification Report Format](#4-verification-report-format)

---

## 1. Architecture & Decomposition Checks

The same checks the verify workflow runs; most are already covered by the Chain Integrity checklist and the gate below — keep an explicit checklist line only for what remains uncovered:

- **Thin Actions:** no SQL/ActiveRecord persistence, hashing, or notifications in Actions (side-effects live in use case handlers and listeners).
- **Strict `Psr\Http\Message\ResponseInterface` return** on every action method.
- **Validator rule names from the installed `yiisoft/validator`** (`Length`, `StringValue`, `Integer` — not Yii2-style `HasLength`/`IsString`).
- **CSRF middleware order:** `CsrfTokenMiddleware` after `SessionMiddleware`, before `Router`; stateless token-authenticated JSON APIs sit outside the CSRF gate.
- **PSR-3 logging:** `LoggerInterface` DI-bound with explicit targets — never the concrete `Yiisoft\Log\Logger` or static `Yii::getLogger()`.
- **File placement per the architecture source** (`references/core-architecture-alignment.md`): vendor-isolated core, one mechanism per concern.

## 2. Multi-Dimensional Quality Evaluation Matrix

In addition to technical compilation and DI wiring, every delivered feature is evaluated against six independent quality dimensions before sign-off:

| Dimension | Scope & Verification Invariants | Grounding / Source |
|---|---|---|
| **1. Functional Correctness** | All requested business invariants and user flows are implemented. Proper HTTP status codes (`200`, `201`, `400`, `404`, `422`) or console `ExitCode` (`OK`, `UNSPECIFIED_ERROR`) returned. Validation errors surfaced cleanly in response bodies. | Feature specification, `references/http-actions-core.md`, `references/infra-commands.md` |
| **2. Architectural Correctness** | Single-Action controllers implement `__invoke()` returning `ResponseInterface`; actions strictly remain thin (zero SQL or direct persistence in actions). Domain isolation aligns with the project's architecture tier: Strict (Clean/Hexagonal) mandates pure domain aggregates isolated from persistence; Pragmatic (Active Record) allows entities coupled to database persistence, but presentation remains decoupled from storage. Decomposition tier adheres to task scope (`Lightweight` / `Standard` / `Full`). Placement strictly follows architecture source (`references/core-architecture-alignment.md`). | `references/core-feature-recipes.md`, `references/core-architecture-alignment.md` |
| **3. API & Signature Correctness** | Every invoked method, constructor, and parameter type verified against installed package sources in `vendor/yiisoft/*/src/`. Zero deprecated Yii2 facades or static helpers (`Yii::$app`, `ActiveRecord::find()`). Version-gated syntax respected. | `references/core-version-notes.md`, Mandatory Signature Lookup Protocol |
| **4. Integration & Wiring Correctness** | Every new interface is DI-bound in `config/**/di/*.php`. Actions mapped in `config/**/routes.php`. Commands registered in `config/console/params.php`. Domain events subscribed in `config/**/events.php`. All packages declared in `composer.json`. | SKILL.md per-step wiring gates, `references/core-di-and-config.md` |
| **5. Security & Safety** | Typed input DTOs validate all untrusted user data. Mutating HTML routes protected by `CsrfTokenMiddleware` preceded by `SessionMiddleware`. Route-level authentication and RBAC permissions (`CurrentUser::can()`) verified before execution. Views escape dynamic data via `Html::encode()`. | `references/http-validation-rules.md`, `references/http-state.md`, `references/infra-auth-and-rbac.md`, `references/http-views.md` |
| **6. Reliability & Performance** | Multi-step database persistence wrapped in explicit transactions (`ConnectionInterface::transaction()`). Domain event dispatching deferred until after database transaction commit (post-commit rule). Pagination (`OffsetPaginator`) or SQL limits enforced on listings. Worker state safely cleared via `StateResetter`. | `references/persistence-db-connection-and-queries.md`, `references/core-events-design.md`, `references/infra-state-resetter.md` |

## 3. Production Readiness Gate

The difference between "milestone closed" and "product ready". Every item is grounded in an existing guide:

- runner & entry point configured; long-running workers reset state via `Yiisoft\Di\StateResetter` (ships with `yiisoft/di`) (`references/infra-runners-and-runtimes.md`, `references/infra-state-resetter.md`);
- ErrorCatcher + API error rendering configured, no debug output in production (HTML/JSON renderers ship with `yiisoft/error-handler`; ProblemDetails is a userland renderer recipe — `references/infra-error-handling.md`, `references/infra-error-handling-web.md`);
- `LoggerInterface` bound in DI with explicit targets (`references/infra-logging.md`);
- CSRF on state-changing routes (`references/http-state.md`) + DTO validation (`references/http-validation-and-forms.md`);
- auth/RBAC on protected routes (`references/infra-auth-and-rbac.md`);
- reversible migrations, one persistence branch, transactions in use cases (`references/persistence-migrations.md`, `references/persistence-db.md`);
- `yii-debug` / `yii-gii` / `code-style` only in `require-dev` (stack invariant via `references/package-catalog.md`);
- cache on hot paths (`references/persistence-caching.md`) + pagination limits (`references/persistence-db.md`);
- unit + HTTP tests and static analysis green (`references/testing-core.md`).

Execute the gate in Standalone mode; in AI Factory mode verify the checklist and hand it to the verify workflow (see SKILL.md "AI Factory Adapter").

## 4. Verification Report Format

Bind the verification report to the Finale and extend it with added packages, changed config files, and the Production Readiness Gate status:

```
Mode: <Light | Full>
Decomposition: <Lightweight | Standard | Full>
Architecture: <source>
fixes applied: <list | none>
tests: pass | fail | not run (no vendor / runner) | blocked (<reason>) | n/a
static analysis (Psalm/PHPStan, Rector): pass | fail | not run | blocked | n/a
packages added: <list | none>
config files changed: <list | none>
production readiness gate: pass | fail (<items>) | n/a
```
