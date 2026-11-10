## Yii3 support (from yii3-skills)

Load the `yii3` skill and re-check the plan against its sections — the skill is the single source of rules; report findings in the workflow's usual groups:

Operating context: this `aif-*` workflow runs the skill in its default AI Factory extension mode (contract: `references/core-aif-adapter.md`); the standalone fallback contract (`references/core-standalone-adapter.md`) is out of scope here.

Improve-specific duties (the rules themselves live in the skill; all `references/*.md` paths resolve relative to the `yii3` skill directory):
- "Mission Workflow (Stages 1–7)": stage coverage and ordering; packages installed/wired before the code that uses them (`references/core-dependency-protocol.md`); per-step wiring gates planned the moment the artifact appears.
- The phase → stage mapping table in the same section: plans must not merge or reorder phases; in Feature mode (canonical default), verify that thin actions and service/repository layers are preserved without collapsing into monolithic controllers; in Patch mode, verify that only touched stages are planned; in Enterprise mode, verify full domain and use-case decomposition.
- "Finale — Definition of Done" item 2 Chain Integrity Checklist: every planned `*Interface` has a DI-binding task, every Action a route task, every console command/event/RBAC artifact its registration task, every schema change a migration task.
- SKILL.md Stage 0 item 2: no second mechanism (driver/ORM/queue/cache/test runner) introduced next to the existing one.
- Zero-ambiguity plan verification: ensure all tasks specify concrete target file paths and an assigned `Guide: references/<topic>.md` (resolved via `references/INDEX.md` or the SKILL.md Task Routing Matrix), and that the plan initializes the complete `### Execution State` block template per `references/core-aif-adapter.md`.
- Existing-code refactoring goes only to "💡 Out of scope".
