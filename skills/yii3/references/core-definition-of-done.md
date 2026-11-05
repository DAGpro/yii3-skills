# Yii3 Definition of Done — Architecture Checks, Production Readiness Gate, Verification Report

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

Finale extension for the `yii3` skill: the checks that run only when they earn their cost.
Load this guide at the Finale when the task is a **new feature**, or when it touches **runtime, auth, queues, or infrastructure** (runners, workers, error handling, logging, caching). Small Light-mode tasks (single route, config/DI edit, one-file refactor) stop at the Chain Integrity checklist in `SKILL.md` and skip this guide.

---

## Contents
- [1. Architecture & Decomposition Checks](#1-architecture--decomposition-checks)
- [2. Production Readiness Gate](#2-production-readiness-gate)
- [3. Verification Report Format](#3-verification-report-format)

---

## 1. Architecture & Decomposition Checks

The same checks the verify workflow runs; most are already covered by the Chain Integrity checklist and the gate below — keep an explicit checklist line only for what remains uncovered:

- **Thin Actions:** no SQL/ActiveRecord persistence, hashing, or notifications in Actions (side-effects live in use case handlers and listeners).
- **Strict `Psr\Http\Message\ResponseInterface` return** on every action method.
- **Validator rule names from the installed `yiisoft/validator`** (`Length`, `StringValue`, `Integer` — not Yii2-style `HasLength`/`IsString`).
- **CSRF middleware order:** `CsrfTokenMiddleware` after `SessionMiddleware`, before `Router`; stateless token-authenticated JSON APIs sit outside the CSRF gate.
- **PSR-3 logging:** `LoggerInterface` DI-bound with explicit targets — never the concrete `Yiisoft\Log\Logger` or static `Yii::getLogger()`.
- **File placement per the architecture source** (`references/core-architecture-alignment.md`): vendor-isolated core, one mechanism per concern.

## 2. Production Readiness Gate

The difference between "milestone closed" and "product ready". Every item is grounded in an existing guide:

- runner & entry point configured; long-running workers reset state via `Yiisoft\Di\StateResetter` (ships with `yiisoft/di`) (`references/infra-runners-and-runtimes.md`, `references/infra-state-resetter.md`);
- ErrorCatcher + ProblemDetails renderers, no debug output in production (`references/infra-error-handling.md`);
- `LoggerInterface` bound in DI with explicit targets (`references/infra-logging.md`);
- CSRF on state-changing routes + DTO validation (`references/http-state.md`);
- auth/RBAC on protected routes (`references/infra-auth-and-rbac.md`);
- reversible migrations, one persistence branch, transactions in use cases (`references/persistence-migrations.md`, `references/persistence-db.md`);
- `yii-debug` / `yii-gii` / `code-style` only in `require-dev` (stack invariant via `references/package-catalog.md`);
- cache on hot paths (`references/persistence-caching.md`) + pagination limits (`references/persistence-db.md`);
- unit + HTTP tests and static analysis green (`references/testing-core.md`).

Execute the gate in Standalone mode; in AI Factory mode verify the checklist and hand it to the verify workflow (see SKILL.md "AI Factory mode").

## 3. Verification Report Format

Bind the verification report to the Finale and extend it with added packages, changed config files, and the Production Readiness Gate status:

```
fixes applied: persistence moved from CreateCommentAction to CommentRepository
tests: pass | fail
static analysis (Psalm/PHPStan, Rector): pass | fail
packages added: <list | none>
config files changed: <list | none>
production readiness gate: pass | fail (<items>)
```
