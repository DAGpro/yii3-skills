## Yii3 support (from yii3-skills)

Guard: if the project does not use Yii3 (no `yiisoft/*` in `composer.json`), ignore this block. Otherwise load the `yii3` skill and apply Stage 0 item 3(c) "Bug / diagnostics": root-cause checklist in order — DI & configuration → input hydration & validation → routing & middleware → API signatures in `vendor/yiisoft/<pkg>/src`. Never use a Yii2 static facade as a workaround. Keep the fix inside the existing structure (architecture source per Stage 0 item 1); do not relocate code.
