# AI Factory Extension: Yii3 Skills

> Multi-agent skill package and [AI Factory](https://github.com/lee-to/ai-factory) extension for idiomatic **Yii 3** development (PHP 8.2+, `yiisoft/*` packages).

The **`yii3`** skill provides a rigorous, stage-based workflow for AI agents (Cursor, Claude Code, Windsurf, Devin) and AI Factory pipelines: mission bootstrap, bottom-up architectural implementation, and a production readiness gate.

## Key Invariants

- **Zero Yii 2 Hallucinations**: Strict ban on legacy constructs (`Yii::$app`, static facades, ActiveRecord event coupling). Enforces modern Yii 3 idioms: PSR-7/PSR-15/PSR-14, DI autowiring, strict immutability, hydrators, and input DTOs.
- **Offline Source of Truth**: All 87 topic guides (89 reference files) are grounded against 130 official `yiisoft/*` packages. Static symbol, AST signature/arity, and manifest freshness checks (`scripts/check-symbols.mjs`, `scripts/check-ast.mjs`, `scripts/check-manifest-freshness.mjs`) run on every change.
- **Strict Hierarchy of Truth**: Clear conflict resolution: **Installed API** (`vendor/yiisoft/`) → **Implementation Patterns** (skill guides) → **Project Conventions** (`ARCHITECTURE.md` or dominant `src/` layout). New code never forces guide conventions onto an established codebase.

## Installation

Install via the AI Factory CLI:

```bash
ai-factory extension add https://github.com/DAGpro/yii3-skills.git
```

Or install as an agent skill directly into any Agent Skills host (Cursor, Claude Code):

```bash
npx skills add DAGpro/yii3-skills --skill '*'
```

## Execution Modes

The skill automatically selects an execution mode based on task scope, or respects the explicit `--mode=<patch|feature|enterprise>` parameter:

| Mode | Trigger & Scope | Architectural Workflow | CLI Flag |
|---|---|---|---|
| **Patch** | Bug fixes, isolated changes (1–3 files), docs, typo/config fixes | Direct surgical edit + project checks; skips aggregate design and schema migrations (unless schema changes required) | `--mode=patch` |
| **Feature** *(default)* | Standard business features, endpoints, console commands, domain logic (~80% of tasks) | Bottom-up stages: Migration & Schema → Domain/Model & Repository Boundary → Repository/Persistence → Use Case Handler & Events → Input DTO & Single-Action Handler → Wiring → Tests | `--mode=feature` |
| **Enterprise** | High-throughput systems, event-driven pipelines, auth/security cores, multi-step transactions | Production-grade rigor: atomic transactions, event publishing, idempotency, complete Production Readiness Gate; decomposition adapts to Architectural Tier (Pragmatic / Balanced / Strict) | `--mode=enterprise` |

## Integration Contexts

- **AI Factory (default)** — The skill acts as an AI Factory extension: it hooks into AI Factory automation pipelines via workflow injections (`injections/*.md`: `aif-plan`, `aif-implement`, `aif-verify`, `aif-fix`, `aif-review`, `aif-improve`, `aif-roadmap`, `aif-architecture`). Findings merge directly into `aif-gate-result`.
- **Standalone (fallback)** — When the target project does not use AI Factory (no `.ai-factory/` directory, no `aif-*` invocation), the skill is loaded directly into an agent (Claude Code, Cursor, Windsurf). It guides the agent start-to-finish: Stage 0 bootstrap → Mission Workflow → Finale with the Chain Integrity checklist.

## What is Inside

- **`skills/yii3/SKILL.md`** — Canonical skill entry point: Stage 0 bootstrap (scope-first — the skill applies to the task's Yii 3 / `yiisoft/*` scope, no environment classification; plus opt-in new project bootstrap), Mission Workflow (Stages 1–7), Finale checklist, core rules, and the task routing matrix.
- **`skills/yii3/references/`** — 87 specialized topic guides (89 reference files total, including `INDEX.md` and `package-catalog.md`) covering DI, HTTP, persistence, auth & RBAC, queue, transactional outbox, mailer, testing, project bootstrap, and version-gated behavior notes.
- **`injections/*.md`** — AI Factory workflow hooks anchoring workflow stages to the skill as the single source of truth.
- **`evals/`** — Evaluation harness with 69 behavioral test scenarios (100% topic guide coverage — 87 of 87 guides bound, see [`evals/COVERAGE.md`](evals/COVERAGE.md)) plus the [`evals/runtime-harness/`](evals/runtime-harness/) L5 PHPUnit 11 integration suite.
- **`scripts/`** — Automated quality gates: `validate.mjs` (manifest, frontmatter, injection structure, and link integrity), `check-symbols.mjs` (ground-truth symbol verification), `check-ast.mjs` (structural call and signature analysis), `check-manifest-freshness.mjs` (manifest provenance & upstream drift detection), `test-aif-workflow.mjs` (workflow contracts), `check-eval-coverage.mjs` (100% guide coverage gate), and `test-php-runtime.mjs` (L4/L5 PHPUnit runtime harness runner).

## Quality Gates & Verification

The skill's recommendations are backed by deterministic verification:

- **Empirical Baseline (+36.3 pp overall, +34.4 pp on pure-code composites)**: Evaluated across paired test scenarios (single-run campaign, $n=1$, GLM-5.3-Flash) — with-skill agents improved from a 56.9% baseline to a 93.2% pass rate (+34.4 pp on complex code tasks; +100 pp on multi-agent protocol adherence). See [`evals/BASELINE.md`](evals/BASELINE.md).
- **Symbol & Arity Grounding**: `node scripts/check-symbols.mjs` verifies 1,468 FQCN occurrences and 474 method call citations across guides against official package sources (indexing 766 unique FQCNs and 346 unique signatures across 130 packages in `evals/data/api-symbols-manifest.json`).
- **AST PHP Code Grounding Analyzer**: `node scripts/check-ast.mjs` statically verifies 840 call arities (566 instance + 274 static) and 197 named parameter bindings across 716 documented PHP code blocks (89 files, 0 defects) against package AST signatures (`177` classes, `469` signatures in `evals/data/ast-signatures-manifest.json`).
- **Manifest Freshness & Upstream Drift**: `node scripts/check-manifest-freshness.mjs` validates commit provenance and parity across both manifests (`130` packages) against local clones; `--upstream` additionally inspects remote drift against upstream `yiisoft/*` remotes.
- **Automated Validation & Workflow Contracts**: `node scripts/validate.mjs` enforces frontmatter spec compliance, link integrity, and the injection structure contract; `node scripts/test-aif-workflow.mjs` verifies 88 AI Factory workflow contracts; `node evals/runner/selftest.mjs` checks all 69 eval scenarios.
- **L5 PHPUnit Integration Harness**: `node scripts/test-php-runtime.mjs --strict` runs real Yii 3 DI container wiring, FastRoute routing, ValidatingHydrator validation, SQLite migrations, transactional outbox + mutex relay, sync queue idempotency, and `StateResetter` verification in CI (`php-runtime-gates` on PHP 8.2+ with Composer & `pdo_sqlite`).

## Supported Stack

- **PHP 8.2+** for generated code.
- **Yii 3 Ecosystem**: Packages cataloged in [`skills/yii3/references/package-catalog.md`](skills/yii3/references/package-catalog.md) (Router, DI & Config, DB/Cycle ORM, Migrations, Validator, Hydrator, Data-Response, View & Widgets, Auth & RBAC, Mailer, Queue, Transactional Outbox, Cache, Mutex, Logging, Error Handling, Runners & Application templates `app` / `app-api` / `app-console`).
- Opt-in new project bootstrap rules live in [`core-dependency-protocol.md`](skills/yii3/references/core-dependency-protocol.md), transactional outbox patterns in [`infra-transactional-outbox.md`](skills/yii3/references/infra-transactional-outbox.md), and version-specific nuances in [`core-version-notes.md`](skills/yii3/references/core-version-notes.md).

## Known Limitations

- **Not a Target-App Runtime**: The skill generates and reviews code; target project test suites, static analysis (Psalm/PHPStan), and migrations execute through the target project's own PHP/Composer toolchain (while CI verifies the reference `evals/runtime-harness/` integration stack on PHP 8.2+ & SQLite).
- **External Dependencies**: Non-`yiisoft` packages (e.g. `symfony/console` attributes) and PHP language deprecations are verified against the target project's `composer.lock` and runtime PHP version, not the offline clones.
- **Out of Scope**: Front-end build tooling (beyond `yiisoft/assets`), GraphQL, and application-level hardening beyond the provided auth, CSRF, and RBAC recipes.

## Contributing

Ground rules, offline clone setup, and the synchronization cascade are documented in [CONTRIBUTING.md](CONTRIBUTING.md); the full project constitution lives in [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE) © DAGpro and yii3-skills contributors.
