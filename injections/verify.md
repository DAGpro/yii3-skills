## Yii3 support (from yii3-skills)

Guard: activate this block only for a Yii 3 project — `yiisoft/*` packages in `composer.json` AND no `yiisoft/yii2` in `composer.json` or `composer.lock`. Yii 2 project (`yiisoft/yii2` present) or non-Yii project (no `yiisoft/*`): ignore this block and do not apply Yii 3 rules. Ambiguous project state (missing `composer.lock`, contradictory evidence): do not auto-activate — ask the user or report the task blocked. Otherwise load the `yii3` skill and verify per its "Finale — Definition of Done" — the skill is the single source of gates:

1. **Chain Integrity Checklist** (Finale item 2, blocking): DI bindings, routes, console/event/RBAC wiring, reversible migrations, post-commit event dispatch, nothing edited in `vendor/` or `config/.merge-plan.php`.
2. **Project checks** (Finale item 1): static analysis & linters per the project's setup (Psalm/PHPStan, Rector, PHP-CS-Fixer); unknown classes, missing `declare(strict_types=1);`, or leftover Yii2 APIs are blocking; packages used in code must be declared in `composer.json`.
3. **Full-mode tasks** also load `references/core-definition-of-done.md` (architecture & decomposition checks, Production Readiness Gate, report format). File-placement judgments consult `references/core-architecture-alignment.md`: dependency-rule violation → blocking, other mismatch → `WARN [architecture-drift]`. Per the skill's Core rule 2 conflict rule: convention-only mismatches (layout, naming) are reported as drift, the code is not rewritten to match the guides.

Merge these findings into `aif-gate-result` (`blockers`, `affected_files`) like any other finding.
