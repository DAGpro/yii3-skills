## Yii3 support (from yii3-skills)

Guard: if the project does not use Yii3 (no `yiisoft/*` in `composer.json`), ignore this block. Otherwise load the `yii3` skill and verify per its "Finale — Definition of Done" — the skill is the single source of gates:

1. **Deterministic gate:** from the skill package directory run `php scripts/verify-all.php [project-path]` (or individual verifiers). Fix every reported error and rerun until exit 0; exit codes are documented in the skill's tooling section — exit 2 means a misconfigured invocation, never treat it as a pass.
2. **Chain Integrity Checklist** (Finale item 3, blocking): DI bindings, routes, console/event/RBAC wiring, reversible migrations, post-commit event dispatch, nothing edited in `vendor/` or `config/.merge-plan.php`.
3. **Project checks** (Finale item 2): static analysis & linters per the project's setup (Psalm/PHPStan, Rector, PHP-CS-Fixer); unknown classes, missing `declare(strict_types=1);`, or leftover Yii2 APIs are blocking; packages used in code must be declared in `composer.json`.
4. **Full-mode tasks** also load `references/core-definition-of-done.md` (architecture & decomposition checks, Production Readiness Gate, report format). File-placement judgments consult `references/core-architecture-alignment.md`: dependency-rule violation → blocking, other mismatch → `WARN [architecture-drift]`. Per the skill's Core rule 2 conflict rule: convention-only mismatches (layout, naming) are reported as drift, the code is not rewritten to match the guides.

Merge these findings into `aif-gate-result` (`blockers`, `affected_files`) like any other finding.
