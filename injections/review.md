## Yii3 support (from yii3-skills)

Guard: activate this block only for a Yii 3 application — at least one `yiisoft/yii-*` package (application/runtime stack, e.g. `yiisoft/yii-runner-http`, `yiisoft/yii-runner-console`, `yiisoft/yii-http`, or `yiisoft/yii-console`; `yiisoft/yii2` excluded) in `composer.json` or `composer.lock`. Yii 2 project (`yiisoft/yii2` present), Yii-ecosystem library (only base `yiisoft/*` packages like `yiisoft/di` or `yiisoft/strings`, without application runtime stack), or non-Yii project: ignore this block and do not apply Yii 3 rules. Unknown project state (neither composer.json nor composer.lock present, contradictory evidence): do not auto-activate — ask the user or report the task blocked (`composer.json` declares intent; `composer.lock` confirms installed versions). Otherwise load the `yii3` skill and review per it — the skill is the single source of rules:

Review-specific duties:
- Source-of-truth split: Core rule 2 — API claims checked against `vendor/yiisoft/<pkg>/src`, implementation patterns against the guides, project conventions (layout, naming) accepted as-is unless a correctness rule is violated — convention-only mismatches are reported as drift, the code is not rewritten to match the guides.
- Core rule 1 "Yii3 is not Yii2" (SKILL.md Core rules) and the Anti-Pattern Matrix of each touched topic guide.
- The Chain Integrity Checklist (SKILL.md Finale item 2): any new `*Interface` without a DI binding in `config/**/di/*.php`, any Action without a route, any console command without registration, any side-effect not wired in `config/**/events.php`.
- Finale item 1: project checks (tests, Psalm/PHPStan, Rector, CS-Fixer) must pass; packages used in code must be declared in `composer.json`.
- Zero-ambiguity review output: classify all findings with exact file paths, line numbers, and strict severity (BLOCKER for architectural violations, SUGGESTION for style conventions).
