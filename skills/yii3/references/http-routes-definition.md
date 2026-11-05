# Yii3 Routing: Route Definitions, Groups & Route Arguments

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Part of the [HTTP Routing Guide](http-routes.md) split — worker-environment caveats, the anti-pattern matrix, and related guides live there.

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
> For detailed instructions on writing single-action invokable controllers, parameter resolution, and PSR-7 response generation, see [Actions & Controllers Guide](http-actions-and-controllers.md).

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
> `Router::process()` calls `$currentRoute->setUri($request->getUri())` **after route matching but before the 404/405 response checks**. As a result, `$currentRoute->getUri()` is **always available**, even on 404 (Not Found) or 405 (Method Not Allowed) responses.

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
