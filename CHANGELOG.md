# Changelog

All notable changes to the `yii3-skills` AI Factory extension and its `yii3` skill are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org/) — pre-1.0, minor = contract/behavior changes. The version lives in [`extension.json`](extension.json); every release is tagged `v<version>`.

## [Unreleased]

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
