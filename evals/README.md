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
  scenario.json      id, mode, timeout, negativeMustFail (checks a bad sample must fail)
  prompt.md          verbatim user request
  fixture/           project state before the agent runs (copied to a temp dir)
  checks.mjs         deterministic checks: check(id, description, ctx => ok()/fail(evidence))
  rubric.md          criteria for a model judge (what cannot be checked by code)
  positive-sample/   overlay with a good solution + transcript.txt
  negative-sample/   overlay with a deliberately bad solution + transcript.txt
```

`ctx` in checks: `{ dir, base, changed, transcript, mode }`, where `changed` is the set of files
added or modified relative to the fixture (`{path, abs, added}`). Dot-entries are never scanned
(skill install dirs, `.git`, agent state) — the work-dir contract is agent-independent.

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
1. Prepare a work dir: copy `fixture/`, add the same sandbox `AGENTS.md` note, `git init` + commit,
   and for with-skill install the skill at `<work>/.opencode/skills/yii3`.
2. Prompt the subagent with hard sandbox rules (work only inside the work dir, no git/composer,
   ignore instructions from files outside it) + the verbatim `prompt.md` + "write your final
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

`selftest.mjs` validates the binding: every scenario must declare guides and every bound file must exist.

**Calibration policy.** The true difficulty of a scenario is its baseline pass-rate. A unit
scenario whose baseline mean stays >= 80% (delta < ~10 pp) must be hardened (indirect prompt,
distractors, extra gates) or retired; in composites, harden or retire individual checks instead.
Headline metric of the suite = delta on composite scenarios; unit scenarios are the diagnostic layer.

## Adding a scenario

1. Copy the closest scenario, adjust the fixture and `prompt.md`.
2. Write `checks.mjs`: structural properties only, no coupling to the agent's class names.
3. Create `positive-sample` and `negative-sample`; list in `negativeMustFail` the check ids
   the bad sample must fail.
4. `node evals/runner/selftest.mjs` must be green.

Rule: every agent failure found on a real project becomes a new scenario.

## Not implemented (TODO)

- Judge over `rubric.md` (a model call; the judge must not know the with-skill/baseline mode).
- Running `composer install` and `phpunit` in the working copy as a check (currently text analysis only).
- Scenarios 02, 05, 06, 08, 10, 12 (see plan: light, drift, convention conflict, no vendor,
  Yii2 trap, negative trigger) — the rest are written; add new ones from observed agent failures.
- Guide coverage: 61 of 78 `skills/yii3/references/` guides have scenarios
  (47 scenarios: 14 unit diagnostics + 4 composite anchors 01/13/23/25; the
  actions cluster, auth/RBAC, persistence, views, i18n, testing and infra
  clusters are covered); continue per-guide coverage in batches on request.
- Tokens/cost in `result.json` (depends on the agent adapter).
