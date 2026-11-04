# Yii3 Package Catalog & Dependency Reference

> Reference catalog of official `yiisoft/*` packages, capabilities, driver options, and companion packages.
>
> **Source of Truth:** For installed packages, inspect `vendor/yiisoft/<pkg>/src/` for exact class interfaces and method signatures. For packages not yet installed, use this catalog to identify the package name and drivers before running `composer require`.

---

## Table of Contents
- [1. Capability Quick-Lookup Matrix](#1-capability-quick-lookup-matrix)
- [2. Architectural Layer Distribution (11 Extended Packages)](#2-architectural-layer-distribution-11-extended-packages)
- [3. Driver & Storage Selection Rules (Pick Exactly ONE per Family)](#3-driver--storage-selection-rules-pick-exactly-one-per-family)
- [4. Minimal Package Sets per Feature Archetype](#4-minimal-package-sets-per-feature-archetype)
  - [4.1. Web Core & Routing](#41-web-core--routing)
  - [4.2. Database with Plain DB or Active Record](#42-database-with-plain-db-or-active-record)
  - [4.3. Database with Cycle ORM](#43-database-with-cycle-orm)
  - [4.4. REST API Endpoint with Validation](#44-rest-api-endpoint-with-validation)
  - [4.5. CLI / Console Commands](#45-cli--console-commands)
  - [4.6. Authentication & RBAC](#46-authentication--rbac)
  - [4.7. Async Jobs & Queue](#47-async-jobs--queue)
  - [4.8. HTML Web Form with Widgets](#48-html-web-form-with-widgets)
  - [4.9. High-Performance Workers & OAuth](#49-high-performance-workers--oauth)
- [5. Package Verification Rules](#5-package-verification-rules)

---

## 1. Capability Quick-Lookup Matrix

| Capability Key | Concern | Primary Packages | Driver / Adapter Choices (Choose ONE) | Key Interfaces & Classes |
|---|---|---|---|---|
| `router` | HTTP Routing | `yiisoft/router` | `yiisoft/router-fastroute` (FastRoute) \| `yiisoft/file-router` (convention file routing) \| `yiisoft/router-composer-attribute-collector` (attribute routes collected via Composer; **experimental** — pinned to the unreleased `yiisoft/router` `dev-add-attributes` branch, see routes guide §1.4) | `Route`, `Group`, `RouteCollectionInterface`, `UrlGeneratorInterface`, `FileRouter` |
| `file-router` | Convention File Routing | `yiisoft/file-router` | — | `FileRouter` (PSR-15 middleware mapping URL paths to controller action classes by convention) |
| `http` | HTTP App & Dispatcher | `yiisoft/yii-http`, `yiisoft/yii-runner-http`, `yiisoft/middleware-dispatcher`, `yiisoft/http`, `yiisoft/psr-emitter` | — | `Application`, `MiddlewareDispatcher`, `Method`, `Status`, `Header`, `SapiEmitter` |
| `emitter` | Response Emitting (SAPI) | `yiisoft/psr-emitter` | — | `SapiEmitter`, `EmitterInterface`, `EmitterMiddleware` (sends PSR-7 responses via standard SAPI headers and echo) |
| `runners` | Application Runners & Workers | `yiisoft/yii-runner`, `yiisoft/yii-runner-http`, `yiisoft/yii-runner-console` | `yiisoft/yii-runner-roadrunner` (RoadRunner) \| `yiisoft/yii-runner-frankenphp` (FrankenPHP) | `RoadRunnerHttpApplicationRunner`, `RoadRunnerHttpWorker`, `FrankenPHPApplicationRunner`, `RequestFactory` |
| `app-templates` | Installable Application Templates | `yiisoft/app`, `yiisoft/app-api`, `yiisoft/app-console` | web (`yiisoft/app`) \| API (`yiisoft/app-api`) \| console (`yiisoft/app-console`) — pick ONE as the project skeleton (`composer create-project`); `yiisoft/requirements` is the standalone system requirements checker for verifying the target PHP environment | Canonical config/layout structure the guides assume (`config/configuration.php` scopes, `public/index.php`, `./yii` entry points) |
| `di` | Dependency Injection | `yiisoft/di`, `yiisoft/definitions`, `yiisoft/injector`, `yiisoft/factory`, `yiisoft/proxy` | — | `Container`, `Injector`, `Reference`, `DynamicReference`, `ProxyManager` |
| `config` | Configuration Plugin | `yiisoft/config` | — | `Config`, `ConfigInterface`, `extra.config-plugin` |
| `request` | Request parsing & context | `yiisoft/request-provider`, `yiisoft/request-body-parser` | — | `RequestProviderInterface`, `RequestBodyParser` middleware |
| `input` | Request -> DTO Mapping | `yiisoft/input-http` | — | `RequestInputInterface`, `#[Body]`, `#[Query]`, `#[Request]`, `#[UploadedFiles]` |
| `validation` | Validation & Rules | `yiisoft/validator` | — | `ValidatorInterface`, `Result`, `RuleInterface`, rule attributes (`#[Required]`, `#[Length]`, `#[StringValue]`) |
| `hydrator` | Object Hydration | `yiisoft/hydrator`, `yiisoft/hydrator-validator` | — | `HydratorInterface`, `TypeCasterInterface` |
| `response` | Data & Download Responses | `yiisoft/data-response`, `yiisoft/response-download` | — | `ResponseFactory\DataResponseFactoryInterface`, `DataResponse`, `DownloadResponseFactory`, `ByteRangeStream` |
| `download` | PSR-7 File Downloads | `yiisoft/response-download` | — | `DownloadResponseFactory`, `ByteRangeStream` (resumable file downloads with byte range and content disposition) |
| `forms` | HTML Forms & Widgets | `yiisoft/form`, `yiisoft/form-model`, `yiisoft/html` | — | `FormModel`, `Form`, `Field`, `Html` |
| `view` | Templates & Rendering | `yiisoft/view`, `yiisoft/yii-view-renderer` | native PHP templates (default) \| `yiisoft/view-twig` + `yiisoft/yii-twig` (Twig templates) | `ViewRenderer`, `WebView`, `ViewInterface` |
| `widgets` | UI Components | `yiisoft/widget`, `yiisoft/yii-widgets` | `yiisoft/bootstrap5` (Bootstrap 5) \| `yiisoft/yii-bulma` (Bulma) | `Widget`, `Block` |
| `assets` | Asset Bundles (CSS/JS) | `yiisoft/assets` | — | `AssetManager`, `AssetBundle` |
| `dataview` | Grids, Lists, Paging UI | `yiisoft/yii-dataview`, `yiisoft/data` | — | `GridView`, `ListView`, `DetailView` |
| `data` | Data Readers & Pagination | `yiisoft/data` | `yiisoft/data-db` (plain DB/AR) \| `yiisoft/data-cycle` (Cycle) | `OffsetPaginator`, `Sort`, `DataReaderInterface`, `CountableDataInterface` |
| `db` | Database Abstraction | `yiisoft/db` (requires the virtual `yiisoft/db-implementation`, *provided* by every driver package — install exactly one) | `yiisoft/db-mysql` \| `yiisoft/db-pgsql` \| `yiisoft/db-sqlite` \| `yiisoft/db-mssql` \| `yiisoft/db-oracle` | `ConnectionInterface`, `Query`, `CommandInterface`, `TransactionInterface` |
| `migrations` | DB Schema Migrations | `yiisoft/db-migration` | (uses DB driver above) | `MigrationBuilder`, `./yii migrate` commands |
| `active-record` | Active Record ORM | `yiisoft/active-record` | (requires `yiisoft/db` + driver) | `ActiveRecord`, `ActiveQuery` |
| `cycle` | Cycle ORM (alternative) | `yiisoft/yii-cycle`, `cycle/orm` | (pairs with `yiisoft/data-cycle`) \| `cycle/annotated` (annotated-entity mapping attributes for `cycle/orm`) | `EntityManagerInterface`, `Select\Repository`, `#[Entity]` |
| `cache` | Caching (PSR-16) | `yiisoft/cache` | `yiisoft/cache-file` \| `yiisoft/cache-redis` \| `yiisoft/cache-db` \| `yiisoft/cache-apcu` \| `yiisoft/cache-memcached` \| `yiisoft/cache-wincache` | `CacheInterface` |
| `session` | Session Handling | `yiisoft/session` | — | `SessionInterface`, `SessionMiddleware`, `FlashInterface` |
| `cookies` | Cookie Management | `yiisoft/cookies` (plus `psr/clock` only if the app injects a custom `ClockInterface` into `Cookie`) | — | `Cookie`, `CookieCollection` |
| `csrf` | CSRF Protection | `yiisoft/csrf` | — | `CsrfTokenMiddleware`, `CsrfHeaderMiddleware`, `CsrfTokenCookieMiddleware`, `CsrfTokenInterface` |
| `auth` | Authentication Core | `yiisoft/auth`, `yiisoft/user` | `yiisoft/auth-jwt` (API tokens) \| `yiisoft/yii-auth-client` (OAuth2/OIDC) \| session auth | `IdentityInterface`, `IdentityRepositoryInterface`, `CurrentUser` |
| `auth-client` | External OAuth / Social Auth | `yiisoft/yii-auth-client` | OAuth 1.0/2.0 \| OpenID Connect (Google, GitHub, Facebook, etc.) | `AuthClientInterface`, `OAuth2`, `Collection`, `AuthAction`, `AuthChoice` |
| `rbac` | Role-Based Access | `yiisoft/rbac` | `yiisoft/rbac-db` \| `yiisoft/rbac-php` \| `yiisoft/rbac-cycle-db` | `ManagerInterface`, `Permission`, `Role`, `RuleInterface` |
| `access` | Access Checking | `yiisoft/access` | — | `AccessCheckerInterface` |
| `rbac-rules` | Dynamic Rule Definitions | `yiisoft/rbac-rules-container` | — | `RuleFactoryInterface`, `RulesContainer` (params key `'yiisoft/rbac-rules-container' => ['rules' => [...], 'validate' => true]`; rule values are yiisoft/factory definitions — class-strings or alias maps) |
| `security` | Cryptography & Hashing | `yiisoft/security` | — | `PasswordHasher`, `Random`, `TokenMasker` |
| `i18n` | Translations (i18n) | `yiisoft/translator`, `yiisoft/i18n` | `yiisoft/translator-message-php` \| `yiisoft/translator-message-db` \| `yiisoft/translator-message-gettext` \| `yiisoft/translator-extractor` (dev-time message extraction, `require-dev`) | `TranslatorInterface`, `CategorySource` |
| `logging` | Logging (PSR-3) | `yiisoft/log` | `yiisoft/log-target-file` \| `yiisoft/log-target-db` \| `yiisoft/log-target-email` \| `yiisoft/log-target-syslog` | `LoggerInterface`, `Target` |
| `events` | Event Dispatching (PSR-14) | `psr/event-dispatcher`, `yiisoft/event-dispatcher`, `yiisoft/yii-event` | — | `EventDispatcherInterface`, `ListenerProviderInterface` |
| `console` | CLI Application | `yiisoft/yii-console`, `yiisoft/yii-runner-console`, `symfony/console` | (Symfony Console bridge) | `Application`, `ExitCode`, `config/console/params.php` |
| `queue` | Background Queue | `yiisoft/queue` | `yiisoft/queue-db` \| `yiisoft/queue-redis` \| `yiisoft/queue-amqp` | `QueueProducerInterface`, `QueueConsumerInterface`, `MessageInterface`, `HandlerInterface` |
| `mutex` | Distributed Locks | `yiisoft/mutex` | `yiisoft/mutex-file` \| `yiisoft/mutex-pdo-mysql` \| `yiisoft/mutex-pdo-pgsql` \| `yiisoft/mutex-pdo-oracle` \| `yiisoft/mutex-redis` | `MutexInterface`, `MutexFactoryInterface` |
| `mail` | Email Sending | `yiisoft/mailer` | `yiisoft/mailer-symfony` (Symfony transport) | `MailerInterface`, `MessageInterface` |
| `rate-limit` | Rate Limiting | `yiisoft/rate-limiter` | (uses cache backend) | `CounterInterface`, `LimitRequestsMiddleware` |
| `middleware` | Ready-Made Middleware | `yiisoft/http-middleware`, `yiisoft/yii-middleware`, `yiisoft/proxy-middleware` | — | `CorsAllowAllMiddleware`, `RedirectMiddleware`, `Subfolder`, `Locale`, `Redirect`, `TrustedHostsNetworkResolver`, `IpValidator` |
| `proxy` | Reverse Proxy & Trusted Hosts | `yiisoft/proxy-middleware` | — | `TrustedHostsNetworkResolver`, `TrustedHeaderProtocolResolver`, `IpValidator` (resolves IP/host/proto behind proxies) |
| `errors` | Error Handling & Pages | `yiisoft/error-handler`, `yiisoft/friendly-exception` | `yiisoft/yii-sentry` (monitoring) | `ErrorHandler`, `FriendlyExceptionInterface` |
| `debug` | Debug Toolbar & Profiler | `yiisoft/yii-debug`, `yiisoft/yii-debug-api`, `yiisoft/yii-debug-viewer`, `yiisoft/profiler` | — | `Profiler`, `ProfilerInterface`, `TargetInterface`, `FileTarget`, `LogTarget` (install via `require-dev`) |
| `profiler` | Performance Profiling | `yiisoft/profiler` | `FileTarget` \| `LogTarget` | `Profiler`, `ProfilerInterface`, `TargetInterface`, `FileTarget`, `LogTarget` (measures execution time and memory deltas) |
| `openapi` | Swagger / OpenAPI Docs | `yiisoft/yii-swagger` | — | `SwaggerService`, `SwaggerUi` |
| `codegen` | Code Generator Gii | `yiisoft/yii-gii` | — | install via `require-dev` |
| `testing` | Test Helpers | `yiisoft/test-support`, `yiisoft/yii-testing` | `phpunit/phpunit` (bare or under `codeception/codeception` suites) \| `testo/testo` (+ `php-testo/bridge-mockery` for Mockery) — mutually exclusive runners; mutation testing via `infection/infection` (+ `testo/bridge-infection` on Testo path) | PSR doubles, test cases |
| `code-style` | CS-Fixer Rules | `yiisoft/code-style` | — | install via `require-dev` |
| `dev-tooling` | Yii Ecosystem Maintainer Tooling | `yiisoft/yii-dev-tool` | — | Maintainer/monorepo utilities (`require-dev` / dev machines only — not an application dependency) |
| `utilities` | Common String/File/JSON/Discovery | `yiisoft/arrays`, `yiisoft/files`, `yiisoft/json`, `yiisoft/strings`, `yiisoft/aliases`, `yiisoft/classifier`, `yiisoft/network-utilities`, `yiisoft/var-dumper` | — | Static helper classes with strict types |
| `classifier` | Filesystem Class Discovery | `yiisoft/classifier` | — | `Classifier` (discovers classes by attribute, interface, or parent without reflection autoloading overhead) |
| `network` | Network & IP Utilities | `yiisoft/network-utilities` | — | `IpHelper`, `DnsHelper`, `IpRanges` (IPv4/IPv6 validation, CIDR ranges, subnet matching, DNS lookups) |
| `var-dumper` | Variable Inspection & Dump | `yiisoft/var-dumper` | — | `VarDumper`, `EchoHandler`, `StreamHandler`, `ClosureExporter` (syntax-highlighted dumping, export, and closure serialization) |

---

## 2. Architectural Layer Distribution (11 Extended Packages)

Detailed architectural breakdown of the 11 specialized packages incorporated from the ecosystem index:

| Architectural Layer | Package | Primary Concern & Purpose | Key Classes & Interfaces | Placement per Architecture Pattern |
|---|---|---|---|---|
| **HTTP & Presentation** | `yiisoft/file-router` | Convention-based file router middleware choosing controller action classes automatically by directory/namespace convention | `Yiisoft\FileRouter\FileRouter` | `Routes/` or `Presentation/` (middleware chain) |
| **HTTP & Presentation** | `yiisoft/response-download` | PSR-7 file download response factory supporting byte ranges, resumable downloads, MIME types, and web server X-Sendfile | `Yiisoft\ResponseDownload\DownloadResponseFactory`, `Yiisoft\ResponseDownload\ByteRangeStream` | `Controllers/`, `Presentation/`, or `Application/` |
| **HTTP & Presentation** | `yiisoft/proxy-middleware` | PSR-15 middleware resolving client IP, host, and protocol behind reverse proxies and CDNs (RFC 7239 `Forwarded` and `X-Forwarded-*`) | `Yiisoft\ProxyMiddleware\TrustedHostsNetworkResolver`, `Yiisoft\ProxyMiddleware\TrustedHeaderProtocolResolver`, `Yiisoft\ProxyMiddleware\IpValidator` | `Middleware/` or `Presentation/` |
| **HTTP & Presentation** | `yiisoft/psr-emitter` | SAPI response emitter transmitting PSR-7 HTTP responses to the client using standard PHP headers and chunked body output buffering | `Yiisoft\PsrEmitter\SapiEmitter`, `Yiisoft\PsrEmitter\EmitterInterface`, `Yiisoft\PsrEmitter\EmitterMiddleware` | Composition Root / HTTP entry point (`public/index.php`) |
| **Security & Auth** | `yiisoft/yii-auth-client` | External authentication via OAuth 1.0/2.0 and OpenID Connect (Google, GitHub, Facebook, etc.) with PSR-15 `AuthAction` and `AuthChoice` widget | `Yiisoft\Yii\AuthClient\AuthClientInterface`, `Yiisoft\Yii\AuthClient\OAuth2`, `Yiisoft\Yii\AuthClient\Collection`, `Yiisoft\Yii\AuthClient\AuthAction`, `Yiisoft\Yii\AuthClient\Widget\AuthChoice` | `Middleware/`, `Controllers/` (boundary) + `Application/` (ports) |
| **Runtime & Workers** | `yiisoft/yii-runner-roadrunner` | Application runner for RoadRunner high-performance daemon server supporting HTTP worker loops, gRPC, and Temporal workflows with state reset | `Yiisoft\Yii\Runner\RoadRunner\RoadRunnerHttpApplicationRunner`, `Yiisoft\Yii\Runner\RoadRunner\RoadRunnerHttpWorker`, `Yiisoft\Yii\Runner\RoadRunner\RoadRunnerGrpcApplicationRunner` | Entry points (`worker.php`, root execution) |
| **Runtime & Workers** | `yiisoft/yii-runner-frankenphp` | Application runner for FrankenPHP Caddy-based server in worker mode (`frankenphp_handle_request`) with in-memory state reset and garbage collection | `Yiisoft\Yii\Runner\FrankenPHP\FrankenPHPApplicationRunner`, `Yiisoft\Yii\Runner\FrankenPHP\RequestFactory` | Entry points (`worker.php`, `public/index.php`) |
| **DevTools & Profiling** | `yiisoft/profiler` | High-performance execution profiler measuring execution time and memory deltas between code checkpoints with pluggable storage targets | `Yiisoft\Profiler\Profiler`, `Yiisoft\Profiler\ProfilerInterface`, `Yiisoft\Profiler\Target\TargetInterface`, `Yiisoft\Profiler\Target\FileTarget`, `Yiisoft\Profiler\Target\LogTarget` | `Infrastructure/` (ports wired to app services / `require-dev`) |
| **Utilities & Discovery** | `yiisoft/classifier` | Filesystem class discovery tool locating classes by PHP 8 attributes, interfaces, or parent inheritance without autoloading reflection overhead | `Yiisoft\Classifier\Classifier` | `Infrastructure/` / Console command discovery |
| **Utilities & Discovery** | `yiisoft/network-utilities` | Network and IP manipulation utilities providing IPv4/IPv6 validation, CIDR subnet matching, IP range aliases, and DNS lookups | `Yiisoft\NetworkUtilities\IpHelper`, `Yiisoft\NetworkUtilities\DnsHelper`, `Yiisoft\NetworkUtilities\IpRanges` | `Infrastructure/Utils/` or shared library |
| **Utilities & Discovery** | `yiisoft/var-dumper` | Advanced variable dumping and closure serialization with recursion detection, depth limiting, and CLI/HTML syntax highlighting | `Yiisoft\VarDumper\VarDumper`, `Yiisoft\VarDumper\ClosureExporter`, `Yiisoft\VarDumper\Handler\EchoHandler`, `Yiisoft\VarDumper\Handler\StreamHandler` | `Infrastructure/` / Utilities (runtime — `yiisoft/rbac-php` uses `VarDumper::export()`; also useful in dev) |

---

## 3. Driver & Storage Selection Rules (Pick Exactly ONE per Family)

Every target application must pick a consistent storage driver for each infrastructure family:

| Infrastructure Concern | Available Driver Packages | How to Select in Project |
|---|---|---|
| **Database Driver** | `yiisoft/db-mysql`<br>`yiisoft/db-pgsql`<br>`yiisoft/db-sqlite`<br>`yiisoft/db-mssql`<br>`yiisoft/db-oracle` | Check `.env`, `docker-compose.yml`, or existing connection config. In CI/testing, `yiisoft/db-sqlite` is preferred. |
| **Persistence Paradigm** | `yiisoft/db` + `yiisoft/active-record`<br>OR `yiisoft/yii-cycle` + `cycle/orm` | Check existing repositories: if `ActiveRecord` is used, stay with Active Record. If Cycle entities are present, stay with Cycle. Never mix for the same entities. |
| **App Runner / Worker** | `yiisoft/yii-runner-http` (standard web)<br>`yiisoft/yii-runner-console` (CLI)<br>`yiisoft/yii-runner-roadrunner` (RoadRunner worker)<br>`yiisoft/yii-runner-frankenphp` (FrankenPHP worker) | Select based on hosting/runtime environment: standard PHP-FPM uses `runner-http`, persistent daemon runtimes use `runner-roadrunner` or `runner-frankenphp`. |
| **Cache Storage** | `yiisoft/cache-file`<br>`yiisoft/cache-redis`<br>`yiisoft/cache-db`<br>`yiisoft/cache-apcu`<br>`yiisoft/cache-memcached`<br>`yiisoft/cache-wincache` | Default for simple web apps is `yiisoft/cache-file`. For distributed/cloud, use `yiisoft/cache-redis`. |
| **Queue Transport** | `yiisoft/queue-db`<br>`yiisoft/queue-redis`<br>`yiisoft/queue-amqp` | If project already has DB without extra infra, use `queue-db`. For high-throughput async, use `queue-redis` or `queue-amqp`. |
| **Mutex Driver** | `yiisoft/mutex-file`<br>`yiisoft/mutex-pdo-mysql`<br>`yiisoft/mutex-pdo-pgsql`<br>`yiisoft/mutex-pdo-oracle`<br>`yiisoft/mutex-redis` | Match the project's primary database or Redis instance. |
| **RBAC Storage** | `yiisoft/rbac-db`<br>`yiisoft/rbac-php`<br>`yiisoft/rbac-cycle-db` | Use `rbac-php` for static roles/permissions checked in version control; use `rbac-db` if roles/assignments are managed via admin panel in DB. |
| **Log Targets** | `yiisoft/log-target-file`<br>`yiisoft/log-target-db`<br>`yiisoft/log-target-email`<br>`yiisoft/log-target-syslog` | One or more targets may be enabled simultaneously in `config/**/params.php`. |
| **Test Runner** | `phpunit/phpunit` (+ `yiisoft/yii-testing`)<br>OR `codeception/codeception` (+ modules; PHPUnit-based suites, app-template style)<br>OR `testo/testo` (+ `php-testo/bridge-mockery` for Mockery) | **Mutually exclusive.** If `phpunit/phpunit` (bare or inside Codeception suites) is in `composer.json`, do NOT install `testo/testo`. If `testo/testo` is used, do not install `phpunit/phpunit` or `codeception/codeception`. Mutation testing via `infection/infection` is orthogonal and runs above either runner (+ `testo/bridge-infection` on the Testo path). |

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
# Core Cycle ORM integration, data readers, DBAL, and migrations:
composer require yiisoft/yii-cycle yiisoft/data-cycle cycle/database cycle/migrations

# Optional: Entity Behaviors (#[CreatedAt], #[UpdatedAt], #[SoftDelete])
composer require cycle/entity-behavior

# Optional: RBAC Storage backed by Cycle ORM
composer require yiisoft/rbac yiisoft/rbac-cycle-db
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

### 4.9. High-Performance Workers & OAuth
```bash
# RoadRunner Worker (spiral/roadrunner-http, -worker, -cli, -grpc arrive transitively;
# after install run ./vendor/bin/rr get to download the rr binary, then ./rr serve):
composer require yiisoft/yii-runner-roadrunner

# FrankenPHP Worker:
composer require yiisoft/yii-runner-frankenphp

# OAuth2 / Social Authentication:
composer require yiisoft/yii-auth-client yiisoft/user yiisoft/session
```

---

## 5. Package Verification Rules

The full dependency gate — existing-installation check, install authorization, wiring verification, and package source inspection — lives in the [Dependency Protocol](core-dependency-protocol.md). When working from this catalog, additionally:

1. Resolve every capability through §1 of this catalog first, and never propose `composer require` for a package already present in `composer.json`.
2. Mind the Category A/B distinction from [Dependency Protocol §4](core-dependency-protocol.md) when deciding whether a package needs manual DI wiring (the merge-plan mechanics behind it are owned by the [DI & Configuration Guide](core-di-and-config.md), sections 2 and 2.3).
3. Before overriding a package's parameters, read its shipped defaults in `vendor/yiisoft/<pkg>/config/params.php`.

---

## Appendix: Third-Party Packages Referenced by Guides

Packages below are prescribed or used by topic guides but are not part of the yiisoft capability tables above (cascade requirement: every package a guide recommends must be findable from this catalog). Roles follow the referencing guides.

| Package | Role per guides | Referenced by |
|---|---|---|
| `psr/container` | PSR-11 container contract (`ContainerInterface`) | core-di-and-config, core-api-signatures |
| `psr/http-message` | PSR-7 contract (`UploadedFileInterface`, request/response interfaces) | core-api-signatures, core-architecture-alignment, core-feature-recipes |
| `olvlvl/composer-attribute-collector` | Composer plugin scanning classes for attribute routing | core-dependency-protocol, http-routes |
| `vlucas/phpdotenv` | `.env` loading (`require-dev` convenience in `yiisoft/app`; not a production secrets mechanism) | core-di-and-config |
| `predis/predis` | Redis client for `RedisCache` / `RedisMutexFactory` (strictly required — no PECL `\Redis`) | persistence-cache-drivers, infra-queue-mutex |
| `symfony/mailer` | Transport layer behind the `yiisoft/mailer-symfony` bridge (`^6.0\|\|^7.0\|\|^8.0`) | infra-mailer-transports |
| `symfony/finder` | Directory scanning behind `yiisoft/classifier` | core-utilities-niche |
| `sentry/sentry` | Sentry SDK behind `yiisoft/yii-sentry` (version-gated options) | infra-error-handling |
| `zircote/swagger-php` | PHP 8 attribute-based OpenAPI specification generation (v5+) | http-openapi-swagger |
| `swagger-api/swagger-ui` | Swagger UI static assets published by `SwaggerUiAsset` | http-openapi-swagger |
| `spiral/roadrunner-worker` | Base Goridge payload protocol for RoadRunner workers | infra-runtime-roadrunner |
| `spiral/roadrunner-cli` | `./vendor/bin/rr` binary download and runner | infra-runtime-roadrunner |
| `spiral/roadrunner-grpc` | gRPC worker support | infra-runtime-roadrunner |
| `temporal/sdk` | Temporal workflow SDK (RoadRunner workflows) | infra-runtime-roadrunner |
| `cycle/schema-migrations-generator` | Cycle CLI schema migrations (with `cycle/migrations`) | persistence-cycle-orm |
| `mockery/mockery` | Mocking framework (via `php-testo/bridge-mockery`) | testing-testo |
| `infection/extension-installer` | Infection Composer extension installer | testing-infection |
| `roave/infection-static-analysis-plugin` | Static-analysis-filtered mutation testing | testing-infection |
| `codeception/module-asserts`, `module-cli`, `module-rest`, `module-phpbrowser`, `lib-innerbrowser` | Codeception suites (REST module requires `module-phpbrowser` + `lib-innerbrowser` and a live served application) | testing-codeception |
| `httpsoft/http-message` | PSR-7 message and factory implementations (`ServerRequest`, `ServerRequestFactory`, `ResponseFactory`) used to build in-memory test requests and responses | testing-core, testing-http |
| `phpstan/phpstan`, `vimeo/psalm` | Static analysis linters (allowed `require-dev` per Dependency Protocol §3.2) | core-dependency-protocol |

