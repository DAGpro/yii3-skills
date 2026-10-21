---
name: yii3
description: >-
  Use when planning, implementing, fixing, reviewing or verifying code in a Yii3 project (composer.json requires yiisoft/* packages
  with yiisoft/config or config-plugin; no yiisoft/yii2). Provides Yii3 conventions, package catalog, architecture-aware feature
  decomposition into actions/use-cases/repositories, and DI/routing wiring rules. Use when user says "Yii3", "Yii 3", "yiisoft",
  "create feature", "add action", "new endpoint", "add repository", "add use case", or "Yii migration". Not for Yii2.
---

# Yii3 development

## Core rules
1. **Yii3 is not Yii2.** No `Yii::$app`, no `yii\` namespace, no static facades. PSR-based, injected.
2. **Source of truth order:** existing project code → `vendor/yiisoft/<pkg>/src` (installed version) → skill documentation (`references/package-catalog.md`, etc.).
   Never invent method signatures or assume Yii2 syntax.
3. **Architecture decides placement:** `/aif-architecture` artifact if it exists, otherwise the project's real structure
   (`src/`, `config/` + similar existing features). See `references/architecture-alignment.md`.
4. Every capability goes through `references/dependency-protocol.md` before code is written.

## Workflow per task
0. Resolve architecture: check `.ai-factory/ARCHITECTURE.md` (or configured path), otherwise inspect existing `src/` and `config/`.
1. Check `composer.json` for installed packages; consult `references/package-catalog.md` and `references/feature-recipes.md` for required packages and drivers.
2. For business feature requests, decompose into full artifact graph (Domain, Persistence, Use Case, Presentation, Wiring) via `references/feature-recipes.md`.
3. Install/wire missing packages per `references/dependency-protocol.md`.
4. Place and write code: architecture source first, then `references/conventions.md`.
5. Verify: run project tests and linters (Psalm/PHPStan, Rector, CS-Fixer, PHPUnit). Report added packages and changed config files.

## References (read on demand)
- `references/architecture-alignment.md` — where code goes
- `references/feature-recipes.md` — feature archetypes, decomposition into layers, capability inference, wiring checklist
- `references/dependency-protocol.md` — check, install, wire, learn a package
- `references/package-catalog.md` — packages, capability keys, driver choices
- `references/api-signatures.md` — exact signatures for top 15 Yii3 interfaces and classes
- `references/actions-and-controllers.md` — package usage recommendations in actions/controllers, HTTP request parsing, DTO hydration, validation, security, data-response, and view rendering
- `references/conventions.md` — layout, config, DI, actions, routes, anti-patterns
