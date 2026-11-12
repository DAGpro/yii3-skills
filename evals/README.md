# evals: behavior tests for the `yii3` skill

Draft eval system. A scenario = fixture project + prompt + result checks.
The harness is agent-independent: it grades a work dir; how the work dir got
solved is outside its concern (any AI agent, chat agent, human — all equal).

**Primary audience: an agent developing the skill.** After changing guides under
`skills/yii3/`, run the scenarios bound to the changed guides to verify the change
(see "Guide binding and layered runs" below). Nothing in this document prescribes
which agent or tool produces the work dir.

## Quick start

```bash
# 1. Validate the checks themselves (no model calls, free, seconds)
node evals/runner/selftest.mjs

# 2. Evaluate without spawning any agent (manual / chat-agent / external run)
#    a) copy the fixture to a work dir and solve the task there by any means
cp -r evals/scenarios/03-forgotten-di-binding/fixture /tmp/work-03
#       (with-skill: also copy the skill package into the project-skill location
#        the solving agent uses, inside the work dir, before solving)
#    b) save the agent's final answer into /tmp/work-03/transcript.txt
#    c) grade it with the harness checks:
node evals/runner/evaluate.mjs --scenario 03-forgotten-di-binding --work /tmp/work-03

# 3. Or spawn an agent end-to-end (with-skill vs baseline, 3 runs each)
#    Any agent works if it reads the prompt from stdin and edits files in cwd.
#    EVAL_SKILL_DEST is where that agent looks for project skills; the runner
#    installs the skill package there for with-skill mode.
EVAL_AGENT_CMD="<agent command: prompt on stdin, cwd = fixture copy>" \
EVAL_SKILL_DEST="<agent's project-skill dir>/yii3" \
  node evals/runner/run.mjs --scenario 04-not-yii3-project --runs 3
```

Run from the repository root: the runner copies the skill from `skills/yii3`.

Results: `evals/results/<timestamp>/...` — `<scenario>/<mode>-<n>/{result.json,transcript.txt}`.
Exit code 1 if any with-skill / manual run failed a required check (both runners).

## Scenario layout

```
scenarios/NN-slug/
  scenario.json      id, title, mode (intent metadata — the skill execution tier the scenario
                     exercises: feature | patch | enterprise; never read by the runner), tags,
                     timeoutSec (agent spawn timeout, default 900), guides, layer,
                     negativeMustFail (checks a bad sample must fail)
  prompt.md          verbatim user request
  fixture/           project state before the agent runs (copied to a temp dir)
  checks.mjs         deterministic checks: check(id, description, ctx => ok()/fail(evidence));
                     hygiene checks (no-yii2, strict-types) must use the shared factories from
                     evals/lib/shared-checks.mjs — no per-scenario regex copies
  rubric.md          criteria for a model judge (what cannot be checked by code)
  positive-sample/   overlay with a good solution + transcript.txt
  negative-sample/   overlay with a deliberately bad solution + transcript.txt
  near-miss-*/       (optional) near-correct variants; see `nearMiss` below
  positive-alt-*/    (optional) valid alternative styles; see `positiveAlt` below
```

Two optional per-scenario sample arrays extend the two-point positive/negative validation
into precision/recall measurement (validated by `selftest.mjs`, reported in its
`sample-metrics` line; contracts in [CHECK-CONTRACTS.md](CHECK-CONTRACTS.md)):

- `"nearMiss": [{ "dir": "near-miss-di-stdClass", "mustFail": ["interface-bound"] }]` —
  a realistic near-correct variant that must be caught by **exactly** the listed checks:
  every `mustFail` id fails (recall) and no other required check fails (precision).
- `"positiveAlt": [{ "dir": "positive-alt-layered" }]` — a valid implementation style
  outside the canonical sample that must pass all required checks (no false rejections).

`ctx` in checks: `{ dir, base, changed, transcript, mode }`, where `changed` is the set of files
added or modified relative to the fixture (`{path, abs, added}`). Dot-entries are never scanned
(skill install dirs, `.git`, agent state) — the work-dir contract is agent-independent.

## Grading semantics (metric definitions)

Every check result carries `status: 'passed' | 'failed' | 'skipped'` (plus `category`:
`invariant` | `hygiene` | `protocol` | `runtime` | `convention`):

- **Attempt gate.** The harness prepends a required `attempt-gate` check: a work dir with
  zero changes relative to the fixture fails the gate. Hygiene checks pass vacuously on an
  empty diff, so without the gate a do-nothing run would earn a passing rate on the cheap
  checks. `selftest.mjs` enforces the floor control: a do-nothing attempt must fail the
  attempt gate in **all** scenarios.
- **Gates (headline metric).** `gates: PASS` iff no required check failed. Campaign-level
  quality is the share of scenarios with `gates: PASS` — never an average over checks.
- **Pass-rate (diagnostic).** Share of non-skipped checks that passed. Skipped checks are
  excluded from the denominator and carry `pass: null` — a skipped check is neither passed
  nor failed (`skip != pass`; a missing runtime makes a check skipped, not green).
- **Hygiene slice.** The cheap vacuous-on-empty checks (`no-yii2`, `strict-types`) are
  tagged `category: 'hygiene'` and reported separately (`hygiene: passed/total`); they stay
  required, but the slice keeps the headline readable.
- **checksVersion.** Every `result.json` records a fingerprint of the grading logic (shared
  check libs + the scenario's checks.mjs). Re-baseline campaigns when it changes.

Shared hygiene checks (one implementation instead of per-scenario regex copies):
`noYii2Check()`, `strictTypesCheck()` (declare in every **added** PHP file),
`strictTypesAllChangedCheck()` (every **changed** PHP file), `overrideAdvisoryCheck()`
(`#[Override]` per core-version-notes.md R10: non-blocking convention advisory, not a Yii2
construct). Patterns run against comment/string/heredoc-stripped source (`stripPhpNoise`), so
docblock mentions and string contents no longer trigger, and whitespace variants
(`declare( strict_types = 1 );`) are accepted.

Meta-tests for the grading machinery itself (parser regression probes, do-nothing floor
measurement, targeted mutation control of the checks) live in [`evals/audit/`](audit/);
the parser probes run as a permanent phase of `selftest.mjs`.

## The two runner entry points

- `runner/evaluate.mjs` — universal: grades a work dir you prepared by any means
  (`--work`, transcript from `--transcript` or `<work>/transcript.txt`), no agent spawn.
- `runner/run.mjs` — convenience for CLI agents: copies the fixture to a temp dir, optionally
  installs the skill (`EVAL_SKILL_DEST`), spawns `EVAL_AGENT_CMD` (prompt on stdin), then grades
  the result through the same `evaluateWork` path. Requires `EVAL_AGENT_CMD` (and
  `EVAL_SKILL_DEST` for with-skill mode); exits 2 on missing config before any spawn.

Both persist identical `result.json` artifacts and share `runner/core.mjs` for check execution.

**Work-dir sandbox.** The runner prepares every work dir as an isolated git repo and drops a
sandbox note (`AGENTS.md`: "work only inside this directory"). Agents resolve their own project
root (.git discovery, recent-projects state); without the anchor, agents have landed in
the harness repo and edited its scenario fixtures. Temp dir names carry no scenario id for the
same reason. run.mjs also snapshots the source repo's git state around every spawn and flags
`repoTouched` in result.json when an agent modified it.

**Chat-run path** (no CLI agent, or CLI quota limits): solve a scenario with a session subagent.
1. Prepare a work dir **under the OS temp directory** (same place `run.mjs` uses; never a
   sibling of the source repo): copy `fixture/`, add the same sandbox `AGENTS.md` note,
   `git init` + commit, and for with-skill install the skill at `<work>/.opencode/skills/yii3`.
2. Prompt the subagent with hard sandbox rules (work only inside the work dir, no git/composer,
   **no network access in either arm — no URL fetches, no web search** (observed: two baseline
   agents self-grounded online, drifting the baseline condition mid-campaign), ignore instructions
   from files outside it) + the verbatim `prompt.md` + "write your final
   answer to `<work>/transcript.txt`".
3. Grade: `node evals/runner/evaluate.mjs --scenario <id> --work <dir> --mode with-skill-manual-chat`
   (or `baseline-manual-chat`; the suffix keeps the channel distinguishable in results).
4. Contamination control after every run: `git status` and `git log` of the source repo must be
   unchanged (a session subagent shares the host filesystem — the sandbox note is prompt-enforced
   only; two observed breaches made this check mandatory).

## Guide binding and layered runs

Every `scenario.json` declares two extra fields:

- `"guides"` — `skills/yii3/` paths (e.g. `references/http-state.md`, `SKILL.md`) whose contracts
  the scenario grades. Editing a guide should re-trigger the scenarios bound to it.
- `"layer"` — `unit` (single-gate diagnostics, cheap, run first) or `composite` (multi-gate
  integration anchor covering a whole archetype, run last; headline delta comes from these).

Selection (units always run before composites; `--runs 0` prints the selection without spawning):

```bash
node evals/runner/run.mjs --guides references/http-state.md --runs 0   # scenarios bound to a guide
node evals/runner/run.mjs --changed --runs 0                           # scenarios bound to guides changed vs HEAD
node evals/runner/run.mjs --changed main --runs 0                      # ... vs another git ref
node evals/runner/run.mjs --layer unit --runs 0                        # diagnostics layer only
```

`selftest.mjs` validates the binding: every scenario must declare guides and every bound file must exist (`node scripts/check-eval-coverage.mjs` validates the bindings across all 69 scenarios and reports live coverage — currently 87 of 87 topic guides bound (100%); run `node scripts/generate-coverage-matrix.mjs` to regenerate [`evals/COVERAGE.md`](COVERAGE.md)).

**Calibration policy.** The true difficulty of a scenario is its baseline pass-rate. A unit
scenario whose baseline mean stays >= 80% (delta < ~10 pp) must be hardened (indirect prompt,
distractors, extra gates) or retired; in composites, harden or retire individual checks instead.
Headline metric of the suite = delta on composite scenarios; unit scenarios are the diagnostic layer.

## Calibration & campaigns (audit P2/P3 protocol)

1. **Baseline measurement (all 69).** Solve every scenario without the skill (the chat-run
   protocol above, one run per scenario to start), grade with
   `evaluate.mjs --scenario <id> --work <dir> --mode baseline-manual-chat`, then apply the
   policy mechanically: `node evals/audit/calibration.mjs --results <dir> --mode baseline-manual-chat`
   → scenarios with baseline mean >= 80% print `HARDEN OR RETIRE`. Re-run after prompt or
   check changes (a prompt rewrite resets comparability for that scenario).
2. **Campaign (n >= 5).** Both arms, 2–3 model tiers, judge as the second channel with
   diff-only majority grading (`EVAL_JUDGE_INPUT=diff`, `EVAL_JUDGE_RUNS=3`), then compute
   uncertainty with `node evals/audit/stats.mjs --results <dir> --arms with-skill,baseline`
   → per-scenario deltas, arm means, scenario-level bootstrap 95% CIs. Publish per-run
   results, not only means. Re-baseline whenever `checksVersion` or a prompt changes.

De-leaking note (2026-11-12): prompts of 18 and 22 were rewritten from solution-dictating
phrasing ("read-through cache entry", "OffsetPaginator from yiisoft/data") to user-level
requirements; 57 and the runner scenarios (58–61) keep their literal thresholds/package
names because for configuration tasks those ARE the requirements. Their pre-rewrite
campaign results are not comparable.

## Runtime Verification Layer (L4/L5)

The harness includes a runtime verification module (`evals/lib/runtime.mjs`) supporting PHP syntax linting (`php -l`), `composer validate`, and strict `phpunit` test execution:

```bash
# Enable runtime checks on evaluate.mjs
node evals/runner/evaluate.mjs --scenario 01-full-add-comment --work /tmp/work-01 --runtime

# Require PHPUnit execution to pass (fail if PHP, vendor/, phpunit binary, or config is missing)
EVAL_REQUIRE_PHPUNIT=1 node evals/runner/evaluate.mjs --scenario 01-full-add-comment --work /tmp/work-01 --runtime

# Validate syntax across all scenario samples (69 scenarios)
node evals/runner/selftest.mjs --runtime

# Run the standalone L5 Yii 3 PHPUnit integration harness (skips locally without PHP; use --strict in PHP 8.2+ / CI)
node scripts/test-php-runtime.mjs
node scripts/test-php-runtime.mjs --strict
node scripts/test-php-runtime.mjs --install --strict

# Or set the environment variable for batch runs
export EVAL_ENABLE_RUNTIME=1
```

- **Environment Detection:** Automatically detects local PHP (`>= 8.2`) and Composer binaries, or an optional Docker image (`EVAL_DOCKER_IMAGE="php:8.2-cli"`). Composer-in-docker supports two image styles: `composer` on the image PATH (`php:*-cli` with composer copied → `EVAL_DOCKER_IMAGE` as-is) and composer-as-ENTRYPOINT images (official `composer:2` → set `EVAL_COMPOSER_DOCKER_IMAGE="composer:2"`). By default, when PHP is absent in offline runner sandboxes, runtime checks report `status: 'skipped'` — excluded from the pass-rate denominator, counted as neither passed nor failed; pass `EVAL_REQUIRE_PHPUNIT=1` (or `--strict` in `test-php-runtime.mjs`) to fail explicitly instead of skipping. For release benchmarks an absent mandatory runtime must make a run inconclusive, not green.
- **Checks executed:**
  - `runtime-php-lint`: Verifies valid PHP 8.2+ syntax (`php -l`) on all generated or touched `.php` files.
  - `runtime-composer-validate`: Verifies `composer.json` syntax and schema.
  - `runtime-vendor-prewarmed`: Automatically attaches a pre-warmed vendor layer from `EVAL_PREWARMED_VENDOR`, `evals/cache/vendor`, or automatic Composer install (`EVAL_AUTO_COMPOSER_INSTALL=1`) to enable `phpunit` execution.
  - `runtime-phpunit`: Resolves `phpunit` (`vendor/phpunit/phpunit/phpunit` / `vendor/bin/phpunit` or custom override) and `phpunit.xml` / `phpunit.xml.dist`, runs PHPUnit tests, and captures parsed test/assertion/error/failure/skip summaries.
- **L5 Runtime Integration Harness (`evals/runtime-harness/`):** A self-contained Yii 3 application slice executed via PHPUnit 11 + SQLite `:memory:` (`composer.json`, `phpunit.xml.dist`, `config/di.php`, `src/`, `tests/Integration/RuntimeStackTest.php`). It verifies real `yiisoft/di` container compilation & `StateResetter`, FastRoute route dispatch, `ValidatingHydrator` 422 validation errors and 404 fallbacks, atomic `Db` transactions + `Migrator` up/down, Transactional Outbox writes, rollback isolation, `FileMutexFactory` + `SyncQueueProducer` relay, and idempotent message consumption. Enforced in CI by `.github/workflows/ci.yml` (`php-runtime-gates`).

## Semantic LLM Judge Layer (`rubric.md`)

The harness includes an automated LLM-as-a-judge runner (`evals/runner/judge.mjs`) for qualitative rubric assessment across scenarios:

```bash
# Evaluate a work directory with the LLM judge (using dry-run mock)
node evals/runner/evaluate.mjs --scenario 01-full-add-comment --work /tmp/work-01 --judge --dry-run

# Run judge against a real LLM provider (OpenAI, Anthropic, or external CLI command)
OPENAI_API_KEY="sk-..." node evals/runner/evaluate.mjs --scenario 01-full-add-comment --work /tmp/work-01 --judge
ANTHROPIC_API_KEY="sk-ant-..." node evals/runner/evaluate.mjs --scenario 01-full-add-comment --work /tmp/work-01 --judge
EVAL_JUDGE_CMD="my-eval-cli --format json" node evals/runner/evaluate.mjs --scenario 01-full-add-comment --work /tmp/work-01 --judge

# Batch judge evaluation over existing result directories
node evals/runner/judge.mjs --results evals/results/campaign-2026-11-07/ --dry-run

# Run built-in judge self-tests
npm run judge:selftest
# or
node evals/runner/judge.mjs --selftest
```

- **Blind Evaluation Invariant:** The judge prompt strictly redacts mode indicators (`with-skill`, `baseline`) to prevent LLM grading bias. Internal harness artifacts (`AGENTS.md`, `result.json`) are excluded. **Diff-only mode** (`--input diff` or `EVAL_JUDGE_INPUT=diff`) grades the changed files without the transcript — the campaign-recommended mode, because transcripts carry arm-distinguishable skill vocabulary that word-redaction cannot hide.
- **Evidence completeness:** every criterion must carry concrete evidence; an empty criteria list or any evidence-free criterion downgrades the verdict to `inconclusive` instead of letting it stand as pass/fail. Diff-only grading of an empty diff is `inconclusive` without a provider call.
- **Multi-run majority:** `--runs N` (or `EVAL_JUDGE_RUNS=N`, default 1) invokes the judge N times independently; verdict by strict majority (adjacent-grade ties resolve stricter: pass+partial→partial, partial+fail→fail; polar disagreement → `inconclusive`), score by median, plus an `agreement` ratio. Judge calibration (κ against hand-labeled solutions) is pending; until calibrated, treat judge scores as a second channel, never as the pass/fail arbiter over deterministic gates.
- **Structured Scoring Contract:** Outputs a typed `judge.json` artifact containing:
  - `score`: Normalized score between 0.0 and 1.0 (median across runs).
  - `verdict`: `"pass"` | `"partial"` | `"fail"` | `"inconclusive"`.
  - `agreement`: share of runs matching the majority verdict (1 for single runs).
  - `provider` / `model` / `inputMode` / `requestedRuns`: provenance metadata (pin the model via `EVAL_JUDGE_MODEL`; the Anthropic default is `claude-sonnet-4-5`).
  - `criteria`: Array of per-rubric-criterion items `[{ criterion, status: met|unmet|unverifiable, evidence }]`.
  - `allRuns`: the raw per-run results when N > 1.
  - `strengths` / `weaknesses`: Specific concrete observations.

## Telemetry & Cost Tracking (Tokens & Cost)

The runner automatically tracks and persists token usage and financial cost telemetry into `result.json` across evaluation runs:

```bash
# Pass explicit token count and cost via CLI
node evals/runner/evaluate.mjs --scenario 01-full-add-comment --work /tmp/work-01 --tokens 1500 --cost 0.0045

# Or pass detailed token JSON
node evals/runner/evaluate.mjs --scenario 01-full-add-comment --work /tmp/work-01 --tokens '{"prompt":1200,"completion":300}'
```

- **Telemetry Sources (Priority Order):**
  1. **CLI / Function Arguments:** `--tokens <number|json>`, `--cost <number>` passed to `evaluate.mjs` or `evaluateWork()`.
  2. **Work Directory Telemetry Files:** Automatically parses `<work>/tokens.json`, `<work>/usage.json`, or `<work>/telemetry.json` dropped by agent wrappers. These files are excluded from task code diffs.
  3. **Environment Variables:** `EVAL_AGENT_TOKENS` (number or JSON) and `EVAL_AGENT_COST` (number string).
  4. **Transcript Regex Heuristics:** Automatically parses JSON usage blocks (`"usage": { "prompt_tokens": ..., "completion_tokens": ..., "total_tokens": ... }`) and key-value lines (`prompt_tokens: 1200`, `total tokens: 1500`, `cost: $0.0045`) in stdout/stderr transcripts.
- **Normalized Schema in `result.json`:**
  ```json
  {
    "id": "01-full-add-comment",
    "mode": "with-skill",
    "run": 1,
    "checksVersion": "a1b2c3d4e5f6",
    "tokens": {
      "prompt": 1200,
      "completion": 300,
      "total": 1500
    },
    "cost": 0.0045,
    "changed": [...],
    "results": [...]
  }
  ```
  Each entry in `results` carries `{ id, description, category, required, status, pass, skipped, evidence }`.
- **Campaign Reporting:** When telemetry is captured, `runner/run.mjs` appends an aggregate `## Telemetry (Tokens & Cost)` summary table into `summary.md`.

## Adding a scenario

1. Copy the closest scenario, adjust the fixture and `prompt.md`.
2. Write `checks.mjs`: structural properties only, no coupling to the agent's class names.
   Import the shared hygiene checks (`noYii2Check`, `strictTypesCheck`, …) from
   `evals/lib/shared-checks.mjs` instead of copying regexes.
3. Create `positive-sample` and `negative-sample`; list in `negativeMustFail` the check ids
   the bad sample must fail. For checks guarding semantic invariants, also add `nearMiss`
   (near-correct variants caught by exactly the listed checks) and, where the check must
   tolerate alternative valid styles, `positiveAlt` samples — see "Scenario layout".
4. `node evals/runner/selftest.mjs` must be green (it also asserts the do-nothing floor
   control and validates all `nearMiss` / `positiveAlt` samples).
5. `node evals/audit/mutation.mjs` — add a targeted mutant for every new semantic
   invariant guard (the defect it exists to catch must be provably caught).

Rule: every agent failure found on a real project becomes a new scenario.
