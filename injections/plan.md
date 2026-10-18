## Yii3 support (from aif-ext-yii3)

Run the `yii3` skill's `scripts/yii3-context.mjs`; if it reports `"yii3": false`, ignore this block.

When planning in a Yii3 project:
- Load the `yii3` skill. Place every new file per the architecture source (`/aif-architecture` artifact, else the inferred
  layout from the script) and name the target path/layer in each task (in ultra plans: in the phase's `Files to Change`).
- Run the script with `--need <capabilities>` for the feature. For each missing package add an early task
  "Install `yiisoft/<pkg>` and wire config" (composer require + params/DI/bootstrap); respect `choice` (e.g. DB driver) and `warning` entries.
- Put config tasks (routes, DI, params, migrations, console registration) before the code that depends on them.
- Do not introduce a new folder structure or a second mechanism (ORM, router, DI style) next to the existing one.
