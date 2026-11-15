## Yii3 support (from yii3-skills)

Load the `yii3` skill and audit security per it — the skill is the single source of rules:

Operating context: this `aif-*` workflow runs the skill in its default AI Factory extension mode (contract: `references/instructions/core-aif-adapter.md`); the standalone fallback contract (`references/instructions/core-standalone-adapter.md`) is out of scope here.

Security-specific duties (the rules themselves live in the skill; all `references/*.md` paths resolve relative to the `yii3` skill directory):
- CSRF protection audit (`csrf` category): in Yii 3, CSRF is not automatically enabled per controller; verify that `CsrfMiddleware` (`yiisoft/csrf`) is registered in routes or web middleware pipeline for mutative methods (POST, PUT, DELETE, PATCH) per `references/packages/http-middlewares.md`. Flag web HTML forms that lack CSRF token parameters or hidden fields.
- Auth & RBAC access control (`auth` category): verify that sensitive use cases, actions, or routes explicitly enforce RBAC permissions using `ManagerInterface::userHasPermission()` per `references/packages/infra-auth-and-rbac.md`. Flag reliance on non-existent global user facades. Verify password hashing uses secure PHP algorithms (`password_hash()`, Argon2id/Bcrypt).
- SQL injection prevention (`injection` category): audit all database interactions in `yiisoft/db`, Active Record, and Cycle ORM. Mandate `:param` placeholder binding; strictly flag raw string concatenation or interpolation in SQL queries per `references/packages/persistence-db-connection-and-queries.md`.
- XSS & template sanitization (`xss` category): in view templates (`yiisoft/view`), verify user-controlled data is escaped using `Html::encode()` or template widget helpers (`yiisoft/html`), preventing raw unescaped HTML echoes per `references/packages/http-views.md`.
- Secrets management (`secrets` category): ensure secrets, database credentials, and signing keys are read exclusively from environment variables (`$_ENV` via `vlucas/phpdotenv`); strictly flag committed secrets in `config/params.php` or `config/web.php`.
- Persistent worker state isolation (`infra` & `race-condition` categories): for RoadRunner/FrankenPHP persistent worker runtimes, audit that request-specific state (user identity, flash messages, query state) is never retained in singleton services across requests, and verify `StateResetter` registration per `references/packages/infra-state-resetter.md`.
