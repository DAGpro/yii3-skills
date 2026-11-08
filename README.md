# AI Factory Extension: Yii3 Skills

[AI Factory](https://github.com/lee-to/ai-factory) extension with the **`yii3`** agent skill — a stage-based development workflow for **Yii 3** (`yiisoft/*` packages, PHP 8.2+): mission bootstrap, bottom-up implementation stages, and a production readiness gate. The skill grounds every API claim in the target project's installed `vendor/yiisoft/<pkg>/src/` sources — offline authoring checks verify class and method-name existence (`node scripts/check-symbols.mjs`; parameter/return-type verification is a known limitation, see *Known limitations*), zero Yii 2 constructs — and separates three sources of truth with an explicit conflict rule: API (vendor sources) → implementation patterns (skill guides) → project conventions (the project's own architecture artifact or dominant `src/` style), so new code never rewrites a working project to match the guides.

## What is inside

- **`skills/yii3/SKILL.md`** — the skill entry point: mode selection (Light vs Full), Stage 0 bootstrap, Mission Workflow (Stages 1–7), Finale with the Chain Integrity checklist, core rules with the Yii 2 ban list, and the task routing matrix.
- **`skills/yii3/references/`** — 80+ specialized topic guides (core/DI/events, HTTP, persistence, infrastructure, testing — large topics split into focused subtopic guides with index files) plus the runtime package catalog and version-gated behavior notes.
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

- **PHP 8.2+** for generated code (Yii 3 conventions).
- **Yii 3 `yiisoft/*` packages**: the skill targets the package families cataloged in [`skills/yii3/references/package-catalog.md`](skills/yii3/references/package-catalog.md) — router, DI & config, db (MySQL/PostgreSQL/SQLite/MSSQL/Oracle) + Active Record / Cycle ORM, migrations, validator, hydrator, data-response, views & widgets, middlewares, state (session/CSRF/cookies), auth & RBAC, mailer, queue, cache, mutex, logging, error handling, runners (SAPI/RoadRunner/FrankenPHP), and testing (PHPUnit/Testo/Codeception). Version-gated behavior (e.g. router ≥ 4.0.3 constructor routes) is tracked in [`core-version-notes.md`](skills/yii3/references/core-version-notes.md) with `composer.lock` verification steps.

## Example

Ask the agent (in a Yii 3 project): *"Add a comment to a post"* — expected behavior:

1. **Stage 0** — guard (`yiisoft/*` present), bootstrap checklist, `Light`/`Full` decision, mission plan printed.
2. **Mission Workflow** — bottom-up stages: migration → `Comment` aggregate + `CommentRepositoryInterface` (bound in DI immediately) → repository adapter → `AddCommentHandler` (domain checks → `ConnectionInterface::transaction()` → events dispatched post-commit) → input DTO + thin `CreateCommentAction` → routes/events wiring → unit + HTTP tests.
3. **Finale** — project checks, Chain Integrity checklist, then (Full mode) the definition-of-done guide:

   ```
   fixes applied: persistence moved to CommentRepository
   tests: pass
   static analysis (Psalm/PHPStan): pass
   packages added: none
   config files changed: config/common/di/post.php, config/common/routes.php
   production readiness gate: pass
   ```

## Known limitations

- **Not a runtime.** The skill generates and reviews code; it does not execute it. Every runtime check (tests, static analysis, migrations) runs through the target project's own toolchain — the skill only prescribes which checks to run.
- **Grounding scope.** `Yiisoft\...` classes and methods quoted in the guides are verified against the offline clones (`node scripts/check-symbols.mjs` — the checker prints the confirmed class/method counts on every run; do not quote hard numbers here, they drift). Claims about **external** dependencies (`symfony/console` attributes) and **PHP language** deprecations are verified via the target project's `composer.lock` / PHP version, not the clones; the `#[Override]` rule ([core-version-notes.md, R10](skills/yii3/references/core-version-notes.md)) is a **convention claim**: the rule class itself is grounded in the clones (`yiisoft/code-style` ships `RemoveOverrideAttributeRector` in the `YII_CORE` set), but whether it *blocks* depends on the target project's Rector preset — without the preset it is reported as a convention suggestion, not an error.
- **Verified package versions.** Guides were grounded against the `master`/stable branches of the 130 `yiisoft/*` clones as of **November 2026** (e.g. router 4.0.3, yii-view-renderer 7.4.x, data-response 2.2.x, log 2.1+). Version-gated behavior is centralized in [`core-version-notes.md`](skills/yii3/references/core-version-notes.md); at runtime, agents must re-verify versions against the target project's `composer.lock` — the clones may drift from what a given project installs.
- **Standalone vs AI Factory.** Standalone mode resolves plan artifacts itself (`PLAN.md`, `docs/plans|docs/plan/*.md`, or an explicit argument — Stage 0 item 3(a)) and closes its own Finale. It does **not** get `/aif-verify` handoff, `aif-gate-result` merging, or `.ai-factory/config.yaml` path resolution; those exist only in AI Factory mode (see the skill's "AI Factory Adapter" section).
- **Out of scope topics.** The skill does not cover: front-end build pipelines (beyond `yiisoft/assets`), GraphQL, third-party non-`yiisoft` package ecosystems beyond the Cycle ORM persistence path, and application-level security hardening beyond the CSRF/auth/RBAC recipes in the guides.

## Updating the references

The 130 `yiisoft/*` package clones under `references/` (at the extension repository root) are the offline source of truth used to author and re-verify the guides. Authoring rules, grounding protocol, and the synchronization cascade (SKILL.md ↔ package catalog ↔ injections ↔ manifests) are defined in [AGENTS.md](AGENTS.md).

## Contributing

Ground rules, the synchronization cascade, and the quality gate for changes are described in [CONTRIBUTING.md](CONTRIBUTING.md); the full project constitution lives in [AGENTS.md](AGENTS.md).

## License

MIT
