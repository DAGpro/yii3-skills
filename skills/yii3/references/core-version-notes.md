# Yii3 Version-Dependent Behavior Notes

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

Single catalog of version-gated behavior referenced across the skill. Every row names the behavior, the package version that changed it, and how to verify the installed version in the target project. Grounded in the topic guides (linked per row) and the cloned package sources.

## How to verify an installed version

1. **Preferred — `composer.lock`** at the project root: find the package under `packages` (or `packages-dev`); read `version` (strip an optional leading `v`). This is the version actually installed, unlike `composer.json` constraints.
2. **Fallback — vendor sources:** when `vendor/` exists but no lock is available, the behavior discriminators below (file/method existence checks) are authoritative.
3. **No `vendor/` at all:** follow the Signature Lookup Protocol in `SKILL.md` — request `composer install` first; otherwise flag every API used as "not verified against sources" in the report.

## Catalog

| # | Behavior / API | Changed in | Replacement on modern versions | Verify in `composer.lock` / vendor |
|---|---|---|---|---|
| 1 | Static route & group factories `Route::get()/post()/put()/delete()/patch()/head()/options()` and `Group::create()` | Deprecated in `yiisoft/router` **4.0.3** (Chg #295); constructors & verb classes introduced in the same release (#193) | `new \Yiisoft\Router\Route\Get('/path')` (also Post, Put, Delete, Patch, Head, Options), `new \Yiisoft\Router\Group()` | `composer.lock` → `yiisoft/router` `version`; below 4.0.3 the verb classes do not exist (static factories are then the only syntax — a warning, not an error). Discriminator in vendor sources: `vendor/yiisoft/router/src/Route/Get.php` exists. See [Routing Guide, §1.1](http-routes-definition.md#11-dedicated-http-verb-classes) |
| 2 | `Yiisoft\Yii\View\Renderer\ViewRenderer` (legacy `render(): DataResponse`) | `@deprecated` since `yiisoft/yii-view-renderer` **7.4.0** | `Yiisoft\Yii\View\Renderer\WebViewRenderer` (`render(): ResponseInterface`; layout defaults to none when unset) | `composer.lock` → `yiisoft/yii-view-renderer` `version`; discriminator: `vendor/yiisoft/yii-view-renderer/src/WebViewRenderer.php` exists. See [Feature Recipes, §7](core-feature-recipes.md#7-verified-pitfalls--deprecations) |
| 3 | `MiddlewareDispatcher::withMiddlewares()` | Deprecated since `yiisoft/middleware-dispatcher` **5.5.0** | Pass `middlewareDefinitions` to the constructor in the DI definition (`DynamicReference::to([...])`) | `composer.lock` → `yiisoft/middleware-dispatcher` `version`. See [Middlewares Guide anti-pattern table](http-middlewares.md) |
| 4 | `Yiisoft\DataResponse\Middleware\FormatDataResponse` and the `Yiisoft\DataResponse\DataResponseFactoryInterface` (old namespace) | Deprecated in `yiisoft/data-response` (verify exact version in vendor sources) | `Yiisoft\DataResponse\Middleware\DataResponseMiddleware`; `Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface` | `composer.lock` → `yiisoft/data-response` `version`; check which middleware classes exist under `vendor/yiisoft/data-response/src/Middleware/`. See [Routing Guide anti-pattern table](http-routes.md) |
| 5 | `Logger::setTraceLevel()` / `setExcludedTracePaths()` | Deprecated since `yiisoft/log` **2.1**, removal in 3.0 (they also throw with a custom context provider) | Constructor arguments on the logger / targets | `composer.lock` → `yiisoft/log` `version`. See [Logging Guide, §4](infra-logging.md) |
| 6 | `Target` setters (`setLevels()`, `setCategories()`, `setExcept()`, `setFormat()`, `setPrefix()`, `setExportInterval()`, `setTimestampFormat()`, `setEnabled()`) | Deprecated, to be removed in `yiisoft/log` **3.0** | Constructor arguments on the target | `composer.lock` → `yiisoft/log` `version`. See [Logging Guide, §4](infra-logging.md) |

## Rules for guides

- Guides keep their grounded per-topic deprecation notes; this file is the cross-topic index — when a guide gains a new version-gated statement, add a row here and link the guide.
- Never state version-gated syntax without anchoring the row above (or a new grounded row) — zero-hallucination policy from `SKILL.md` Core rule 2 applies to version facts as well.
