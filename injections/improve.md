## Yii3 support (from aif-ext-yii3)

If the project does not use Yii3 (no `yiisoft/*` in `composer.json`), ignore this block.

While refining the plan also check, and report in the usual findings groups:
- **Missing install tasks** — a task needs a capability whose package is missing in `composer.json` and has no earlier install+wire task;
  missing companions (DB driver, cache storage, router implementation, queue adapter, `security` for passwords, `mailer` for emails).
- **Missing config & wiring tasks (Chain Integrity)** — verify the entire execution chain:
  * Route: every new Action must have a route registration task in `config/**/routes.php`.
  * Console: every new Console Command must have a registration task in `config/console/params.php` under `'yiisoft/yii-console' => ['commands' => [...]]`.
  * DI: every new interface (`*Interface`) must have a binding task in `config/**/di/*.php`.
  * Migrations: any schema/table changes must have a migration task (`yiisoft/db-migration`).
  * Events: any side-effects (notifications, audit) must have event listeners wired in `config/**/events.php`.
  * Input: any user input must have an Input DTO with `yiisoft/validator` attributes instead of raw request access.
  * Auth / Middleware / RBAC: mutating or protected routes must have authentication/authorization checks (`CurrentUser::can()`, `yiisoft/user` / `yiisoft/rbac`), and custom `RuleInterface` classes must be registered in `'yiisoft/rbac-rules-container'`.
- **Missing pagination limit** — ensure all query/listing tasks enforce an `OffsetPaginator` or explicit SQL `limit` to prevent denial-of-service on large tables.
- **Missing CSRF / CORS** — ensure HTML form routes include `CsrfMiddleware` (`yiisoft/csrf`), and API route groups include `CorsAllowAllMiddleware` (`yiisoft/yii-middleware`) or appropriate CORS handling.
- **Post-Commit Event Dispatching** — verify that side-effects (emails, queue jobs) are dispatched outside/after the DB transaction to avoid ghost notifications on rollback.
- **DTO Mass-Assignment & Typecasting** — verify separate DTOs exist for Create vs Update (avoiding ID overwrite), and numeric/boolean query parameters are typecasted properly.
- **Missing transaction boundary** — if a Use Case / Service performs multiple state-modifying database operations,
  ensure it is planned to execute inside a transaction (`Yiisoft\Db\ConnectionInterface::transaction()`).
- **Missing test tasks** — every business feature must have tasks for Unit tests (Use Case / Domain logic)
  and Functional/HTTP tests (Action / Endpoint) matching the project's testing setup (PHPUnit / Codeception).
- **Fat Action smell** — if a task places business logic, SQL/ActiveRecord calls, hashing, or email sending directly into an Action,
  refactor the task to split into Use Case / Command Handler + Event Listener, keeping Action strictly for HTTP orchestration.
- **Wrong order** — code tasks that precede the install/config/migration they depend on (🔗 dependency fixes).
- **Architecture placement** — every file path vs the architecture source (`/aif-architecture` artifact, else the existing layout):
  wrong layer/slice, dependency-rule violations, new top-level folders. Consult `references/feature-recipes.md`.
- **Yii2-isms** in task text (`Yii::$app`, `yii\...`, `rules()`, behaviors) → rewrite for Yii3.
Existing-code refactoring goes only to "💡 Out of scope".
