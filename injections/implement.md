## Yii3 support (from yii3-skills)

Guard: if the project does not use Yii3 (no `yiisoft/*` in `composer.json`), ignore this block. Otherwise load the `yii3` skill (`SKILL.md`) and execute per it — the skill is the single source of rules:

- Apply "Mission Workflow (Stages 1–7)" strictly bottom-up, including the Mandatory Signature Lookup Protocol and the per-step wiring gates. Follow the skill's Core rule 2 source-of-truth split: API calls → `vendor/yiisoft/<pkg>/src`; implementation patterns → the skill's guides (project divergence = flag, not copy); project conventions (layout, naming, chosen drivers) → the project's architecture artifact or dominant `src/` style — new code continues the project's style.
- Print `Architecture: <source>` per Stage 0 item 5; place every file per that source and the targeted topic guide.
- Use the project's own commands for composer, tests, and linters (Makefile, composer scripts, Docker, Psalm/PHPStan, Rector, PHPUnit).
- `HANDOFF_MODE=1` behavior (never ask the user) is defined in the skill's "AI Factory mode" section.
