## Yii3 support (from aif-ext-yii3)

If the project does not use Yii3 (no `yiisoft/*` in `composer.json`), ignore this block. Otherwise load the `yii3` skill.

When diagnosing bugs in a Yii3 project, check the typical Yii3 root causes:
1. **DI & Configuration:** missing/unbound interfaces in `config/common/di/*.php`, circular dependencies in constructor arguments, or overridden parameters in `config/**/params.php`. Inspect `config/.merge-plan.php` to verify the package is recognized.
2. **Input Hydration & Validation:** type mismatches in DTO properties (e.g. string from request body not matching typed `int`/`bool` properties without hydrator casting), or incorrectly configured rule attributes (`#[Required]`, `#[Length]`, `#[StringValue]`, …).
3. **Routing & Middleware:** mismatched HTTP method in `Route::get/post`, route group prefix issues, or a middleware not delegating properly via `$handler->handle($request)`.
4. **API Signatures:** check the installed package's source code in `vendor/yiisoft/<pkg>/src` rather than assuming method names. Never introduce Yii2 static facades (`Yii::$app`) as a workaround.
Keep the fix inside the existing structure (`/aif-architecture` artifact, else the real layout); do not relocate code.
