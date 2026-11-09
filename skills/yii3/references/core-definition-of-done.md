# Yii3 Definition of Done — Architecture Checks, Production Readiness Gate, Verification Report

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

Finale extension for the `yii3` skill: the checks that run only when they earn their cost.
Load this guide at the Finale when the task is a **new feature**, or when it touches **runtime, auth, queues, or infrastructure** (runners, workers, error handling, logging, caching). Small Light-mode tasks (single route, config/DI edit, one-file refactor) stop at the Chain Integrity checklist in `SKILL.md` and skip this guide.

---

## Contents
- [1. Architecture & Code-to-Reference Compliance Checks](#1-architecture--code-to-reference-compliance-checks)
- [2. Multi-Dimensional Quality Evaluation Matrix](#2-multi-dimensional-quality-evaluation-matrix)
- [3. Production Readiness Gate](#3-production-readiness-gate)
  - [3.1. Code Quality & Formatting Toolchain (`yiisoft/code-style`)](#31-code-quality--formatting-toolchain-yiisoftcode-style)
- [4. Verification Report Format](#4-verification-report-format)

---

## 1. Architecture & Code-to-Reference Compliance Checks

Before sign-off, every newly created or modified artifact MUST be audited against its governing topic guide in `references/`:

1. **Resolve Governing Guide:** Identify the specific topic guide (`references/<topic>.md`) governing the artifact via the active plan, the Task Routing Matrix in `SKILL.md`, or `references/INDEX.md` (e.g. actions → `http-actions-core.md`, middlewares → `http-middlewares.md`, DI → `core-di-and-config.md`, queue → `infra-queue-jobs.md`, events → `core-events-and-listeners.md`, migrations → `persistence-migrations-operations.md`).
2. **Anti-Pattern Audit [BLOCKER]:** Inspect the `## Anti-Pattern Matrix` (or `## Anti-Patterns & Common Traps`) in that governing guide. Every forbidden pattern is a hard failure (`[BLOCKER]`). If the code reproduces any forbidden pattern from that guide's matrix, verification fails.
3. **Core Invariants [BLOCKER]:**
   - **Thin Actions:** zero direct SQL, persistence, `$db->transaction()`, hashing, or notifications; strictly return `Psr\Http\Message\ResponseInterface`; input via typed DTO + validator.
   - **Post-Commit Events:** domain events dispatched strictly after database transaction commit, never inside an open transaction.
   - **SQL Injection Safety:** all dynamic SQL values use parameterized binding; collection queries enforce pagination (`OffsetPaginator`) or explicit SQL `limit`.
   - **Validator Grounding:** rules use modern PHP 8 attributes from installed `yiisoft/validator` (never Yii 2 `rules()`).
   - **CSRF Order:** `CsrfTokenMiddleware` after `SessionMiddleware`, before `Router`; stateless APIs exempt.
   - **PSR-3 Logging:** `LoggerInterface` DI-bound with explicit targets; never concrete `Yiisoft\Log\Logger` or static facades.
   - **Constructor DI:** dependencies injected via `__construct()`; never inject `ContainerInterface` into services.
4. **Defect Severity Classification:** Hard architectural bans (Yii::$app, static facades, controller base class, SQL in actions, uncommitted event dispatch) are strict blocking gate failures (`BLOCKER`). Tooling and code-style rules (such as `#[Override]` omission per `yiisoft/code-style`) are non-blocking convention suggestions (`SUGGESTION`), unless explicitly enforced by the project's own Rector preset or CI rules.

## 2. Multi-Dimensional Quality Evaluation Matrix

In addition to technical compilation and DI wiring, every delivered feature is evaluated against six independent quality dimensions before sign-off:

| Dimension | Scope & Verification Invariants | Grounding / Source |
|---|---|---|
| **1. Functional Correctness** | All requested business invariants and user flows are implemented. Proper HTTP status codes (`200`, `201`, `400`, `404`, `422`) or console `ExitCode` (`OK`, `UNSPECIFIED_ERROR`) returned. Validation errors surfaced cleanly in response bodies. | Feature specification, `references/http-actions-core.md`, `references/infra-commands.md` |
| **2. Architectural Correctness** | Single-Action controllers implement `__invoke()` returning `ResponseInterface`; actions strictly remain thin (zero SQL or direct persistence in actions). Domain isolation aligns with the project's `/aif-architecture` pattern: **Explicit Architecture (Strict)** mandates pure domain aggregates isolated from persistence and explicit repository interfaces; **Structured Modules (Balanced)** organizes code by domain modules, allows Active Record or concrete repositories, and introduces interfaces at module boundaries or for swappable components; **Layered Architecture (Pragmatic)** allows application services directly consuming concrete repositories or Active Record models. Across all three patterns: Presentation remains decoupled from persistence (zero direct SQL or persistence in actions). Decomposition tier adheres to task scope (`Lightweight` / `Standard` / `Full`). Placement strictly follows architecture source (`references/core-architecture-alignment.md`). | `references/core-feature-recipes.md`, `references/core-architecture-alignment.md` |
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

### 3.1. Code Quality & Formatting Toolchain (`yiisoft/code-style`)

When setting up automated code quality, linting, and refactoring, use `yiisoft/code-style` (dev dependency only):

```bash
composer require --dev yiisoft/code-style rector/rector
```

#### 1. PHP-CS-Fixer (`.php-cs-fixer.dist.php`)
Use `Yiisoft\CodeStyle\ConfigBuilder::build()` to register `@Yiisoft/Core` and `@Yiisoft/Core:risky` rule sets:

```php
<?php

declare(strict_types=1);

use PhpCsFixer\Finder;
use Yiisoft\CodeStyle\ConfigBuilder;

$finder = (new Finder())->in([
    __DIR__ . '/src',
    __DIR__ . '/tests',
]);

return ConfigBuilder::build()
    ->setRiskyAllowed(true)
    ->setRules([
        '@Yiisoft/Core' => true,
        '@Yiisoft/Core:risky' => true,
    ])
    ->setFinder($finder);
```

#### 2. Rector (`rector.php`)
Use `Yiisoft\CodeStyle\Rector\SetList::YII_CORE` (enforces Yii conventions, including removing `#[Override]` attributes):

```php
<?php

declare(strict_types=1);

use Rector\Config\RectorConfig;
use Yiisoft\CodeStyle\Rector\SetList;

return RectorConfig::configure()
    ->withPaths([
        __DIR__ . '/src',
        __DIR__ . '/tests',
    ])
    ->withSets([
        SetList::YII_CORE,
    ]);
```

#### 3. Composer Helper Scripts
Register shortcuts in `composer.json`:
```json
"scripts": {
    "cs-check": "php-cs-fixer fix --dry-run",
    "cs-fix": "php-cs-fixer fix",
    "rector": "rector"
}
```

## 4. Verification Report Format

Bind the verification report to the Finale and extend it with added packages, changed config files, and the Production Readiness Gate status:

```
Mode: <Light | Full>
Decomposition: <Lightweight | Standard | Full>
Architecture: <source>
fixes applied: <list | none>
tests: pass | fail | not run | blocked (<reason>) | n/a
static analysis (Psalm/PHPStan, Rector): pass | fail | not run | blocked (<reason>) | n/a
packages added: <list | none>
config files changed: <list | none>
production readiness gate: pass | fail (<items>) | n/a
```

### Canonical Status Vocabulary

All automated gates and check lines strictly adhere to one unified 5-state vocabulary:

| Status | Meaning & Machine Interpretation |
|---|---|
| **`pass`** / `PASS` | Check was executed and completed cleanly with zero errors/violations. |
| **`fail`** / `FAIL` | Check was executed and detected concrete failures or defects. |
| **`not run`** / `NOT RUN` | Check was not executed (e.g. offline environment, test runner or `vendor/` not present). Never conflate with `fail` or `blocked`. |
| **`blocked (<reason>)`** / `BLOCKED` | Check could not run due to an environmental or external dependency blocker (e.g. missing database container, network boundary). |
| **`n/a`** / `N/A` | Check is not applicable to the current task scope (e.g. Production Readiness Gate on Light-mode tasks). |
