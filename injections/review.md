
## Yii3 support (from aif-ext-yii3)

In a Yii3 project (`yiisoft/*` in `composer.json`, no `yiisoft/yii2`) additionally flag:
- **Yii2 APIs & Anti-patterns:** `Yii::$app`, `yii\...` namespace, `actionX()` methods, `rules()` / `behaviors()` in models, services built with `new` instead of DI, missing `declare(strict_types=1);`.
- **Fat Action:** Action containing SQL queries, ActiveRecord persistence, password hashing, or notification sending (must be extracted to Use Case / Domain / Event Listener).
- **Unvalidated Input:** reading raw `$request->getParsedBody()['field']` without strongly-typed DTO validated by `yiisoft/validator` `#[Rule]` attributes.
- **Missing DI bindings & Wiring:** any newly introduced interface (`*Interface`) without a mapping in `config/**/di/*.php`, any Action without a Route, or any Console Command without registration in `config/console/params.php`.
- **Missing Transactions:** multiple state-modifying database operations without `$db->transaction()`.
- **API Response:** returning raw PHP arrays or `json_encode` instead of using `Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface` with proper HTTP status codes.
- **Packages & Config:** packages used in code but missing from `composer.json`, or files edited in `vendor/` or `config/.merge-plan.php`.
- **Architecture violations:** judged against the `/aif-architecture` artifact or, if absent, the existing project structure (`references/feature-recipes.md`).
Ensure project linters and static analysis (Psalm/PHPStan, Rector, CS-Fixer) pass.
