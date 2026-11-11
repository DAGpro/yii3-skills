# Changelog

All notable changes to the `yii3-skills` AI Factory extension and its `yii3` skill are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org/) — pre-1.0, minor = contract/behavior changes. The version lives in [`extension.json`](extension.json); every release is tagged `v<version>`.

## [Unreleased]

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
