## Yii3 support (from yii3-skills)

Guard: if the project does not use Yii3 (no `yiisoft/*` in `composer.json`), ignore this block. Otherwise load the `yii3` skill (`SKILL.md`) and execute per it — the skill is the single source of rules:

- Apply "Mission Workflow (Stages 1–7)" strictly bottom-up, including the Mandatory Signature Lookup Protocol and the per-step wiring gates. The API source of truth for every `yiisoft/*` call is `vendor/yiisoft/<pkg>/src`, never this extension's guides or model memory.
- Print `Architecture: <source>` per Stage 0 item 5; place every file per that source and the targeted topic guide.
- Use the project's own commands for composer, tests, and linters (Makefile, composer scripts, Docker, Psalm/PHPStan, Rector, PHPUnit).
- `HANDOFF_MODE=1` behavior (never ask the user) is defined in the skill's "AI Factory mode" section.
