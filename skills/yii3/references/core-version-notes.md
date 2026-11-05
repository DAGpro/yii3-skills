# Yii3 Version-Dependent Behavior Notes

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

Single catalog of version-gated behavior referenced across the skill. Every entry names the behavior, the package version that changed it, how to verify the installed version in the target project, and where it was verified in the package sources. Guides keep their grounded per-topic deprecation notes; this file is the cross-topic index — when a guide gains a new version-gated statement, add an entry here and link the guide.

## How to verify an installed version

1. **Preferred — `composer.lock`** at the project root: find the package under `packages` (or `packages-dev`); read `version` (strip an optional leading `v`). This is the version actually installed, unlike `composer.json` constraints.
2. **Fallback — vendor sources:** when `vendor/` exists but no lock is available, the behavior discriminators below (file/method existence checks) are authoritative.
3. **No `vendor/` at all:** follow the Signature Lookup Protocol in `SKILL.md` — request `composer install` first; otherwise flag every API used as "not verified against sources" in the report.

## Catalog

### R1 Router static route & group factories deprecated (router 4.0.3)

- **Behavior/API:** static factories `Route::get()/post()/put()/delete()/patch()/head()/options()` and `Group::create()`.
- **Changed in:** `yiisoft/router` **4.0.3** (Chg #295; constructors & verb classes introduced in the same release, #193).
- **Replacement:** `new \Yiisoft\Router\Route\Get('/path')` (also Post, Put, Delete, Patch, Head, Options), `new \Yiisoft\Router\Group()`.
- **Verify:** `composer.lock` → `yiisoft/router` `version`; below 4.0.3 the verb classes do not exist (static factories are then the only syntax — a warning, not an error). Vendor discriminator: `vendor/yiisoft/router/src/Route/Get.php` exists.
- **Grounding:** cloned sources — `src/Route/Get.php` exists; `Route::get()` etc. carry `@deprecated Use new \Yiisoft\Router\Route\Get() instead`; `CHANGELOG.md` §4.0.3. See [Routing Guide, §1.1](http-routes-definition.md#11-dedicated-http-verb-classes).

### R2 ViewRenderer → WebViewRenderer (yii-view-renderer 7.4.0)

- **Behavior/API:** `Yiisoft\Yii\View\Renderer\ViewRenderer` (legacy `render(): DataResponse`).
- **Changed in:** `yiisoft/yii-view-renderer` **7.4.0** — `ViewRenderer` marked `@deprecated`, `WebViewRenderer` introduced (Chg #144).
- **Replacement:** `Yiisoft\Yii\View\Renderer\WebViewRenderer` (`render(): ResponseInterface`; layout defaults to none when unset).
- **Verify:** `composer.lock` → `yiisoft/yii-view-renderer` `version`; vendor discriminator: `vendor/yiisoft/yii-view-renderer/src/WebViewRenderer.php` exists.
- **Grounding:** cloned sources — `src/ViewRenderer.php` docblock `@deprecated Use WebViewRenderer instead`; `CHANGELOG.md` §7.4.0. See [Feature Recipes, §7](core-feature-recipes.md#7-verified-pitfalls--deprecations).

### R3 MiddlewareDispatcher::withMiddlewares() deprecated (middleware-dispatcher 5.5.0)

- **Behavior/API:** `MiddlewareDispatcher::withMiddlewares()`.
- **Changed in:** `yiisoft/middleware-dispatcher` **5.5.0**.
- **Replacement:** pass `middlewareDefinitions` to the constructor in the DI definition (`DynamicReference::to([...])`).
- **Verify:** `composer.lock` → `yiisoft/middleware-dispatcher` `version`; vendor discriminator: the `@deprecated since 5.5.0` docblock on `withMiddlewares()` in `vendor/yiisoft/middleware-dispatcher/src/MiddlewareDispatcher.php`.
- **Grounding:** cloned sources — `src/MiddlewareDispatcher.php` line 78. See [Middlewares Guide](http-middlewares.md) and the DI & Config Guide note.

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
- **Changed in:** `yiisoft/log` — deprecated now, removal in **3.0**.
- **Replacement:** constructor arguments on the target.
- **Verify:** `composer.lock` → `yiisoft/log` `version`; vendor discriminator: `@deprecated` docblocks in `vendor/yiisoft/log/src/Target.php`.
- **Grounding:** cloned sources — `src/Target.php` lines 138–265. See [Logging Guide, §4](infra-logging.md).

### R7 CurrentUser::getIdentity() never returns null (user)

- **Behavior/API:** `Yiisoft\User\CurrentUser::getIdentity()` is declared with a **non-nullable** `IdentityInterface` return type; when no user is authenticated it falls back to the guest identity factory instead of returning `null`.
- **Condition:** any current `yiisoft/user` (guest-identity fallback is part of the current contract, not a recent change — check the installed sources if the project pins an old version).
- **Replacement for null checks:** `CurrentUser::isGuest(): bool`.
- **Verify:** vendor discriminator: `vendor/yiisoft/user/src/CurrentUser.php` — `public function getIdentity(): IdentityInterface` and the `$identity ??= $this->guestIdentityFactory->create();` fallback.
- **Grounding:** cloned sources — `src/CurrentUser.php` lines 105–121; `isGuest()` at line 142. Referenced by the SKILL.md Core rules ban table (row 13).

### R8 Console migration commands use colon names (db-migration)

- **Behavior/API:** migration console commands are registered as `migrate:up`, `migrate:down`, `migrate:redo`, `migrate:history`, ... (colon separator); the slash form `migrate/up` does not exist.
- **Condition:** any current `yiisoft/db-migration` — commands declare `#[AsCommand('migrate:up', ...)]` (Symfony Console attribute).
- **Replacement:** `./yii migrate:up` etc. — see [Migrations Operations Guide, §8](persistence-migrations-operations.md).
- **Verify:** vendor discriminator: `vendor/yiisoft/db-migration/src/Command/UpdateCommand.php` carries `#[AsCommand('migrate:up', 'Applies new migrations.')]`.
- **Grounding:** cloned sources — `src/Command/UpdateCommand.php` line 43, `src/Command/DownCommand.php` line 44. Referenced by the SKILL.md Core rules ban table (row 8).

### R9 yii-middleware legacy classes deprecated (→ http-middleware)

- **Behavior/API:** `Yiisoft\Yii\Middleware\CorsAllowAll`, `ForceSecureConnection`, `HttpCache`, `TagRequest` (and `IpFilter`, to be removed in 2.0 in favor of `Yiisoft\NetworkUtilities\IpRanges`).
- **Changed in:** `yiisoft/yii-middleware` current 1.x line (deprecations present without a pinned release — verify in vendor sources).
- **Replacement:** `Yiisoft\HttpMiddleware\CorsAllowAllMiddleware`, `ForceSecureConnectionMiddleware`, `HttpCacheMiddleware`, `TagRequestMiddleware` from `yiisoft/http-middleware`.
- **Verify:** vendor discriminator: `@deprecated` docblocks in `vendor/yiisoft/yii-middleware/src/*.php`.
- **Grounding:** cloned sources — `src/CorsAllowAll.php` line 16 et al. See [Middlewares Guide anti-pattern table](http-middlewares.md).

### R10 `#[Override]` attribute ban (convention; NOT grounded in package sources)

- **Behavior/API:** the PHP 8 `#[Override]` attribute on methods is forbidden by Yii 3 conventions and stripped by Rector (`RemoveOverrideAttributeRector`).
- **Status:** **not verifiable in the cloned `yiisoft/*` sources** — no `RemoveOverrideAttributeRector` reference exists in any cloned package's `rector.php`, `.github/`, or `docs/`. Treat as a convention claim sourced from the Yii 3 team's tooling practice, not from package sources.
- **Verify:** in the target project — `composer.lock` → is `rector/rector` installed, and does the project's `rector.php` (or the adopted Yiisoft Rector preset) enable `RemoveOverrideAttributeRector`? If the preset is absent, do not flag `#[Override]` as an error; report it as a convention suggestion only.
- **Referenced by:** SKILL.md Core rules ban table (row 15).

### R11 Symfony console commands must declare #[AsCommand] (external symfony/console 6.1+)

- **Behavior/API:** `protected static $defaultName` and `$this->setDescription(...)` are deprecated in Symfony Console 6.1+ / 7.0 and are not used in Yii3; commands declare identity via the PHP 8 attribute `#[AsCommand]`.
- **Condition:** external dependency `symfony/console` ≥ 6.1 (not a `yiisoft/*` package; not cloned in the authoring library).
- **Replacement:** `#[AsCommand('name', 'description')]` on the command class.
- **Verify:** `composer.lock` → `symfony/console` `version`.
- **Grounding:** see [Console Commands Guide, §2](infra-commands.md) and [Console Testing Guide](testing-console.md).
