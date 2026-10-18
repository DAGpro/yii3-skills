
## Yii3 support (from aif-ext-yii3)

Run the `yii3` skill's `scripts/yii3-context.mjs`; if it reports `"yii3": false`, ignore this block.

While refining the plan also check, and report in the usual findings groups:
- **Missing install tasks** — a task needs a capability (`--need`) whose package is missing and has no earlier install+wire task;
  missing companions (DB driver, cache storage, router implementation, queue adapter).
- **Missing config tasks** — routes, DI, params, bootstrap/events, console registration, migrations.
- **Wrong order** — code tasks that precede the install/config/migration they depend on (🔗 dependency fixes).
- **Architecture placement** — every file path vs the architecture source (`/aif-architecture` artifact, else the inferred layout):
  wrong layer/slice, dependency-rule violations, new top-level folders.
- **Yii2-isms** in task text (`Yii::$app`, `yii\...`, `rules()`, behaviors) → rewrite for Yii3.
Existing-code refactoring goes only to "💡 Out of scope".
