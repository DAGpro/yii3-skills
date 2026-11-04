# AI Factory Extension: Yii3 Skills

[AI Factory](https://github.com/lee-to/ai-factory) extension with the **`yii3`** agent skill — a stage-based development workflow for **Yii 3** (`yiisoft/*` packages, PHP 8.2+): mission bootstrap, bottom-up implementation stages, deterministic verification, and a production readiness gate. The skill grounds every API claim in the target project's installed `vendor/yiisoft/<pkg>/src/` sources — zero hallucinated signatures, zero Yii 2 constructs — and separates three sources of truth with an explicit conflict rule: API (vendor sources) → implementation patterns (skill guides) → project conventions (the project's own architecture artifact or dominant `src/` style), so new code never rewrites a working project to match the guides.

## What is inside

- **`skills/yii3/SKILL.md`** — the skill entry point: mode selection (Light vs Full), Stage 0 bootstrap, Mission Workflow (Stages 1–7), Finale with the Chain Integrity checklist, core rules with the Yii 2 ban list, and the task routing matrix.
- **`skills/yii3/references/`** — 56 topic guides (core/DI/events, HTTP, persistence, infrastructure, testing) plus the runtime package catalog and version-gated behavior notes.
- **`skills/yii3/scripts/`** — dependency-free PHP 8.1+ static verifiers (`verify-all.php`, `check-di-syntax.php`, `verify-actions.php`, `verify-routes.php`), a fixture-based self-test (`selftest.php`), and the `fixtures/` catalog.
- **`skills/yii3/examples/crud-slice/`** — a canonical vertical slice (migration → domain aggregate → persistence adapter → use case handler with post-commit events → thin actions → config wiring → unit tests) used as the template for new features.
- **`injections/*.md`** — thin workflow hooks for AI Factory (`aif-plan`, `aif-implement`, `aif-verify`, `aif-fix`, `aif-review`, `aif-improve`, `aif-roadmap`, `aif-architecture`); the skill itself is the single source of rules.

## Operating modes

- **Standalone** — the skill is loaded directly (Claude Code / Cursor / any Agent Skills host). It leads the agent start-to-finish: Stage 0 → Mission Workflow → Finale is the closing gate.
- **AI Factory** — the skill is loaded by the `yii3` injection inside an `aif-*` workflow. Stage 0 detects what the workflow already resolved and continues without redoing it; the Finale hands control to `/aif-verify` (findings merge into its `aif-gate-result`).

The rules are identical in both modes; only who closes the final gate differs. All AI Factory specifics are consolidated in the skill's "AI Factory mode" section, so standalone users never need to know the workflow internals.

## Installation

With the AI Factory CLI:

```bash
ai-factory extension add https://github.com/DAGpro/yii3-skills.git
```

Skills-only install (any Agent Skills host, without the AI Factory CLI):

```bash
npx skills add DAGpro/yii3-skills --skill '*'
```

## Supported stack

- **PHP 8.2+** for generated code (Yii 3 conventions); the verifier scripts themselves run on **PHP 8.1+** CLI.
- **Yii 3 `yiisoft/*` packages**: the skill targets the package families cataloged in [`skills/yii3/references/package-catalog.md`](skills/yii3/references/package-catalog.md) — router, DI & config, db (MySQL/PostgreSQL/SQLite/MSSQL/Oracle) + Active Record / Cycle ORM, migrations, validator, hydrator, data-response, views & widgets, middlewares, state (session/CSRF/cookies), auth & RBAC, mailer, queue, cache, mutex, logging, error handling, runners (SAPI/RoadRunner/FrankenPHP), and testing (PHPUnit/Testo/Codeception). Version-gated behavior (e.g. router ≥ 4.0.3 constructor routes) is tracked in [`core-version-notes.md`](skills/yii3/references/core-version-notes.md) with `composer.lock` verification steps.

## Example

Ask the agent (in a Yii 3 project): *"Add a comment to a post"* — expected behavior:

1. **Stage 0** — guard (`yiisoft/*` present), bootstrap checklist, `Light`/`Full` decision, mission plan printed.
2. **Mission Workflow** — bottom-up stages: migration → `Comment` aggregate + `CommentRepositoryInterface` (bound in DI immediately) → repository adapter → `AddCommentHandler` (domain checks → `ConnectionInterface::transaction()` → events dispatched post-commit) → input DTO + thin `CreateCommentAction` → routes/events wiring → unit + HTTP tests.
3. **Finale** — deterministic gate, project checks, Chain Integrity checklist, then (Full mode) the definition-of-done guide:

   ```
   verify-all.php <scope> -> exit 1 (1 error)
   - verify-actions.php: src/Presentation/CreateCommentAction.php:12 — thin_action_create_command — ...
   fixes applied: persistence moved to CommentRepository
   rerun: verify-all.php <scope> -> exit 0
   packages added: none
   config files changed: config/common/di/post.php, config/common/routes.php
   production readiness gate: pass
   ```

## Running the verifiers

From the skill package directory, against a Yii 3 project path:

```bash
php scripts/verify-all.php /path/to/project          # all checkers in one pass
php scripts/check-di-syntax.php /path/to/project     # DI files + params.php
php scripts/verify-actions.php /path/to/project      # actions: thin action, return types, output statements
php scripts/verify-routes.php /path/to/project       # routes.php: syntax, names, static factories
php scripts/selftest.php                             # verifier self-test against fixtures/
```

Exit codes: `0` = pass or warnings only · `1` = blocking errors · `2` = misconfigured invocation. These are static heuristics — a green result never proves that DI wiring resolves or routes match at runtime.

## Updating the references

The 130 `yiisoft/*` package clones under `references/` (at the extension repository root) are the offline source of truth used to author and re-verify the guides. Authoring rules, grounding protocol, and the synchronization cascade (SKILL.md ↔ package catalog ↔ injections ↔ manifests) are defined in [AGENTS.md](AGENTS.md).

## License

MIT
