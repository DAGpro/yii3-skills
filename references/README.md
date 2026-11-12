# references/ — Offline Source of Truth (Authoring Only)

This folder holds local clones of the official `yiisoft/*` packages. It is the **grounding source** for authoring and editing the skill's reference guides (`skills/yii3/references/`): the zero-hallucination protocol ([AGENTS.md](../AGENTS.md), §4.2) requires inspecting these sources before any guide content is written.

**Git policy:** the clones themselves are git-ignored — only this `README.md` and `packages.lock.json` are tracked. Populate or sync the folder before working on the guides.

## Populating & updating the folder

Exact commits and known releases for all 130 packages are pinned in [packages.lock.json](packages.lock.json) and managed via [scripts/sync-references.mjs](../scripts/sync-references.mjs):

```bash
# 1. Populate missing clones or align existing clones to the pinned commits
node scripts/sync-references.mjs restore

# 2. Check whether local clones match packages.lock.json
node scripts/sync-references.mjs status
```

To clone a single new package manually (resolved via [PACKAGES.md](../PACKAGES.md)):

```bash
git clone --depth 1 https://github.com/yiisoft/<package>.git references/<package>
```

### Updating skill guides from package history

Clones default to `--depth 1` (single snapshot commit). When updating guides against newer package releases:

```bash
# 1. Fetch full commit history and tags without moving HEAD
node scripts/sync-references.mjs fetch-history --pkg <package>   # or omit --pkg for all

# 2. Inspect commits / diffs between the pinned HEAD and upstream
node scripts/sync-references.mjs diff --pkg <package> --stat

# 3. Update the affected guides under skills/yii3/references/ from the diff

# 4. Advance the clone to the new commit/tag and update packages.lock.json
node scripts/sync-references.mjs bump --pkg <package>
```

Every guide claim — class names, method signatures, parameter and return types, configuration keys — must be verifiable in these sources:

- `<package>/src/` — exact class names, method signatures, parameter and return types;
- `<package>/docs/` and `<package>/tests/` — idiomatic usage, configuration syntax, architectural patterns.

## Rules

1. **Strictly read-only** — never edit, delete, move, or `git add` anything inside this folder except this README and `packages.lock.json` (updated via `scripts/sync-references.mjs`).
2. **Targeted search only** — resolve the package via [PACKAGES.md](../PACKAGES.md) first, then open specific paths (`router/src/...`). Never run unconstrained recursive searches across the whole folder.
3. **No hallucination** — if an API cannot be confirmed in these sources, it must not be written into the guides.
4. **Not a runtime dependency** — the skill ships nothing from here; deliverables reference `vendor/yiisoft/<pkg>/` of the target project, never this folder.
