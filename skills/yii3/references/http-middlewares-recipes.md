# Yii3 Middlewares: Custom Middleware Implementation Recipes

> **Grounding:** APIs in `vendor/yiisoft/<pkg>/src/`, patterns in this guide, conventions in architecture artifact (SKILL.md Core rule 2).

> Practical implementation recipes for custom PSR-15 middlewares in Yii3: request pre-processing, short-circuiting guards, idiomatic authentication via `yiisoft/auth`, response post-processing, exception mapping, and RBAC permission checks.

## Table of Contents

- [2. Implementation Recipes](#2-implementation-recipes)
  - [2.1. Request Pre-Processing (Correlation ID / Attribute Enrichment)](#21-request-pre-processing-correlation-id--attribute-enrichment)
  - [2.2. Short-Circuiting Guard (Custom API Key Authentication)](#22-short-circuiting-guard-custom-api-key-authentication)
  - [2.3. Idiomatic Authentication via `yiisoft/auth`](#23-idiomatic-authentication-via-yiisoftauth)
  - [2.4. Response Post-Processing (Security Headers)](#24-response-post-processing-security-headers)
  - [2.5. Exception Mapping Responder via `yiisoft/error-handler`](#25-exception-mapping-responder-via-yiisofterror-handler)
  - [2.6. RBAC Permission Guard (`AccessCheckerMiddleware`)](#26-rbac-permission-guard-accesscheckermiddleware)

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
> [Actions & Controllers Guide, §3.8 "Authentication & Authorization"](http-actions-concerns.md#38-authentication--authorization-yiisoftuser-yiisoftauth-jwt).

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
