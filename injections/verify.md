
## Yii3 support (from aif-ext-yii3)

If the project does not use Yii3 (no `yiisoft/*` in `composer.json`), ignore this block.

1. **Project static analysis & linters:** run Psalm/PHPStan, Rector, PHP-CS-Fixer/ECS per the project's setup.
   - Any unknown classes, missing `declare(strict_types=1);`, or leftover Yii2 APIs (`Yii::$app`, `yii\...`) are blocking.
   - Packages used in code must be declared in `composer.json` (no unlisted transitive dependencies).
2. **Deterministic Yii3 verification scripts (blocking):** from the skill package directory, run
   `php scripts/verify-all.php [project-path]` (or individual verifiers: `check-di-syntax.php`, `verify-actions.php`, `verify-routes.php`).
   Loop: run verifier suite → fix every reported error → rerun → repeat until all exit 0.
   Warnings exit 0 and are reported separately from errors (errors block, warnings advisory).
   Exit 2 (wrong scan path or PHP guard) means a misconfigured invocation — fix it, never treat it as a pass.
3. **Config wiring & Chain Integrity** (judgment):
   - Every newly created interface (`*Interface`) MUST be bound in DI (`config/**/di/*.php`) — missing binding is blocking.
   - Every newly created Action MUST have an active Route registered in `config/**/routes.php` — missing route is blocking.
   - Every newly created Console Command MUST be registered in `config/console/params.php` under `'yiisoft/yii-console' => ['commands' => [...]]` — missing command wiring is blocking.
   - Every custom RBAC Rule (`RuleInterface`) MUST be registered in `config/common/params.php` under `'yiisoft/rbac-rules-container'` — missing rule wiring is blocking.
   - Migrations MUST exist in `yiisoft/db-migration` for any newly introduced tables or altered columns.
   - Any side-effects (e.g. notifications/emails) must be wired to events in `config/**/events.php`.
   - Nothing edited in `vendor/` or `config/.merge-plan.php`.
4. **Architecture & Decomposition** (complements the built-in architecture gate; do not duplicate its findings):
   - New/changed files sit where the `/aif-architecture` artifact — or, if absent, the existing structure — says;
     dependency-rule violation → blocking, other mismatch → `WARN [architecture-drift]`.
   - **Thin Actions:** Action classes must not contain direct database queries (SQL/ActiveRecord), password hashing, or notification logic;
     such logic must live in Use Cases / Repositories / Listeners (`references/feature-recipes.md`).
   - **PSR-7 Response Type:** Action classes MUST strictly declare and return `Psr\Http\Message\ResponseInterface` (never array, string, or void).
   - **Input Validation:** User input must pass through an Input DTO with `yiisoft/validator` attributes (no unvalidated `$request->getParsedBody()`); rule class names must exist in the installed `yiisoft/validator` (`Length`, `StringValue`, `Integer` — not Yii2-style `HasLength`/`IsString`) — see `references/validation-and-forms.md`.
   - **PSR-3 Logging:** Application code must inject `Psr\Log\LoggerInterface` (never the concrete `Yiisoft\Log\Logger`, no static `Yii::getLogger()`/`Yii::error()`), and `LoggerInterface::class` must be bound in DI with explicit targets — see `references/logging.md`.
   - **CSRF Protection:** State-changing HTML forms and session-based routes must be protected by `CsrfTokenMiddleware`, registered **after** `SessionMiddleware` and **before** `Router`; forms must render the `_csrf` hidden field from `CsrfTokenInterface`. SPAs use `CsrfHeaderMiddleware` / `CsrfTokenCookieMiddleware` instead. Purely stateless JSON APIs authenticated by tokens (e.g. JWT) are **outside the CSRF gate** — do not flag them. See `references/http-state.md` §5.
   - **Reversible Migrations:** Every migration must implement a working, reversible `down()` method.
5. **Tests:** Run the project's tests (PHPUnit / Pest).
Merge these into `aif-gate-result` (`blockers`, `affected_files`) like any other finding.
