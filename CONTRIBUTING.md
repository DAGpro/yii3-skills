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

1. **`skills/yii3/SKILL.md`** — register the topic in the routing matrix / `references/INDEX.md`; add trigger keywords to the frontmatter description when introducing a new topic.
2. **`skills/yii3/references/package-catalog.md`** — every `yiisoft/*` package recommended by a guide must be present and correctly categorized there.
3. **`injections/`** — if the change introduces architectural quality gates, conventions, or verification checks, update the relevant workflow hooks (`plan.md`, `implement.md`, `verify.md`, ...).
4. **`evals/` & manifests** — add/update eval scenarios (`node scripts/generate-coverage-matrix.mjs` to update `evals/COVERAGE.md`), and regenerate API manifests (`node scripts/check-symbols.mjs --export-manifest` and `node scripts/check-ast.mjs --export-manifest`) when touching documented `yiisoft/*` APIs.
5. **`extension.json`** — register any new skill directory or standalone manifest.

## Automated quality gates before you commit

Run the local quality gates:

```bash
# 1. Extension integrity, manifest, frontmatter, guard sync, and link consistency
node scripts/validate.mjs

# 2. AI Factory workflow integration contracts (88 contract tests)
node scripts/test-aif-workflow.mjs

# 3. Topic guide coverage across eval scenarios (100% across 87 topic guides / 89 files)
node scripts/check-eval-coverage.mjs

# 4. Ground-truth symbol, method signature, and parameter arity check
node scripts/check-symbols.mjs

# 5. AST PHP code grounding analyzer (signatures, arities, and named args across PHP blocks)
node scripts/check-ast.mjs

# 6. Manifest provenance & cross-manifest parity check (use --upstream for remote drift checks)
node scripts/check-manifest-freshness.mjs --strict --max-age-days 30

# 7. Behavioral evaluation checks (all 68 scenario checks; add --runtime when PHP 8.2+ is installed)
node evals/runner/selftest.mjs

# 8. Judge unit self-test & L5 Yii 3 PHPUnit runtime harness (skips locally without PHP; strict in CI)
node evals/runner/judge.mjs --selftest
node scripts/test-php-runtime.mjs
```

### 1. Extension validation (`scripts/validate.mjs`)

The gate checks manifest integrity, `SKILL.md` frontmatter (including the description length limit), reference links, the References inventory (every guide listed exactly once, one file per bullet), anchor existence for all relative `.md#anchor` links, activation guard byte-identity (`AGENTS.md` §4.6), deliverable purity, and per-guide package-catalog consistency. It must pass with **0 errors**; resolve warnings or justify them explicitly in the PR description.

### 2. Workflow contract tests (`scripts/test-aif-workflow.mjs`)

Validates all 96 integration contracts between the `yii3` skill and AI Factory workflows (`injections/*.md`): activation guards, path resolution, 6-phase decomposition, durable `### Execution State`, and verify handoff.

### 3. Topic guide coverage (`scripts/check-eval-coverage.mjs` & `scripts/generate-coverage-matrix.mjs`)

Ensures every non-index topic guide under `skills/yii3/references/` is bound to at least one scenario under `evals/scenarios/` (`100.0%` coverage across 86 topic guides / 68 scenarios) and that `evals/COVERAGE.md` stays in sync (`node scripts/generate-coverage-matrix.mjs`).

### 4. Symbol & AST signature checks (`scripts/check-symbols.mjs`, `scripts/check-ast.mjs`, `scripts/check-manifest-freshness.mjs`)

Grounding gates for the guides: `check-symbols.mjs` extracts every `Yiisoft\...` FQCN and `Class::method()` pair from `skills/yii3/references/*.md`, parses method signatures, and verifies symbol existence and argument arity against `references/<pkg>/src` (or `evals/data/api-symbols-manifest.json` with `--manifest-mode`). `check-ast.mjs` performs structural analysis over all PHP fenced blocks (typed instances, static/fluent chains, call arities, and named parameters). Exit codes:

- **0** — all symbols, signatures, and AST checks confirmed (use `--manifest-mode` when `references/` is absent, as in CI);
- **1** — at least one symbol, call arity, or named parameter could not be confirmed.

Symbols quoted intentionally as non-existent (phantom-API warnings in anti-pattern tables) live in the `ALLOWLIST` array at the top of `scripts/check-symbols.mjs` / `scripts/check-ast.mjs`. Every entry must state **why** the symbol cannot be confirmed against the clones — no bare entries. If you quote a non-existent API in a guide, add both the warning and the allowlist entry in the same PR.

Whenever `references/` clones are present, also run `node scripts/check-manifest-freshness.mjs --strict --max-age-days 30` (or regenerate manifests with `--export-manifest`) so `evals/data/api-symbols-manifest.json` and `evals/data/ast-signatures-manifest.json` match the cloned package commits. Run `node scripts/check-manifest-freshness.mjs --upstream` to inspect upstream `yiisoft/*` remote drift without mutating local clones.

Populate the clones first ([references/README.md](references/README.md)); without them use `--manifest-mode` for `check-symbols.mjs` and `check-ast.mjs`.

### 5. Eval harness & L5 PHPUnit runtime (`evals/runner/selftest.mjs`, `scripts/test-php-runtime.mjs`)

`evals/runner/selftest.mjs` validates all 68 behavioral test scenarios: confirms scenario JSON schemas, guide bindings, positive/negative sample checks, and delimiter state machines (`--runtime` adds `php -l` and `composer validate` checks when PHP is available).

`evals/runtime-harness/` provides a real L5 Yii 3 + SQLite + PHPUnit 11 integration suite (DI container, FastRoute routing, `ValidatingHydrator`, DB migrations, transactional outbox + mutex relay, sync queue, and `StateResetter`). Run `node scripts/test-php-runtime.mjs` locally (skips cleanly if PHP/Composer/`pdo_sqlite` is absent) or `node scripts/test-php-runtime.mjs --strict` in PHP 8.2+ environments (enforced in CI `php-runtime-gates`).

## Workflow

1. Branch from `main` with a short-lived topic branch.
2. Make the change following the ground rules and the synchronization cascade above.
3. Run all quality gates — all must pass green with zero errors:
   - `node scripts/validate.mjs`
   - `node scripts/test-aif-workflow.mjs`
   - `node scripts/check-eval-coverage.mjs`
   - `node scripts/check-symbols.mjs` (or `--manifest-mode`)
   - `node scripts/check-ast.mjs` (or `--manifest-mode`)
   - `node scripts/check-manifest-freshness.mjs --strict` (when `references/` is populated; omit `--strict` in clone-free CI environments)
   - `node evals/runner/selftest.mjs`
   - `node evals/runner/judge.mjs --selftest`
   - `node scripts/test-php-runtime.mjs` (pass `--strict` when PHP 8.2+ and `evals/runtime-harness/vendor` are available)
4. Commit following [Conventional Commits](https://www.conventionalcommits.org/) (e.g. `docs(skill): ...`, `feat(injections): ...`, `refactor(skill): ...`).
5. Open a PR describing what changed and which cascade points were touched.

## PR checklist

- [ ] `node scripts/validate.mjs` — 0 errors, 0 warnings (or justified in the PR description).
- [ ] `node scripts/test-aif-workflow.mjs` — 96 passed, 0 failed.
- [ ] `node scripts/check-eval-coverage.mjs` — 100.0% topic guide coverage (86/86 topic guides, 68 scenarios); `evals/COVERAGE.md` regenerated if guides/scenarios changed.
- [ ] `node scripts/check-symbols.mjs` and `node scripts/check-ast.mjs` — 0 unconfirmed symbols, arities, or AST defects (run with `--manifest-mode` if `references/` is not populated).
- [ ] `node scripts/check-manifest-freshness.mjs` — manifest provenance and parity check passes (`--strict` if `references/` is populated).
- [ ] `node evals/runner/selftest.mjs` — 68/68 OK (`--runtime` and `node scripts/test-php-runtime.mjs --strict` pass on PHP 8.2+ / CI `php-runtime-gates`).
- [ ] `node evals/runner/judge.mjs --selftest` — PASS.
- [ ] Every new/quoted API claim was inspected in `references/<pkg>/src/` or `vendor/yiisoft/<pkg>/src/`.
- [ ] Synchronization cascade touched: SKILL.md routing/inventory, package-catalog, injections, coverage matrix, and manifests (when applicable).
- [ ] No deliverable contains authoring-library paths, Windows drive paths, or self-referential install paths.

## Reporting issues

When reporting a wrong API claim or a Yii 2 leak in a guide, point to the file and line, and — if possible — to the exact source that contradicts it (a file under `references/<package>/`, or a live `vendor/yiisoft/` tree from a real project). Evidence-based corrections get merged fastest.

**Every found agent failure becomes a new eval scenario.** If an agent followed the skill and still produced a Yii 2 leak, a hallucinated API, a skipped wiring gate, or a wrong placement — do not just patch the guide: capture the failure as a reproducible eval scenario (task prompt + expected guard/guide behavior + the actual wrong output) and link it in the PR that fixes the rule. A failure fixed only in prose will recur; a failure converted into an eval scenario keeps the whole rule set honest.

## License

By contributing, you agree that your contributions are licensed under the MIT License stated in [README.md](README.md).
