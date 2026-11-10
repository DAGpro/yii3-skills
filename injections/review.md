## Yii3 support (from yii3-skills)

Load the `yii3` skill and review per it — the skill is the single source of rules:

Operating context: this `aif-*` workflow runs the skill in its default AI Factory extension mode (contract: `references/aif-adapter.md`); the standalone fallback contract (`references/standalone-adapter.md`) is out of scope here.

Review-specific duties (the rules themselves live in the skill; all `references/*.md` paths resolve relative to the `yii3` skill directory):
- Source-of-truth split: Core rule 2 — API claims checked against `vendor/yiisoft/<pkg>/src`, implementation patterns against the guides, project conventions (layout, naming) accepted as-is unless a correctness rule is violated — convention-only mismatches are reported as drift, the code is not rewritten to match the guides.
- Core rule 1 "Yii3 is not Yii2" (SKILL.md Core rules) and the Anti-Pattern Matrix of each touched topic guide.
- The Chain Integrity Checklist & Code-to-Reference Compliance Audit (SKILL.md Finale item 2): any new `*Interface` without a DI binding in `config/**/di/*.php`, any Action without a route, any console command without registration, any side-effect not wired in `config/**/events.php`, or any generated/modified file violating the Anti-Pattern Matrix of its governing reference guide (`references/<topic>.md`).
- Finale item 1: project checks (tests, Psalm/PHPStan, Rector, CS-Fixer) must pass; packages used in code must be declared in `composer.json`.
- Zero-ambiguity review output: classify all findings with exact file paths, line numbers, and strict severity (BLOCKER for architectural violations, SUGGESTION for style conventions).
