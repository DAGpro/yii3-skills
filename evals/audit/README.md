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

Planned (P1, per the audits): mutation control of the checks themselves (stub-method
survivors, wrong-DI-target, comment-instead-of-code mutants must be caught), and
near-miss sample sets per critical check (precision/recall instead of two-point
positive/negative validation).
