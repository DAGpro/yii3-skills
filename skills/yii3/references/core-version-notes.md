# Yii3 Version-Dependent Behavior Notes

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

Single catalog of version-gated behavior referenced across the skill. Every entry names the behavior, the package version that changed it, how to verify the installed version in the target project, and where it was verified in the package sources. Guides keep their grounded per-topic deprecation notes; this file is the cross-topic index — when a guide gains a new version-gated statement, add an entry here and link the guide.

## How to verify an installed version

1. **Preferred — `composer.lock`** at the project root: find the package under `packages` (or `packages-dev`); read `version` (strip an optional leading `v`). This is the version actually installed, unlike `composer.json` constraints.
2. **Fallback — vendor sources:** when `vendor/` exists but no lock is available, the behavior discriminators below (file/method existence checks) are authoritative.
3. **No `vendor/` at all:** follow the Mandatory Signature Lookup Protocol in `SKILL.md` — request `composer install` first; otherwise flag every API used as "not verified against sources" in the report.

## Catalog

### R1 Router static route & group factories deprecated (router 4.0.3)

- **Behavior/API:** static factories `Route::get()/post()/put()/delete()/patch()/head()/options()` and `Group::create()`.
- **Changed in:** `yiisoft/router` **4.0.3** (Chg #295; constructors & verb classes introduced in the same release, #193).
- **Replacement:** `new \Yiisoft\Router\Route\Get('/path')` (also Post, Put, Delete, Patch, Head, Options), `new \Yiisoft\Router\Group()`.
- **Verify:** `composer.lock` → `yiisoft/router` `version`; below 4.0.3 the verb classes do not exist (static factories are then the only syntax — a warning, not an error). Vendor discriminator: `vendor/yiisoft/router/src/Route/Get.php` exists.
- **Grounding:** cloned sources — `src/Route/Get.php` exists; `Route::get()` etc. carry `@deprecated Use new \Yiisoft\Router\Route\Get() instead`; `CHANGELOG.md` §4.0.3. See [Routing Guide, §1.1](http-routes-definition.md#11-dedicated-http-verb-classes).

### R2 ViewRenderer → WebViewRenderer (yii-view-renderer 7.4.0)

- **Behavior/API:** `Yiisoft\Yii\View\Renderer\ViewRenderer` (legacy `render(): DataResponse`).
- **Changed in:** `yiisoft/yii-view-renderer` **7.4.0** — `ViewRenderer` marked `@deprecated`, `WebViewRenderer` introduced (New #144).
- **Replacement:** `Yiisoft\Yii\View\Renderer\WebViewRenderer` (`render(): ResponseInterface`; layout defaults to none when unset).
- **Verify:** `composer.lock` → `yiisoft/yii-view-renderer` `version`; vendor discriminator: `vendor/yiisoft/yii-view-renderer/src/WebViewRenderer.php` exists.
- **Grounding:** cloned sources — `src/ViewRenderer.php` docblock `@deprecated Use WebViewRenderer instead`; `CHANGELOG.md` §7.4.0. See [Feature Recipes, §7](core-feature-recipes.md#7-verified-pitfalls--deprecations).

### R3 MiddlewareDispatcher::withMiddlewares() deprecated (middleware-dispatcher 5.5.0)

- **Behavior/API:** `MiddlewareDispatcher::withMiddlewares()`.
- **Changed in:** `yiisoft/middleware-dispatcher` **5.5.0**.
- **Replacement:** pass `middlewareDefinitions` to the constructor in the DI definition (`DynamicReference::to([...])`).
- **Verify:** `composer.lock` → `yiisoft/middleware-dispatcher` `version`; vendor discriminator: the `@deprecated since 5.5.0` docblock on `withMiddlewares()` in `vendor/yiisoft/middleware-dispatcher/src/MiddlewareDispatcher.php`.
- **Grounding:** cloned sources — `src/MiddlewareDispatcher.php` line 78. See [Middlewares Guide](http-middlewares.md).

### R4 Legacy data-response classes & middlewares deprecated (data-response 2.2.0)

- **Behavior/API:** `DataResponse`, `DataResponseFactory`, root-namespace `DataResponseFactoryInterface`, `DataResponseFormatterInterface`, `ContentNegotiator`, and the `Middleware\FormatDataResponse*` middlewares.
- **Changed in:** `yiisoft/data-response` **2.2.0** (Chg #107).
- **Replacement:** `Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface` (+ `DataResponseFactory`, `JsonResponseFactory`, ...), `FormatterInterface` implementations, and `Middleware\DataResponseMiddleware` (+ `JsonDataResponseMiddleware`, `ContentNegotiatorDataResponseMiddleware`, ...).
- **Verify:** `composer.lock` → `yiisoft/data-response` `version`; check which classes exist under `vendor/yiisoft/data-response/src/Middleware/`.
- **Grounding:** cloned sources — `src/Middleware/FormatDataResponse.php` `@deprecated Use DataResponseMiddleware instead`; `CHANGELOG.md` §2.2.0. See [Routing Guide anti-pattern table](http-routes.md).

### R5 Logger trace setters deprecated (log 2.1, removal 3.0)

- **Behavior/API:** `Logger::setTraceLevel()`, `Logger::setExcludedTracePaths()` (also throw with a custom context provider).
- **Changed in:** `yiisoft/log` **2.1**, removal in **3.0**.
- **Replacement:** constructor arguments on the logger / targets.
- **Verify:** `composer.lock` → `yiisoft/log` `version`; vendor discriminator: `@deprecated since 2.1` docblocks in `vendor/yiisoft/log/src/Logger.php`.
- **Grounding:** cloned sources — `src/Logger.php` lines 104/171/193. See [Logging Guide, §4](infra-logging.md).

### R6 Target setters deprecated (log, removal 3.0)

- **Behavior/API:** `Target` setters — `setLevels()`, `setCategories()`, `setExcept()`, `setFormat()`, `setPrefix()`, `setExportInterval()`, `setTimestampFormat()`, `setEnabled()`.
- **Changed in:** `yiisoft/log` **2.2.2** (under development, Enh #146 — `Target` configuration moved to constructor parameters and the corresponding setters deprecated); removal in **3.0** (docblocks). The `$levels` constructor parameter that replaces `setLevels()` exists since **2.2.0** (New #125).
- **Replacement:** constructor arguments on the target.
- **Verify:** `composer.lock` → `yiisoft/log` `version` (the clone pins 2.2.2 under development — check for a released 2.2.2+ before treating the setter deprecations as shipped); vendor discriminator: `@deprecated To be removed in 3.0` docblocks in `vendor/yiisoft/log/src/Target.php`.
- **Grounding:** cloned sources — `src/Target.php` lines 138–284; `CHANGELOG.md` §2.2.2 (Enh #146), §2.2.0 (New #125). See [Logging Guide, §4](infra-logging.md).

### R7 CurrentUser::getIdentity() never returns null (user)

- **Behavior/API:** `Yiisoft\User\CurrentUser::getIdentity()` is declared with a **non-nullable** `IdentityInterface` return type; when no user is authenticated it falls back to the guest identity factory instead of returning `null`.
- **Condition:** any current `yiisoft/user` (guest-identity fallback is part of the current contract, not a recent change — check the installed sources if the project pins an old version).
- **Replacement for null checks:** `CurrentUser::isGuest(): bool`.
- **Verify:** vendor discriminator: `vendor/yiisoft/user/src/CurrentUser.php` — `public function getIdentity(): IdentityInterface` and the `$identity ??= $this->guestIdentityFactory->create();` fallback.
- **Grounding:** cloned sources — `src/CurrentUser.php` lines 105–121; `isGuest()` at line 142.

### R8 Console migration commands use colon names (db-migration)

- **Behavior/API:** migration console commands are registered as `migrate:up`, `migrate:down`, `migrate:redo`, `migrate:history`, ... (colon separator); the slash form `migrate/up` does not exist.
- **Condition:** any current `yiisoft/db-migration` — commands declare `#[AsCommand('migrate:up', ...)]` (Symfony Console attribute).
- **Replacement:** `./yii migrate:up` etc. — see [Migrations Operations Guide, §8](persistence-migrations-operations.md).
- **Verify:** vendor discriminator: `vendor/yiisoft/db-migration/src/Command/UpdateCommand.php` carries `#[AsCommand('migrate:up', 'Applies new migrations.')]`.
- **Grounding:** cloned sources — `src/Command/UpdateCommand.php` line 43, `src/Command/DownCommand.php` line 44.

### R9 yii-middleware legacy classes deprecated (→ http-middleware)

- **Behavior/API:** `Yiisoft\Yii\Middleware\CorsAllowAll`, `ForceSecureConnection`, `HttpCache`, `TagRequest` (and `IpFilter`, to be removed in 2.0 in favor of `Yiisoft\NetworkUtilities\IpRanges`).
- **Changed in:** `yiisoft/yii-middleware` **1.1.0** (Chg #132 — the four middlewares marked deprecated); only the `IpFilter` removal-in-2.0 deprecation is vendor-docblock-only (no changelog pin).
- **Replacement:** full FQCNs from `yiisoft/http-middleware` — `Yiisoft\HttpMiddleware\CorsAllowAllMiddleware`, `Yiisoft\HttpMiddleware\ForceSecureConnection\ForceSecureConnectionMiddleware`, `Yiisoft\HttpMiddleware\HttpCache\HttpCacheMiddleware`, `Yiisoft\HttpMiddleware\TagRequest\TagRequestMiddleware` (three of the four live in sub-namespaces, not the package root).
- **Verify:** `composer.lock` → `yiisoft/yii-middleware` `version` (1.1.0+); vendor discriminator: `@deprecated` docblocks in `vendor/yiisoft/yii-middleware/src/*.php`.
- **Grounding:** cloned sources — `src/CorsAllowAll.php` line 16 et al. See [Middlewares Guide anti-pattern table](http-middlewares.md).

### R10 `#[Override]` attribute ban (code-style `YII_CORE` set)

- **Behavior/API:** the PHP 8 `#[Override]` attribute on methods is forbidden by Yii 3 conventions and stripped by Rector (`RemoveOverrideAttributeRector`).
- **Changed in:** `yiisoft/code-style` **1.1.0** (New #11 — the rule and the ready-to-use `SetList::YII_CORE` set were added together).
- **Status:** grounded in cloned sources — `yiisoft/code-style` ships `RemoveOverrideAttributeRector` in the `yii-core` set (`SetList::YII_CORE`).
- **Verify:** in the target project — `composer.lock` → is `rector/rector` installed, and does the project's `rector.php` (or the adopted Yiisoft Rector preset) enable `RemoveOverrideAttributeRector`? If the preset is absent, do not flag `#[Override]` as an error; report it as a convention suggestion only.
- **Grounding:** cloned sources — `src/Rector/Rules/RemoveOverrideAttributeRector.php` (rule class), `src/Rector/sets/yii-core.php` (registered in the set's rules), `README.md` Rector section ("removes the `#[Override]` attribute from methods. Yii convention is not to use this attribute"), `CHANGELOG.md` §1.1.0.

### R11 Symfony console commands must declare #[AsCommand] (external symfony/console 6.1+)

- **Behavior/API:** `protected static $defaultName` and `$this->setDescription(...)` are deprecated in Symfony Console 6.1+ / 7.0 and are not used in Yii3; commands declare identity via the PHP 8 attribute `#[AsCommand]`.
- **Condition:** external dependency `symfony/console` ≥ 6.1 (not a `yiisoft/*` package; not cloned in the authoring library).
- **Replacement:** `#[AsCommand('name', 'description')]` on the command class.
- **Verify:** `composer.lock` → `symfony/console` `version`.
- **Grounding:** see [Console Commands Guide, §2](infra-commands.md) and [Console Testing Guide](testing-console.md).

### R12 `TagReference::id()` tag-alias helper (di 1.4.0)

- **Behavior/API:** `Yiisoft\Di\Reference\TagReference::id()` — `public static function id(string $tag): string` returns the tag alias `'tag@' . $tag`, the literal container ID under which tagged definitions are registered and by which they are resolved.
- **Changed in:** `yiisoft/di` **1.4.0** (New #380).
- **Verify:** `composer.lock` → `yiisoft/di` `version`; vendor discriminator: `public static function id(string $tag): string` in `vendor/yiisoft/di/src/Reference/TagReference.php`.
- **Grounding:** cloned sources — `src/Reference/TagReference.php`; `CHANGELOG.md` §1.4.0. See [DI Container Guide, §5.1](core-di-container.md#51-service-tagging-tagreference).

### R13 `StrictFactory` (factory 1.3.0)

- **Behavior/API:** `Yiisoft\Factory\StrictFactory` — creates objects only from pre-registered definitions; constructor signature `__construct(array $definitions, ?ContainerInterface $container = null, bool $validate = true)` (definitions come first), plus `create(string $id): mixed` and `has(string $id): bool`.
- **Changed in:** `yiisoft/factory` **1.3.0** (New #214).
- **Verify:** `composer.lock` → `yiisoft/factory` `version`; vendor discriminator: `vendor/yiisoft/factory/src/StrictFactory.php` exists.
- **Grounding:** cloned sources — `src/StrictFactory.php`; `CHANGELOG.md` §1.3.0. See [DI Container Guide, §6.2](core-di-container.md#62-yiisoftfactoryfactory--strictfactory).

### R14 `CsrfMiddleware` deprecated in favor of `CsrfTokenMiddleware` (csrf 2.2.0)

- **Behavior/API:** `Yiisoft\Csrf\CsrfMiddleware` (the legacy, token-storage-agnostic middleware).
- **Changed in:** `yiisoft/csrf` **2.2.0** (Chg #71).
- **Replacement:** `Yiisoft\Csrf\CsrfTokenMiddleware`.
- **Verify:** `composer.lock` → `yiisoft/csrf` `version`; vendor discriminator: `@deprecated Use the {@see CsrfTokenMiddleware} class instead.` docblock in `vendor/yiisoft/csrf/src/CsrfMiddleware.php`.
- **Grounding:** cloned sources — `src/CsrfMiddleware.php`; `CHANGELOG.md` §2.2.0. See [State & Security Guide](http-state.md).

### R15 Template rendering removed from mailer (mailer 6.0.0)

- **Behavior/API:** `MessageInterface::compose()`, `withTemplate()`, `withLocale()`, the `MessageBodyRenderer` / `MessageBodyTemplate` classes, and the `yiisoft/view` dependency.
- **Changed in:** `yiisoft/mailer` **6.0.0** (Chg #101).
- **Replacement:** render views in application code and pass the final bodies to the message via `withHtmlBody()` / `withTextBody()`.
- **Verify:** `composer.lock` → `yiisoft/mailer` `version`; vendor discriminator: absence of `vendor/yiisoft/mailer/src/MessageBodyRenderer.php`.
- **Grounding:** cloned sources — `CHANGELOG.md` §6.0.0 (Chg #101 entries); `src/Message.php` `withHtmlBody()` / `withTextBody()`. See [Mailer Guide](infra-mailer.md).

### R16 Session `sid_length` / `sid_bits_per_character` options dropped (session 3.0.0)

- **Behavior/API:** the session options `sid_length` and `sid_bits_per_character`.
- **Changed in:** `yiisoft/session` **3.0.0** (Chg #66).
- **Replacement:** do not pass these options in the session config.
- **Verify:** `composer.lock` → `yiisoft/session` `version` (3.0.0+); vendor discriminator: no `sid_length` / `sid_bits_per_character` in `vendor/yiisoft/session/src/Session.php` option defaults.
- **Grounding:** cloned sources — `src/Session.php` (options absent); `CHANGELOG.md` §3.0.0. See [State & Security Guide, §2.1](http-state.md#21-session-api).

### R17 Session without `yiisoft/cookies` dependency + worker session-ID fix (session 3.0.3)

- **Behavior/API:** `yiisoft/session` no longer requires `yiisoft/cookies` (Enh #86), and `Session::open()` no longer reuses the previous session ID in long-running workers (Bug #25).
- **Changed in:** `yiisoft/session` **3.0.3**.
- **Verify:** `composer.lock` → `yiisoft/session` `version` (3.0.3+); vendor discriminator: no `yiisoft/cookies` in the installed package's `composer.json` `require` section.
- **Grounding:** cloned sources — `composer.json` (no `yiisoft/cookies` in `require`); `src/Session.php` (session-ID reset before open); `CHANGELOG.md` §3.0.3. See [State & Security Guide, §6](http-state.md#6-worker-mode-notes).

### R18 Widgets usable without factory initialization (widget 2.2.0)

- **Behavior/API:** widgets can be instantiated and rendered without calling `WidgetFactory::initialize()` first, and `WidgetFactoryInitializationException` is deprecated (no longer thrown; will be removed in 3.0).
- **Changed in:** `yiisoft/widget` **2.2.0** (Chg #99 — exception deprecated; Enh #99 — no-factory usage).
- **Verify:** `composer.lock` → `yiisoft/widget` `version` (2.2.0+); vendor discriminator: `@deprecated Will be removed in version 3.0.` docblock in `vendor/yiisoft/widget/src/WidgetFactoryInitializationException.php`.
- **Grounding:** cloned sources — `src/WidgetFactoryInitializationException.php`; `CHANGELOG.md` §2.2.0. See [Widgets & Assets Guide, §7.2](http-widgets-and-assets.md#72-widget-life-cycle-factory--themes-widgetfactory-in-22).

### R19 `FileHelper::clearDirectory()` filter option (files 2.1.0)

- **Behavior/API:** `FileHelper::clearDirectory()` accepts a `filter` option (a `PathMatcherInterface`) in its `$options` array, keeping matching paths while clearing the directory.
- **Changed in:** `yiisoft/files` **2.1.0** (New #47).
- **Verify:** `composer.lock` → `yiisoft/files` `version` (2.1.0+); vendor discriminator: `$filter = self::getFilter($options)` inside `clearDirectory()` in `vendor/yiisoft/files/src/FileHelper.php`.
- **Grounding:** cloned sources — `src/FileHelper.php`; `CHANGELOG.md` §2.1.0. See [File Handling Guide](http-file-handling.md).

### R20 Download response MIME auto-detection (response-download 1.1.0)

- **Behavior/API:** when `$mimeType` is `null`, the download response factory guesses the content MIME type automatically (finfo), falling back to `application/octet-stream`.
- **Changed in:** `yiisoft/response-download` **1.1.0** (Enh #28).
- **Verify:** `composer.lock` → `yiisoft/response-download` `version` (1.1.0+); vendor discriminator: "it will be guessed based on the file" wording on the `$mimeType` parameter in `vendor/yiisoft/response-download/src/DownloadResponseFactory.php`.
- **Grounding:** cloned sources — `src/DownloadResponseFactory.php`; `CHANGELOG.md` §1.1.0. See [File Handling Guide](http-file-handling.md).

### R21 `ThrowableResponseFactory` moved to root namespace (error-handler 5.0.0)

- **Behavior/API:** `Yiisoft\ErrorHandler\Factory\ThrowableResponseFactory` (deprecated convenience factory) is removed.
- **Changed in:** `yiisoft/error-handler` **5.0.0** (under development, Chg #162).
- **Replacement:** `Yiisoft\ErrorHandler\ThrowableResponseFactory` (root namespace) or inject `ThrowableResponseFactoryInterface` via DI.
- **Verify:** `composer.lock` → `yiisoft/error-handler` `version`; vendor discriminator: absence of `vendor/yiisoft/error-handler/src/Factory/ThrowableResponseFactory.php`.
- **Grounding:** cloned sources — `src/ThrowableResponseFactory.php` (`final class ThrowableResponseFactory implements ThrowableResponseFactoryInterface`); `CHANGELOG.md` §5.0.0 under development. See [Error Handling Guide, §11](infra-error-handling.md#11-anti-pattern-matrix).

### R22 `Ttl` value object for cache TTLs (cache 3.2.0)

- **Behavior/API:** `Yiisoft\Cache\Ttl` — immutable value object representing a time-to-live duration; named constructors `Ttl::seconds()`, `Ttl::minutes()`, `Ttl::hours()`, `Ttl::days()`, `Ttl::forever()`, plus `Ttl::create()` and `Ttl::from()`; `Cache::__construct()` accepts `Ttl|DateInterval|int|null` as `$defaultTtl`.
- **Changed in:** `yiisoft/cache` **3.2.0** (New #150).
- **Verify:** `composer.lock` → `yiisoft/cache` `version` (3.2.0+); vendor discriminator: `vendor/yiisoft/cache/src/Ttl.php` exists.
- **Grounding:** cloned sources — `src/Ttl.php`, `src/Cache.php` constructor; `CHANGELOG.md` §3.2.0. See [Caching Guide, §1.3](persistence-caching.md#13-value-object-ttl-cache-320).

### R23 Codeception floor `^5.3.5` (testing stack)

- **Behavior/API:** the Codeception floor used by the official Yii 3 application templates: `codeception/codeception` `^5.3.5` (web + API templates), `^5.2.2` (console template).
- **Condition:** external dependency `codeception/codeception` (not a `yiisoft/*` package; not cloned in the authoring library).
- **Verify:** `composer.lock` → `codeception/codeception` `version`; project-side check: the require-dev constraint in the project's `composer.json`.
- **Grounding:** app template manifests in the cloned library — `yiisoft/app` and `yiisoft/app-api` pin `^5.3.5`, `yiisoft/app-console` pins `^5.2.2`. See [Codeception Testing Guide, §1.1](testing-codeception.md#11-installation).

### R24 Sentry cron-monitor thresholds require `sentry/sentry` 4.4+ (external)

- **Behavior/API:** the cron-monitor config keys `failureIssueThreshold` and `recoveryThreshold` are forwarded to the SDK's `MonitorConfig` only when the installed `sentry/sentry` supports them (added in the SDK in 4.4); older SDK versions silently omit them.
- **Condition:** external dependency `sentry/sentry` ≥ 4.4 (not a `yiisoft/*` package; not cloned in the authoring library). The `yiisoft/yii-sentry` integration itself requires `sentry/sentry` `^4.0`.
- **Verify:** `composer.lock` → `sentry/sentry` `version`.
- **Grounding:** cloned sources — `yiisoft/yii-sentry` `src/SentryCronMonitor.php` ("These `MonitorConfig` parameters were added in sentry/sentry 4.4." — version-gated forwarding) and `README.md` ("requires sentry/sentry 4.4+"). See [Error Handling Ops Guide, §8.3](infra-error-handling-ops.md).
