---
name: yii3
description: >-
  Use when planning, implementing, fixing, reviewing or verifying code in a Yii3 project (composer.json requires yiisoft/* packages
  with yiisoft/config or config-plugin; no yiisoft/yii2). Provides a project probe script, Yii3 conventions, a verified package
  catalog, the protocol for installing and wiring yiisoft/* packages, and architecture-aware file placement. Not for Yii2.
---

# Yii3 development

## Probe first
Run `scripts/yii3-context.mjs` (Node, no deps). It prints JSON: is this Yii3, installed `yiisoft/*` packages with locked versions,
config/merge-plan state, tooling (Makefile/Docker/psalm/phpunit), the architecture source, and — on request —
`--need <capabilities>` (what to install), `--scan-git [base]` / `--scan <files>` (imports, Yii2 usage, strict_types).
`--list` prints capability keys. If `"yii3": false`, stop using this skill.

## Core rules
1. **Yii3 is not Yii2.** No `Yii::$app`, no `yii\` namespace, no static facades. PSR-based, injected.
2. **Source of truth order:** existing project code → `vendor/yiisoft/<pkg>` (installed version) → `references/` → memory.
   Never invent method signatures.
3. **Architecture decides placement:** `/aif-architecture` artifact if it exists, otherwise the project's real structure
   (`architecture.layout` from the probe + similar existing features). See `references/architecture-alignment.md`.
4. Every capability goes through `references/dependency-protocol.md` before code is written.

## Workflow per task
0. Probe; note `Architecture: <artifact path | inferred>`.
1. List capabilities the task needs; probe with `--need`.
2. Install/wire per the dependency protocol.
3. Place and write code: architecture source first, then `references/conventions.md`.
4. Verify: project tests/linters + `--scan-git`. Report added packages and changed config files.

## References (read on demand)
- `references/architecture-alignment.md` — where code goes
- `references/dependency-protocol.md` — check, install, wire, learn a package
- `references/package-catalog.md` — human-readable view of `scripts/package-catalog.json`
- `references/conventions.md` — layout, config, DI, actions, routes, anti-patterns
