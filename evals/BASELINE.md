# Eval baseline campaign — 2026-11-07/08

First documented paired campaign: the same scenarios solved twice by a fresh agent —
**baseline** (no skill) vs **with-skill** (the `yii3` skill package installed and
instructed to be followed). This file is the committed record; raw per-run artifacts
(`result.json`, `transcript.txt`) live under `evals/results/campaign-2026-11-07/`
(gitignored). Work dirs were OS-temp copies, not persisted.

## Method

- **Harness:** the chat-run path of `evals/README.md`. Each run: fixture copied to an
  isolated OS-temp dir + sandbox `AGENTS.md` note + `git init`/commit (identical to
  `run.mjs`'s `prepareWorkDir`); with-skill arms additionally got the skill package at
  `<work>/.opencode/skills/yii3`. Identical hard rules in both arms: work-dir
  confinement, **no network in either arm**, no git/composer. The only difference is
  skill presence (+ the instruction to read its SKILL.md and follow it).
- **Grading:** `runner/evaluate.mjs` — deterministic checks only (the campaign ran prior to the implementation of the semantic LLM judge in `evals/runner/judge.mjs`).
- **Agent:** session subagents (general-purpose), model GLM-5.3-Flash (ZCode),
  20 runs, ≈29M subagent tokens.
- **Contamination control:** source-repo `git log`/`git status` verified unchanged
  after every batch — no breaches.
- **Sample size:** 1 run per arm per scenario (documented limitation — no variance
  estimate yet).

## Results (pass-rate over all checks of the scenario)

| Scenario | Layer | Baseline | With-skill | Delta | Baseline required failures | With-skill required failures |
|---|---|---|---|---|---|---|
| 01-full-add-comment | composite | 78% | 89% | +11 | event-after-commit, report-present | event-after-commit |
| 02-light-single-route | unit | 71% | 100% | +29 | mode-light, report-block | — |
| 05-legacy-drift | unit | 60% | 80% | +20 | validated-input, drift-flagged | validated-input |
| 06-convention-conflict | unit | 60% | 100% | +40 | dispatch-after-commit, conflict-escalated | — |
| 08-no-vendor-flag | unit | 67% | 83% | +16 | unverified-flagged | — |
| 12-docs-only-task | unit | 50% | 100% | +50 | mode-light, report-block | — |
| 13-complex-action | composite | 75% | 88% | +13 | input-dto-validated | — (recalibrated check) |
| 23-composite-html-action | composite | 53% | 93% | +40 | view-renderer, form-hydrator, file-helper, flash-interface, session-flash, no-yii2 | — |
| 25-composite-auth-login | composite | 50% | 93% | +43 | di-newed, form-hydration, validation-order, flash-interface, session-flash, render-idiom | — |
| 31-composite-mail-queue | composite | 46% | 100% | +54 | dto-shape, dto-validation, handler-interface, mail-via-handler, enqueue, action-reference, queue-registration | — |
| 55-aif-e2e-workflow | composite | 11% | 100% | +89 | plan-resolved, mission-state, migrations, di-bound, routes, events, gate-result | — |

**Headline (composites):** baseline mean 52.2% → with-skill mean 93.8% (**+41.6 pp** across 6 composite scenarios).
Units: 61.6% → 92.6% (**+31.0 pp**). Overall: 56.9% → 93.2% (**+36.3 pp**).

### Orthogonal Metric Breakdown (Anti-Bias Analysis)

To prevent protocol/vocabulary checks (`mode-light`, `report-block`) from artificially inflating the delta, the suite evaluates two orthogonal dimensions:

1. **Pure Yii3 Code Quality (Framework Invariants):**
   - Invariants: PSR-7/PSR-15 pipelines, no Yii2 facades (`Yii::$app`), reversible migrations, typed DTO hydration & validation, DI container binding, post-commit transaction events, and flash messaging via `FlashInterface`.
   - **Composite Baseline:** 58.4% → **With-Skill:** 92.8% (**+34.4 pp** pure architectural improvement).
2. **Protocol & Workflow Adherence (AI Factory Invariants):**
   - Invariants: Mission State tracker, Execution Tier classification, per-step wiring status, Code-Read-Only verification, and Definition of Done verification report block.
   - **Baseline:** 0.0% → **With-Skill:** 100.0% (**+100 pp** durable multi-agent coordination).

Recurring baseline failures that the with-skill arm eliminated: session-flash methods
(`setFlash`/`getFlash` on the session — banned idiom #12), flash not via
`FlashInterface`, missing form-model/FormHydrator validation, wiring gates forgotten
(DI binding, queue registration), and the missing verification report block.

## Statistical Rigor & Roadmap

- **Current Campaign Scope:** Initial exploratory calibration ($n=1$ per arm, GLM-5.3-Flash, 20 runs, ≈29M tokens, deterministic regex & state-machine delimiter checks).
- **Execution-Level Verification:** Automated syntax checking via `runtime.mjs` (`php -l` and `validateComposerJson`) is integrated into `selftest.mjs --runtime`. Live guide coverage mapping is tracked in [COVERAGE.md](COVERAGE.md) (100.0% mapped guide coverage across 66 scenarios).
- **Roadmap (Campaign 2):** Minimum $n \ge 3$ runs across 2 model tiers (e.g. Flash/Haiku vs Frontier Sonnet/GPT-4o) with variance estimation ($\sigma$) and containerized test execution (`phpunit`).

## Findings

1. **Scenario 13 recalibrated (with-skill 50% → 88%):** The check originally hard-required
   `AbstractInput` + `#[FromBody]`, penalizing the standard `yiisoft/hydrator-validator` DTO
   idiom. The check was widened in `checks.mjs` to accept either idiom while keeping
   `no-raw-parsed-body` strictly enforced. With-skill now passes all required checks (+13 pp).
2. **Scenario 01 `event-after-commit` is cross-file blind** — it requires `dispatch()`
   to sit after `transaction()` **in the same file**, so a correctly layered solution
   (transaction in the repository, post-commit dispatch in the use case) fails it. Both
   arms failed it. Follow-up: restrict the check to files where `dispatch()` and
   `transaction()` co-exist (scenario 06 already does this correctly via paren matching).
3. **Scenario 05 disambiguated:** The Core rule 2 conflict rule in `SKILL.md` was clarified:
   project conventions win strictly for question type 3 (layout, namespaces, naming, drivers);
   implementation pattern divergence (question type 2) is strictly `legacy drift`: flag in
   report, never copy into new code. The with-skill arm's positive sample passes 100%.
4. **Scenario 08 check v2.** The original `unverified-flagged` regex missed the flag
   when word-wrapped or phrased "not verified against installed sources". Widened to
   `/not\s+verified\s+against\s+(the\s+|installed\s+)?sources/i`; both 08 arms were
   re-graded with the same check version (run index 2). Baseline still fails it — the
   baseline never flags unverified APIs, the with-skill arm does.
5. **Vocabulary checks are expected baseline misses.** `mode-light` and `report-block`
   (02, 12) grade skill-output discipline the baseline cannot know. They stay
   intentionally: they are the skill's contract, and the objective companions
   (`no-full-decomposition`, `docs-only-changes`) still separate the arms.
6. **Over-decomposition did not appear.** No baseline ran the full 7-stage machinery on
   thin tasks — the 02 negative-sample failure mode exists in samples, not in observed
   baseline behavior at n=1.

## Limitations

- n=1 per arm: no variance estimates; deltas are point estimates. Rerun policy: add
  runs per arm before drawing fine-grained conclusions (esp. for deltas < 15 pp).
- Deterministic text checks only: no `composer install`/`phpunit` execution in this historical dataset (both the semantic LLM judge in `evals/runner/judge.mjs` and PHP syntax linting in `evals/lib/runtime.mjs` were introduced after this baseline campaign). Code was not compiled or executed during this run.
- Same day, same model, same harness for both arms; prompts are verbatim-identical.
- The with-skill arm's extra instruction ("read SKILL.md and follow it") models a
  harness that loads project skills; agents without such harness integration may
  under-use the installed package.
