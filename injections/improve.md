## Yii3 support (from yii3-skills)

Guard: if the project does not use Yii3 (no `yiisoft/*` in `composer.json`), ignore this block. Otherwise load the `yii3` skill and re-check the plan against its sections — the skill is the single source of rules; report findings in the workflow's usual groups:

- "Mission Workflow (Stages 1–7)": stage coverage and ordering; packages installed/wired before the code that uses them (`references/core-dependency-protocol.md`); per-step wiring gates planned the moment the artifact appears.
- The phase → stage mapping table in the same section: plans must not merge or reorder phases.
- "Finale — Definition of Done" item 2 Chain Integrity Checklist: every planned `*Interface` has a DI-binding task, every Action a route task, every console command/event/RBAC artifact its registration task, every schema change a migration task.
- SKILL.md Stage 0 item 2: no second mechanism (driver/ORM/queue/cache/test runner) introduced next to the existing one.
- Existing-code refactoring goes only to "💡 Out of scope".
