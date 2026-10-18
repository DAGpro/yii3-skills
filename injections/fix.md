
## Yii3 support (from aif-ext-yii3)

Run the `yii3` skill's `scripts/yii3-context.mjs`; if it reports `"yii3": false`, ignore this block. Otherwise load the `yii3` skill.
Investigate DI wiring and merged config first (`config/.merge-plan.php`, `config/common/di/*.php`, package `config/` in
`vendor/yiisoft/*`) — most Yii3 bugs are missing/overridden definitions or params. Check the installed package version's source before
assuming API behavior. Keep the fix inside the existing structure (`/aif-architecture` artifact, else the real layout); do not relocate code.
