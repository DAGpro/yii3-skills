# Yii3 HTTP Routing Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Practical guide for route definitions, route groups, middleware stacks, URL generation, FastRoute caching, and alternative routing using `yiisoft/router`, `yiisoft/router-fastroute`, `yiisoft/file-router`, `yiisoft/yii-middleware`, and official Yii3 components.

This topic is split into two focused guides — load the one that matches the task:

- [Route Definitions, Groups & Route Arguments](http-routes-definition.md) — modern verb-class route syntax, FastRoute argument patterns/constraints/caching, route groups & nested routing, accessing route arguments (§1–§4).
- [Middleware Ordering & URL Generation](http-routes-url-and-middleware.md) — route middleware pipeline & execution order, URL generation & reverse routing, convention-based file routing (§5–§7).

Read this file for worker-environment caveats (§8), the anti-pattern matrix (§9), and related guides (§10).

---
## 8. Critical Caveats & Worker Environment Traps

### 8.1. Immutability of Route and Group

Every configuration method returns a **cloned instance** (`$route = clone $this`). The method sets differ per class: on `Route` — `name()`, `pattern()`, `host()`, `hosts()`, `override()`, `defaults()`, `action()`, `middleware()`, `prependMiddleware()`, `disableMiddleware()`; on `Group` — `routes()`, `withCors()`, `host()`, `hosts()`, `namePrefix()`, `middleware()`, `prependMiddleware()`, `disableMiddleware()` (e.g. `withCors()` exists only on `Group`, and `name()`/`action()` only on `Route`).

```php
declare(strict_types=1);

use App\Presentation\Action\User\ListUsersAction;
use Yiisoft\Router\Route\Get;

// INCORRECT: In-place modification does nothing!
$route = new Get('/users');
$route->name('user.list'); // Returns a clone; $route is unmodified!
$route->action(ListUsersAction::class); // Discarded!

// CORRECT: Chained or reassigned
$route = (new Get('/users'))
    ->name('user.list')
    ->action(ListUsersAction::class);
```

### 8.2. Long-Running Worker Reset (`CurrentRoute` & `UrlGenerator`)

In persistent worker environments (RoadRunner, FrankenPHP, Swoole, Workerman), services in the DI container survive across requests.

`Yiisoft\Router\CurrentRoute` and `Yiisoft\Router\FastRoute\UrlGenerator` maintain request-scoped state. In `config/di.php`, both are configured with automated worker reset callbacks:

```php
declare(strict_types=1);

use Yiisoft\Router\CurrentRoute;
use Yiisoft\Router\FastRoute\UrlGenerator;
use Yiisoft\Router\RouteCollector;
use Yiisoft\Router\RouteCollectorInterface;
use Yiisoft\Router\UrlGeneratorInterface;

return [
    RouteCollectorInterface::class => RouteCollector::class,

    // Resets matched route, URI, and route arguments between worker requests
    CurrentRoute::class => [
        'reset' => function () {
            $this->route = null;
            $this->uri = null;
            $this->arguments = [];
        },
    ],

    // Resets default URL arguments between worker requests
    UrlGeneratorInterface::class => [
        'class' => UrlGenerator::class,
        'reset' => function () {
            $this->defaultArguments = [];
        },
    ],
];
```

> [!CAUTION]
> **1. Singleton Service Property Leak:**
> If your application injects `CurrentRoute` into custom singleton services, never cache its argument values in service properties across requests. Always read `$this->currentRoute->getArgument(...)` dynamically inside the method call.
>
> **2. `UrlGenerator::$uriPrefix` Persistence:**
> The DI reset closure resets `$defaultArguments = []`, but does **not** reset `$uriPrefix` or `$encodeRaw`. If runtime code dynamically invokes `setUriPrefix()` inside a request in worker mode, restore it at the end of the request.

### 8.3. Duplicate Route Names & `override()`

If two routes share the same name, `RouteCollection` throws `InvalidArgumentException`:
`A route with name 'user.view' already exists.`

If you need a module or plugin to replace an existing core route, explicitly mark it with `->override()`:

```php
declare(strict_types=1);

use App\Presentation\Action\User\CustomUserViewAction;
use Yiisoft\Router\Route\Get;

return [
    (new Get('/users/{id:\d+}'))
        ->action(CustomUserViewAction::class)
        ->name('user.view')
        ->override(),
];
```

---

## 9. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| **Yii2 URL syntax: `['user/view', 'id' => 1]`** | Legacy Yii2 array syntax. Not supported in Yii3; triggers type error. | Inject `UrlGeneratorInterface` and call `$urlGenerator->generate('user.view', ['id' => 1])`. |
| **Deprecated static factories: `Route::get('/...')`** | Static factory methods on `Route` and `Group::create()` are deprecated in `yiisoft/router`. | Use `new \Yiisoft\Router\Route\Get('/...')` and `new \Yiisoft\Router\Group('/...')`. |
| **Deprecated `Group::create('/...')`** | Static factory on `Group` is deprecated in `yiisoft/router`. | Use `new \Yiisoft\Router\Group('/...')`. |
| **Second argument to `Group::create('/prefix', [...routes])`** | `Group::create()` signature is `(?string $prefix = null)` — it accepts only one parameter. A second argument (a middleware list or routes array) is silently discarded by PHP, resulting in an empty route group with zero endpoints. | Instantiate the group with `new Group('/prefix', [...routes])` (the constructor's second `$routes` parameter) or chain `->routes(...)`. |
| **Calling `$currentRoute->getRoute()`** | `CurrentRoute` does NOT expose `getRoute()`; triggers fatal `Error: Call to undefined method CurrentRoute::getRoute()`. | Access metadata via individual getters: `$currentRoute->getName()`, `getPattern()`, `getHost()`, `getMethods()`, `getUri()`, `getArgument('id')`. |
| **Relying on `Route::defaults()` for URL generation** | `Route::defaults()` is strictly used by `UrlMatcher`. `UrlGenerator` ignores it, throwing `RuntimeException` for missing parameters. | Set generation defaults via `$urlGenerator->setDefaultArgument('param', 'val')` or pass them in `$arguments`. |
| **Deprecated `FormatDataResponse` middleware** | `Yiisoft\DataResponse\Middleware\FormatDataResponse` is deprecated in `yiisoft/data-response`. | Use `Yiisoft\DataResponse\Middleware\DataResponseMiddleware`. |
| **Deprecated `DataResponseFactoryInterface` namespace** | `Yiisoft\DataResponse\DataResponseFactoryInterface` is deprecated. | Use `Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface`. |
| **Routes without names: `new Get('/...')`** | Reverse routing and URL generation fail without names (`RouteNotFoundException`). | Always append `->name('scope.action')` or use string-backed enums `->name(RouteName::SCOPE_ACTION)`. |
| **Reading route args via `$request->getAttribute('id')`** | `Router` middleware does NOT populate PSR-7 request attributes with route arguments; returns `null`. | Inject `CurrentRoute` and use `$currentRoute->getArgument('id')` or `#[RouteArgument]`. |
| **Capturing groups in regex: `{id:(photo\|video)}`** | FastRoute uses regex group indices to map arguments; capturing parentheses corrupt argument offsets. | Use non-capturing groups: `{id:(?:photo\|video)}` or character classes. |
| **Multiple host placeholders: `hosts('{t1}.com', '{t2}.com')`** | `UrlMatcher` regex cannot combine variable placeholders across multiple hosts; throws `RuntimeException`. | Placeholders are only allowed on single-host definitions: `->host('{tenant}.example.com')`. |
| **Unconstrained placeholders: `{id}` for numeric IDs** | Matches arbitrary strings; shadows subsequent static or specific routes. | Add strict regex constraints: `{id:\d+}`. |
| **Mutating operations on `GET` routes** | Violates HTTP RFC standards; vulnerable to CSRF and browser prefetching. | Use dedicated `Post`, `Put`, `Patch`, or `Delete` verb classes. |
| **Hardcoding URLs in templates: `href="/users"`** | Fragile against path prefixes, subdirectory deployments, and URL refactoring. | Use `$urlGenerator->generate('user.list')`. |
| **In-place route configuration without chaining** | `Route` and `Group` are immutable (`clone $this`); intermediate method calls are discarded if not chained. | Chain method calls: `(new Get('/'))->name('home')->action(HomeAction::class)`. |
| **Reading `CurrentRoute` in pre-Router middlewares** | Route matching occurs inside `Yiisoft\Router\Middleware\Router`; earlier middlewares see empty `CurrentRoute`. | Move route-dependent logic into a route/group middleware or inside the action handler. |
| **Wrong named parameter in `generateFromCurrent(arguments: ...)`** | Parameter name in `UrlGeneratorInterface` is `$replacedArguments`; triggers PHP 8 fatal error. | Call `$urlGenerator->generateFromCurrent(replacedArguments: ['page' => 2])`. |
| **Wrong middleware order: Auth before RequestBodyParser** | Auth/Guard middleware fails to read credentials because request payload has not been parsed into `parsedBody`. | Place `RequestBodyParser` before authentication in the group middleware stack. |
| **Duplicate manual OPTIONS routes when `withCors()` is used** | `Group::withCors()` automatically registers preflight `OPTIONS` routes returning `204 No Content`. | Omit manual `OPTIONS` routes for patterns handled by `withCors()`. |
| **Passing BackedEnum to `Group::namePrefix()`** | `Group::namePrefix()` strictly expects `string`, not `BackedEnum`. | Pass enum value: `->namePrefix(RouteName::API_PREFIX->value)`. |
| **Caching `CurrentRoute` state in singleton properties** | In worker modes (RoadRunner/Swoole), properties persist across requests causing cross-request data leaks. | Never store `getArgument()` values in singleton properties; query `CurrentRoute` dynamically. |
| **Importing `Yiisoft\Router\Attribute\Group`** | Class does not exist; triggers fatal `Class not found` error. | Use core class directly as attribute: `use Yiisoft\Router\Group;`. |
| **Running CI with `--no-plugins` with attribute collector** | `olvlvl/composer-attribute-collector` will not run, leaving route tables empty. | Avoid experimental attribute collector in production or allow plugin execution in CI. |
| **Kebab-case URLs in FileRouter: `/user-profile`** | `#/.#u` leaves hyphens alone; resolves to illegal PHP class `User-profileController`. | Use camelCase (`/userProfile`) or single-word paths (`/user`). |
| **Lowercase keys in `FileRouter::$actions`** | `$request->getMethod()` returns uppercase `'GET'`; lowercase keys evaluate to `null`. | Use uppercase HTTP verbs as keys: `['GET' => 'index', 'POST' => 'update']`. |
| **Using `#[RouteArgument]` with `FileRouter`** | `FileRouter` does not populate `CurrentRoute`; attributes evaluate to `null`. | Read parameters from `$request->getQueryParams()` or request body. |
| **Calling `generateAbsolute()` in CLI without host configuration** | In CLI, `$uri` is `null`; without configured host/scheme, falls back to returning relative URL `/path`. | Configure `$params['yiisoft/router-fastroute']['host']` and `'scheme'` in `config/console/params.php` (merged into the `params-console` group) or `config/common/params.php`. |
| **Expecting custom 404 handler to catch 405 errors** | `Router` handles 405 directly with `Allow` header; does not delegate to `$handler`. | Configure 405 error rendering in a dedicated response decorator or global error catcher. |
| **Disabling FastRoute cache in production** | Recompiles all routes on every request, creating unnecessary CPU overhead. | Set `'enableCache' => true` in production and clear/pre-warm cache during deployment. |

---

## 10. Related Topic Guides

- [Actions & Controllers Guide](http-actions-and-controllers.md) — Single-action controllers, PSR-7 response factories, and input DTO hydration.
- [PSR-15 Middlewares Guide](http-middlewares.md) — Onion-model pipeline flow, canonical global/group middleware ordering, official middlewares catalog, and custom middleware recipes (including the RBAC permission guard).
- [Authentication & RBAC Guide](infra-auth-and-rbac.md) — Route access control, authentication middlewares, and RBAC permission checks.
- [OpenAPI & Swagger Guide](http-openapi-swagger.md) — Documenting routes, endpoints, and schemas with PHP 8 attributes.
- [Error Handling Guide](infra-error-handling.md) — `ErrorCatcher` middleware, error rendering, and the outermost pipeline layer.
- [I18n & Translation Guide](http-i18n-translation.md) — Message translation, category sources, and locale resolution via the `Locale` middleware (`SetLocaleEvent`, cookie/header gating, DI registration).