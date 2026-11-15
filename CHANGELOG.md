# Changelog

All notable changes to the `yii3-skills` AI Factory extension and its `yii3` skill are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org/) — pre-1.0, minor = contract/behavior changes. The version lives in [`extension.json`](extension.json); every release is tagged `v<version>`.

## [0.9.1] — 2026-11-15

### Fixed
- Fixed unconfirmed method signatures in `core-aif-adapter.md` (§7.5 receipt schema) and `infra-payments.md` by using canonical `ResponseFactory\DataResponseFactoryInterface::createResponse()` and `HydratorInterface::create()`, resolving CI `--manifest-mode` failure in `check-symbols.mjs`.
- Fixed 3 dead TOC anchor links in `infra-commands-definition.md`.
- Synchronized AI Factory role-binding matrix in `core-aif-adapter.md` to cover all 13 workflow injections registered in `extension.json` and documented unhooked workflow boundaries.
- Mandated Phase 6 test strategy (or justified N/A) in `injections/plan.md` to prevent unbacked implementations.
- Refined `SKILL.md` tone by adding technical rationale ("why") to framework invariants and clarifying repository interface optionality in Layered Architecture.
- Strengthened Subagent Receipt verification gate with independent filesystem and git diff evidence auditing.

## [0.9.0] — 2026-11-15

### Added
- Subagent Protocol 2.0 (`core-aif-adapter.md` §7): Context Readiness Gate (§7.2) and structured `### Subagent Execution Receipt` schema (§7.5).
- New composite eval scenario `70-subagent-delegation` testing Context Readiness evaluation, brief generation with mandatory anchors, receipt validation, and clean verify handoff.
- Scope & Progressive Context Disclosure rule in `SKILL.md` for surgical patch/bugfix tasks.

### Changed
- Unified all topic guide references to strictly use `references/packages/<guide-name>.md` or `references/instructions/<guide-name>.md` across `SKILL.md`, `core-aif-adapter.md`, `core-definition-of-done.md`, all 13 `injections/*.md`, `PACKAGES.md`, `evals/README.md`, and eval scenario positive sample transcripts.
- Hardened `scripts/test-aif-workflow.mjs` with strict assertion disallowing flat `references/<file>.md` guide paths in injections; expanded contract suite to 321 assertions.
- Refined `SKILL.md` Root-Cause Analysis from rigid linear chain to adaptive call-graph upstream traversal from symptom locus.
- Refined Grounding statement in `README.md` to reflect verified provenance manifests vs installed runtime sources.
- Updated topic guide eval coverage to 100.0% (98/98 guides covered across 70 scenarios) in `evals/COVERAGE.md`.

## [0.8.0] — 2026-11-15

### Added
- Subagent Delegation & Context Preservation Protocol (`references/instructions/core-aif-adapter.md` §7): formalizes isolation risk prevention, 4 mandatory delegation anchors (skill loading directive, architecture pattern & target paths, governing topic guides, signature grounding & invariants), canonical delegation prompt template, and parent receipt & verification gate.
- Subagent Delegation rule in standalone fallback mode (`references/instructions/core-standalone-adapter.md` §5).
- `Subagent Context Preservation` and `Root-Cause Analysis` invariants in `SKILL.md` (Framework Invariants), anchored to `core-aif-adapter.md` and `core-architecture-alignment.md §6`.

### Changed
- Synchronized `references/INDEX.md` inventory with subagent delegation capability.
- Formatted relative link syntax in `references/instructions/core-dependency-protocol.md`.

### Removed
- Pruned hallucinated reference to non-existent `core-aif-verification.md` from `references/INDEX.md`.

## [0.7.0] — 2026-11-15

### Changed
- Restructured reference guide library: organized meta-architecture instructions and protocols into `references/instructions/` and subsystem/package guides into `references/packages/`.
- Updated relative paths and anchor links across all 100 reference guides, `SKILL.md`, and `INDEX.md`.
- Synchronized 13 AI Factory workflow injections and 69 benchmark eval scenarios with restructured directory paths.
- Adapted quality gate validators (`validate.mjs`, `check-symbols.mjs`, `check-ast.mjs`, `check-eval-coverage.mjs`).

## [0.6.0] — 2026-11-15

### Added
- New reference guide `skills/yii3/references/infra-payments.md` covering `yiisoft/payments`: multi-gateway abstraction (Stripe, PayPal, YooKassa, Robokassa), PSR-17/18 client wiring, `PaymentIntent` lifecycle, and cryptographic webhook verification via `WebhookProcessor`.
- 5 new AI Factory workflow injections in `injections/`: `aif.md`, `build-automation.md`, `ci.md`, `dockerize.md`, and `security-checklist.md`, bringing total workflow hooks to 13 registered in `extension.json`.
- Ecosystem expansion with 3 new official packages: `yiisoft/scheduler`, `yiisoft/yii-runner-rapira`, and `yiisoft/payments`; references lockfile updated to 136 packages (`references/packages.lock.json`).
- Pre-release and ecosystem notes in `references/README.md` for in-development packages `yiisoft/yii-auth-session`, `yiisoft/locale-middleware`, and `yiisoft/db-profiler`.
- 226 AI Factory workflow contract tests in `scripts/test-aif-workflow.mjs`.

### Changed
- Standardized injection contract across all 13 workflow hooks: load-first SSOT pattern deferring directly to the `yii3` skill without environment-classification gating.
- Updated API symbols and AST signature manifests to 136 packages (`792` classes, `347` signatures in `api-symbols-manifest.json`; `186` classes, `484` signatures in `ast-signatures-manifest.json`).
- Updated reference guide library to 100 reference files (98 topic guides, 100% eval coverage across 69 scenarios).
- Decoupled leaf reference guides from imposed architecture layers (Clean/Layered), enforcing neutral component contracts and deferring folder layouts strictly to `core-architecture-alignment.md`.
- Eliminated residual execution mode markers (Feature/Patch/Enterprise) across eval scenarios, tests, and guides.

### Removed
- Pruned non-runtime test packages `yiisoft/dummy-provider` and `yiisoft/psr-dummy-provider` from authoring references, lockfile, and package catalog.

## [0.5.0] — 2026-11-14

### Added
- Standard Agent Skills metadata (`license: MIT`, `metadata.author`, `metadata.version`) in `skills/yii3/SKILL.md` frontmatter.
- Modular splits for 7 oversized reference guides (`http-middlewares`, `core-feature-recipes`, `persistence-active-record`, `infra-commands`, `testing-core`, `persistence-migrations-schema`, `http-openapi-endpoints`), keeping all 97 topic guides strictly under 600 lines and 35KB.
- Standardized `## Table of Contents` across all 23 reference guides >250 lines.

### Changed
- Deduplicated 4-line `Grounding rule` callout block across 94 reference guides into a concise 1-line note, saving ~2,800 tokens of preamble context.
- Compressed `skills/yii3/SKILL.md`: eliminated prose walls >300 chars, structured Mode Selection into a clean table, added 4th column `Audit Index` with all 11 split-indexes, and surfaced all 24 leaf guides in `Secondary / Variants`.
- Synchronized single source of truth configuration and routing paths across all core guides.
- Fixed 15 critical and 4 warning false-positive security scanner triggers in code samples.

## [0.4.0] — 2026-11-11

### Added
- Scope-first zero-Yii3-scope rule (SKILL.md Stage 0): tasks outside Yii 3 / `yiisoft/*` get a brief not-applicable note and are executed with the target project's own conventions — no Mission State tracker, no Finale/DoD artifacts.
- Lock–API Coherence rule (`core-dependency-protocol.md` §3.2): implemented code must match the locked package version; a newer API requires a package-argument lock regeneration (`composer update <package>`), never a constraint-only bump; offline fallback recorded via `Pending Manual Installation Steps`.
- `scripts/validate.mjs`: `version-bump` warning when `skills/` or `injections/` change — uncommitted or since the last release tag — without an `extension.json` version bump (implements `quality_gates.versioning.warn_on_no_version_bump`).
- This changelog; releases tagged `v<version>`.

### Changed
- Eval terminology sync after the Feature/Patch mode rename: scenario 01 `report-present` check + golden sample, and eight scenario titles (01, 03, 07, 09, 11, 12, 14, 21) switched from "Full/Light mode" to "Feature/Patch mode".

### Version
- `0.3.1` → `0.4.0` (contract changes since `25c16b2`: operating-context inversion, adapter renames, role-bound execution, scope-first activation, audit fixes).

## [0.3.1] — 2026-11-10

### Fixed
- Harmonized skill modes, gate schemas, telemetry, and docs across audits (`25c16b2`).

## [0.3.0] — 2026-11-04

### Added
- Action response adapters, application-layer model, durable plan execution state, and adaptive smoke checks (`7f0062d`).
- Full extension overview in README (`b90ab8d`).

### Removed
- Verifier suite and CRUD-slice example (`591e04e`).

## [0.2.0] — 2026-10-28

### Added
- `yii3-v2` skill registration and manifest sync (`1749ec8`).

### Removed
- `yii3-v2` retired; canonical single `yii3` skill distribution finalized (`d49e70d`).

## [0.1.0] — 2026-08-24

### Added
- Initial extension: unified `yii3` skill with workflow injections (`0e1335f`), architecture and roadmap hooks (`e802cad`).
