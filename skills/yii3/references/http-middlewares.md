# Yii3 PSR-15 Middlewares Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Practical guide for implementing, configuring, and testing PSR-15 HTTP middleware pipelines using `yiisoft/middleware-dispatcher`, `yiisoft/http-middleware`, `yiisoft/router`, and official Yii3 components.

---

## Table of Contents
- [1. PSR-15 Specification & Pipeline Architecture](#1-psr-15-specification--pipeline-architecture)
  - [1.1. Pipeline Flow (The Onion Model)](#11-pipeline-flow-the-onion-model)
- [2. Implementation Recipes](#2-implementation-recipes)
  - [2.1. Request Pre-Processing (Correlation ID / Attribute Enrichment)](#21-request-pre-processing-correlation-id--attribute-enrichment)
  - [2.2. Short-Circuiting Guard (Custom API Key Authentication)](#22-short-circuiting-guard-custom-api-key-authentication)
  - [2.3. Idiomatic Authentication via yiisoft/auth](#23-idiomatic-authentication-via-yiisoftauth)
  - [2.4. Response Post-Processing (Security Headers)](#24-response-post-processing-security-headers)
  - [2.5. Exception Mapping Responder via yiisoft/error-handler](#25-exception-mapping-responder-via-yiisofterror-handler)
  - [2.6. RBAC Permission Guard (AccessCheckerMiddleware)](#26-rbac-permission-guard-accesscheckermiddleware)
- [3. Official Yii3 Middlewares Catalog](#3-official-yii3-middlewares-catalog)
  - [3.1. SessionMiddleware Behavior](#31-sessionmiddleware-behavior)
  - [3.2. CSRF Middleware Behavior](#32-csrf-middleware-behavior)
- [4. Registration Scopes & Pipelines](#4-registration-scopes--pipelines)
  - [4.1. Global Application Pipeline (config/web/di/application.php)](#41-global-application-pipeline-configwebdiapplicationphp)
  - [4.2. Route Group Pipeline (config/web/routes.php)](#42-route-group-pipeline-configwebroutesphp)
  - [4.3. Single Route Pipeline (config/web/routes.php)](#43-single-route-pipeline-configwebroutesphp)
  - [4.4. Rate Limiting Recipes (yiisoft/rate-limiter)](#44-rate-limiting-recipes-yiisoftrate-limiter)
- [5. Supported Middleware Definition Formats](#5-supported-middleware-definition-formats)
- [6. Hidden Pitfalls & Critical Gotchas](#6-hidden-pitfalls--critical-gotchas)
- [7. Anti-Pattern Matrix](#7-anti-pattern-matrix)
- [8. Related Topic Guides](#8-related-topic-guides)

---

## 1. PSR-15 Specification & Pipeline Architecture

All Yii3 middlewares implement the standard `Psr\Http\Server\MiddlewareInterface`:

```php
<?php

declare(strict_types=1);

namespace Psr\Http\Server;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Standard PSR-15 HTTP server middleware contract implemented by all Yii3 middlewares.
 */
interface MiddlewareInterface
{
    /**
     * Process an incoming server request and return a response, optionally delegating
     * response creation to a downstream handler.
     */
    public function process(
        ServerRequestInterface $request,
        RequestHandlerInterface $handler,
    ): ResponseInterface;
}
```

### 1.1. Pipeline Flow (The Onion Model)

Yii3 executes middlewares using `Yiisoft\Middleware\Dispatcher\MiddlewareDispatcher` and `Yiisoft\Middleware\Dispatcher\MiddlewareStack`. 
Middlewares wrap around each other in concentric layers:

```
 Incoming Request
        │
        ▼
┌────────────────────────────────────────────────────────┐
│ [Ingress] Middleware 1 (e.g. ErrorCatcher)             │
│   ┌──────────────────────────────────────────────────┐ │
│   │ [Ingress] Middleware 2 (e.g. SessionMiddleware)  │ │
│   │   ┌────────────────────────────────────────────┐ │ │
│   │   │ [Ingress] Middleware 3 (e.g. Auth/Guard)   │ │ │
│   │   │   ┌──────────────────────────────────────┐ │ │ │
│   │   │   │ Action Handler (Terminal Middleware) │ │ │ │
│   │   │   │ Produces ResponseInterface           │ │ │ │
│   │   │   └──────────────────────────────────────┘ │ │ │
│   │   │ [Egress] Middleware 3 (Post-processing)    │ │ │
│   │   └────────────────────────────────────────────┘ │ │
│   │ [Egress] Middleware 2 (Session Cookie Commit)    │ │
│   └──────────────────────────────────────────────────┘ │
│ [Egress] Middleware 1 (Catch Throwables)               │
└────────────────────────────────────────────────────────┘
        │
        ▼
 Emitted Response
```

Middlewares serve one of three functional roles:
1. **Request Pre-processing:** Enriches, authenticates, or sanitizes the request before passing it downstream (`$handler->handle($modifiedRequest)`).
2. **Response Post-processing:** Alters, buffers, or enriches the returned response on egress (e.g. adding security headers, calculating `Content-Length`, committing cookies).
3. **Short-Circuiting:** Halts downstream execution immediately and returns a new response without calling `$handler->handle($request)` (e.g. 401 Unauthorized, 403 Forbidden, 429 Too Many Requests, or 204 No Content for CORS preflight).

---

## 2. Implementation Recipes

### 2.1. Request Pre-Processing (Correlation ID / Attribute Enrichment)

Demonstrates reading an existing header or generating a unique ID, attaching it immutably to request attributes for downstream handlers, and echoing it back on the egress response.

```php
<?php

declare(strict_types=1);

namespace App\Presentation\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

use function bin2hex;
use function random_bytes;

/**
 * Attaches a correlation/trace Request-ID to request attributes and response headers.
 */
final class RequestIdMiddleware implements MiddlewareInterface
{
    public const ATTRIBUTE_NAME = 'requestId';
    public const HEADER_NAME = 'X-Request-Id';

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        // 1. Read existing header or generate a cryptographically secure 128-bit hex token
        $requestId = $request->getHeaderLine(self::HEADER_NAME);
        if ($requestId === '') {
            $requestId = bin2hex(random_bytes(16));
        }

        // 2. PSR-7 Immutability: withAttribute returns a new instance; MUST reassign!
        $request = $request->withAttribute(self::ATTRIBUTE_NAME, $requestId);

        // 3. Delegate to downstream handler
        $response = $handler->handle($request);

        // 4. Attach header to outgoing response
        return $response->withHeader(self::HEADER_NAME, $requestId);
    }
}
```

> [!IMPORTANT]
> **PSR-7 Immutability Rule:**
> PSR-7 request and response objects are strictly immutable. Calling `$request->withAttribute(...)` or `$response->withHeader(...)` never modifies the current object in-place; it returns a new clone. You **must** reassign the return value: `$request = $request->withAttribute(...);`.

---

### 2.2. Short-Circuiting Guard (Custom API Key Authentication)

When validation fails, a guard middleware short-circuits execution by generating and returning a `ResponseInterface` directly without calling `$handler->handle($request)`.

```php
<?php

declare(strict_types=1);

namespace App\Presentation\Middleware;

use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;

use function json_encode;

use const JSON_THROW_ON_ERROR;

/**
 * Contract for verifying API keys.
 */
interface ApiKeyRepositoryInterface
{
    public function isValid(string $apiKey): bool;
}

/**
 * Short-circuiting authentication guard middleware.
 */
final readonly class ApiKeyAuthMiddleware implements MiddlewareInterface
{
    public const HEADER_NAME = 'X-API-KEY';

    public function __construct(
        private ApiKeyRepositoryInterface $apiKeys,
        private ResponseFactoryInterface $responseFactory,
    ) {}

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $apiKey = $request->getHeaderLine(self::HEADER_NAME);

        if ($apiKey === '' || !$this->apiKeys->isValid($apiKey)) {
            // Short-circuit: do NOT call $handler->handle($request)
            $response = $this->responseFactory->createResponse(Status::UNAUTHORIZED);
            $response->getBody()->write(
                json_encode(['error' => 'Unauthorized: Invalid or missing API key.'], JSON_THROW_ON_ERROR),
            );

            return $response->withHeader(Header::CONTENT_TYPE, 'application/json');
        }

        return $handler->handle($request);
    }
}
```

---

### 2.3. Idiomatic Authentication via `yiisoft/auth`

Yii3 provides the official `Yiisoft\Auth\Middleware\Authentication` middleware. It delegates identity verification to standard authenticators (such as `HttpBearer` or `HttpHeader`) and automatically binds the authenticated identity to `$request->getAttribute(Authentication::class)`.

Downstream actions only need to read that attribute — the middleware guarantees it is populated, or the request was already rejected with a `401` challenge:

```php
// App\Presentation\Action\ProfileAction
public function __invoke(ServerRequestInterface $request): ResponseInterface
{
    /** @var IdentityInterface|null $identity */
    $identity = $request->getAttribute(Authentication::class);
    // ... build the PSR-7 response for the authenticated identity
}
```

> [!TIP]
> **Actions & Controllers Reference:**
> For the complete action-layer recipes on authentication and authorization (login/logout actions, guarding route
> groups, identity injection into action signatures, and permission checks), see the
> [Actions & Controllers Guide, §3.8 "Authentication & Authorization"](http-actions-and-controllers.md#38-authentication--authorization-yiisoftuser-yiisoftauth-jwt).

---

### 2.4. Response Post-Processing (Security Headers)

Enriches outgoing HTTP responses with standard security headers using typed constants from `Yiisoft\Http\Header`.

```php
<?php

declare(strict_types=1);

namespace App\Presentation\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Yiisoft\Http\Header;

final class SecurityHeadersMiddleware implements MiddlewareInterface
{
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        // Process downstream pipeline first to receive generated response
        $response = $handler->handle($request);

        return $response
            ->withHeader(Header::X_CONTENT_TYPE_OPTIONS, 'nosniff')
            ->withHeader(Header::X_FRAME_OPTIONS, 'DENY')
            ->withHeader(Header::X_XSS_PROTECTION, '1; mode=block')
            ->withHeader(Header::REFERRER_POLICY, 'strict-origin-when-cross-origin');
    }
}
```

---

### 2.5. Exception Mapping Responder via `yiisoft/error-handler`

Yii3 provides `Yiisoft\ErrorHandler\Middleware\ExceptionResponder`, which intercepts domain exceptions and maps them directly to HTTP status codes or custom response-generating callables resolved by `Yiisoft\Injector\Injector`.

```php
<?php

declare(strict_types=1);

namespace App\Infrastructure\Configuration;

use DomainException;
use InvalidArgumentException;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\ErrorHandler\Middleware\ExceptionResponder;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;
use Yiisoft\Injector\Injector;

use function json_encode;

use const JSON_THROW_ON_ERROR;

final class ExceptionResponderFactory
{
    public function create(ResponseFactoryInterface $responseFactory, Injector $injector): ExceptionResponder
    {
        return new ExceptionResponder(
            exceptionMap: [
                // 1. Integer format: maps exception to HTTP status code directly
                DomainException::class => Status::NOT_FOUND,

                // 2. Callable format: receives injected dependencies and builds custom response
                InvalidArgumentException::class => static function (
                    InvalidArgumentException $exception,
                    ResponseFactoryInterface $factory,
                ): ResponseInterface {
                    $response = $factory->createResponse(Status::BAD_REQUEST);
                    $response->getBody()->write(
                        json_encode([
                            'error' => 'Invalid Request',
                            'message' => $exception->getMessage(),
                        ], JSON_THROW_ON_ERROR),
                    );

                    return $response->withHeader(Header::CONTENT_TYPE, 'application/json');
                },
            ],
            responseFactory: $responseFactory,
            injector: $injector,
            checkResponseBody: false,
        );
    }
}
```

---

### 2.6. RBAC Permission Guard (`AccessCheckerMiddleware`)

Beyond authentication, route-level **authorization** is enforced with a short PSR-15 guard that checks an RBAC permission for the current user before the action runs. Roles, permissions, assignments, and dynamic rules are defined in the RBAC layer — see the [Authentication & RBAC Guide, §8 "Role-Based Access Control (RBAC) Architecture"](infra-auth-and-rbac.md#8-role-based-access-control-rbac-architecture).

```php
declare(strict_types=1);

namespace App\Presentation\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\User\CurrentUser;

final readonly class AccessCheckerMiddleware implements MiddlewareInterface
{
    public function __construct(
        private string $permission,
        private CurrentUser $currentUser,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        if ($this->currentUser->isGuest()) {
            return $this->responseFactory->createResponse(
                ['error' => 'Authentication required'],
                Status::UNAUTHORIZED
            );
        }

        if (!$this->currentUser->can($this->permission)) {
            return $this->responseFactory->createResponse(
                ['error' => 'Access denied'],
                Status::FORBIDDEN
            );
        }

        return $handler->handle($request);
    }
}
```

Attaching the RBAC guard to route groups and single routes (the guard is created via a closure so the container injects `CurrentUser` and the response factory per request):

```php
declare(strict_types=1);

use App\Presentation\Action\Admin\ListUsersAction;
use App\Presentation\Middleware\AccessCheckerMiddleware;
use Yiisoft\Auth\Middleware\Authentication;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route\Get;
use Yiisoft\User\CurrentUser;
use Yiisoft\User\Login\LoginMiddleware;

(new Group('/admin'))
    ->middleware(Authentication::class)
    ->middleware(LoginMiddleware::class)
    ->middleware(
        static fn (
            CurrentUser $currentUser,
            DataResponseFactoryInterface $responseFactory,
        ): AccessCheckerMiddleware => new AccessCheckerMiddleware('adminAccess', $currentUser, $responseFactory)
    )
    ->routes(
        (new Get('/users'))
            ->action(ListUsersAction::class)
            ->middleware(
                static fn (
                    CurrentUser $currentUser,
                    DataResponseFactoryInterface $responseFactory,
                ): AccessCheckerMiddleware => new AccessCheckerMiddleware('manageUsers', $currentUser, $responseFactory)
            )
            ->name('admin.users'),
    );
```

> [!NOTE]
> `AccessCheckerMiddleware` depends on `Yiisoft\User\CurrentUser`, which is populated by `LoginMiddleware` (the identity bridge). Keep the ordering `Authentication → LoginMiddleware → AccessCheckerMiddleware` — see §4.1 for the pipeline invariant and the [Authentication & RBAC Guide](infra-auth-and-rbac.md) for `CurrentUser` wiring and RBAC configuration.

---

## 3. Official Yii3 Middlewares Catalog

The following table documents verified PSR-15 middlewares across official `yiisoft/*` packages:

| Middleware Class (FQCN) | Official Package | Pipeline Role | Purpose & Constructor Dependencies |
|---|---|---|---|
| `Yiisoft\ErrorHandler\Middleware\ErrorCatcher` | `yiisoft/error-handler` | Ingress / Egress | Catches all downstream throwables, dispatches `ApplicationError` event, and renders error responses using `ThrowableResponseFactoryInterface`. Dependencies: `ThrowableResponseFactoryInterface $throwableResponseFactory`, `?EventDispatcherInterface $eventDispatcher = null`. |
| `Yiisoft\ErrorHandler\Middleware\ExceptionResponder` | `yiisoft/error-handler` | Ingress / Egress | Maps specific exceptions to status codes or custom responses. Dependencies: `array $exceptionMap`, `ResponseFactoryInterface $responseFactory`, `Injector $injector`, `bool $checkResponseBody = false`. |
| `Yiisoft\Session\SessionMiddleware` | `yiisoft/session` | Ingress / Egress | Manages session lifecycle. Restores session ID from request cookies, commits session on egress, and discards state if downstream throws. Dependencies: `SessionInterface $session`. Full behavior — see §3.1. *(Note: namespace is `Yiisoft\Session`, NOT `Yiisoft\Session\Middleware`)*. |
| `Yiisoft\Csrf\CsrfTokenMiddleware` | `yiisoft/csrf` | Ingress / Guard | Validates CSRF tokens (parsed-body param `_csrf`, falling back to the `X-CSRF-Token` header) for unsafe methods. Dependencies: `ResponseFactoryInterface $responseFactory`, `CsrfTokenInterface $token`, `?RequestHandlerInterface $failureHandler = null`. Configuration, failure handling, and the `withSafeMethods()` trap — see §3.2. *(Replaces deprecated `CsrfMiddleware`)*. |
| `Yiisoft\Csrf\CsrfTokenCookieMiddleware` | `yiisoft/csrf` | Egress | Publishes the current CSRF token into a client-readable `XSRF-TOKEN` response cookie for SPA/Axios clients. Must be placed **before** `CsrfTokenMiddleware`. Dependencies: `CsrfTokenInterface $token` (cookie and `$cacheControl` options). Constructor and cookie semantics — see §3.2. |
| `Yiisoft\Csrf\CsrfHeaderMiddleware` | `yiisoft/csrf` | Ingress / Guard | Validates the presence of a custom CSRF header (`X-CSRF-Header`) for AJAX/SPA requests; takes no `CsrfTokenInterface`. Dependencies: `ResponseFactoryInterface $responseFactory`, `?RequestHandlerInterface $failureHandler = null`. Header semantics and method terminology — see §3.2. |
| `Yiisoft\RequestProvider\RequestCatcherMiddleware` | `yiisoft/request-provider` | Ingress | Captures current `$request` into `RequestProviderInterface $provider` so DI-resolved domain services can access request context. Dependencies: `RequestProviderInterface $provider`. |
| `Yiisoft\Request\Body\RequestBodyParser` | `yiisoft/request-body-parser` | Ingress | Parses raw HTTP body (`application/json` via `JsonParser`) into `$request->withParsedBody()`. Returns HTTP 400 on malformed payloads. Dependencies: `ResponseFactoryInterface $responseFactory`, `ContainerInterface $container`, `?BadRequestHandlerInterface $badRequestHandler = null`. |
| `Yiisoft\Router\Middleware\Router` | `yiisoft/router` | Ingress / Terminal | Matches route via `UrlMatcherInterface`. Sets `CurrentRoute`. Dispatches route-level middleware stack. Returns HTTP 405 with `Allow` header on method mismatch. Dependencies: `UrlMatcherInterface $matcher`, `ResponseFactoryInterface $responseFactory`, `MiddlewareFactory $middlewareFactory`, `CurrentRoute $currentRoute`, `?EventDispatcherInterface $eventDispatcher = null`. |
| `Yiisoft\DataResponse\Middleware\ContentNegotiatorDataResponseMiddleware` | `yiisoft/data-response` | Egress | Negotiates `Accept` header and formats `DataStream` responses using formatters (`JsonFormatter`, `XmlFormatter`). Dependencies: `array $formatters = []`, `FormatterInterface\|RequestHandlerInterface\|null $fallback = null`. *(Replaces deprecated `ContentNegotiator` — `FormatDataResponse`'s actual replacement is `DataResponseMiddleware`)*. |
| `Yiisoft\DataResponse\Middleware\JsonDataResponseMiddleware` | `yiisoft/data-response` | Egress | Enforces JSON formatting on `DataStream` responses via `JsonFormatter`. Dependencies: `JsonFormatter $formatter = new JsonFormatter()`. *(Replaces deprecated `FormatDataResponseAsJson`)*. |
| `Yiisoft\DataResponse\Middleware\XmlDataResponseMiddleware` | `yiisoft/data-response` | Egress | Enforces XML formatting on `DataStream` responses via `XmlFormatter`. Dependencies: `XmlFormatter $formatter = new XmlFormatter()`. |
| `Yiisoft\Yii\RateLimiter\LimitRequestsMiddleware` | `yiisoft/rate-limiter` | Ingress / Guard | Enforces rate limits using `CounterInterface` and `LimitPolicyInterface`. Returns HTTP 429 and adds `X-Rate-Limit-*` headers. Dependencies: `CounterInterface $counter`, `ResponseFactoryInterface $responseFactory`, `?LimitPolicyInterface $limitingPolicy = null`, `?MiddlewareInterface $failStoreUpdatedDataMiddleware = null`. *(Note: Class is `LimitRequestsMiddleware`, NOT `RateLimiterMiddleware`)*. |
| `Yiisoft\HttpMiddleware\CorsAllowAllMiddleware` | `yiisoft/http-middleware` | Ingress / Guard | Handles CORS headers and short-circuits preflight `OPTIONS` requests with HTTP 204. Dependencies: `?ResponseFactoryInterface $responseFactory = null`. *(Replaces deprecated `Yiisoft\Yii\Middleware\CorsAllowAll`)*. |
| `Yiisoft\HttpMiddleware\ContentLengthMiddleware` | `yiisoft/http-middleware` | Egress | Adds or removes `Content-Length` header according to HTTP specifications. Dependencies: `bool $removeOnTransferEncoding = true`, `bool $add = true`, `array $doNotAddOnStatusCode = [...]`, `array $removeOnStatusCode = [...]`. |
| `Yiisoft\HttpMiddleware\ForceSecureConnection\ForceSecureConnectionMiddleware` | `yiisoft/http-middleware` | Ingress / Egress | Redirects insecure HTTP requests to HTTPS and attaches HSTS / CSP headers. Dependencies: `ResponseFactoryInterface $responseFactory`, `RedirectOptions $redirectOptions = new RedirectOptions()`, `?string $cspHeader = self::DEFAULT_CSP_HEADER`, `?HstsHeader $hstsHeader = new HstsHeader()`. *(Replaces deprecated `Yiisoft\Yii\Middleware\ForceSecureConnection`)*. |
| `Yiisoft\HttpMiddleware\HttpCache\HttpCacheMiddleware` | `yiisoft/http-middleware` | Ingress / Egress | Client-side HTTP caching with `Last-Modified` and `ETag`. Dependencies: `ResponseFactoryInterface $responseFactory`, `CacheControlProviderInterface $cacheControlProvider = new NullCacheControlProvider()`, `LastModifiedProviderInterface $lastModifiedProvider = new NullLastModifiedProvider()`, `ETagProviderInterface $eTagProvider = new NullETagProvider()`, `ETagGeneratorInterface $eTagGenerator = new DefaultETagGenerator()`, `ETagValueNormalizerInterface $eTagValueNormalizer = new NoopETagValueNormalizer()`. *(Replaces deprecated `Yiisoft\Yii\Middleware\HttpCache`)*. Full ETag / conditional-request configuration recipes: [HTTP Response Caching (ETag) Guide](http-cache-etag.md). |
| `Yiisoft\HttpMiddleware\HeadRequestMiddleware` | `yiisoft/http-middleware` | Egress | Removes body from response for `HEAD` requests. Dependencies: `StreamFactoryInterface $streamFactory`. |
| `Yiisoft\HttpMiddleware\RedirectMiddleware` | `yiisoft/http-middleware` | Ingress / Guard | Responds with a redirect to the specified URL when a condition callable is met. Dependencies: `ResponseFactoryInterface $responseFactory`, `string $url`, `int $statusCode = 301`, `?callable $condition = null`. |
| `Yiisoft\HttpMiddleware\TagRequest\TagRequestMiddleware` | `yiisoft/http-middleware` | Ingress | Attaches an identification tag to request attributes. Dependencies: `string $attributeName = 'requestTag'`, `TagProviderInterface $tagProvider = new TimeBasedTagProvider()`. *(Replaces deprecated `Yiisoft\Yii\Middleware\TagRequest`)*. |
| `Yiisoft\Auth\Middleware\Authentication` | `yiisoft/auth` | Ingress / Guard | Authenticates request using `AuthenticatorInterface` (`HttpBearer`, `HttpHeader`). Binds identity to `$request->getAttribute(Authentication::class)`. Dependencies: `AuthenticatorInterface\|AuthenticationMethodInterface $authenticationMethod`, `ResponseFactoryInterface $responseFactory`, `?RequestHandlerInterface $authenticationFailureHandler = null`. |
| `Yiisoft\Cookies\CookieMiddleware` | `yiisoft/cookies` | Ingress / Egress | Decrypts and validates request cookies; encrypts and signs outgoing response `Set-Cookie` headers based on `CookieEncryptor` and `CookieSigner`. Dependencies: `LoggerInterface $logger`, `CookieEncryptor $encryptor`, `CookieSigner $signer`, `array $cookiesSettings = []`. |
| `Yiisoft\Yii\Middleware\Locale` | `yiisoft/yii-middleware` | Ingress | Detects and sets request locale from URL prefix, query param, or cookies. Dispatches `SetLocaleEvent` and configures `UrlGeneratorInterface`. Dependencies: `EventDispatcherInterface $eventDispatcher`, `UrlGeneratorInterface $urlGenerator`, `LoggerInterface $logger`, `ResponseFactoryInterface $responseFactory`, `array $supportedLocales = []`, `array $ignoredRequestUrlPatterns = []`, `bool $secureCookie = false`, `?DateInterval $cookieDuration = null`, `?ClockInterface $clock = null`. |
| `Yiisoft\Yii\Middleware\IpFilter` | `yiisoft/yii-middleware` | Ingress / Guard | Restricts incoming requests to specified IPv4/IPv6 ranges using `IpRanges`. Responds with HTTP 403 Forbidden for disallowed clients. Dependencies: `ValidatorInterface $validator`, `ResponseFactoryInterface $responseFactory`, `?string $clientIpAttribute = null`, `array $ipRanges = []`. |
| `Yiisoft\Yii\Middleware\Subfolder` | `yiisoft/yii-middleware` | Ingress | Adjusts URI path and sets `@baseUrl` alias when Yii3 application is served from a subfolder rather than root domain. Must precede `Router`. Dependencies: `UrlGeneratorInterface $uriGenerator`, `Aliases $aliases`, `?string $prefix = null`, `?string $baseUrlAlias = '@baseUrl'`. |
| `Yiisoft\ProxyMiddleware\TrustedHostsNetworkResolver` | `yiisoft/proxy-middleware` | Ingress | Resolves client IP, protocol, host, and port behind reverse proxies using `X-Forwarded-*` or RFC 7239 `Forwarded` headers. Configured via `withTrustedIps(array $trustedIps)`. Stores client IP in attribute `TrustedHostsNetworkResolver::ATTRIBUTE_REQUEST_CLIENT_IP`. |

> [!TIP]
> For session API, flash messages, cookie signing/encryption, CSRF token implementations, and the required
> middleware ordering (`ErrorCatcher → SessionMiddleware → CsrfTokenMiddleware → Router`), see [HTTP State Guide](http-state.md).

### 3.1. SessionMiddleware Behavior

`Yiisoft\Session\SessionMiddleware` (constructor: `SessionInterface $session`) drives the per-request session lifecycle around the downstream handler:

- **Ingress:** reads the session id from the request cookie named by `$session->getName()` and calls `setId()` **only when the session has no id yet** — an already-set id is never overwritten.
- **Egress:** on any downstream `Throwable` it **discards** the session (uncommitted changes are lost) and re-throws; otherwise it `close()`s an active session and appends a `Set-Cookie` header **only when the session id changed** (cookie attributes come from `Session::getCookieParameters()`).
- **HTTPS invariant:** throws `Yiisoft\Session\SessionException` when `cookie_secure` is enabled but the request scheme is not HTTPS; adds the `Secure` flag automatically for `SameSite=None`. The shipped params pre-override `cookie_secure` to `0` for local HTTP — see the [HTTP State Guide, §2.2](http-state.md#22-di-wiring--options).
- **Token-authenticated APIs:** place `SessionMiddleware` in a route **group** rather than the global pipeline, so sessions are not started for stateless, token-authenticated requests.

### 3.2. CSRF Middleware Behavior

Shared behavioral reference for the three CSRF middlewares (token implementations and token storage are owned by the [HTTP State Guide, §5.1](http-state.md#51-token-implementations); state-side DI wiring by its §5.2):

- **`CsrfTokenMiddleware`** — the standard validator. Constants: `PARAMETER_NAME = '_csrf'`, `HEADER_NAME = 'X-CSRF-Token'`. The token is read from the parsed-body parameter `_csrf`, falling back to the `X-CSRF-Token` header. Immutable config: `withParameterName()`, `withHeaderName()`, `withSafeMethods()` (default safe methods `[GET, HEAD, OPTIONS]`); the getters `getParameterName()` / `getHeaderName()` let views and clients read the configured names instead of hard-coding `_csrf`. On failure: the configured `$failureHandler` runs, otherwise a `422` with a plain-text body is returned. (`CsrfMiddleware` — without "Token" — is **deprecated**; use `CsrfTokenMiddleware`.)
- **`withSafeMethods()` replacement trap:** `withSafeMethods()` **replaces** the whole default `[GET, HEAD, OPTIONS]` list. The OPTIONS-only DI definition `'withSafeMethods()' => [[Method::OPTIONS]]` (`Method` is `Yiisoft\Http\Method` from `yiisoft/http`) is the official recipe for any-origin JavaScript SPAs, not a neutral syntax demo — after it, GET and HEAD are validated too.
- **`CsrfHeaderMiddleware`** — AJAX/SPA variant: requires only the **presence** of a custom header (`HEADER_NAME = 'X-CSRF-Header'`; an empty value passes) — no token value matching, and it takes no `CsrfTokenInterface`. The default `'unsafe'` methods `[GET, HEAD, POST]` use **CORS-preflight terminology** (the methods for which the header is required), not HTTP-method safety; config: `withHeaderName()`, `withUnsafeMethods()`. A custom request header sent cross-origin requires CORS configuration.
- **`CsrfTokenCookieMiddleware`** — for SPA (JS-readable double-submit): publishes the token in an `XSRF-TOKEN` cookie; the cookie is **not** HttpOnly (JavaScript must read it) and is never trusted as input. Constructor: `(CsrfTokenInterface $token, string $cookieName = self::COOKIE_NAME, string $path = '/', ?string $domain = null, ?bool $secure = null, ?string $sameSite = self::SAME_SITE_LAX, $cacheControl = true)`. `$cacheControl` is untyped in the signature (documented `bool|string`, runtime-checked): `true` (default) replaces `Cache-Control` with `no-store`, `false` leaves the header untouched, a string sets that value. `$secure = null` (default) resolves per request — secure over HTTPS, and always secure with `SameSite=None`.
- **Ordering:** place `CsrfTokenCookieMiddleware` **before** `CsrfTokenMiddleware` so the token is published even on `422` responses, and `SessionMiddleware` before CSRF when the synchronizer token storage is session-backed. The official SPA cookie-flow wiring (`SessionMiddleware → CsrfTokenCookieMiddleware → CsrfTokenMiddleware` with `->withHeaderName('X-XSRF-TOKEN')`) together with the client-side usage is documented in the [HTTP State Guide, §5.3](http-state.md#53-forms--ajax-usage).

---

## 4. Registration Scopes & Pipelines

Yii3 provides three scopes for attaching middlewares:

```
┌────────────────────────────────────────────────────────┐
│ 1. Global Application Pipeline                         │
│    Configured in DI container: Application::class      │
│    Executes for every incoming HTTP request.           │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. Route Group Pipeline                                │
│    Configured via new Group('/api/v1')->middleware(...)│
│    Executes for all routes in that group.              │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 3. Single Route Pipeline                               │
│    Configured via (new Post(...))->middleware(...)     │
│    Executes exclusively for that single endpoint.      │
└────────────────────────────────────────────────────────┘
```

### 4.1. Global Application Pipeline (`config/web/di/application.php`)

The global middleware pipeline executes for every incoming HTTP request before routing. In Yii3, this is configured in DI container definitions for `Yiisoft\Yii\Http\Application`:

```php
<?php

declare(strict_types=1);

use App\Presentation\Middleware\SecurityHeadersMiddleware;
use App\Web\NotFound\NotFoundHandler;
use Yiisoft\Csrf\CsrfTokenCookieMiddleware;
use Yiisoft\Csrf\CsrfTokenMiddleware;
use Yiisoft\Definitions\DynamicReference;
use Yiisoft\Definitions\Reference;
use Yiisoft\ErrorHandler\Middleware\ErrorCatcher;
use Yiisoft\Middleware\Dispatcher\MiddlewareDispatcher;
use Yiisoft\RequestProvider\RequestCatcherMiddleware;
use Yiisoft\Router\Middleware\Router;
use Yiisoft\Session\SessionMiddleware;
use Yiisoft\Yii\Http\Application;

/** @var array $params */

return [
    Application::class => [
        '__construct()' => [
            'dispatcher' => DynamicReference::to([
                'class' => MiddlewareDispatcher::class,
                '__construct()' => [
                    'middlewareDefinitions' => [
                        // 1. Outermost: Catch any uncaught Throwable and render error response
                        ErrorCatcher::class,

                        // 2. Security headers applied to all outgoing responses
                        SecurityHeadersMiddleware::class,

                        // 3. Session lifecycle management (start/commit/discard)
                        SessionMiddleware::class,

                        // 4. Publish XSRF-TOKEN cookie for JavaScript clients (must precede CsrfTokenMiddleware)
                        CsrfTokenCookieMiddleware::class,

                        // 5. CSRF protection for mutating requests (POST, PUT, DELETE, PATCH)
                        CsrfTokenMiddleware::class,

                        // 6. Store current request into RequestProviderInterface for DI services
                        RequestCatcherMiddleware::class,

                        // 7. Router matches route, dispatches group/route middleware stack, and invokes action
                        Router::class,
                    ],
                ],
            ]),
            'fallbackHandler' => Reference::to(NotFoundHandler::class),
        ],
    ],
];
```

> [!NOTE]
> In `yiisoft/middleware-dispatcher >= 5.5.0`, `MiddlewareDispatcher::withMiddlewares()` is deprecated in favor of passing middleware definitions directly to `__construct(['middlewareDefinitions' => [...]])`. `MiddlewareDispatcher` reverses the definitions internally — never rely on the outdated "last specified handler will be executed first" sentence in its docblock: the first-listed definition is the outermost middleware and executes first.

> [!NOTE]
> **Authenticated pipelines:** the example above is the anonymous baseline. A typical authenticated web application
> inserts the auth middlewares into the same global stack (canonical invariant from the
> [Authentication & RBAC Guide](infra-auth-and-rbac.md)):
> `ErrorCatcher → SessionMiddleware → CsrfTokenMiddleware → CookieLoginMiddleware → Authentication → LoginMiddleware → Router`,
> with route-specific access guards (`AccessCheckerMiddleware`, §2.6) attached inside route groups after `Router`
> dispatches them. Hard constraints: `SessionMiddleware` must precede CSRF (synchronizer tokens live in the session);
> `CookieLoginMiddleware` runs after `SessionMiddleware` (remember-me auto-login needs the session) and before
> `Authentication` / `LoginMiddleware`, so the remembered identity is resolved before identity consumers run;
> `Authentication` must precede route-level permission guards. For token-authenticated APIs, keep `SessionMiddleware`
> and the CSRF middlewares out of the global pipeline and scope them to the route groups that need sessions (§3.1).

---

### 4.2. Route Group Pipeline (`config/web/routes.php`)

Executes for all routes inside a specific route group (e.g. `/api/v1`). For route group definitions, prefixing, and FastRoute rules, see [Routing Guide](http-routes.md).

```php
<?php

declare(strict_types=1);

use App\Presentation\Action\User\ListUsersAction;
use App\Presentation\Action\User\ViewUserAction;
use App\Presentation\Middleware\ApiKeyAuthMiddleware;
use Yiisoft\DataResponse\Formatter\JsonFormatter;
use Yiisoft\DataResponse\Formatter\XmlFormatter;
use Yiisoft\DataResponse\Middleware\ContentNegotiatorDataResponseMiddleware;
use Yiisoft\HttpMiddleware\CorsAllowAllMiddleware;
use Yiisoft\Request\Body\RequestBodyParser;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route\Get;

return [
    // Instantiated via new Group() (Group::create() is deprecated)
    (new Group('/api/v1'))
        ->middleware(
            // 1. CORS headers and OPTIONS preflight handling (MUST precede auth)
            CorsAllowAllMiddleware::class,

            // 2. Content negotiation for DataStream responses
            static fn() => new ContentNegotiatorDataResponseMiddleware(
                formatters: [
                    'application/json' => new JsonFormatter(),
                    'application/xml' => new XmlFormatter(),
                ],
                fallback: new JsonFormatter(),
            ),

            // 3. Parse incoming JSON body into $request->getParsedBody()
            RequestBodyParser::class,

            // 4. Guard all routes in this group
            ApiKeyAuthMiddleware::class,
        )
        ->routes(
            // Instantiated via new Get() (Route::get() is deprecated)
            (new Get('/users'))
                ->action(ListUsersAction::class)
                ->name('api.users.list'),

            (new Get('/users/{id:\d+}'))
                ->action(ViewUserAction::class)
                ->name('api.users.view'),
        ),
];
```

---

### 4.3. Single Route Pipeline (`config/web/routes.php`)

Executes for a specific endpoint. Routes can append middlewares, prepend middlewares, and explicitly **disable** inherited group middlewares.

```php
<?php

declare(strict_types=1);

use App\Presentation\Action\Auth\LoginAction;
use App\Presentation\Action\Billing\ChargeInvoiceAction;
use App\Presentation\Action\HealthCheckAction;
use App\Presentation\Middleware\ApiKeyAuthMiddleware;
use App\Presentation\Middleware\RequireIdempotencyKeyMiddleware;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route\Get;
use Yiisoft\Router\Route\Post;
use Yiisoft\Yii\RateLimiter\LimitRequestsMiddleware;

return [
    (new Group('/api/v1'))
        ->middleware(ApiKeyAuthMiddleware::class)
        ->routes(
            // 1. Endpoint-specific rate limiting
            (new Post('/auth/login'))
                ->middleware(LimitRequestsMiddleware::class)
                ->action(LoginAction::class)
                ->name('auth.login'),

            // 2. Extra safety guard: Idempotency Key requirement
            (new Post('/billing/invoices/{id:\d+}/charge'))
                ->middleware(RequireIdempotencyKeyMiddleware::class)
                ->action(ChargeInvoiceAction::class)
                ->name('billing.charge'),

            // 3. Disabling inherited middleware: Public Health Check
            (new Get('/health'))
                ->disableMiddleware(ApiKeyAuthMiddleware::class)
                ->action(HealthCheckAction::class)
                ->name('api.health'),
        ),
];
```

> [!NOTE]
> In Yii3 routing, `Route::action()` is the terminal middleware of that route's pipeline. When `->middleware(...)` is called after `->action(...)`, `Route` automatically inserts the new middleware **before** the action in the execution list.
> For action handler implementation patterns, single-action invokable controllers, and PSR-7 response factories, see [Actions & Controllers Guide](http-actions-and-controllers.md).

---

### 4.4. Rate Limiting Recipes (`yiisoft/rate-limiter`)

`Yiisoft\Yii\RateLimiter\LimitRequestsMiddleware` enforces rate limits using sliding windows, protecting APIs and login endpoints from abusive traffic.

#### 1. DI Configuration (`config/web/di/rate-limiter.php`)

```php
declare(strict_types=1);

use Psr\SimpleCache\CacheInterface;
use Yiisoft\Definitions\Reference;
use Yiisoft\Yii\RateLimiter\Counter;
use Yiisoft\Yii\RateLimiter\CounterInterface;
use Yiisoft\Yii\RateLimiter\LimitRequestsMiddleware;
use Yiisoft\Yii\RateLimiter\Policy\LimitPerIp;
use Yiisoft\Yii\RateLimiter\Policy\LimitPolicyInterface;
use Yiisoft\Yii\RateLimiter\Storage\SimpleCacheStorage;
use Yiisoft\Yii\RateLimiter\Storage\StorageInterface;

return [
    // Storage backend: SimpleCacheStorage (PSR-16) or ApcuStorage (high-speed APCu)
    StorageInterface::class => static fn (CacheInterface $cache): StorageInterface => new SimpleCacheStorage($cache),

    // Counter sliding window: 100 requests per 60 seconds
    CounterInterface::class => [
        'class' => Counter::class,
        '__construct()' => [
            'limit' => 100,
            'periodInSeconds' => 60,
        ],
    ],

    // Default policy: fingerprint by client remote IP
    LimitPolicyInterface::class => LimitPerIp::class,

    LimitRequestsMiddleware::class => [
        '__construct()' => [
            'limitingPolicy' => Reference::to(LimitPolicyInterface::class),
        ],
    ],
];
```

#### 2. Custom Rate-Limiting Policy (e.g. per-user or API token)

```php
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Auth\Middleware\Authentication;
use Yiisoft\Yii\RateLimiter\Policy\LimitCallback;

// Rate limit by authenticated user ID, falling back to client IP
$policy = new LimitCallback(
    static function (ServerRequestInterface $request): string {
        $identity = $request->getAttribute(Authentication::class);
        return $identity?->getId() ?? $request->getServerParams()['REMOTE_ADDR'] ?? 'anonymous';
    }
);
```

#### 3. Automatic Response Headers & Status Mapping

`LimitRequestsMiddleware` automatically maps headers to all responses and blocks requests when the limit is exceeded:

| Header / Status | Value | Description |
|---|---|---|
| `X-Rate-Limit-Limit` | `(string) $result->getLimit()` | Maximum request limit in current window (e.g. `100`). |
| `X-Rate-Limit-Remaining` | `(string) $result->getRemaining()` | Remaining request quota in current window. |
| `X-Rate-Limit-Reset` | `(string) $result->getResetTime()` | Unix timestamp when request quota resets. |
| **HTTP 429** | `Too Many Requests` | Returned automatically when `$state->isLimitReached() === true`. |

---

## 5. Supported Middleware Definition Formats

`Yiisoft\Middleware\Dispatcher\MiddlewareFactory` supports multiple definition formats when registering middlewares in routes, groups, or dispatchers:

```php
<?php

declare(strict_types=1);

namespace App\Infrastructure\Route;

use App\Presentation\Action\User\IndexAction;
use App\Presentation\Middleware\ApiKeyAuthMiddleware;
use App\Presentation\Middleware\SecurityHeadersMiddleware;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Psr\Log\LoggerInterface;
use Yiisoft\Router\Route\Get;

// Supported middleware definition formats in Yiisoft\Middleware\Dispatcher\MiddlewareFactory:

// 1. PSR-15 MiddlewareInterface class string (resolved via PSR-11 container)
$route1 = (new Get('/api/v1/resource'))->middleware(ApiKeyAuthMiddleware::class);

// 2. PSR-15 RequestHandlerInterface class string (invokes ->handle())
$route2 = (new Get('/api/v1/handler'))->middleware(IndexAction::class);

// 3. Array definition for DI container (instantiated via Yiisoft\Definitions\ArrayDefinition)
$route3 = (new Get('/api/v1/custom'))->middleware([
    'class' => SecurityHeadersMiddleware::class,
]);

// 4. Controller action pair [ControllerClass, 'methodName']
$route4 = (new Get('/api/v1/users'))->action([IndexAction::class, 'handle']);

// 5. Invokable class (class with __invoke method)
$route5 = (new Get('/api/v1/invoke'))->middleware(IndexAction::class);

// 6. Anonymous closure / callable with automatic DI parameter injection
$route6 = (new Get('/api/v1/inline'))->middleware(
    static function (
        ServerRequestInterface $request,
        RequestHandlerInterface $handler,
        LoggerInterface $logger,
    ): ResponseInterface {
        $logger->info('Processing inline request');
        return $handler->handle($request);
    }
);
```

---

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
   Terminating the script with `die()` or `exit()` crashes the PHP process immediately, bypassing response post-processing, session commit (`SessionMiddleware::commitSession()`), logging, and PSR-7 SAPI response emitters. Always return a PSR-7 `ResponseInterface`.

7. **`withMiddlewares()` Deprecation in MiddlewareDispatcher:**
   In `yiisoft/middleware-dispatcher >= 5.5.0`, `withMiddlewares()` is deprecated. Do not configure dispatcher instances with `withMiddlewares()` in application DI definitions; pass definitions directly to `__construct(['middlewareDefinitions' => [...]])`.

---

## 7. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| **Ignoring PSR-7 immutability (`$request->withAttribute(...)`)** | Method returns a clone. The return value is discarded, and downstream handlers receive unmodified `$request`. | Reassign explicitly: `$request = $request->withAttribute('key', $value);`. |
| **Using deprecated `Yiisoft\Csrf\CsrfMiddleware`** | `CsrfMiddleware` is deprecated and slated for removal. | Use `Yiisoft\Csrf\CsrfTokenMiddleware` for validation and `Yiisoft\Csrf\CsrfTokenCookieMiddleware` for cookie emission. |
| **Hallucinating `Yiisoft\Yii\Http\Middleware\CorsMiddleware`** | Class does not exist; triggers fatal `ClassNotFoundError`. `yiisoft/yii-http` only provides application runners and events. | Use `Yiisoft\HttpMiddleware\CorsAllowAllMiddleware` from `yiisoft/http-middleware` or `Group::withCors()`. |
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

