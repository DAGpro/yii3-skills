# Yii3 package catalog

> Generated from `scripts/package-catalog.json` (`node scripts/validate.mjs --gen`). **verified** = package exists (seen on Packagist/yiisoft demo), NOT that its API is known. **unverified** = from memory: confirm with `composer show -a <pkg>` first.

| Key | Need | Packages | Choose one of | Exists | Notes |
|---|---|---|---|---|---|
| router | Routing | `yiisoft/router` | `yiisoft/router-fastroute` | verified | router-fastroute is the usual implementation |
| http | HTTP app runner / handlers | `yiisoft/yii-http`, `yiisoft/yii-runner-http`, `yiisoft/middleware-dispatcher` |  | verified | Normally already in the app template |
| di | DI container | `yiisoft/di`, `yiisoft/definitions`, `yiisoft/injector` |  | verified |  |
| config | Config plugin | `yiisoft/config` |  | verified |  |
| request | Request provider / body parser | `yiisoft/request-provider`, `yiisoft/request-body-parser` |  | verified |  |
| input | Request -> DTO input | `yiisoft/input-http` |  | verified | usually together with yiisoft/hydrator and yiisoft/validator |
| response | JSON/data responses | `yiisoft/data-response` |  | verified |  |
| validation | Validation | `yiisoft/validator` |  | unverified |  |
| hydrator | Hydrator | `yiisoft/hydrator` |  | unverified |  |
| forms | Forms / HTML | `yiisoft/form`, `yiisoft/html` |  | verified |  |
| view | Views / layouts | `yiisoft/view`, `yiisoft/yii-view-renderer` |  | verified | older templates used yiisoft/yii-view; follow what the project has |
| widgets | Widgets | `yiisoft/widget` |  | verified |  |
| assets | Assets | `yiisoft/assets` |  | verified |  |
| dataview | Grids / data widgets | `yiisoft/yii-dataview`, `yiisoft/data` |  | verified |  |
| db | Database | `yiisoft/db` | `yiisoft/db-mysql`, `yiisoft/db-pgsql`, `yiisoft/db-sqlite`, `yiisoft/db-mssql`, `yiisoft/db-oracle` | unverified | driver must match the project's DB; ask/inspect docker+env first |
| migrations | DB migrations | `yiisoft/db-migration` |  | unverified |  |
| active-record | ActiveRecord | `yiisoft/active-record` |  | unverified | needs yiisoft/db; do not mix with Cycle |
| cycle | Cycle ORM | `yiisoft/yii-cycle` |  | verified | alternative ORM - ask before choosing |
| cache | Cache (PSR-16) | `yiisoft/cache` | `yiisoft/cache-file`, `yiisoft/cache-db` | verified |  |
| session | Session | `yiisoft/session` |  | verified |  |
| cookies | Cookies | `yiisoft/cookies` |  | verified |  |
| csrf | CSRF | `yiisoft/csrf` |  | verified |  |
| auth | Authentication | `yiisoft/auth`, `yiisoft/user` |  | verified |  |
| rbac | RBAC | `yiisoft/rbac` | `yiisoft/rbac-php`, `yiisoft/rbac-db` | verified |  |
| access | Access checks | `yiisoft/access` |  | verified |  |
| security | Hashing / crypto | `yiisoft/security` |  | verified |  |
| i18n | Translations | `yiisoft/translator` |  | verified | needs a message source package, check unverified |
| logging | Logging (PSR-3) | `yiisoft/log` | `yiisoft/log-target-file`, `yiisoft/log-target-db`, `yiisoft/log-target-email` | verified |  |
| events | Events (PSR-14) | `yiisoft/yii-event` |  | verified |  |
| console | Console | `yiisoft/yii-console`, `yiisoft/yii-runner-console` |  | verified |  |
| queue | Queue | `yiisoft/queue` |  | verified | yiisoft/yii-queue is deprecated in favour of yiisoft/queue; adapters are separate packages |
| mail | Mail | `yiisoft/mailer`, `yiisoft/mailer-symfony` |  | verified |  |
| mutex | Mutex / locks | `yiisoft/mutex` | `yiisoft/mutex-file` | verified |  |
| rate-limit | Rate limiting | `yiisoft/rate-limiter` |  | verified |  |
| middleware | Ready-made middleware | `yiisoft/yii-middleware` |  | verified |  |
| errors | Error handling | `yiisoft/error-handler` |  | verified |  |
| debug | Debug toolbar (dev) | `yiisoft/yii-debug`, `yiisoft/yii-debug-api` |  | verified |  |
| openapi | OpenAPI / Swagger | `yiisoft/yii-swagger` |  | verified |  |
| sentry | Sentry | `yiisoft/yii-sentry` |  | verified |  |
| codegen | Code generator (Gii) (dev) | `yiisoft/yii-gii` |  | verified |  |
| json | JSON helper | `yiisoft/json` |  | verified |  |
| testing | Test helpers (dev) | `yiisoft/test-support` |  | verified | plus phpunit/phpunit |
| code-style | Code style (dev) | `yiisoft/code-style` |  | verified |  |
