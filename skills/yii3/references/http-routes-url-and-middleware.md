# Yii3 Routing: Middleware Ordering & URL Generation

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Part of the [HTTP Routing Guide](http-routes.md) split — worker-environment caveats, the anti-pattern matrix, and related guides live there.

## 5. Middleware Pipeline & Execution Order

Route middleware execution follows the standard PSR-15 **onion / pipeline model (FIFO on Request Ingress, LIFO on Response Egress)**.

> [!TIP]
> For complete instructions on authoring custom PSR-15 middlewares, global application pipelines, and the official middleware catalog, see [PSR-15 Middlewares Guide](http-middlewares.md).

### 5.1. Execution Order Hierarchy (The Onion Model)

The routing-specific aspect of the onion model is the nesting depth of the matched route: **global application middlewares → `Yiisoft\Router\Middleware\Router` → group middlewares → route middlewares → action handler**. Each level wraps the next on request ingress (FIFO) and unwinds in reverse order on response egress (LIFO).

> [!TIP]
> **Onion Model Reference:**
> For the complete pipeline diagram, the three middleware functional roles (pre-processing, post-processing, short-circuiting), and `MiddlewareDispatcher` mechanics, see the [PSR-15 Middlewares Guide, §1.1 "Pipeline Flow (The Onion Model)"](http-middlewares.md#11-pipeline-flow-the-onion-model).

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

The canonical ordering of common middlewares (CORS → response formatting → body parsing → session → CSRF → authentication → guards → action) is owned by the [PSR-15 Middlewares Guide](http-middlewares.md): see [§4.1 "Global Application Pipeline"](http-middlewares.md#41-global-application-pipeline-configwebdiapplicationphp) — including the authenticated-pipeline invariant — and [§4.2 "Route Group Pipeline"](http-middlewares.md#42-route-group-pipeline-configwebroutesphp). From the routing side, middlewares are attached to a group (executing for every route inside it) and optionally refined per route:

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

Route and group level authorization chains `Yiisoft\Auth\Middleware\Authentication` with an RBAC permission guard (`AccessCheckerMiddleware`) attached via `->middleware(...)` at either group or single-route scope. The guard depends on `CurrentUser` and a response factory, so it must be instantiated through a container closure — attaching it as a bare `new AccessCheckerMiddleware(...)` instance breaks DI resolution.

> [!TIP]
> **RBAC Permission Guard Reference:**
> For the canonical `AccessCheckerMiddleware` recipe — group and single-route attachment, container-closure construction, and the `Authentication → LoginMiddleware → AccessCheckerMiddleware` ordering invariant — see the [PSR-15 Middlewares Guide, §2.6 "RBAC Permission Guard (`AccessCheckerMiddleware`)"](http-middlewares.md#26-rbac-permission-guard-accesscheckermiddleware). For identity storage, token authentication, and defining role/permission hierarchies in `yiisoft/rbac`, see the [Authentication & RBAC Guide](infra-auth-and-rbac.md).

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
3. **Alias Registration (auto-detection mode only):** When `$prefix` is `null`, it registers the detected base path with `Yiisoft\Aliases\Aliases` under the alias named by `$baseUrlAlias` (default `@baseUrl`) via `$aliases->set($this->baseUrlAlias, $baseUrl)`, making it available to asset publishers and template helpers. An explicit `$prefix` registers no alias.
4. **Auto-Detection Mode:** If `$prefix` is omitted (`null`), `Subfolder` automatically derives the web path from `$_SERVER` environment variables (`SCRIPT_FILENAME`, `PHP_SELF`, `ORIG_SCRIPT_NAME`, `DOCUMENT_ROOT`).

Register `Subfolder` in the global HTTP middleware pipeline **before** `Router`. There is **no** `"middlewares"` params key — no package consumes it; the stack is wired through the `Application::class` DI definition via the `MiddlewareDispatcher` constructor argument `middlewareDefinitions` (`withMiddlewares()` is deprecated since `yiisoft/middleware-dispatcher` 5.5.0).

The routing-relevant placement invariant is:

`ErrorCatcher` → `Subfolder` → `Locale` (§6.4) → `Router`

`Subfolder` **must** precede `Router`: it slices the subfolder prefix from the request path before route matching. If `Router` runs first, every route match fails with a 404 because the request path still carries the prefix.

> [!TIP]
> **Canonical Global Pipeline Wiring:**
> For the canonical `Application::class` / `MiddlewareDispatcher` wiring with the full middleware stack, see the [PSR-15 Middlewares Guide, §4.1 "Global Application Pipeline"](http-middlewares.md#41-global-application-pipeline-configwebdiapplicationphp). For the outermost `ErrorCatcher` layer and pipeline ordering, see the [Error Handling Guide, §2](infra-error-handling-web.md#2-errorcatcher-middleware--pipeline-ordering).

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

#### `Locale` Middleware: Routing-Relevant Behavior

1. **Transparent Ingress Rewriting:**
   When a request arrives without a locale prefix (`/about`), and the resolved locale is the default locale, `Locale` internally rewrites the request path to `/{defaultLocale}/about` before passing it to `$handler`. This allows the route group `Group('/{_language:[a-z]{2}}')` to match cleanly without duplicate route definitions.
2. **SEO Canonicalization (302 Redirect):**
   If a client requests the default locale with an explicit prefix (e.g. `GET /en/about` when `'en'` is the default), `Locale` strips the prefix and issues a **302 redirect** (`Status::FOUND`) to `/about`.
3. **URL Generator Coupling (`_language`):**
   For non-default locales, `Locale` calls `$urlGenerator->setDefaultArgument('_language', $locale)`. You do **not** need to manually pass `['_language' => $locale]` in actions or views. For the default locale, it resets the default argument to `null`.

> [!IMPORTANT]
> **Pipeline Ordering Invariant:**
> The routing ingress pipeline order is strictly constrained:
> `Subfolder` -> `Locale` -> `Router`.
> `Subfolder` must run first so `Locale` sees clean paths. `Locale` must run before `Router` so that rewritten paths and localized default arguments are available during route matching.

> [!TIP]
> **Locale Resolution Reference:**
> For the complete locale resolution mechanics — the 4-stage resolution priority (URL path prefix → `_language` query parameter → cookie → `Accept-Language`), cookie/header gating, `SetLocaleEvent` translator synchronization, the constructor signature, and DI registration — see the [I18n & Translation Guide, §6.2 "Locale Middleware (`yii-middleware`)"](http-i18n-storage-and-locale.md#62-locale-middleware-yii-middleware).

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
