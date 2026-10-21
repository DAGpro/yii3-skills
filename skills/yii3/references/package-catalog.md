# Yii3 Package Catalog & Dependency Reference

> Reference catalog of official `yiisoft/*` packages, capabilities, driver options, and companion packages.
>
> **Source of Truth:** For installed packages, inspect `vendor/yiisoft/<pkg>/src/` for exact class interfaces and method signatures. For packages not yet installed, use this catalog to identify the package name and drivers before running `composer require`.

---

## 1. Capability Quick-Lookup Matrix

| Capability Key | Concern | Primary Packages | Driver / Adapter Choices (Choose ONE) | Key Interfaces & Classes |
|---|---|---|---|---|
| `router` | HTTP Routing | `yiisoft/router` | `yiisoft/router-fastroute` | `Route`, `Group`, `RouteCollectionInterface`, `UrlGeneratorInterface` |
| `http` | HTTP App & Dispatcher | `yiisoft/yii-http`, `yiisoft/yii-runner-http`, `yiisoft/middleware-dispatcher`, `yiisoft/http` | — | `Application`, `MiddlewareDispatcher`, `Method`, `Status`, `Header` |
| `di` | Dependency Injection | `yiisoft/di`, `yiisoft/definitions`, `yiisoft/injector`, `yiisoft/factory` | — | `Container`, `Injector`, `Reference`, `DynamicReference` |
| `config` | Configuration Plugin | `yiisoft/config` | — | `Config`, `ConfigInterface`, `extra.config-plugin` |
| `request` | Request parsing & context | `yiisoft/request-provider`, `yiisoft/request-body-parser` | — | `RequestProviderInterface`, `RequestBodyParser` middleware |
| `input` | Request -> DTO Mapping | `yiisoft/input-http` | — | `RequestInputInterface`, `#[Body]`, `#[Query]`, `#[Request]`, `#[UploadedFiles]` |
| `validation` | Validation & Rules | `yiisoft/validator` | — | `ValidatorInterface`, `Result`, `RuleInterface`, `#[Rule]` attributes |
| `hydrator` | Object Hydration | `yiisoft/hydrator`, `yiisoft/hydrator-validator` | — | `HydratorInterface`, `TypeCasterInterface` |
| `response` | Data / JSON Responses | `yiisoft/data-response` | — | `ResponseFactory\DataResponseFactoryInterface`, `DataResponse` |
| `forms` | HTML Forms & Widgets | `yiisoft/form`, `yiisoft/form-model`, `yiisoft/html` | — | `FormModel`, `Form`, `Field`, `Html` |
| `view` | Templates & Rendering | `yiisoft/view`, `yiisoft/yii-view-renderer` | `yiisoft/bootstrap5` \| `yiisoft/yii-bulma` \| `yiisoft/view-twig` | `ViewRenderer`, `WebView`, `ViewInterface` |
| `widgets` | UI Components | `yiisoft/widget`, `yiisoft/yii-widgets` | — | `Widget`, `Block` |
| `assets` | Asset Bundles (CSS/JS) | `yiisoft/assets` | — | `AssetManager`, `AssetBundle` |
| `dataview` | Grids, Lists, Paging UI | `yiisoft/yii-dataview`, `yiisoft/data` | — | `GridView`, `ListView`, `DetailView` |
| `data` | Data Readers & Pagination | `yiisoft/data` | `yiisoft/data-db` (plain DB/AR) \| `yiisoft/data-cycle` (Cycle) | `OffsetPaginator`, `Sort`, `DataReaderInterface`, `CountableDataInterface` |
| `db` | Database Abstraction | `yiisoft/db` | `yiisoft/db-mysql` \| `yiisoft/db-pgsql` \| `yiisoft/db-sqlite` \| `yiisoft/db-mssql` \| `yiisoft/db-oracle` | `ConnectionInterface`, `Query`, `CommandInterface`, `TransactionInterface` |
| `migrations` | DB Schema Migrations | `yiisoft/db-migration` | (uses DB driver above) | `MigrationBuilder`, `./yii migrate` commands |
| `active-record` | Active Record ORM | `yiisoft/active-record` | (requires `yiisoft/db` + driver) | `ActiveRecord`, `ActiveQuery` |
| `cycle` | Cycle ORM (alternative) | `yiisoft/yii-cycle`, `cycle/orm` | (pairs with `yiisoft/data-cycle`) | `EntityManagerInterface`, `Select\Repository`, `#[Entity]` |
| `cache` | Caching (PSR-16) | `yiisoft/cache` | `yiisoft/cache-file` \| `yiisoft/cache-redis` \| `yiisoft/cache-db` \| `yiisoft/cache-apcu` \| `yiisoft/cache-memcached` | `CacheInterface` |
| `session` | Session Handling | `yiisoft/session` | — | `SessionInterface`, `SessionMiddleware`, `FlashInterface` |
| `cookies` | Cookie Management | `yiisoft/cookies` | — | `Cookie`, `CookieCollection` |
| `csrf` | CSRF Protection | `yiisoft/csrf` | — | `CsrfMiddleware`, `CsrfTokenInterface` |
| `auth` | Authentication Core | `yiisoft/auth`, `yiisoft/user` | `yiisoft/auth-jwt` (API tokens) \| session auth | `IdentityInterface`, `IdentityRepositoryInterface`, `CurrentUser` |
| `rbac` | Role-Based Access | `yiisoft/rbac` | `yiisoft/rbac-db` \| `yiisoft/rbac-php` \| `yiisoft/rbac-cycle-db` | `ManagerInterface`, `Permission`, `Role`, `RuleInterface` |
| `access` | Access Checking | `yiisoft/access` | — | `AccessCheckerInterface` |
| `security` | Cryptography & Hashing | `yiisoft/security` | — | `PasswordHasher`, `Random`, `TokenMasker` |
| `i18n` | Translations (i18n) | `yiisoft/translator`, `yiisoft/i18n` | `yiisoft/translator-message-php` \| `yiisoft/translator-message-db` \| `yiisoft/translator-message-gettext` | `TranslatorInterface`, `CategorySource` |
| `logging` | Logging (PSR-3) | `yiisoft/log` | `yiisoft/log-target-file` \| `yiisoft/log-target-db` \| `yiisoft/log-target-email` \| `yiisoft/log-target-syslog` | `LoggerInterface`, `Target` |
| `events` | Event Dispatching (PSR-14) | `yiisoft/event-dispatcher`, `yiisoft/yii-event` | — | `EventDispatcherInterface`, `ListenerProviderInterface` |
| `console` | CLI Application | `yiisoft/yii-console`, `yiisoft/yii-runner-console` | (Symfony Console bridge) | `Application`, `ExitCode`, `config/console/params.php` |
| `queue` | Background Queue | `yiisoft/queue` | `yiisoft/queue-db` \| `yiisoft/queue-redis` \| `yiisoft/queue-amqp` | `QueueInterface`, `MessageInterface`, `JobInterface` |
| `mutex` | Distributed Locks | `yiisoft/mutex` | `yiisoft/mutex-file` \| `yiisoft/mutex-pdo-mysql` \| `yiisoft/mutex-pdo-pgsql` \| `yiisoft/mutex-redis` | `MutexInterface`, `MutexFactoryInterface` |
| `mail` | Email Sending | `yiisoft/mailer` | `yiisoft/mailer-symfony` (Symfony transport) | `MailerInterface`, `MessageInterface` |
| `rate-limit` | Rate Limiting | `yiisoft/rate-limiter` | (uses cache backend) | `CounterInterface`, `LimitRequestsMiddleware` |
| `middleware` | Ready-Made Middleware | `yiisoft/yii-middleware`, `yiisoft/http-middleware` | — | `CorsAllowAllMiddleware`, `RedirectMiddleware`, `SubFolderMiddleware` |
| `errors` | Error Handling & Pages | `yiisoft/error-handler`, `yiisoft/friendly-exception` | `yiisoft/yii-sentry` (monitoring) | `ErrorHandler`, `FriendlyExceptionInterface` |
| `debug` | Debug Toolbar & API | `yiisoft/yii-debug`, `yiisoft/yii-debug-api`, `yiisoft/yii-debug-viewer` | — | install via `require-dev` |
| `openapi` | Swagger / OpenAPI Docs | `yiisoft/yii-swagger` | — | `SwaggerService`, `SwaggerUi` |
| `codegen` | Code Generator Gii | `yiisoft/yii-gii` | — | install via `require-dev` |
| `testing` | Test Helpers | `yiisoft/test-support`, `yiisoft/yii-testing` | `phpunit/phpunit` (standard) \| `testo/testo` (exclusive) | PSR doubles, test cases |
| `code-style` | CS-Fixer Rules | `yiisoft/code-style` | — | install via `require-dev` |
| `utilities` | Common String/File/JSON | `yiisoft/arrays`, `yiisoft/files`, `yiisoft/json`, `yiisoft/strings`, `yiisoft/aliases` | — | Static helper classes with strict types |

---

## 2. Driver & Storage Selection Rules (Pick Exactly ONE per Family)

Every target application must pick a consistent storage driver for each infrastructure family:

| Infrastructure Concern | Available Driver Packages | How to Select in Project |
|---|---|---|
| **Database Driver** | `yiisoft/db-mysql`<br>`yiisoft/db-pgsql`<br>`yiisoft/db-sqlite`<br>`yiisoft/db-mssql`<br>`yiisoft/db-oracle` | Check `.env`, `docker-compose.yml`, or existing connection config. In CI/testing, `yiisoft/db-sqlite` is preferred. |
| **Persistence Paradigm** | `yiisoft/db` + `yiisoft/active-record`<br>OR `yiisoft/yii-cycle` + `cycle/orm` | Check existing repositories: if `ActiveRecord` is used, stay with Active Record. If Cycle entities are present, stay with Cycle. Never mix for the same entities. |
| **Cache Storage** | `yiisoft/cache-file`<br>`yiisoft/cache-redis`<br>`yiisoft/cache-db`<br>`yiisoft/cache-apcu`<br>`yiisoft/cache-memcached` | Default for simple web apps is `yiisoft/cache-file`. For distributed/cloud, use `yiisoft/cache-redis`. |
| **Queue Transport** | `yiisoft/queue-db`<br>`yiisoft/queue-redis`<br>`yiisoft/queue-amqp` | If project already has DB without extra infra, use `queue-db`. For high-throughput async, use `queue-redis` or `queue-amqp`. |
| **Mutex Driver** | `yiisoft/mutex-file`<br>`yiisoft/mutex-pdo-mysql`<br>`yiisoft/mutex-pdo-pgsql`<br>`yiisoft/mutex-redis` | Match the project's primary database or Redis instance. |
| **RBAC Storage** | `yiisoft/rbac-db`<br>`yiisoft/rbac-php`<br>`yiisoft/rbac-cycle-db` | Use `rbac-php` for static roles/permissions checked in version control; use `rbac-db` if roles/assignments are managed via admin panel in DB. |
| **Log Targets** | `yiisoft/log-target-file`<br>`yiisoft/log-target-db`<br>`yiisoft/log-target-email`<br>`yiisoft/log-target-syslog` | One or more targets may be enabled simultaneously in `config/**/params.php`. |
| **Test Runner** | `phpunit/phpunit` (+ `yiisoft/yii-testing`)<br>OR `testo/testo` | **Mutually exclusive.** If `phpunit/phpunit` is in `composer.json`, do NOT install `testo/testo`. If `testo/testo` is used, do not install `phpunit/phpunit`. |

---

## 3. Phantom Packages (Anti-Hallucination Guard)

The following packages are commonly hallucinated by AI models but **DO NOT EXIST** as independent `yiisoft/*` packages:

| Hallucinated Package Name | What Actually Implements It in Yii3 | Correct Action |
|---|---|---|
| ❌ `yiisoft/cors` | `yiisoft/http-middleware` & `yiisoft/yii-middleware` | Use `Yiisoft\Yii\Middleware\CorsAllowAll` or configure CORS headers in middleware stack. |
| ❌ `yiisoft/http-client` | No official Yii3 HTTP client wrapper exists. | Install standard PSR-18 client: `composer require guzzlehttp/guzzle` or `symfony/http-client`. |
| ❌ `yiisoft/testo` | The vendor is `testo`, not `yiisoft`. | Use `composer require --dev testo/testo`. |
| ❌ `yiisoft/yii-queue` | Deprecated older package. | Use `composer require yiisoft/queue`. |
| ❌ `yiisoft/yii-view` | Older template package. | Use `composer require yiisoft/view yiisoft/yii-view-renderer`. |
| ❌ `yiisoft/rbac-rules` | Rules container is separate. | Use `composer require yiisoft/rbac-rules-container`. |
| ❌ `yiisoft/rest` / `yiisoft/yii-rest` | Does NOT exist in Yii3. | REST is built via `yiisoft/router` + `yiisoft/data-response` + `yiisoft/input-http` + `yiisoft/validator`. |
| ❌ `yiisoft/jwt` | Wrong package name. | Use `composer require yiisoft/auth-jwt`. |
| ❌ `yiisoft/active-form` | Split into form and model packages. | Use `composer require yiisoft/form yiisoft/form-model`. |
| ❌ `yiisoft/grid` | Dataview handles grid rendering. | Use `composer require yiisoft/yii-dataview`. |
| ❌ `yiisoft/helpers` | Split into discrete standalone packages. | Use `yiisoft/arrays`, `yiisoft/strings`, `yiisoft/files`, `yiisoft/json`. |
| ❌ `yiisoft/db-common` | Core database abstraction is unified. | Use `composer require yiisoft/db`. |

---

## 4. Minimal Package Sets per Feature Archetype

When implementing a new feature in a target project, require only the minimal set of missing packages:

### 4.1. Web Core & Routing
```bash
composer require yiisoft/di yiisoft/config yiisoft/router yiisoft/router-fastroute yiisoft/middleware-dispatcher yiisoft/yii-http yiisoft/yii-runner-http
```

### 4.2. Database with Plain DB or Active Record
```bash
# Plain DB:
composer require yiisoft/db yiisoft/db-migration yiisoft/db-mysql yiisoft/aliases

# Active Record:
composer require yiisoft/db yiisoft/db-migration yiisoft/active-record yiisoft/db-mysql yiisoft/aliases
```

### 4.3. Database with Cycle ORM
```bash
composer require yiisoft/yii-cycle yiisoft/data-cycle yiisoft/db yiisoft/db-migration yiisoft/db-mysql
```

### 4.4. REST API Endpoint with Validation
```bash
composer require yiisoft/data-response yiisoft/input-http yiisoft/validator yiisoft/hydrator yiisoft/hydrator-validator
```

### 4.5. CLI / Console Commands
```bash
composer require yiisoft/yii-console yiisoft/yii-runner-console
```

### 4.6. Authentication & RBAC
```bash
composer require yiisoft/user yiisoft/auth yiisoft/session yiisoft/security yiisoft/rbac yiisoft/rbac-db
```

### 4.7. Async Jobs & Queue
```bash
composer require yiisoft/queue yiisoft/queue-db yiisoft/mutex yiisoft/mutex-pdo-mysql
```

### 4.8. HTML Web Form with Widgets
```bash
composer require yiisoft/form yiisoft/form-model yiisoft/html yiisoft/view yiisoft/yii-view-renderer yiisoft/assets yiisoft/csrf
```

---

## 5. Verification Protocol in Target Project

1. Always check `composer.json` before proposing `composer require`.
2. After installing, inspect `vendor/yiisoft/<pkg>/src/` for public methods, constructor arguments, and return types.
3. Verify that `config/.merge-plan.php` was updated by `yiisoft/config`.
4. Check package default parameters in `vendor/yiisoft/<pkg>/config/params.php` before overriding them in project configuration.
