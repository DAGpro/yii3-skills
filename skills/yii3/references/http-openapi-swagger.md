# Yii3 OpenAPI & Swagger Integration Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Comprehensive architectural and usage guide for `yiisoft/yii-swagger`: generating OpenAPI v3 specifications from PHP 8 attributes (`zircote/swagger-php`), serving interactive Swagger UI documentation, configuring performance caching, managing multi-version APIs, and securing documentation endpoints in Yii 3 applications.

This topic is split into three focused guides — load the one that matches the task:

- [Setup & Serving](http-openapi-setup.md) — architecture overview, installation & dependency protocol, DI configuration & params, route integration for serving documentation (§1–§4).
- [Documenting Endpoints with Attributes](http-openapi-endpoints.md) — PHP 8 attribute annotations for endpoints & schemas, multi-version API documentation (§5–§6).
- [Swagger UI, CLI Generation & Operations](http-openapi-ui-and-ops.md) — offline CLI specification generator, Swagger UI customization & asset management, environment protection & performance caching (§7–§9).

Read this file for the anti-pattern table (§10) and related guides (§11).

---
## 10. Anti-Patterns & Common Traps

| # | Anti-Pattern | Why It Fails | Idiomatic Yii 3 Solution |
|---|---|---|---|
| 1 | **Setting `'cacheTTL' => null` in Dev** | `\array_key_exists('cacheTTL', $params)` activates caching with infinite TTL (`Ttl::forever()`). | Omit the `'cacheTTL'` key completely from `params.php` in development using conditional array spreading. |
| 2 | **Attaching `FormatDataResponseAsHtml` to `SwaggerUi`** | `SwaggerUi` returns a standard PSR-7 `ResponseInterface` (`ViewResponse`), not a `DataStream`. The middleware is completely ignored. | Do not attach `FormatDataResponseAsHtml` to the Swagger UI route. |
| 3 | **Using deprecated `FormatDataResponseAsJson`** | `FormatDataResponseAsJson` is deprecated. Omitting formatting entirely throws `LogicException: Formatter is not set.` | Attach modern `Yiisoft\DataResponse\Middleware\JsonDataResponseMiddleware::class` to `/swagger/json-url`. |
| 4 | **Calling `Group::create('/swagger', [...])`** | `Group::create()` takes only the prefix — a second argument is silently discarded, leaving an empty route group (canonical analysis: [Routing Guide, §9](http-routes.md#9-anti-pattern-matrix)). | Use `new Group('/swagger', [...])` or `(new Group('/swagger'))->routes(...)`. |
| 5 | **Reading path parameters via `$request->getAttribute('id')`** | In Yii 3, route match arguments are stored in `CurrentRoute`, not PSR-7 request attributes. Always evaluates to `null`. | Inject `Yiisoft\Router\CurrentRoute $currentRoute` and call `$currentRoute->getArgument('id')` or use `#[RouteArgument('id')]`. |
| 6 | **Writing custom DI factories in `config/web/di/swagger.php`** | `yiisoft/yii-swagger` already ships with `config/di-web.php` wiring `SwaggerService`, `SwaggerJson`, and `SwaggerUi`. | Configure `config/params.php` under `'yiisoft/yii-swagger'`. Avoid custom DI declarations. |
| 7 | **Using phantom methods like `withAnnotationPaths()` or `withOptions()` on `SwaggerJson`** | These methods do not exist on `SwaggerJson`. Calling them throws a fatal `Error: Call to undefined method`. | Use `SwaggerJson::withPaths(string ...$paths)` and configure generator options in `params.php` or `SwaggerService`. |
| 8 | **Passing `'processors'` in `params['options']`** | `SwaggerService::createGenerator()` does not recognize or pass `'processors'` to `Generator`. | Inject a pre-configured `OpenApi\Generator` instance into `SwaggerService` via DI. |
| 9 | **Empty `source-paths` array** | Calling `SwaggerService::fetch([])` with empty paths throws `InvalidArgumentException: Source paths cannot be empty array.` | Always provide at least one valid scanned directory alias (e.g. `'@src/Presentation'`). |
| 10 | **Missing root `#[OA\Info]` attribute** | `OpenApi\Generator::generate()` returns `null`, throwing `RuntimeException: No OpenApi target set.` | Create a dedicated `ApiDoc` class with `#[OA\Info]`, `#[OA\Server]`, and `#[OA\Tag]`. |
| 11 | **Missing `@assets` / `@assetsUrl` aliases** | `SwaggerUiAsset` publishing fails with `InvalidArgumentException: Invalid path alias: @assets`. | Register `@assets` and `@assetsUrl` in `config/common/aliases.php` or `config/params.php`. |
| 12 | **Using legacy `@OA\...` PHPDoc annotations** | PHPDoc annotations are deprecated, slower to parse, and lack PHP 8 compile-time type validation. | Use native PHP 8 attributes: `#[OA\Get]`, `#[OA\Post]`, `#[OA\Schema]`, `#[OA\Property]`. |

---

## 11. Related Topic Guides

- [Routing Guide](http-routes.md) — FastRoute syntax, route groups, regex parameter constraints, and middleware ordering.
- [Actions & Controllers Guide](http-actions-and-controllers.md) — Single-action invokable controllers, PSR-7 data responses, and request handling.
- [Validation & Forms Guide](http-validation-and-forms.md) — Request DTO validation using `yiisoft/validator` attributes and `ValidatingHydrator`.
- [PSR-15 Middlewares Guide](http-middlewares.md) — Guarding endpoints with authentication, rate limiting, and IP filtering.
- [Authentication & RBAC Guide](infra-auth-and-rbac.md) — Implementing JWT bearer tokens and OAuth 2.0 flows documented in OpenAPI security schemes.
- [Console Commands Guide](infra-commands.md) — Building Symfony Console CLI tools like offline specification generators.
- [File Handling Guide](http-file-handling.md) — Handling binary uploads (`multipart/form-data`) and stream responses.
- [Views & Widgets Guide](http-views-and-widgets.md) — View rendering and asset bundle architecture. Swagger UI view-template customization via `Theme::$pathMap` lives in §8.2 of the [OpenAPI UI & Operations Guide](http-openapi-ui-and-ops.md#82-customizing-the-html-view-template-via-themepathmap).