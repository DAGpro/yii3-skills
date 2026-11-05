# references/ — Offline Source of Truth (Authoring Only)

This folder holds local clones of the official `yiisoft/*` packages. It is the **grounding source** for authoring and editing the skill's reference guides (`skills/yii3/references/`): the zero-hallucination protocol ([AGENTS.md](../AGENTS.md), §4.2) requires inspecting these sources before any guide content is written.

**Git policy:** the clones themselves are git-ignored — everything here except this file is local-only. Populate the folder before working on the guides.

## Populating the folder

Clone the packages you need, resolved via the navigation index [PACKAGES.md](../PACKAGES.md) (which package to study for which task):

```bash
git clone https://github.com/yiisoft/<package>.git references/<package>
```

Every guide claim — class names, method signatures, parameter and return types, configuration keys — must be verifiable in these sources:

- `<package>/src/` — exact class names, method signatures, parameter and return types;
- `<package>/docs/` and `<package>/tests/` — idiomatic usage, configuration syntax, architectural patterns.

## Rules

1. **Strictly read-only** — never edit, delete, move, or `git add` anything inside this folder except this README.
2. **Targeted search only** — resolve the package via [PACKAGES.md](../PACKAGES.md) first, then open specific paths (`router/src/...`). Never run unconstrained recursive searches across the whole folder.
3. **No hallucination** — if an API cannot be confirmed in these sources, it must not be written into the guides.
4. **Not a runtime dependency** — the skill ships nothing from here; deliverables reference `vendor/yiisoft/<pkg>/` of the target project, never this folder.
