# Yii3 PSR-15 Middlewares Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Comprehensive guide to PSR-15 middleware architecture, official ecosystem middlewares, custom middleware recipes, registration pipelines, and security best practices in Yii3.

This topic is split into two focused guides — load the one that matches the task:

- [Pipeline Architecture, Catalog & Registration Scopes](http-middlewares-protocol.md) — PSR-15 specification, onion model, official Yii3 middlewares catalog (SessionMiddleware, CsrfTokenMiddleware), registration scopes (global, group, single route, rate limiting), and definition formats (§1, §3–§5).
- [Custom Middleware Implementation Recipes](http-middlewares-recipes.md) — Request pre-processing (correlation ID), short-circuiting API key guards, authentication via `yiisoft/auth`, response post-processing (security headers), exception mapping, and RBAC permission guards (`AccessCheckerMiddleware`) (§2).

## 6. Hidden Pitfalls & Critical Gotchas

1. **PSR-7 Immutability Trap:**
   Calling `$request->withAttribute('key', $value)` without reassigning it discards the new request instance. Downstream handlers will receive the unmodified `$request`. Always write `$request = $request->withAttribute(...);`.

2. **Session Discard on Exception:**
   `Yiisoft\Session\SessionMiddleware` wraps downstream handling in `try ... catch (Throwable $e)`. If an unhandled exception is thrown, it executes `$this->session->discard()` to prevent saving corrupted session states. If you swallow exceptions in custom middleware without re-throwing, uncommitted session changes may be committed unintentionally.

3. **Missing `RequestBodyParser` Before JSON Actions:**
   PSR-7 server request implementations (e.g. `httpsoft/http-message`) only parse standard `application/x-www-form-urlencoded` and `multipart/form-data` bodies natively. For `application/json` (or XML) requests, `$request->getParsedBody()` will return `null` unless `Yiisoft\Request\Body\RequestBodyParser` is registered in the pipeline — note that the package ships only a JSON parser out of the box; XML and other body formats require a custom parser via `withParser()`.

4. **Correct Pipeline Ordering (Outer to Inner):**
   - `ErrorCatcher` must be the outermost middleware to catch errors from all downstream layers.
   - `Subfolder` and `Locale` must precede `Router` so URL matching operates on the cleaned URI path.
   - `SessionMiddleware` must precede `CsrfTokenMiddleware` if CSRF tokens depend on session storage.
   - `CsrfTokenCookieMiddleware` must precede `CsrfTokenMiddleware` so the `XSRF-TOKEN` cookie is sent even if validation fails.
   - `CorsAllowAllMiddleware` must precede authentication and body parser middlewares in API route groups so browser `OPTIONS` preflight requests are answered with 204 without requiring auth credentials.
   - `RequestBodyParser` must precede any middleware or action that inspects parsed body data.

5. **Short-Circuiting vs Handler Delegation:**
   In short-circuiting guards (e.g. auth failures, rate limits), **never** call `$handler->handle($request)`. Return the error `ResponseInterface` directly. Calling `$handler->handle($request)` and then returning your own response causes downstream actions and database mutations to execute anyway.

6. **Never Use `exit()` or `die()`:**
   Terminating the script with `die()` or `exit()` crashes the PHP process immediately, bypassing response post-processing, session commit (performed internally by `SessionMiddleware`), logging, and PSR-7 SAPI response emitters. Always return a PSR-7 `ResponseInterface`.

7. **`withMiddlewares()` Deprecation in MiddlewareDispatcher:**
   In `yiisoft/middleware-dispatcher >= 5.5.0`, `withMiddlewares()` is deprecated. Do not configure dispatcher instances with `withMiddlewares()` in application DI definitions; pass definitions directly to `__construct(['middlewareDefinitions' => [...]])`.

---

## 7. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| **Ignoring PSR-7 immutability (`$request->withAttribute(...)`)** | Method returns a clone. The return value is discarded, and downstream handlers receive unmodified `$request`. | Reassign explicitly: `$request = $request->withAttribute('key', $value);`. |
| **Using deprecated `Yiisoft\Csrf\CsrfMiddleware`** | `CsrfMiddleware` is deprecated and slated for removal. | Use `Yiisoft\Csrf\CsrfTokenMiddleware` for validation and `Yiisoft\Csrf\CsrfTokenCookieMiddleware` for cookie emission. |
| **Hallucinating `Yiisoft\Yii\Http\Middleware\CorsMiddleware`** | Class does not exist; triggers fatal `ClassNotFoundError`. `yiisoft/yii-http` ships the `Application` lifecycle — the PSR-15 `Application` itself, its events, and fallback handlers (`NotFoundHandler`, `ThrowableHandler`); the runners that bootstrap it live in `yiisoft/yii-runner-http` and friends. | Use `Yiisoft\HttpMiddleware\CorsAllowAllMiddleware` from `yiisoft/http-middleware` or `Group::withCors()`. |
| **Using deprecated `Yiisoft\Yii\Middleware\CorsAllowAll`** | Class is deprecated in favor of `yiisoft/http-middleware`. | Use `Yiisoft\HttpMiddleware\CorsAllowAllMiddleware`. |
| **Using deprecated `Yiisoft\Yii\Middleware\ForceSecureConnection`, `HttpCache`, or `TagRequest`** | Classes are deprecated in `yiisoft/yii-middleware` in favor of `yiisoft/http-middleware`. | Use `ForceSecureConnectionMiddleware`, `HttpCacheMiddleware`, and `TagRequestMiddleware` from `yiisoft/http-middleware`. |
| **Hallucinating `Yiisoft\Yii\RateLimiter\RateLimiterMiddleware`** | Class does not exist in `yiisoft/rate-limiter`. | Use `Yiisoft\Yii\RateLimiter\LimitRequestsMiddleware`. |
| **Wrong session middleware namespace: `Yiisoft\Session\Middleware\SessionMiddleware`** | Triggers fatal `ClassNotFoundError`. The class resides directly in root `Yiisoft\Session`. | Use `Yiisoft\Session\SessionMiddleware`. |
| **Using deprecated `FormatDataResponse` or `FormatDataResponseAsJson`** | Legacy formatters deprecated in `yiisoft/data-response`. | Use `ContentNegotiatorDataResponseMiddleware` or `JsonDataResponseMiddleware`. |
| **Using deprecated `Group::create('/prefix')`** | `Group::create()` is marked `@deprecated Use new Group() instead`. | Use `new Group('/prefix')`. |
| **Using deprecated `Route::get()`, `Route::post()`, `Route::put()`, `Route::delete()`** | Static factory methods are deprecated in `yiisoft/router`. | Use `new \Yiisoft\Router\Route\Get('/path')`, `new \Yiisoft\Router\Route\Post('/path')`, or `Route::methods([Method::...], ...)`. |
| **Placing `Authentication` before `CorsAllowAllMiddleware` in API groups** | Browser preflight `OPTIONS` requests do not send authorization headers and fail with 401 Unauthorized before CORS headers are attached. | Place `CorsAllowAllMiddleware` first in the group middleware stack before any authentication guards. |
| **Placing `CsrfTokenMiddleware` before `CsrfTokenCookieMiddleware`** | If CSRF validation fails, execution terminates before `CsrfTokenCookieMiddleware` can attach the `XSRF-TOKEN` cookie, locking client out. | Register `CsrfTokenCookieMiddleware` before `CsrfTokenMiddleware` in the global pipeline. |
| **Calling deprecated `MiddlewareDispatcher::withMiddlewares()` in DI definitions** | `withMiddlewares()` is deprecated since 5.5.0 and re-instantiates internal stack closures unnecessarily. | Pass definitions to constructor: `'dispatcher' => DynamicReference::to(['class' => MiddlewareDispatcher::class, '__construct()' => ['middlewareDefinitions' => [...]]])`. |
| **Configuring global middlewares under `params.php` `'yiisoft/yii-runner-http'`** | `yii-runner-http` does not read middlewares from params. Global pipeline is defined in DI. | Configure pipeline in `config/web/di/application.php` under `Application::class => ['__construct()' => ['dispatcher' => DynamicReference::to([...])]]`. |
| **Calling `die()` or `exit()` inside middleware** | Crashes worker/process; bypasses response emitters, session cookie commitment, and log flushing. | Return a PSR-7 `ResponseInterface` with error status (e.g. 401/403/422). |
| **Reading `$request->getParsedBody()` without `RequestBodyParser`** | `$request->getParsedBody()` returns `null` for `application/json` payloads. | Add `Yiisoft\Request\Body\RequestBodyParser` to group or global pipeline. |
| **Placing heavy business or DB logic inside global middlewares** | Slows down every incoming request, including health checks and static file serving. | Keep middlewares lightweight; scope auth/rate-limiting to specific route groups or routes. |
| **Calling `$handler->handle($request)` inside short-circuit guard** | Downstream action still executes, causing unintended state changes before returning error response. | Return error `ResponseInterface` immediately without delegating to `$handler->handle($request)`. |
| **Calling `$handler->handle()` multiple times in one middleware** | Causes downstream middlewares and controller actions to execute multiple times. | Call `$handler->handle($request)` exactly once per request. |

---

## 8. Related Topic Guides

- [Routing Guide](http-routes.md) — Route groups, URL generation, FastRoute parameters, and route middleware pipelines.
- [HTTP Response Caching (ETag) Guide](http-cache-etag.md) — RFC 7232 conditional requests and the full `HttpCacheMiddleware` configuration recipes (ETag / `Last-Modified` providers, suffix normalization, route wiring).
- [Actions & Controllers Guide](http-actions-and-controllers.md) — Single-action invokable controllers, parameter resolution, and response factories.
- [Authentication & RBAC Guide](infra-auth-and-rbac.md) — Authentication middleware methods, identity repositories, OAuth2/OIDC login (`AuthAction`), and RBAC rules.
- [HTTP State Guide](http-state.md) — Session/cookie APIs, flash messages, CSRF token implementations, and state-side DI wiring.
- [Error Handling & Exception Management Guide](infra-error-handling.md) — `ErrorCatcher` / `ExceptionResponder` internals, error renderers, and Sentry capture around the pipeline.
- [Runners & Runtimes Guide](infra-runners-and-runtimes.md) — Application runners, worker event loops, and the runtime selection matrix.
- [Long-Running Worker Safety & StateResetter Guide](infra-state-resetter.md) — StateResetter configuration and per-service resetters for persistent worker runtimes.
- [OpenAPI & Swagger Guide](http-openapi-swagger.md) — Documenting API endpoints and middleware-protected routes.
- [Utility Packages Guide](core-utilities.md) — `IpHelper`/`IpRanges` for building custom IP allow/deny guards, and `DnsHelper` for domain validation.
