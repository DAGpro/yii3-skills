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
| `evals/` | Behavior tests for the skill: fixture scenarios + agent runner, see [`evals/README.md`](evals/README.md); `evals/results/` is git-ignored |
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

## Automated quality gates before you commit

Run the local quality gates:

```bash
# 1. Extension integrity, manifest, frontmatter, and link consistency
node scripts/validate.mjs

# 2. AI Factory workflow integration contracts (65 contract tests)
node scripts/test-aif-workflow.mjs

# 3. Ground-truth symbol, method signature, and parameter arity check
node scripts/check-symbols.mjs

# 4. Behavioral evaluation checks (all 57 scenario checks)
node evals/runner/selftest.mjs
```

### 1. Extension validation (`scripts/validate.mjs`)

The gate checks manifest integrity, `SKILL.md` frontmatter (including the description length limit), reference links, the References inventory (every guide listed exactly once, one file per bullet), anchor existence for all relative `.md#anchor` links, deliverable purity, and per-guide package-catalog consistency. It must pass with **0 errors**; resolve warnings or justify them explicitly in the PR description.

### 2. Workflow contract tests (`scripts/test-aif-workflow.mjs`)

Validates integration contracts between the `yii3` skill and AI Factory workflows (`injections/*.md`): activation guards, path resolution, 6-phase decomposition, durable `### Execution State`, and verify handoff.

### 3. Symbol & signature check against sources (`scripts/check-symbols.mjs`)

Grounding gate for the guides: it extracts every `Yiisoft\...` FQCN and `Class::method()` pair from `skills/yii3/references/*.md`, parses method signatures, and verifies both symbol existence and argument arity against the offline clones in `references/<pkg>/src` (PSR-4 mapping from each clone's `composer.json`, with `extends`/`implements`/trait resolution). Exit codes:

- **0** — all symbols and signatures confirmed, or `references/` is not populated (a warning is printed instead);
- **1** — at least one symbol or call arity could not be confirmed.

Symbols quoted intentionally as non-existent (phantom-API warnings in anti-pattern tables) live in the `ALLOWLIST` array at the top of `scripts/check-symbols.mjs`. Every entry must state **why** the symbol cannot be confirmed against the clones — no bare entries. If you quote a non-existent API in a guide, add both the warning and the allowlist entry in the same PR.

Populate the clones first ([references/README.md](references/README.md)); without them the gate is a no-op.

### 4. Eval harness self-test (`evals/runner/selftest.mjs`)

Validates all 57 behavioral test scenarios: confirms scenario JSON schemas, guide bindings, positive/negative sample checks, and delimiter state machines.

## Workflow

1. Branch from `main` with a short-lived topic branch.
2. Make the change following the ground rules and the synchronization cascade above.
3. Run all four quality gates — all must pass green with zero errors:
   - `node scripts/validate.mjs`
   - `node scripts/test-aif-workflow.mjs`
   - `node scripts/check-symbols.mjs`
   - `node evals/runner/selftest.mjs`
4. Commit following [Conventional Commits](https://www.conventionalcommits.org/) (e.g. `docs(skill): ...`, `feat(injections): ...`, `refactor(skill): ...`).
5. Open a PR describing what changed and which cascade points were touched.

## PR checklist

- [ ] `node scripts/validate.mjs` — 0 errors, 0 warnings (or justified in the PR description).
- [ ] `node scripts/test-aif-workflow.mjs` — 65 passed, 0 failed.
- [ ] `node scripts/check-symbols.mjs` — 0 unconfirmed symbols / arities (clones populated), or the no-clones warning is acknowledged.
- [ ] `node evals/runner/selftest.mjs` — 57/57 OK.
- [ ] Every new/quoted API claim was inspected in `references/<pkg>/src/` or `vendor/yiisoft/<pkg>/src/`.
- [ ] Synchronization cascade touched: SKILL.md routing/inventory, package-catalog, injections (when the change adds gates or conventions).
- [ ] No deliverable contains authoring-library paths, Windows drive paths, or self-referential install paths.

## Reporting issues

When reporting a wrong API claim or a Yii 2 leak in a guide, point to the file and line, and — if possible — to the exact source that contradicts it (a file under `references/<package>/`, or a live `vendor/yiisoft/` tree from a real project). Evidence-based corrections get merged fastest.

**Every found agent failure becomes a new eval scenario.** If an agent followed the skill and still produced a Yii 2 leak, a hallucinated API, a skipped wiring gate, or a wrong placement — do not just patch the guide: capture the failure as a reproducible eval scenario (task prompt + expected guard/guide behavior + the actual wrong output) and link it in the PR that fixes the rule. A failure fixed only in prose will recur; a failure converted into an eval scenario keeps the whole rule set honest.

## License

By contributing, you agree that your contributions are licensed under the MIT License stated in [README.md](README.md).
