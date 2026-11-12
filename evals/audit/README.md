# evals/audit: meta-tests for the eval system itself

Tools that grade the graders (external-audit follow-ups, 2026-11-12). Unlike
`runner/selftest.mjs` (which validates scenarios against their samples), everything
here validates the **grading machinery** — the parser helpers, the shared checks, and
the metric scale.

- `parser-probes.mjs` — regression probes for the PHP parsing helpers (`matchParen`,
  `methodBody`, `stripPhpNoise`) and the canonical hygiene checks
  (`lib/shared-checks.mjs`): backslash-string and heredoc survival, `#[...]` attribute
  parens, comment/string false positives, whitespace-tolerant `strict_types`, R10
  `#[Override]` advisory behavior. Runs as a permanent phase of `runner/selftest.mjs`;
  also standalone: `node evals/audit/parser-probes.mjs`.
- `floor.mjs` — do-nothing floor measurement: grades an untouched fixture (no changes,
  empty transcript) in every scenario and reports the gates verdict and the vacuous
  pass-rate. With the attempt gate, gates must FAIL in all scenarios (this is also
  enforced permanently by the selftest floor control); the pass-rate quantifies how much
  of the check scale remains free on an empty diff (historically 35.2% mean, concentrated
  in the hygiene slice). Usage: `node evals/audit/floor.mjs [--json]`.
- `mutation.mjs` — targeted mutation control of the checks themselves (audit P1): each
  mutant applies a specific defect edit to a scenario's positive sample (wrong DI target,
  comment-only binding, dispatch before/inside the transaction, wrong-table migration
  revert, docblock-only validation attributes, unwired DTO) and the grading run must fail
  exactly the checks guarding that invariant; behavior-preserving control mutants
  (spaced `strict_types`, docblock Yii2 mentions, class-constant migrations) must fail
  nothing. Usage: `node evals/audit/mutation.mjs [--json]`. Current: targeted 10/10
  caught, controls 3/3 clean.

Scenario-level precision/recall fixtures (near-miss negatives and alternative-positive
samples, declared per scenario as `nearMiss` / `positiveAlt`) are validated permanently
by `runner/selftest.mjs`; contracts for the semantically upgraded checks live in
[`../CHECK-CONTRACTS.md`](../CHECK-CONTRACTS.md).
