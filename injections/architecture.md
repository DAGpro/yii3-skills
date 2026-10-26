## Yii3 support (from aif-ext-yii3)

If the project does not use Yii3 (no `yiisoft/*` in `composer.json`), ignore this block.

When generating or updating ARCHITECTURE.md for a Yii3 project, additionally include:
- **Package-category → layer mapping:** map Yii3 package categories (HTTP routing/middleware, forms/input/
  validation, use cases/DTOs/events, persistence adapters, domain, runners/wiring, auth/RBAC boundary) to the
  layers of the chosen pattern — use the placement tables in `references/architecture-alignment.md` §4
  (yii3 skill) as the baseline.
- **Domain purity rule:** the domain layer imports neither `yiisoft/db` (nor drivers, ActiveRecord, Cycle),
  HTTP classes (`yiisoft/yii-http`, PSR-15 handlers) nor view packages (`yiisoft/view`, `yii-view-renderer`);
  persistence reaches the domain only through port interfaces bound in DI.
- **Composition root location:** record where `config/**/di*.php`, `config/**/routes.php`, and
  `config/**/events*.php` live under the chosen pattern (see the placement tables) and state that all wiring
  happens there — never inside `src/`.
- **One mechanism per concern:** one DB driver, one ORM path, one queue/cache/mutex driver, one test runner;
  the architecture must forbid introducing a second competing mechanism later.
