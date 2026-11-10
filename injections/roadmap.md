## Yii3 support (from yii3-skills)

Load the `yii3` skill and shape milestones per it — the skill is the single source of rules:

Operating context: this `aif-*` workflow runs the skill in its default AI Factory extension mode (contract: `references/aif-adapter.md`); the standalone fallback contract (`references/standalone-adapter.md`) is out of scope here.

Roadmap-specific duties (the rules themselves live in the skill; all `references/*.md` paths resolve relative to the `yii3` skill directory):
- Stack invariants: shape milestones per SKILL.md Stage 0 item 2 — exactly one DB driver, one persistence path, one queue/cache/mutex driver, one RBAC storage, one translator message storage, one test runner; dev tools stay in `require-dev`.
- Driver selection rules: resolve driver selections per the skill's `references/package-catalog.md` §3 ("Pick Exactly ONE per Family").
- Architecture sequencing: add an early milestone "Run the architecture workflow before the first plan" so every subsequent plan places code against a resolved architecture.
