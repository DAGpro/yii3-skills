# AI Factory Extension: Yii3 Skills

> Multi-agent skill package and [AI Factory](https://github.com/lee-to/ai-factory) extension for idiomatic **Yii 3** development (PHP 8.2+, `yiisoft/*` packages).

The **`yii3`** skill provides a rigorous, stage-based workflow for AI agents (Cursor, Claude Code, Windsurf, Devin) and AI Factory pipelines: mission bootstrap, bottom-up architectural implementation, and a production readiness gate.

## Key Invariants

- **Zero Yii 2 Hallucinations**: Strict ban on legacy constructs (`Yii::$app`, static facades, ActiveRecord event coupling). Enforces modern Yii 3 idioms: PSR-7/PSR-15/PSR-14, DI autowiring, strict immutability, hydrators, and input DTOs.
- **Offline Source of Truth**: All 80+ reference guides are grounded against 130 official `yiisoft/*` packages. Static symbol and method arity checks (`scripts/check-symbols.mjs`) run on every change.
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
| **Patch** | Bug fixes, isolated changes (1–3 files), docs, typo/config fixes | Direct surgical edit + project checks; skips aggregate design and schema migrations | `--mode=patch` |
| **Feature** *(default)* | Standard business features, endpoints, console commands, domain logic | Bottom-up stages: Schema/Migration → Domain/Interface → Handler → DTO & Thin Action → Wiring → Tests | `--mode=feature` |
| **Enterprise** | High-throughput systems, event-driven flows, modular CQRS, audit requirements | Full CQRS decomposition, transactional outbox/event-sourcing, explicit SLA/metrics, stress & audit checklists | `--mode=enterprise` |

## Integration Contexts

- **Standalone** — The skill is loaded directly into an agent (Claude Code, Cursor, Windsurf). It guides the agent start-to-finish: Stage 0 bootstrap → Mission Workflow → Finale with the Chain Integrity checklist.
- **AI Factory** — The skill hooks into AI Factory automation pipelines via workflow injections (`injections/*.md`: `aif-plan`, `aif-implement`, `aif-verify`, `aif-fix`, `aif-review`, `aif-improve`, `aif-roadmap`, `aif-architecture`). Findings merge directly into `aif-gate-result`.

## What is Inside

- **`skills/yii3/SKILL.md`** — Canonical skill entry point: Stage 0 bootstrap, Mission Workflow (Stages 1–7), Finale checklist, core rules, Yii 2 ban list, and the task routing matrix.
- **`skills/yii3/references/`** — 80+ specialized guides (DI, HTTP, persistence, auth & RBAC, queue, mailer, testing), runtime package catalog, and version-gated behavior notes.
- **`injections/*.md`** — AI Factory workflow hooks anchoring workflow stages to the skill as the single source of truth.
- **`evals/`** — Evaluation harness with 57 behavioral test scenarios across unit and composite Yii 3 tasks.
- **`scripts/`** — Automated quality gates: `validate.mjs` (manifest, frontmatter, and link integrity) and `check-symbols.mjs` (ground-truth symbol and arity verification against 130 offline packages).

## Quality Gates & Verification

The skill's recommendations are backed by deterministic verification:

- **Empirical Baseline (+36.3 pp gain)**: Evaluated across paired test scenarios — with-skill agents improved from a 56.9% baseline to a 93.2% pass rate (+41.6 pp on complex composite tasks). See [`evals/BASELINE.md`](evals/BASELINE.md).
- **Symbol & Arity Grounding**: `node scripts/check-symbols.mjs` verifies 1,400+ FQCNs and 460 method signatures and argument arities against official package sources.
- **Automated Validation**: `node scripts/validate.mjs` enforces frontmatter spec compliance, link integrity, and activation guard synchronization.

## Supported Stack

- **PHP 8.2+** for generated code.
- **Yii 3 Ecosystem**: Packages cataloged in [`skills/yii3/references/package-catalog.md`](skills/yii3/references/package-catalog.md) (Router, DI & Config, DB/Cycle ORM, Migrations, Validator, Hydrator, Data-Response, View & Widgets, Auth & RBAC, Mailer, Queue, Cache, Mutex, Logging, Error Handling, Runners).
- Version-specific nuances (e.g. router ≥ 4.0.3 constructor routes) are detailed in [`core-version-notes.md`](skills/yii3/references/core-version-notes.md).

## Known Limitations

- **Not a Runtime**: The skill generates and reviews code; it does not execute application code. Tests, static analysis (Psalm/PHPStan), and migrations run through the target project's own toolchain.
- **External Dependencies**: Non-`yiisoft` packages (e.g. `symfony/console` attributes) and PHP language deprecations are verified against the target project's `composer.lock` and runtime PHP version, not the offline clones.
- **Out of Scope**: Front-end build tooling (beyond `yiisoft/assets`), GraphQL, and application-level hardening beyond the provided auth, CSRF, and RBAC recipes.

## Contributing

Ground rules, offline clone setup, and the synchronization cascade are documented in [CONTRIBUTING.md](CONTRIBUTING.md); the full project constitution lives in [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE) © DAGpro and yii3-skills contributors.
