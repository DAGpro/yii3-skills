## Yii3 support (from yii3-skills)

Guard: activate this block only for a Yii 3 project — `yiisoft/*` packages in `composer.json` AND no `yiisoft/yii2` in `composer.json` or `composer.lock`. Yii 2 project (`yiisoft/yii2` present) or non-Yii project (no `yiisoft/*`): ignore this block and do not apply Yii 3 rules. Ambiguous project state (missing `composer.lock`, contradictory evidence): do not auto-activate — ask the user or report the task blocked. Otherwise load the `yii3` skill and additionally flag — the skill is the single source of rules:

- The Core rule 2 source-of-truth split: API claims checked against `vendor/yiisoft/<pkg>/src`, implementation patterns against the guides, project conventions (layout, naming) accepted as-is unless a correctness rule is violated — convention-only mismatches are reported as drift, the code is not rewritten to match the guides.
- The "Cross-Cutting Yii 2 Bans (Quick Guard List)" (SKILL.md Core rules) and the Anti-Pattern Matrix of each touched topic guide.
- The Chain Integrity Checklist (SKILL.md Finale item 2): any new `*Interface` without a DI binding in `config/**/di/*.php`, any Action without a route, any console command without registration, any side-effect not wired in `config/**/events.php`.
- Finale item 1: project checks (tests, Psalm/PHPStan, Rector, CS-Fixer) must pass; packages used in code must be declared in `composer.json`.
