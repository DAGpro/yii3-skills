# Contributing to yii3-skills

Thanks for your interest in contributing! This repository is an [AI Factory](https://github.com/lee-to/ai-factory) extension and an Agent Skills package: it teaches AI agents to write idiomatic **Yii 3** code (`yiisoft/*` packages). It is **not** a Yii 3 application — there is no runtime and no `vendor/`; the product is documentation, rules, and workflow hooks.

## Repository layout

| Path | What it is |
|---|---|
| `skills/yii3/` | The `yii3` skill: `SKILL.md` entry point + `references/` topic guides (incl. `package-catalog.md`) |
| `injections/` | AI Factory workflow hooks: `plan`, `improve`, `implement`, `verify`, `fix`, `review`, `roadmap`, `architecture` |
| `extension.json` | Extension manifest registering skills and injections |
| `PACKAGES.md` | Navigation index over the offline reference library |
| `references/` | 130 offline clones of `yiisoft/*` packages — authoring-only, **strictly read-only**; clones are git-ignored, populate locally per [`references/README.md`](references/README.md) |
| `scripts/validate.mjs` | Extension quality gate — run before every PR |
| `AGENTS.md` | Project constitution — read it first; it is binding and wins on any conflict with this file |

## Ground rules (short version of [AGENTS.md](AGENTS.md))

1. **Ground every API claim in `references/`.** Before writing or updating any guide, snippet, or DI recipe, inspect the actual package sources: `references/<package>/src/` for signatures, `docs/` and `tests/` for idiomatic usage. Never rely on parametric memory or Yii 2 habits (`Yii::$app`, static facades); if an API cannot be confirmed in `references/`, it must not be written.
2. **`references/` is strictly read-only.** Never edit, move, or stage anything inside it.
3. **Targeted search only.** Resolve the package via [PACKAGES.md](PACKAGES.md) first, then open specific paths (`references/router/...`). Never run unconstrained recursive searches across `references/`.
4. **English only.** All deliverables (skill entry point, topic guides, injections, manifests) are authored in English.
5. **Agent Skills spec.** `SKILL.md` frontmatter must be spec-compliant: `description` ≤ 1024 characters with explicit trigger keywords; internal cross-references use relative paths.
6. **Purity.** Deliverables never contain self-referential install paths (`skills/yii3/...` inside the skill itself), Windows drive paths, or authoring-library paths (`references/<pkg>/src`) — target-project paths such as `vendor/yiisoft/<pkg>/src` are used instead. The validator enforces this.

## Synchronization cascade

A change to a topic guide is **not complete** until dependent registries are in sync:

1. **`skills/yii3/SKILL.md`** — register the topic in the routing matrix / references list; add trigger keywords to the frontmatter description when introducing a new topic.
2. **`skills/yii3/references/package-catalog.md`** — every `yiisoft/*` package recommended by a guide must be present and correctly categorized there.
3. **`injections/`** — if the change introduces architectural quality gates, conventions, or verification checks, update the relevant workflow hooks (`plan.md`, `implement.md`, `verify.md`, ...).
4. **`extension.json`** — register any new skill directory or standalone manifest.

## Validate before you commit

```bash
node scripts/validate.mjs
```

The gate checks manifest integrity, `SKILL.md` frontmatter (including the description length limit), reference links, deliverable purity, and per-guide package-catalog consistency. It must pass with **0 errors**; resolve warnings or justify them explicitly in the PR description.

## Workflow

1. Branch from `main` with a short-lived topic branch.
2. Make the change following the ground rules and the synchronization cascade above.
3. Run `node scripts/validate.mjs` — it must pass.
4. Commit following [Conventional Commits](https://www.conventionalcommits.org/) (e.g. `docs(skill): ...`, `feat(injections): ...`, `refactor(skill): ...`).
5. Open a PR describing what changed and which cascade points were touched.

## Reporting issues

When reporting a wrong API claim or a Yii 2 leak in a guide, point to the file and line, and — if possible — to the exact source that contradicts it (a file under `references/<package>/`, or a live `vendor/yiisoft/` tree from a real project). Evidence-based corrections get merged fastest.

## License

By contributing, you agree that your contributions are licensed under the MIT License stated in [README.md](README.md).
