
## Yii3 support (from aif-ext-yii3)

In a Yii3 project (`yiisoft/*` in `composer.json`, no `yiisoft/yii2`) additionally flag: Yii2 APIs, `Yii::$app`-style service location,
missing `declare(strict_types=1)`, services built with `new` instead of DI, packages used but missing from `composer.json`
(`yii3-context.mjs --scan-git` finds these), config edited in `vendor/` or `config/.merge-plan.php`, and architecture violations judged
against the `/aif-architecture` artifact or, if absent, the existing project structure.
