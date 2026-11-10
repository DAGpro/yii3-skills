## Yii3 support (from yii3-skills)

Load the `yii3` skill (`SKILL.md`) and execute per it — the skill is the single source of rules:

Operating context: this `aif-*` workflow runs the skill in its default AI Factory extension mode (contract: `references/core-aif-adapter.md`); the standalone fallback contract (`references/core-standalone-adapter.md`) is out of scope here.

Implement-specific duties (the skill is the single source of rules; all `references/*.md` paths resolve relative to the `yii3` skill directory):
- Mandatory guide-grounded execution: apply "Mission Workflow (Stages 1–7)" strictly bottom-up. Before generating code for any plan task, read the task's assigned `Guide: references/<topic>.md` (if omitted in the plan, resolve it from `references/INDEX.md` or the SKILL.md Task Routing Matrix) and inspect API signatures in `vendor/yiisoft/<pkg>/src`. Never generate code without consulting the corresponding guide.
- Source-of-truth split: follow the skill's Core rule 2 — API calls → `vendor/yiisoft/<pkg>/src`; implementation patterns → the skill's guides (project divergence = flag, not copy); project conventions (layout, naming, chosen drivers) → the project's architecture artifact or dominant `src/` style — new code continues the project's style.
- Zero-ambiguity handoff to verify: print `Architecture: <source>` and establish the Mission State tracker per Stage 0 item 5; place every file per that source and the targeted topic guide. Upon completing implementation, the active plan artifact must be fully reconciled — check off all task boxes `- [x]`, record every touched file under `Artifacts: <path> (<role>)`, and verify every per-step wiring gate (`DI binding: PASS`, `Routes / CLI: PASS`, `Events / Migrations: PASS`) in `### Execution State`. Never leave artifacts unlisted or wiring unverified.
- Tooling commands: use the project's own commands for composer, tests, and linters (Makefile, composer scripts, Docker, Psalm/PHPStan, Rector, PHPUnit).
- Autonomous mode: `HANDOFF_MODE=1` behavior (never ask the user) is defined in the AI Factory Adapter (`references/core-aif-adapter.md` §5).
