# Yii3 HTTP Routing Guide

> Practical guide for route definitions, route groups, middleware stacks, URL generation, FastRoute caching, and alternative routing using `yiisoft/router`, `yiisoft/router-fastroute`, `yiisoft/file-router`, `yiisoft/yii-middleware`, and official Yii3 components.

---

## Table of Contents
- [1. Route Definition Architecture & Modern Syntax](#1-route-definition-architecture--modern-syntax)
  - [1.1. Dedicated HTTP Verb Classes](#11-dedicated-http-verb-classes)
  - [1.2. Type-Safe Route Names with Backed Enums](#12-type-safe-route-names-with-backed-enums)
  - [1.3. Supported Action Handler Formats](#13-supported-action-handler-formats)
  - [1.4. Attribute-Based Route Collection (`yiisoft/router-composer-attribute-collector`)](#14-attribute-based-route-collection-yiisoftrouter-composer-attribute-collector)
- [2. FastRoute Argument Patterns, Constraints, Defaults & Caching](#2-fastroute-argument-patterns-constraints-defaults--caching)
  - [2.1. Parameter Constraints & Regex Rules](#21-parameter-constraints--regex-rules)
  - [2.2. Parameter Defaults (Matching vs. Generation)](#22-parameter-defaults-matching-vs-generation)
  - [2.3. Host-Based Matching & Subdomains](#23-host-based-matching--subdomains)
  - [2.4. FastRoute Dispatch Caching (`enableCache` & PSR-16)](#24-fastroute-dispatch-caching-enablecache--psr-16)
- [3. Route Groups & Nested Routing (`Yiisoft\Router\Group`)](#3-route-groups--nested-routing-yiisoftroutergroup)
  - [3.1. Defining Nested Groups](#31-defining-nested-groups)
  - [3.2. Selective Middleware Exclusion (`->disableMiddleware(...)`)](#32-selective-middleware-exclusion--disablemiddleware)
  - [3.3. Built-In CORS Support (`->withCors(...)`)](#33-built-in-cors-support--withcors)
- [4. Accessing Route Arguments in Actions & Middlewares](#4-accessing-route-arguments-in-actions--middlewares)
  - [4.1. The Injected `CurrentRoute` Service](#41-the-injected-currentroute-service)
  - [4.2. Hydrator Parameter Resolution (`#[RouteArgument]`)](#42-hydrator-parameter-resolution-routeargument)
  - [4.3. Critical Traps & Ingress Caveats](#43-critical-traps--ingress-caveats)
- [5. Middleware Pipeline & Execution Order](#5-middleware-pipeline--execution-order)
  - [5.1. Execution Order Hierarchy (The Onion Model)](#51-execution-order-hierarchy-the-onion-model)
  - [5.2. Routing Middleware Pipeline: 404 vs. 405 Architecture](#52-routing-middleware-pipeline-404-vs-405-architecture)
  - [5.3. Canonical Middleware Sequence](#53-canonical-middleware-sequence)
  - [5.4. `middleware()` vs. `prependMiddleware()` & Smart Splice Insertion](#54-middleware-vs-prependmiddleware--smart-splice-insertion)
  - [5.5. Route Access Control & RBAC Protection](#55-route-access-control--rbac-protection)
- [6. URL Generation & Reverse Routing (`UrlGeneratorInterface`)](#6-url-generation--reverse-routing-urlgeneratorinterface)
  - [6.1. Relative and Absolute URL Generation (RFC 3986 & CLI)](#61-relative-and-absolute-url-generation-rfc-3986--cli)
  - [6.2. Mutating Current Route (`generateFromCurrent()`)](#62-mutating-current-route-generatefromcurrent)
  - [6.3. Ingress Subfolder Handling & URL Prefixing (`Yiisoft\Yii\Middleware\Subfolder`)](#63-ingress-subfolder-handling--url-prefixing-yiisoftyiimiddlewaresubfolder)
  - [6.4. Multilingual Routing & Locale Management (`Yiisoft\Yii\Middleware\Locale`)](#64-multilingual-routing--locale-management-yiisoftyiimiddlewarelocale)
  - [6.5. Declarative Route Redirects (`Yiisoft\Yii\Middleware\Redirect`)](#65-declarative-route-redirects-yiisoftyiimiddlewareredirect)
  - [6.6. URL Generation Exceptions](#66-url-generation-exceptions)
- [7. Alternative & Convention-Based Routing (`yiisoft/file-router`)](#7-alternative--convention-based-routing-yiisoftfile-router)
  - [7.1. FileRouter Architecture & Conventions](#71-filerouter-architecture--conventions)
  - [7.2. Creating a FileRouter Controller](#72-creating-a-filerouter-controller)
  - [7.3. Pipeline Integration & Fallback Router Pattern](#73-pipeline-integration--fallback-router-pattern)
- [8. Critical Caveats & Worker Environment Traps](#8-critical-caveats--worker-environment-traps)
  - [8.1. Immutability of Route and Group](#81-immutability-of-route-and-group)
  - [8.2. Long-Running Worker Reset (`CurrentRoute` & `UrlGenerator`)](#82-long-running-worker-reset-currentroute--urlgenerator)
  - [8.3. Duplicate Route Names & `override()`](#83-duplicate-route-names--override)
- [9. Anti-Pattern Matrix](#9-anti-pattern-matrix)
- [10. Related Topic Guides](#10-related-topic-guides)

---

## 1. Route Definition Architecture & Modern Syntax

Routing in Yii3 connects incoming PSR-7 HTTP requests (`Method` + `URI path`) to a dedicated PSR-15 middleware pipeline terminating in an action handler.

Routes are declared in configuration files (typically `config/routes.php`, `config/common/routes.php`, or `config/web/routes.php`) returning an array of `Yiisoft\Router\Route` and `Yiisoft\Router\Group` instances. These route declarations are fed into `Yiisoft\Router\RouteCollectorInterface`.

> [!NOTE]
> **Route Matchability Invariant:**
> Routes must specify at least one middleware definition or action handler. `UrlMatcher::injectRoutes()` skips any route where `$route->getData('hasMiddlewares')` evaluates to `false`. A route defined without an action or middleware will not be registered into FastRoute's matching table.

### 1.1. Dedicated HTTP Verb Classes

In `yiisoft/router`, static factory methods (`Route::get()`, `Route::post()`, etc.) are **deprecated**. The modern, idiomatic approach is instantiating dedicated verb classes from the `Yiisoft\Router\Route` namespace:

- `Yiisoft\Router\Route\Get`
- `Yiisoft\Router\Route\Post`
- `Yiisoft\Router\Route\Put`
- `Yiisoft\Router\Route\Delete`
- `Yiisoft\Router\Route\Patch`
- `Yiisoft\Router\Route\Head`
- `Yiisoft\Router\Route\Options`

```php
declare(strict_types=1);

use App\Presentation\Action\Site\ContactAction;
use App\Presentation\Action\User\CreateUserAction;
use App\Presentation\Action\User\DeleteUserAction;
use App\Presentation\Action\User\ListUsersAction;
use App\Presentation\Action\User\UpdateUserAction;
use App\Presentation\Action\User\ViewUserAction;
use Yiisoft\Http\Method;
use Yiisoft\Router\Route;
use Yiisoft\Router\Route\Delete;
use Yiisoft\Router\Route\Get;
use Yiisoft\Router\Route\Patch;
use Yiisoft\Router\Route\Post;
use Yiisoft\Router\Route\Put;

return [
    // Standard CRUD routes using dedicated verb classes
    (new Get('/users'))
        ->action(ListUsersAction::class)
        ->name('user.list'),

    (new Post('/users'))
        ->action(CreateUserAction::class)
        ->name('user.create'),

    (new Get('/users/{id:\d+}'))
        ->action(ViewUserAction::class)
        ->name('user.view'),

    (new Put('/users/{id:\d+}'))
        ->action(UpdateUserAction::class)
        ->name('user.update'),

    (new Delete('/users/{id:\d+}'))
        ->action(DeleteUserAction::class)
        ->name('user.delete'),

    // Multiple HTTP verbs matching the same pattern
    (new Route('/contact', [Method::GET, Method::POST]))
        ->action(ContactAction::class)
        ->name('site.contact'),
];
```

> [!TIP]
> **Constructor Initialization vs. Fluent Setters:**
> Dedicated verb classes support full constructor initialization:
> ```php
> new Get(
>     pattern: '/users/{id:\d+}',
>     name: 'user.view',
>     action: ViewUserAction::class,
> );
> ```
> Use constructor initialization for concise route tables, or fluent chaining (`->action()->name()`) for readable multi-middleware definitions.

### 1.2. Type-Safe Route Names with Backed Enums

The `->name()` method accepts both `string` and `BackedEnum`. Using string-backed enums provides compile-time safety, auto-completion, and refactoring guarantees:

```php
declare(strict_types=1);

namespace App\Infrastructure\Routing;

enum RouteName: string
{
    case USER_LIST = 'user.list';
    case USER_CREATE = 'user.create';
    case USER_VIEW = 'user.view';
    case USER_UPDATE = 'user.update';
    case USER_DELETE = 'user.delete';
}
```

```php
declare(strict_types=1);

use App\Infrastructure\Routing\RouteName;
use App\Presentation\Action\User\ListUsersAction;
use Yiisoft\Router\Route\Get;

return [
    (new Get('/users'))
        ->action(ListUsersAction::class)
        ->name(RouteName::USER_LIST),
];
```

> [!NOTE]
> `Route::name()` accepts `string|BackedEnum`, resolving enum instances via `$name->value`. However, `Group::namePrefix()` strictly expects `string`. When combining enums with groups, pass string values: `->namePrefix(RouteName::API_PREFIX->value)`.

### 1.3. Supported Action Handler Formats

Yii3 route actions are resolved via `Yiisoft\Middleware\Dispatcher\MiddlewareFactory`. The following formats are valid for `->action(...)`:

| Action Format | Description | Example |
|---|---|---|
| **Single Action Controller (Recommended)** | Invokable class with `__invoke(ServerRequestInterface $request): ResponseInterface` | `->action(ListUsersAction::class)` |
| **PSR-15 Request Handler** | Class implementing `Psr\Http\Server\RequestHandlerInterface` (`handle()`) | `->action(ApiHandler::class)` |
| **PSR-15 Middleware** | Class implementing `Psr\Http\Server\MiddlewareInterface` (`process()`) | `->action(CustomTerminalMiddleware::class)` |
| **Controller Method Pair** | Array with `[ControllerClass, 'methodName']` (method must return `ResponseInterface`) | `->action([UserController::class, 'index'])` |
| **Closure / Callable** | `function(ServerRequestInterface $request): ResponseInterface` | `->action(fn(ServerRequestInterface $r): ResponseInterface => $responseFactory->createResponse())` |

> [!TIP]
> For detailed instructions on writing single-action invokable controllers, parameter resolution, and PSR-7 response generation, see [Actions & Controllers Guide](actions-and-controllers.md).

### 1.4. Attribute-Based Route Collection (`yiisoft/router-composer-attribute-collector`)

> [!CAUTION]
> **Status: Experimental / Not Recommended for Production.**
> - The package `yiisoft/router-composer-attribute-collector` requires `"yiisoft/router": "dev-add-attributes as 4"` in its `composer.json`. In stable releases of `yiisoft/router` (`^3.0` or `^4.0`), attribute classes (`Yiisoft\Router\Attribute\*`) and `RoutesProviderInterface` **do not exist**.
> - Route discovery depends entirely on the Composer plugin `olvlvl/composer-attribute-collector` (`^2.0`). If your continuous integration (CI) pipeline or deployment environment executes `composer install --no-plugins`, the attribute map is **never generated**, causing route registration to silently fail.
> - **Autoload Dump Invalidation Trap:** Attribute discovery occurs strictly at **`composer dump-autoload` time**. Newly added or modified controller attributes remain completely invisible until `composer dump-autoload` is re-run.

The package provides `Yiisoft\Router\ComposerAttributeCollector\AttributeRoutesProvider` — a `final` class implementing `Yiisoft\Router\Provider\RoutesProviderInterface`. To allow the plugin, configure `composer.json`:

```json
"config": {
    "allow-plugins": {
        "olvlvl/composer-attribute-collector": true
    }
}
```

#### Correct Attribute Imports

```php
declare(strict_types=1);

namespace App\Controller;

use Psr\Http\Message\ResponseInterface;
use Yiisoft\Router\Attribute\Delete;
use Yiisoft\Router\Attribute\Get;
use Yiisoft\Router\Attribute\Post;
use Yiisoft\Router\Attribute\Put;
use Yiisoft\Router\Group; // Note: Core Group class is used directly; there is NO Attribute\Group class!

#[Group(prefix: '/post')]
final class PostController
{
    #[Get('')]
    public function list(): ResponseInterface
    {
        // ...
    }

    #[Get('/{slug}')]
    public function view(): ResponseInterface
    {
        // ...
    }

    #[Put('/{slug}')]
    public function edit(): ResponseInterface
    {
        // ...
    }

    #[Post('/')]
    public function create(): ResponseInterface
    {
        // ...
    }

    #[Delete('/{slug}')]
    public function delete(): ResponseInterface
    {
        // ...
    }
}
```

> [!IMPORTANT]
> **No `Yiisoft\Router\Attribute\Group` Class Exists:**
> Class-level grouping uses the core router class `Yiisoft\Router\Group` directly as a PHP 8 attribute (`use Yiisoft\Router\Group;`). Attempting to import `Yiisoft\Router\Attribute\Group` causes a fatal `Class not found` error.

> [!TIP]
> Prefer explicit configuration files (`config/routes.php`) as shown in §1.1 and §3.1. Explicit tables are grep-friendly, maintainable, support `disableMiddleware()` and `withCors()`, and have zero dependency on experimental packages or Composer dump hooks.

---

## 2. FastRoute Argument Patterns, Constraints, Defaults & Caching

`yiisoft/router-fastroute` compiles route patterns using FastRoute syntax. Placeholders are declared with `{parameter}` or `{parameter:regex}`.

### 2.1. Parameter Constraints & Regex Rules

```php
declare(strict_types=1);

use App\Presentation\Action\Article\ViewArticleAction;
use App\Presentation\Action\Catalog\CatalogIndexAction;
use App\Presentation\Action\Media\ViewMediaAction;
use App\Presentation\Action\Order\ViewOrderAction;
use App\Presentation\Action\Post\ViewPostAction;
use Yiisoft\Router\Route\Get;

return [
    // Digits only (integer database IDs)
    (new Get('/posts/{id:\d+}'))
        ->action(ViewPostAction::class)
        ->name('post.view'),

    // UUID v4 format
    (new Get('/orders/{id:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}'))
        ->action(ViewOrderAction::class)
        ->name('order.view'),

    // URL slug (lowercase alphanumeric with dashes)
    (new Get('/articles/{slug:[a-z0-9-]+}'))
        ->action(ViewArticleAction::class)
        ->name('article.view'),

    // Optional segments (enclosed in square brackets)
    (new Get('/catalog[/{category:[a-z-]+}[/page/{page:\d+}]]'))
        ->action(CatalogIndexAction::class)
        ->defaults(['category' => 'all', 'page' => 1])
        ->name('catalog.index'),

    // Non-capturing group for discrete choices
    (new Get('/media/{type:(?:photo|video)}'))
        ->action(ViewMediaAction::class)
        ->name('media.view'),
];
```

> [!WARNING]
> **Capturing Groups in FastRoute Regex:**
> Never use capturing parentheses `(a|b)` inside route parameter regexes (e.g. `{type:(photo|video)}`). FastRoute relies on regex group count indexing; capturing parentheses corrupt FastRoute's internal group offsets, shifting and breaking parameter extraction.
> Always use **non-capturing groups** `(?:a|b)`:
> ```php
> // CORRECT: Non-capturing group
> (new Get('/media/{type:(?:photo|video)}'))->action(ViewMediaAction::class)->name('media.view');
>
> // INCORRECT: Capturing group corrupts argument offsets!
> (new Get('/media/{type:(photo|video)}'))->action(ViewMediaAction::class)->name('media.view');
> ```

### 2.2. Parameter Defaults (Matching vs. Generation)

Default values are specified on the route via `->defaults(array $defaults)`. When an optional URL segment is omitted by the client, FastRoute merges these defaults into the route arguments:

```php
declare(strict_types=1);

use App\Presentation\Action\Catalog\CatalogIndexAction;
use Yiisoft\Router\Route\Get;

return [
    (new Get('/catalog[/{category}[/page/{page:\d+}]]'))
        ->action(CatalogIndexAction::class)
        ->defaults([
            'category' => 'electronics',
            'page' => 1,
        ])
        ->name('catalog.index'),
];
```

> [!IMPORTANT]
> **The `Route::defaults()` Matching vs. Generation Trap:**
> `Route::defaults()` applies **strictly to route matching** (`UrlMatcher`).
> `UrlGenerator` **never** reads `Route::defaults()`. If a route pattern has a parameter without a value passed to `$urlGenerator->generate('route')`, it throws `RuntimeException`, even if `defaults()` was configured on the route!
> To provide default values for URL generation, use `$urlGenerator->setDefaultArgument('page', '1')` (see §6.1).

### 2.3. Host-Based Matching & Subdomains

Routes can be constrained to specific domain names or subdomains using `->host(string $host)` or `->hosts(string ...$hosts)`.

`UrlMatcher` matches incoming requests against `{host}{path}`:

```php
declare(strict_types=1);

use App\Presentation\Action\Admin\AdminDashboardAction;
use App\Presentation\Action\Api\ApiHealthAction;
use App\Presentation\Action\Tenant\TenantDashboardAction;
use Yiisoft\Router\Route\Get;

return [
    // Static host constraint
    (new Get('/dashboard'))
        ->host('admin.example.com')
        ->action(AdminDashboardAction::class)
        ->name('admin.dashboard'),

    // Multiple allowed static hosts
    (new Get('/api/health'))
        ->hosts('api.example.com', 'api-internal.example.com')
        ->action(ApiHealthAction::class)
        ->name('api.health'),

    // Host with variable placeholder (allowed on single-host patterns only)
    (new Get('/tenant/dashboard'))
        ->host('{tenant:[a-z0-9-]+}.example.com')
        ->action(TenantDashboardAction::class)
        ->name('tenant.dashboard'),
];
```

> [!CAUTION]
> **Host Placeholders with Multiple Hosts:**
> When calling `->hosts('tenant1.com', 'tenant2.com')` with multiple hosts, `UrlMatcher` combines them into an internal regex `({_host:tenant1.com|tenant2.com})`. Variable placeholders are **strictly forbidden** when multiple hosts are provided (`RuntimeException: Placeholders are not allowed with multiple host names`). Placeholders are only allowed on single-host definitions.

### 2.4. FastRoute Dispatch Caching (`enableCache` & PSR-16)

FastRoute route compilation (parsing patterns, generating group-count regexes, combining routing tables) introduces measurable CPU overhead on large route collections. `yiisoft/router-fastroute` provides built-in PSR-16 caching.

#### Configuration Parameter

Caching is controlled via `$params['yiisoft/router-fastroute']['enableCache']` in `config/params.php`:

```php
declare(strict_types=1);

return [
    'yiisoft/router-fastroute' => [
        'enableCache' => true, // default is true
        'encodeRaw' => true,
        'scheme' => null,
        'host' => null,
    ],
];
```

#### DI Container Wiring (`config/di-web.php`)

In `config/di-web.php`, the `UrlMatcherInterface` factory checks `enableCache`. When set to `false`, `'cache' => null` is explicitly injected into `UrlMatcher`, disabling the cache:

```php
declare(strict_types=1);

use Psr\SimpleCache\CacheInterface;
use Yiisoft\Injector\Injector;
use Yiisoft\Router\FastRoute\UrlMatcher;
use Yiisoft\Router\UrlMatcherInterface;

return [
    UrlMatcherInterface::class => static function (Injector $injector) use ($params): UrlMatcherInterface {
        $enableCache = $params['yiisoft/router-fastroute']['enableCache'] ?? true;

        $arguments = [];
        if ($enableCache === false) {
            $arguments['cache'] = null;
        }

        return $injector->make(UrlMatcher::class, $arguments);
    },
];
```

#### Mechanics & Performance

- **Cache Key:** `UrlMatcher::CONFIG_CACHE_KEY = 'cache_key'`; the default key used in the PSR-16 cache is `'routes-cache'`.
- **Cache Hit:** If cached dispatch data exists in `CacheInterface`, `UrlMatcher` loads it directly and sets an internal flag `$hasCache = true`. When `match()` executes, `injectRoutes()` is **completely bypassed**, saving the iteration over all `Route` instances and regex compilation.
- **Cache Miss:** When the cache is empty or expired, `injectRoutes()` builds the FastRoute data structure, extracts dispatch data via `$fastRouteCollector->getData()`, and saves it to the cache backend via `$cache->set('routes-cache', $dispatchData)`.

#### Development vs. Production Rules

- **Local Development (`dev`):** Set `'enableCache' => false` in `config/params-local.php` (or dev environment config). This guarantees that new routes or pattern edits are immediately matched without needing cache flushes.
- **Production (`prod`):** Always maintain `'enableCache' => true`. During deployment steps, clear or pre-warm the cache after running migrations or config compilation.

---

## 3. Route Groups & Nested Routing (`Yiisoft\Router\Group`)

`Yiisoft\Router\Group` organizes modular subsystems (APIs, admin dashboards, tenant areas), applying shared path prefixes, name prefixes, host constraints, and scoped middleware stacks.

### 3.1. Defining Nested Groups

`Group::create()` is **deprecated**. Always instantiate groups directly with `new Group(...)`:

```php
declare(strict_types=1);

use App\Presentation\Action\Api\V1\Product\CreateProductAction;
use App\Presentation\Action\Api\V1\Product\ListProductsAction;
use App\Presentation\Action\Api\V1\Product\ShowProductAction;
use App\Presentation\Action\Api\V1\User\ProfileUpdateAction;
use App\Presentation\Action\Api\V1\User\ProfileViewAction;
use App\Presentation\Middleware\ApiAuthMiddleware;
use App\Presentation\Middleware\RateLimitMiddleware;
use Yiisoft\DataResponse\Middleware\DataResponseMiddleware;
use Yiisoft\Request\Body\RequestBodyParser;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route\Get;
use Yiisoft\Router\Route\Post;
use Yiisoft\Router\Route\Put;

return [
    // Top-level API group: /api/v1/...
    (new Group('/api/v1'))
        ->namePrefix('api.v1.')
        ->middleware(
            DataResponseMiddleware::class,
            RequestBodyParser::class,
        )
        ->routes(
            // Public endpoints: /api/v1/products -> name: api.v1.product.list
            (new Get('/products'))
                ->action(ListProductsAction::class)
                ->name('product.list'),

            (new Get('/products/{id:\d+}'))
                ->action(ShowProductAction::class)
                ->name('product.show'),

            // Authenticated sub-group: /api/v1/user/...
            (new Group('/user'))
                ->namePrefix('user.')
                ->middleware(
                    ApiAuthMiddleware::class,
                    RateLimitMiddleware::class,
                )
                ->routes(
                    // /api/v1/user/profile -> name: api.v1.user.profile.view
                    (new Get('/profile'))
                        ->action(ProfileViewAction::class)
                        ->name('profile.view'),

                    // /api/v1/user/profile -> name: api.v1.user.profile.update
                    (new Put('/profile'))
                        ->action(ProfileUpdateAction::class)
                        ->name('profile.update'),
                ),
        ),
];
```

### 3.2. Selective Middleware Exclusion (`->disableMiddleware(...)`)

When a parent group declares middlewares that should not apply to a specific route (e.g. exempting `/login`, `/register`, or `/healthz` from authentication or session checks), use `->disableMiddleware(...)`:

```php
declare(strict_types=1);

use App\Presentation\Action\Auth\LoginAction;
use App\Presentation\Action\Dashboard\DashboardAction;
use App\Presentation\Middleware\SessionAuthMiddleware;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route\Get;
use Yiisoft\Router\Route\Post;

return [
    (new Group('/admin'))
        ->namePrefix('admin.')
        ->middleware(SessionAuthMiddleware::class)
        ->routes(
            // Protected: executes SessionAuthMiddleware
            (new Get('/dashboard'))
                ->action(DashboardAction::class)
                ->name('dashboard'),

            // Public login: disables SessionAuthMiddleware for this route only
            (new Post('/login'))
                ->action(LoginAction::class)
                ->disableMiddleware(SessionAuthMiddleware::class)
                ->name('login'),
        ),
];
```

### 3.3. Built-In CORS Support (`->withCors(...)`)

When building REST APIs that require Cross-Origin Resource Sharing (CORS), register a CORS middleware using `->withCors(...)` on the group.

`RouteCollection` automatically registers preflight `OPTIONS` routes returning `204 No Content` for every endpoint in the group, and prepends the CORS middleware to each route:

```php
declare(strict_types=1);

use App\Presentation\Action\Item\CreateItemAction;
use App\Presentation\Action\Item\ListItemsAction;
use App\Presentation\Middleware\CustomCorsMiddleware;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route\Get;
use Yiisoft\Router\Route\Post;

return [
    (new Group('/api'))
        ->withCors(CustomCorsMiddleware::class)
        ->routes(
            (new Get('/items'))
                ->action(ListItemsAction::class)
                ->name('items.list'),

            (new Post('/items'))
                ->action(CreateItemAction::class)
                ->name('items.create'),
        ),
];
```

> [!NOTE]
> Do NOT declare manual `OPTIONS` routes for patterns covered by `->withCors()`. `RouteCollection` generates them automatically. Manual definitions cause route name collisions or conflict with the built-in handler.

---

## 4. Accessing Route Arguments in Actions & Middlewares

### 4.1. The Injected `CurrentRoute` Service

When a route is matched, `Yiisoft\Router\Middleware\Router` sets the matched route, URI, and arguments on the `Yiisoft\Router\CurrentRoute` service.

Inject `CurrentRoute` into your action or middleware constructor:

```php
declare(strict_types=1);

namespace App\Presentation\Action\User;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;

final readonly class ViewUserAction
{
    public function __construct(
        private CurrentRoute $currentRoute,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        // Retrieve single route argument with optional default
        $userId = $this->currentRoute->getArgument('id');
        if ($userId === null) {
            return $this->responseFactory->createResponse(
                ['error' => 'Missing ID parameter'],
                Status::BAD_REQUEST,
            );
        }

        // Retrieve all matched arguments as array: ['id' => '42']
        $allArguments = $this->currentRoute->getArguments();

        // Retrieve route metadata
        $routeName = $this->currentRoute->getName();
        $pattern = $this->currentRoute->getPattern();
        $methods = $this->currentRoute->getMethods();
        $host = $this->currentRoute->getHost();
        $uri = $this->currentRoute->getUri();

        return $this->responseFactory->createResponse([
            'userId' => (int) $userId,
            'route' => $routeName,
            'pattern' => $pattern,
            'methods' => $methods,
            'all' => $allArguments,
        ]);
    }
}
```

> [!CAUTION]
> **`CurrentRoute` Does NOT Have a `getRoute()` Method!**
> Developers familiar with other frameworks often attempt to call `$currentRoute->getRoute()`. This method **does not exist** on `CurrentRoute` (`Error: Call to undefined method CurrentRoute::getRoute()`).
> The underlying `Route` object is fully encapsulated. Use the individual metadata getters:
> - `getName(): ?string`
> - `getPattern(): ?string`
> - `getHost(): ?string`
> - `getMethods(): ?array`
> - `getUri(): ?UriInterface`
> - `getArguments(): array`
> - `getArgument(string $name, ?string $default = null): ?string`

> [!NOTE]
> **Unconditional URI Availability:**
> `Router::process()` calls `$currentRoute->setUri($request->getUri())` **before** matching checks. As a result, `$currentRoute->getUri()` is **always available**, even on 404 (Not Found) or 405 (Method Not Allowed) responses.

### 4.2. Hydrator Parameter Resolution (`#[RouteArgument]`)

When using `yiisoft/hydrator` with action parameter resolution or request DTO hydration, route arguments can be directly bound to method parameters or class properties using `Yiisoft\Router\HydratorAttribute\RouteArgument`:

```php
declare(strict_types=1);

namespace App\Presentation\Action\Order;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Router\HydratorAttribute\RouteArgument;

final readonly class ViewOrderAction
{
    public function __construct(
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(
        ServerRequestInterface $request,
        #[RouteArgument('id')] string $orderId,
    ): ResponseInterface {
        return $this->responseFactory->createResponse([
            'orderId' => $orderId,
        ]);
    }
}
```

You can also bind route parameters inside request DTOs:

```php
declare(strict_types=1);

namespace App\Application\DTO;

use Yiisoft\Router\HydratorAttribute\RouteArgument;
use Yiisoft\Validator\Rule\Regex;
use Yiisoft\Validator\Rule\Required;

final readonly class OrderRequest
{
    public function __construct(
        #[Required]
        #[Regex('/^\d+$/')]
        #[RouteArgument('id')]
        public string $orderId,
    ) {}
}
```

> [!TIP]
> If the `#[RouteArgument]` attribute name argument is omitted (`#[RouteArgument]`), `RouteArgumentResolver` automatically resolves the argument matching the property or parameter name.

### 4.3. Critical Traps & Ingress Caveats

> [!IMPORTANT]
> **Trap 1: Route arguments are NOT stored in `$request->getAttribute('id')`!**
> Unlike Slim or Mezzio, Yii3's `Router` middleware does **not** push matched arguments into PSR-7 server request attributes.
> Calling `$request->getAttribute('id')` returns `null`. You must inject `CurrentRoute` or use `#[RouteArgument]`.
>
> **Trap 2: `CurrentRoute` is empty in pre-Router global middlewares!**
> In application-level middlewares that execute **before** `Yiisoft\Router\Middleware\Router`, route matching has not occurred yet. Calling `$currentRoute->getName()` or `$currentRoute->getArgument('id')` will return `null`.

---

## 5. Middleware Pipeline & Execution Order

Route middleware execution follows the standard PSR-15 **onion / pipeline model (FIFO on Request Ingress, LIFO on Response Egress)**.

> [!TIP]
> For complete instructions on authoring custom PSR-15 middlewares, global application pipelines, and the official middleware catalog, see [PSR-15 Middlewares Guide](middlewares.md).

### 5.1. Execution Order Hierarchy (The Onion Model)

```text
Incoming Request
      │
      ▼
┌────────────────────────────────────────────────────────┐
│ Global App Middlewares (ErrorCatcher, Subfolder, etc.) │
│   ┌──────────────────────────────────────────────────┐ │
│   │ Router Middleware (matches pattern, sets CurrentRoute) │
│   │   ┌────────────────────────────────────────────┐ │ │
│   │   │ Group Middlewares (FIFO: Ingress 1, Ingress 2) │
│   │   │   ┌──────────────────────────────────────┐ │ │ │
│   │   │   │ Route Middlewares (FIFO: Ingress 1)   │ │ │ │
│   │   │   │   ┌────────────────────────────────┐ │ │ │ │
│   │   │   │   │ Action Handler (Terminal)      │ │ │ │ │
│   │   │   │   │ Returns ResponseInterface      │ │ │ │ │
│   │   │   │   └────────────────────────────────┘ │ │ │ │
│   │   │   │ Route Middlewares (LIFO: Egress)   │ │ │ │
│   │   │   └──────────────────────────────────────┘ │ │ │
│   │   │ Group Middlewares (LIFO: Egress 2, Egress 1) │ │
│   │   └────────────────────────────────────────────┘ │ │
│   └──────────────────────────────────────────────────┘ │
│ Global App Middlewares (LIFO: Egress)                  │
└────────────────────────────────────────────────────────┘
      │
      ▼
Outgoing Response
```

### 5.2. Routing Middleware Pipeline: 404 vs. 405 Architecture

The core `Yiisoft\Router\Middleware\Router` middleware executes `UrlMatcher::match($request)`. Its handling of unmatched or mismatched requests follows a strict architectural distinction:

#### 1. 405 Method Not Allowed (Immediate Short-Circuit)
When the URI path matches an existing route pattern, but the incoming HTTP verb is not permitted (`$result->isMethodFailure()`):
- If the HTTP verb is `OPTIONS`, `Router::process()` returns a `204 No Content` response with the `Allow` header listing permitted methods.
- For other verbs, `Router::process()` immediately returns a `405 Method Not Allowed` response with the `Allow` header populated (e.g. `Allow: GET, HEAD`).
- **Pipeline Short-Circuit:** The downstream handler `$handler->handle($request)` is **never invoked**. Middlewares and handlers placed after `Router` will not see 405 requests.

#### 2. 404 Route Not Found (Delegated to Next Handler)
When no declared route matches the incoming URI path (`!$result->isSuccess()` and `!$result->isMethodFailure()`):
- `Router::process()` does **NOT** generate a 404 response.
- It immediately invokes the next pipeline handler: `return $handler->handle($request);`.
- **Architectural Consequence:** This allows downstream fallback routers (such as `Yiisoft\FileRouter\FileRouter`, see §7) or a terminal custom `NotFoundHandler` at the end of the application stack to catch and handle the request.

### 5.3. Canonical Middleware Sequence

When attaching middlewares to groups and routes, declare them in this canonical order:

1. **CORS / Preflight Handling:** `CorsAllowAllMiddleware` from `yiisoft/http-middleware` (processes `OPTIONS` before authentication).
2. **Response Formatting:** `DataResponseMiddleware` from `yiisoft/data-response` (intercepts `DataResponse` on egress and serializes to JSON/XML).
3. **Request Body Parsing:** `RequestBodyParser` from `yiisoft/request-body-parser` (deserializes JSON/XML payload before validation or guards inspect it).
4. **Session / Cookies:** `SessionMiddleware` from `yiisoft/session` (restores session state and user identity).
5. **CSRF Protection:** `CsrfTokenMiddleware` from `yiisoft/csrf` (validates CSRF token for web state-changing verbs).
6. **Authentication & Authorization:** `Authentication` (`Yiisoft\Auth\Middleware\Authentication`, no `Middleware` suffix in the class name), `AccessCheckerInterface` (`yiisoft/access`).
7. **Rate Limiting:** `LimitRequestsMiddleware` (`yiisoft/rate-limiter`) throttles requests per authenticated identity.
8. **Action Handler:** Presentation Action.

```php
declare(strict_types=1);

use App\Presentation\Action\Shop\CheckoutAction;
use App\Presentation\Middleware\ApiAuthMiddleware;
use App\Presentation\Middleware\RateLimitMiddleware;
use App\Presentation\Middleware\ValidateCheckoutPayloadMiddleware;
use Yiisoft\DataResponse\Middleware\DataResponseMiddleware;
use Yiisoft\Request\Body\RequestBodyParser;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route\Post;

return [
    (new Group('/api/v1'))
        ->middleware(
            DataResponseMiddleware::class,
            RequestBodyParser::class,
            ApiAuthMiddleware::class,
            RateLimitMiddleware::class,
        )
        ->routes(
            (new Post('/checkout'))
                ->action(CheckoutAction::class)
                ->middleware(ValidateCheckoutPayloadMiddleware::class)
                ->name('checkout'),
        ),
];
```

### 5.4. `middleware()` vs. `prependMiddleware()` & Smart Splice Insertion

- `->middleware(...)`: Appends middleware definitions to the end of the stack.
- `->prependMiddleware(...)`: Prepends middleware definitions to the beginning of the stack via `array_unshift` (executed first on ingress).

#### Smart Splice Insertion (`Route::middleware`)
In `Yiisoft\Router\Route`, if an action handler has already been registered via `->action(...)`, calling `->middleware(...)` does not append after the action. Instead, `Route::middleware()` executes `array_splice()` to insert the middleware **immediately before the action handler**.

The action handler is **always guaranteed to be executed last** in the route's middleware stack, even if `->middleware()` is chained after `->action()`:

```php
// Both yield the identical execution order: RateLimitMiddleware -> ViewUserAction
$route1 = (new Get('/users/{id:\d+}'))
    ->middleware(RateLimitMiddleware::class)
    ->action(ViewUserAction::class);

$route2 = (new Get('/users/{id:\d+}'))
    ->action(ViewUserAction::class)
    ->middleware(RateLimitMiddleware::class);
```

### 5.5. Route Access Control & RBAC Protection

Routes and route groups can be protected with authentication and role/permission authorization middlewares:

```php
declare(strict_types=1);

use App\Presentation\Action\Admin\DashboardAction;
use App\Presentation\Action\Post\CreatePostAction;
use App\Presentation\Middleware\AccessCheckerMiddleware;
use Yiisoft\Auth\Middleware\Authentication;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route\Get;
use Yiisoft\Router\Route\Post;

return [
    // Group protected by authentication and permission checks
    (new Group('/admin'))
        ->middleware(Authentication::class)
        ->middleware(new AccessCheckerMiddleware(permission: 'adminAccess'))
        ->routes(
            (new Get('/dashboard'))
                ->action(DashboardAction::class)
                ->name('admin.dashboard'),
            (new Post('/posts'))
                ->action(CreatePostAction::class)
                ->middleware(new AccessCheckerMiddleware(permission: 'managePosts'))
                ->name('admin.posts.create'),
        ),
];
```

> [!TIP]
> For identity storage, token authentication, and defining role/permission hierarchies in `yiisoft/rbac`, see [Authentication & RBAC Guide](auth-and-rbac.md).

---

## 6. URL Generation & Reverse Routing (`UrlGeneratorInterface`)

Never hardcode URLs or URI strings in actions, console commands, views, or emails. Inject `Yiisoft\Router\UrlGeneratorInterface` (implemented by `Yiisoft\Router\FastRoute\UrlGenerator`).

### 6.1. Relative and Absolute URL Generation (RFC 3986 & CLI)

```php
declare(strict_types=1);

namespace App\Application\Service;

use Yiisoft\Router\UrlGeneratorInterface;

final readonly class OrderUrlService
{
    public function __construct(
        private UrlGeneratorInterface $urlGenerator,
    ) {}

    public function createLinks(string $orderId): array
    {
        return [
            // Relative URL: /orders/123?tab=items#summary
            'view' => $this->urlGenerator->generate(
                name: 'order.view',
                arguments: ['id' => $orderId],
                queryParameters: ['tab' => 'items'],
                hash: 'summary',
            ),

            // Absolute URL: https://orders.example.com/orders/123
            'absolute' => $this->urlGenerator->generateAbsolute(
                name: 'order.view',
                arguments: ['id' => $orderId],
                queryParameters: [],
                hash: null,
                scheme: 'https',
                host: 'orders.example.com',
            ),
        ];
    }
}
```

#### RFC 3986 Compliance & `encodeRaw`

`UrlGenerator` defaults to RFC 3986 compliant URL path encoding (`rawurlencode()`):
- Spaces are encoded as `%20`.
- Tildes `~` remain unencoded.
- Controlled via `$params['yiisoft/router-fastroute']['encodeRaw']` (default `true`). Setting this to `false` falls back to legacy form encoding `urlencode()` (spaces as `+`, `~` as `%7E`).

#### Extra Arguments Become Query Parameters

Any arguments passed to `$urlGenerator->generate($name, $arguments)` that do not match route placeholders are automatically transferred into `$queryParameters`:

```php
// Route pattern: '/posts/{id:\d+}'
// Result: '/posts/42?page=2&sort=desc'
$url = $urlGenerator->generate('post.view', [
    'id' => 42,
    'page' => 2,
    'sort' => 'desc',
]);
```

#### CLI / Console URL Generation Fallback

In CLI commands, cron jobs, or background queue jobs, there is no active incoming HTTP request. Therefore, `CurrentRoute::getUri()` returns `null`.

When calling `generateAbsolute()` in CLI:
- If neither the route nor the call specifies `$host`, and no default host is configured, `UrlGenerator::generateAbsolute()` falls back to returning a **relative URL** (`/posts/42`)!
- **Solution:** Configure default CLI host and scheme in `config/params-console.php` (or `config/params.php`):

```php
declare(strict_types=1);

return [
    'yiisoft/router-fastroute' => [
        'host' => 'example.com',
        'scheme' => 'https',
    ],
];
```

### 6.2. Mutating Current Route (`generateFromCurrent()`)

For pagination links, filtering, sorting, or language switchers, use `generateFromCurrent()`.

> [!WARNING]
> **Named Argument Warning for PHP 8:**
> The first parameter of `generateFromCurrent()` is named **`$replacedArguments`**, not `$arguments`. Using `arguments:` with named arguments will trigger a fatal `Error: Unknown named parameter $arguments`.

```php
declare(strict_types=1);

namespace App\Presentation\Action\Catalog;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Router\UrlGeneratorInterface;

final readonly class CatalogIndexAction
{
    public function __construct(
        private UrlGeneratorInterface $urlGenerator,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        // Replaces 'page' in current route arguments, adds query parameters
        $nextPageUrl = $this->urlGenerator->generateFromCurrent(
            replacedArguments: ['page' => 2],
            queryParameters: ['sort' => 'price_asc'],
            hash: null,
            fallbackRouteName: 'catalog.index',
        );

        return $this->responseFactory->createResponse([
            'nextPage' => $nextPageUrl,
        ]);
    }
}
```

### 6.3. Ingress Subfolder Handling & URL Prefixing (`Yiisoft\Yii\Middleware\Subfolder`)

When a Yii3 application is hosted in a subfolder (e.g. `https://example.com/my-subfolder/`), two challenges arise:
1. Incoming requests carry the `/my-subfolder` prefix, which would fail route matching against standard route definitions like `/users`.
2. Outgoing URLs generated via `$urlGenerator->generate()` must automatically include the `/my-subfolder` prefix.

`Yiisoft\Yii\Middleware\Subfolder` resolves both issues at the ingress boundary.

#### Constructor Signature

```php
public function __construct(
    private UrlGeneratorInterface $uriGenerator,
    private Aliases $aliases,
    private ?string $prefix = null,
    private ?string $baseUrlAlias = '@baseUrl',
)
```

#### Lifecycle & Behavior

1. **Ingress Path Slicing:** `Subfolder` detects or extracts the base URL (e.g. `/my-subfolder`). It slices this prefix from the request URI path so that downstream middlewares (`Router`) see clean relative paths (`/users`).
2. **Outbound URL Generator Synchronization:** It immediately calls `$this->uriGenerator->setUriPrefix($baseUrl)`. All subsequent calls to `$urlGenerator->generate()` throughout the request cycle automatically prepend `/my-subfolder`.
3. **Alias Registration:** It registers the detected base path with `Yiisoft\Aliases\Aliases` under `@baseUrl` (`$aliases->set('@baseUrl', $baseUrl)`), making it available to asset publishers and template helpers.
4. **Auto-Detection Mode:** If `$prefix` is omitted (`null`), `Subfolder` automatically derives the web path from `$_SERVER` environment variables (`SCRIPT_FILENAME`, `PHP_SELF`, `ORIG_SCRIPT_NAME`, `DOCUMENT_ROOT`).

```php
declare(strict_types=1);

// In application middleware pipeline (e.g. config/params-web.php):
use Yiisoft\Router\Middleware\Router;
use Yiisoft\Yii\Middleware\Subfolder;

return [
    'middlewares' => [
        // MUST precede Router middleware:
        Subfolder::class,
        Router::class,
    ],
];
```

### 6.4. Multilingual Routing & Locale Management (`Yiisoft\Yii\Middleware\Locale`)

For multilingual websites, `Yiisoft\Yii\Middleware\Locale` provides comprehensive locale detection, URL localization, and SEO canonicalization.

#### Multilingual Route Table Setup

Define a language prefix in your route groups:

```php
declare(strict_types=1);

use App\Presentation\Action\Site\AboutAction;
use App\Presentation\Action\Site\HomeAction;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route\Get;

return [
    (new Group('/{_language:[a-z]{2}}'))
        ->routes(
            (new Get('/'))
                ->action(HomeAction::class)
                ->name('site.home'),

            (new Get('/about'))
                ->action(AboutAction::class)
                ->name('site.about'),
        ),
];
```

#### `Locale` Middleware Features

1. **4-Stage Resolution Priority:**
   - (1) URI path prefix (`/en/...`, `/de/...`).
   - (2) Query parameter (default `_language`).
   - (3) Cookie (default `_language`).
   - (4) `Accept-Language` header (when enabled via `->withDetectLocale(true)`).
2. **SEO Canonicalization (302 Redirect):**
   If a client requests the default locale with an explicit prefix (e.g. `GET /en/about` when `'en'` is the default), `Locale` strips the prefix and issues a **302 redirect** (`Status::FOUND`) to `/about`.
3. **Transparent Ingress Rewriting:**
   When a request arrives without a locale prefix (`/about`), and the resolved locale is the default locale, `Locale` internally rewrites the request path to `/{defaultLocale}/about` before passing it to `$handler`. This allows the route group `Group('/{_language:[a-z]{2}}')` to match cleanly without duplicate route definitions.
4. **URL Generator Integration:**
   For non-default locales, `Locale` calls `$urlGenerator->setDefaultArgument('_language', $locale)`. You do **not** need to manually pass `['_language' => $locale]` in actions or views. For the default locale, it resets the default argument to `null`.
5. **Translator Event Synchronization:**
   Upon resolving the locale, it dispatches `Yiisoft\Yii\Middleware\Event\SetLocaleEvent`, allowing `yiisoft/translator` to update its active translation locale.

```php
declare(strict_types=1);

use Yiisoft\Yii\Middleware\Locale;

// Configuring Locale in DI container (config/di-web.php):
return [
    Locale::class => static fn(Locale $locale) => $locale
        ->withSupportedLocales([
            'en' => 'en-US',
            'de' => 'de-DE',
            'ru' => 'ru-RU',
        ])
        ->withDefaultLocale('en')
        ->withDetectLocale(true),
];
```

> [!IMPORTANT]
> **Pipeline Ordering Invariant:**
> The routing ingress pipeline order is strictly constrained:
> `Subfolder` -> `Locale` -> `Router`.
> `Subfolder` must run first so `Locale` sees clean paths. `Locale` must run before `Router` so that rewritten paths and localized default arguments are available during route matching.

### 6.5. Declarative Route Redirects (`Yiisoft\Yii\Middleware\Redirect`)

For URL migrations, redirects, or vanity routes, `Yiisoft\Yii\Middleware\Redirect` enables declarative redirects directly in route definitions:

```php
declare(strict_types=1);

use Yiisoft\Router\CurrentRoute;
use Yiisoft\Router\Route\Get;
use Yiisoft\Yii\Middleware\Redirect;

return [
    // Permanent 301 redirect to named route
    (new Get('/old-dashboard'))
        ->middleware(
            static fn(Redirect $redirect) => $redirect->toRoute('admin.dashboard')->permanent()
        ),

    // Temporary 302 redirect with parameters
    (new Get('/legacy-user/{id:\d+}'))
        ->middleware(
            static fn(Redirect $redirect, CurrentRoute $currentRoute) => $redirect
                ->toRoute('user.view', ['id' => $currentRoute->getArgument('id')])
                ->temporary()
        ),

    // Redirect to external URL
    (new Get('/docs'))
        ->middleware(
            static fn(Redirect $redirect) => $redirect->toUrl('https://yiiframework.com')->permanent()
        ),
];
```

- **Short-Circuiting:** `Redirect::process()` does **not** invoke `$handler->handle($request)`. It immediately creates and returns a redirect response with the `Location` header.
- **Routing Integration:** Unlike `Yiisoft\HttpMiddleware\RedirectMiddleware` (which requires static URLs), `Yiisoft\Yii\Middleware\Redirect` injects `UrlGeneratorInterface` and resolves route names and route parameters dynamically.

### 6.6. URL Generation Exceptions

`UrlGeneratorInterface` methods can throw the following exceptions:

- `Yiisoft\Router\RouteNotFoundException`: Thrown when the requested route name does not exist in `RouteCollection`.
- `\RuntimeException`: Thrown by `UrlGenerator::generate()` when required route arguments are missing, or when provided argument values fail FastRoute regex validation (e.g. passing a string `'abc'` to `{id:\d+}`).
- `\InvalidArgumentException`: Thrown by `UrlGenerator::setDefaultArgument()` if the passed value is not a scalar, `null`, or `\Stringable`.

---

## 7. Alternative & Convention-Based Routing (`yiisoft/file-router`)

For rapid prototyping, admin panels, or file-structure-based routing similar to Next.js or Nuxt, Yii3 provides `yiisoft/file-router`. It maps incoming request URI paths directly to controller classes and methods based on PSR-4 directory structure and class naming conventions.

### 7.1. FileRouter Architecture & Conventions

`Yiisoft\FileRouter\FileRouter` implements PSR-15 `MiddlewareInterface`. It is completely autonomous and has **zero dependencies on `yiisoft/router` or FastRoute**.

| Setting | Default Value | Setter Method |
|---|---|---|
| **Namespace** | `'App'` | `->withNamespace(string $namespace)` |
| **Base Directory** | `'Controller'` | `->withBaseControllerDirectory(string $directory)` |
| **Class Postfix** | `'Controller'` | `->withClassPostfix(string $postfix)` |
| **Default Controller** | `'Index'` | `->withDefaultControllerName(string $name)` |
| **Route Prefix** | `''` | `->withRoutePrefix(string $prefix)` |

#### Two-Stage Candidate Resolution

When resolving `/user/blog`:
- **Candidate 1:** `App\Controller\User\BlogController` (action determined by HTTP verb, e.g. `index()`).
- **Candidate 2:** `App\Controller\UserController::blog()` (action method named after the sub-path segment).

#### Critical Caveats & Traps

> [!CAUTION]
> **1. The Hyphen / Kebab-Case Trap (`#/.#u`):**
> `FileRouter` uses `preg_replace_callback('#/.#u', ...)` which capitalizes **only the single character immediately following each slash `/`**. Intra-segment hyphens are **not** converted to camelCase.
> Therefore, `/user-profile` resolves to `App\Controller\User-profileController`. Because hyphens are illegal in PHP class identifiers, `class_exists()` returns `false` and the route is skipped!
> **Solution:** Use camelCase in URIs (`/userProfile`) or single words (`/user`).
>
> **2. No Interaction with `CurrentRoute` & `#[RouteArgument]`:**
> `FileRouter` does **not** populate `Yiisoft\Router\CurrentRoute`. Calling `$currentRoute->getName()` returns `null`, and `#[RouteArgument]` attributes will not resolve. Controllers routed by `FileRouter` must read parameters from `$request->getQueryParams()` or the request body.
>
> **3. Sub-Path Action Methods Ignore HTTP Verbs:**
> When matching Candidate 2 (`UserController::blog()`), the sub-path action name (`blog`) takes precedence over HTTP verb mapping. The method will be executed for `GET`, `POST`, `PUT`, or `DELETE` requests unless restricted by controller middleware.

### 7.2. Creating a FileRouter Controller

In `FileRouter`, controllers define methods matching clean, lowercase HTTP verbs (`index()`, `create()`, `update()`, `delete()`, `patch()`, `head()`, `options()`).

> [!NOTE]
> There are **no action prefixes** (e.g. not `actionIndex`) and **no verb prefixes** (e.g. not `getIndex`).

```php
declare(strict_types=1);

namespace App\Controller\User;

use App\Presentation\Middleware\ApiAuthMiddleware;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;

final class ProfileController
{
    /**
     * Optional: Override default HTTP verb method mappings.
     * Keys MUST be uppercase ('GET', 'POST', 'PUT', 'DELETE').
     *
     * WARNING: Defining $actions completely replaces the default map!
     *
     * @var array<string, string>
     */
    public static array $actions = [
        'GET' => 'index',
        'POST' => 'update',
    ];

    /**
     * Optional: Per-action middleware pipeline executed before action method.
     *
     * @var array<string, list<array|callable|string>>
     */
    public static array $middlewares = [
        'update' => [
            ApiAuthMiddleware::class,
        ],
    ];

    public function __construct(
        private readonly DataResponseFactoryInterface $responseFactory,
    ) {}

    public function index(ServerRequestInterface $request): ResponseInterface
    {
        return $this->responseFactory->createResponse(['status' => 'profile-view']);
    }

    public function update(ServerRequestInterface $request): ResponseInterface
    {
        return $this->responseFactory->createResponse(['status' => 'profile-updated']);
    }
}
```

> [!WARNING]
> **Uppercase Keys in `$actions`:**
> `FileRouter` checks `$controllerClass::$actions[$request->getMethod()]`. Because `$request->getMethod()` returns uppercase (`'GET'`), using lowercase keys (`'get' => 'index'`) fails to match, evaluating to `null`.

### 7.3. Pipeline Integration & Fallback Router Pattern

`FileRouter` implements PSR-15 `MiddlewareInterface`. If no matching controller or method exists, `FileRouter` **never throws an exception and never returns 404/405**. It delegates unconditionally to `$handler->handle($request)`.

This makes it an ideal fallback router placed after `Yiisoft\Router\Middleware\Router`:

```php
declare(strict_types=1);

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Yiisoft\FileRouter\FileRouter;

final readonly class FileRouterFallbackMiddleware implements MiddlewareInterface
{
    public function __construct(
        private FileRouter $fileRouter,
    ) {}

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        return $this->fileRouter
            ->withNamespace('App')
            ->withBaseControllerDirectory('Controller')
            ->withClassPostfix('Controller')
            ->process($request, $handler);
    }
}
```

---

## 8. Critical Caveats & Worker Environment Traps

### 8.1. Immutability of Route and Group

Every configuration method on `Route` and `Group` (`name()`, `action()`, `middleware()`, `defaults()`, `host()`, `pattern()`, `withCors()`, `disableMiddleware()`) returns a **cloned instance** (`$route = clone $this`).

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
| **Calling `generateAbsolute()` in CLI without host configuration** | In CLI, `$uri` is `null`; without configured host/scheme, falls back to returning relative URL `/path`. | Configure `$params['yiisoft/router-fastroute']['host']` and `'scheme'` in `config/params-console.php`. |
| **Expecting custom 404 handler to catch 405 errors** | `Router` handles 405 directly with `Allow` header; does not delegate to `$handler`. | Configure 405 error rendering in a dedicated response decorator or global error catcher. |
| **Disabling FastRoute cache in production** | Recompiles all routes on every request, creating unnecessary CPU overhead. | Set `'enableCache' => true` in production and clear/pre-warm cache during deployment. |

---

## 10. Related Topic Guides

- [Actions & Controllers Guide](actions-and-controllers.md) — Single-action controllers, PSR-7 response factories, and input DTO hydration.
- [PSR-15 Middlewares Guide](middlewares.md) — Middleware pipeline flow, official middlewares catalog, and custom guards.
- [Authentication & RBAC Guide](auth-and-rbac.md) — Route access control, authentication middlewares, and RBAC permission checks.
- [OpenAPI & Swagger Guide](openapi-swagger.md) — Documenting routes, endpoints, and schemas with PHP 8 attributes.
- [I18n & Translation Guide](i18n-translation.md) — Message translation, category sources, and integration with `SetLocaleEvent`.
