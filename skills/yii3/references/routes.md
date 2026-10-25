# Yii3 HTTP Routing Guide

> Practical guide for route definitions, route groups, middleware stacks, URL generation, and route argument handling using `yiisoft/router`, `yiisoft/router-fastroute`, `yiisoft/file-router`, and official Yii3 components.
>
> **Source of Truth & Verification Rule for AI Models:**
> In projects using this extension, always verify exact method signatures, constructor arguments, and options directly in `vendor/yiisoft/<package>/src/` for installed packages.
> When generating code, if an installed package's method signature or property is unfamiliar or in doubt, **read its source files in `vendor/yiisoft/<package>/src/`** rather than guessing or relying on Yii2 habits.

---

## Table of Contents
- [1. Route Definition Architecture & Modern Syntax](#1-route-definition-architecture--modern-syntax)
  - [1.1. Dedicated HTTP Verb Classes](#11-dedicated-http-verb-classes)
  - [1.2. Type-Safe Route Names with Backed Enums](#12-type-safe-route-names-with-backed-enums)
  - [1.3. Supported Action Handler Formats](#13-supported-action-handler-formats)
- [2. FastRoute Argument Patterns, Constraints & Defaults](#2-fastroute-argument-patterns-constraints--defaults)
  - [2.1. Parameter Constraints & Regex Rules](#21-parameter-constraints--regex-rules)
  - [2.2. Parameter Defaults](#22-parameter-defaults)
  - [2.3. Host-Based Matching & Subdomains](#23-host-based-matching--subdomains)
- [3. Route Groups & Nested Routing (Yiisoft\\Router\\Group)](#3-route-groups--nested-routing-yiisoftroutergroup)
  - [3.1. Defining Nested Groups](#31-defining-nested-groups)
  - [3.2. Selective Middleware Exclusion (->disableMiddleware(...))](#32-selective-middleware-exclusion--disablemiddleware)
  - [3.3. Built-In CORS Support (->withCors(...))](#33-built-in-cors-support--withcors)
- [4. Accessing Route Arguments in Actions & Middlewares](#4-accessing-route-arguments-in-actions--middlewares)
  - [4.1. The Injected CurrentRoute Service](#41-the-injected-currentroute-service)
  - [4.2. Hydrator Parameter Resolution (#[RouteArgument])](#42-hydrator-parameter-resolution-routeargument)
  - [4.3. Critical Traps & Ingress Caveats](#43-critical-traps--ingress-caveats)
- [5. Middleware Pipeline & Execution Order](#5-middleware-pipeline--execution-order)
  - [5.1. Execution Order Hierarchy (The Onion Model)](#51-execution-order-hierarchy-the-onion-model)
  - [5.2. Canonical Middleware Sequence](#52-canonical-middleware-sequence)
  - [5.3. middleware() vs. prependMiddleware()](#53-middleware-vs-prependmiddleware)
- [6. URL Generation & Reverse Routing (UrlGeneratorInterface)](#6-url-generation--reverse-routing-urlgeneratorinterface)
  - [6.1. Relative and Absolute URL Generation](#61-relative-and-absolute-url-generation)
  - [6.2. Mutating Current Route (generateFromCurrent())](#62-mutating-current-route-generatefromcurrent)
  - [6.3. Default Arguments & URI Prefixes](#63-default-arguments--uri-prefixes)
  - [6.4. URL Generation Exceptions](#64-url-generation-exceptions)
- [7. Alternative & Convention-Based Routing (yiisoft/file-router)](#7-alternative--convention-based-routing-yiisoftfile-router)
  - [7.1. FileRouter Architecture & Conventions](#71-filerouter-architecture--conventions)
  - [7.2. Creating a FileRouter Controller](#72-creating-a-filerouter-controller)
  - [7.3. Pipeline Integration](#73-pipeline-integration)
- [8. Critical Caveats & Worker Environment Traps](#8-critical-caveats--worker-environment-traps)
  - [8.1. Immutability of Route and Group](#81-immutability-of-route-and-group)
  - [8.2. Long-Running Worker Reset (CurrentRoute & UrlGenerator)](#82-long-running-worker-reset-currentroute--urlgenerator)
  - [8.3. Duplicate Route Names & override()](#83-duplicate-route-names--override)
- [9. Anti-Pattern Matrix](#9-anti-pattern-matrix)

---

## 1. Route Definition Architecture & Modern Syntax

Routing in Yii3 connects incoming PSR-7 HTTP requests (`Method` + `URI path`) to a dedicated PSR-15 middleware pipeline terminating in an action handler.

Routes are declared in configuration files (typically `config/routes.php`, `config/common/routes.php`, or `config/web/routes.php`) returning an array of `Yiisoft\Router\Route` and `Yiisoft\Router\Group` instances.

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
> Dedicated verb classes also support full constructor initialization:
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
| **Controller Method Pair** | Array with `[ControllerClass, 'methodName']` | `->action([UserController::class, 'index'])` |
| **Closure / Callable** | `function(ServerRequestInterface $request): ResponseInterface` | `->action(fn(ServerRequestInterface $r): ResponseInterface => $responseFactory->createResponse())` |

---

## 2. FastRoute Argument Patterns, Constraints & Defaults

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
> Never use capturing parentheses `(a|b)` inside route parameter regexes (e.g. `{type:(photo|video)}`). Capturing groups corrupt FastRoute's internal regex matching offsets and cause parameter shifting.
> Always use **non-capturing groups** `(?:a|b)`:
> ```php
> // CORRECT: Non-capturing group
> (new Get('/media/{type:(?:photo|video)}'))->action(ViewMediaAction::class)->name('media.view');
>
> // INCORRECT: Capturing group breaks argument extraction!
> (new Get('/media/{type:(photo|video)}'))->action(ViewMediaAction::class)->name('media.view');
> ```

### 2.2. Parameter Defaults

Default values are specified via `->defaults(array $defaults)`. When an optional URL segment is omitted by the client, FastRoute merges these defaults into the route arguments:

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

### 2.3. Host-Based Matching & Subdomains

Routes can be constrained to specific domain names or subdomains using `->host(string $host)` or `->hosts(string ...$hosts)`.

`UrlMatcher` matches routes against `{host}{path}`:

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
> When calling `->hosts('tenant1.com', 'tenant2.com')` with multiple hosts, `UrlMatcher` automatically combines them into a regex `({_host:tenant1.com|tenant2.com})`. Variable placeholders are **strictly forbidden** when multiple hosts are provided (`RuntimeException: Placeholders are not allowed with multiple host names`). Placeholders are only allowed on single-host definitions.

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

        return $this->responseFactory->createResponse([
            'userId' => (int) $userId,
            'route' => $routeName,
            'pattern' => $pattern,
            'all' => $allArguments,
        ]);
    }
}
```

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
> Unlike Slim or Mezzio, Yii3's `Router` middleware does **not** push matched arguments into PSR-7 server request attributes by default.
> Calling `$request->getAttribute('id')` returns `null`. You must inject `CurrentRoute` or use `#[RouteArgument]`.
>
> **Trap 2: `CurrentRoute` is empty in pre-Router global middlewares!**
> In application-level middlewares that execute **before** `Yiisoft\Router\Middleware\Router`, route matching has not occurred yet. Calling `$currentRoute->getName()` or `$currentRoute->getArgument('id')` will return `null`.

---

## 5. Middleware Pipeline & Execution Order

Route middleware execution follows the standard PSR-15 **onion / pipeline model (FIFO on Request Ingress, LIFO on Response Egress)**.

### 5.1. Execution Order Hierarchy (The Onion Model)

```text
Incoming Request
      │
      ▼
┌────────────────────────────────────────────────────────┐
│ Global App Middlewares (ErrorCatcher, Cors, etc.)      │
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

### 5.2. Canonical Middleware Sequence

When attaching middlewares to groups and routes, declare them in this canonical order:

1. **CORS / Preflight Handling:** `CorsMiddleware` (processes `OPTIONS` before authentication).
2. **Response Formatting:** `DataResponseMiddleware` (intercepts `DataResponse` on the way out and serializes to JSON/XML).
3. **Request Body Parsing:** `RequestBodyParser` (deserializes JSON/XML payload before guards inspect it).
4. **Session / Cookies:** `SessionMiddleware` (restores session state and user identity).
5. **CSRF Protection:** `CsrfMiddleware` (validates CSRF token for web state-changing verbs).
6. **Authentication & Authorization:** `AuthenticationMiddleware`, `AccessChecker`.
7. **Rate Limiting:** `RateLimiter` (throttles requests per authenticated identity).
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

### 5.3. `middleware()` vs. `prependMiddleware()`

- `->middleware(...)`: Appends middleware definitions to the end of the stack (executed after already added middlewares, but before the terminal action).
- `->prependMiddleware(...)`: Prepends middleware definitions to the beginning of the stack (executed first on ingress).

---

## 6. URL Generation & Reverse Routing (`UrlGeneratorInterface`)

Never hardcode URLs or URI strings in actions, console commands, views, or emails. Inject `Yiisoft\Router\UrlGeneratorInterface` (implemented by `Yiisoft\Router\FastRoute\UrlGenerator`).

### 6.1. Relative and Absolute URL Generation

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

> [!NOTE]
> In `generateAbsolute()`, if `$scheme` and `$host` are omitted (`null`), `UrlGenerator` automatically infers them from the active request URI stored in `CurrentRoute`, or falls back to configured default container parameters.

### 6.2. Mutating Current Route (`generateFromCurrent()`)

For pagination links, filtering, sorting, or language switchers, use `generateFromCurrent()`.

> [!WARNING]
> **Named Argument Warning for PHP 8:**
> The first parameter of `generateFromCurrent()` is named **`$replacedArguments`**, not `$arguments`. Using `arguments:` with named arguments will trigger a PHP `Error: Unknown named parameter $arguments`.

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

### 6.3. Default Arguments & URI Prefixes

```php
declare(strict_types=1);

use Yiisoft\Router\UrlGeneratorInterface;

/** @var UrlGeneratorInterface $urlGenerator */

// Sets a global default argument (e.g. current locale) applied to all generated URLs
$urlGenerator->setDefaultArgument('locale', 'en');

// Configures base path prefix when application is deployed in a subdirectory
$urlGenerator->setUriPrefix('/my-subfolder');
```

### 6.4. URL Generation Exceptions

`UrlGeneratorInterface` methods can throw the following exceptions:

- `Yiisoft\Router\RouteNotFoundException`: Thrown when the requested route name does not exist in `RouteCollection`.
- `\RuntimeException`: Thrown by `UrlGenerator::generate()` when required route arguments are missing, or when provided argument values fail FastRoute regex validation (e.g. passing a string `'abc'` to `{id:\d+}`).

---

## 7. Alternative & Convention-Based Routing (`yiisoft/file-router`)

For rapid prototyping, admin panels, or file-structure-based routing similar to Next.js or Nuxt, Yii3 provides `yiisoft/file-router`. It resolves URLs directly to controller classes and methods based on filesystem paths.

### 7.1. FileRouter Architecture & Conventions

`Yiisoft\FileRouter\FileRouter` implements PSR-15 `MiddlewareInterface`. When processing a request, it maps the URI path to controller class names using the following configurable conventions:

| Setting | Default Value | Setter Method |
|---|---|---|
| **Namespace** | `'App'` | `->withNamespace(string $namespace)` |
| **Base Directory** | `'Controller'` | `->withBaseControllerDirectory(string $directory)` |
| **Class Postfix** | `'Controller'` | `->withClassPostfix(string $postfix)` |
| **Default Controller** | `'Index'` | `->withDefaultControllerName(string $name)` |
| **Route Prefix** | `''` | `->withRoutePrefix(string $prefix)` |

By default, `FileRouter` resolves `/user/profile` to class `App\Controller\User\ProfileController`.

> [!WARNING]
> **Namespace & Directory Redundancy:**
> Do NOT set `withNamespace('App\Controller')` AND `withBaseControllerDirectory('Controller')`. That would resolve to `App\Controller\Controller\...`. Either keep defaults (`'App'` + `'Controller'`), or set `withNamespace('App\Controller')->withBaseControllerDirectory('')`.

### 7.2. Creating a FileRouter Controller

In `FileRouter`, controllers define methods matching HTTP verbs (`index()`, `create()`, `update()`, `delete()`, `patch()`, `head()`, `options()`), or custom action mappings via `$actions`:

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
     * Defaults: GET -> index, POST -> create, PUT -> update, DELETE -> delete, PATCH -> patch.
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

### 7.3. Pipeline Integration

Because `FileRouter` implements `MiddlewareInterface`, it can be plugged directly into the application middleware pipeline as a fallback router after the primary route table:

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
> If your application injects `CurrentRoute` into custom singleton services, never cache its state in persistent service properties across requests. Always read `$this->currentRoute->getArgument(...)` dynamically inside the method call.

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
