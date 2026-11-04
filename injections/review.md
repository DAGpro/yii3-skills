## Yii3 support (from yii3-skills)

Guard: if the project uses Yii3 (`yiisoft/*` in `composer.json`, no `yiisoft/yii2`), load the `yii3` skill and additionally flag — the skill is the single source of rules:

- The Core rule 2 source-of-truth split: API claims checked against `vendor/yiisoft/<pkg>/src`, implementation patterns against the guides, project conventions (layout, naming) accepted as-is unless a correctness rule is violated — convention-only mismatches are reported as drift, the code is not rewritten to match the guides.
- The "Cross-Cutting Yii 2 Bans (Quick Guard List)" (SKILL.md Core rules) and the Anti-Pattern Matrix of each touched topic guide.
- The Chain Integrity Checklist (SKILL.md Finale item 3): any new `*Interface` without a DI binding in `config/**/di/*.php`, any Action without a route, any console command without registration, any side-effect not wired in `config/**/events.php`.
- Finale items 1–2: deterministic verifier errors (`php scripts/verify-all.php [project-path]`) and project checks (tests, Psalm/PHPStan, Rector, CS-Fixer) must pass; packages used in code must be declared in `composer.json`.
