# Yii3 Stateless JWT Authentication Guide

> [!IMPORTANT]
> **Grounding rule:** this guide is authoring synthesis for navigation and patterns. The source of truth for every class name, method signature, constructor argument, and configuration key is the installed package source under `vendor/yiisoft/<pkg>/src/`. Verify there before writing code; never substitute this guide for vendor sources, and never write Yii 2 APIs.

> Reference guide for stateless JSON Web Token (JWT) / Bearer-token authentication with `yiisoft/auth-jwt`: DI binding for the JWT authenticator, and issuing signed tokens with `TokenFactoryInterface`.

```shell
composer require yiisoft/auth-jwt
```

**Scope & Ownership:** This guide is the single source of truth for stateless JWT authentication; it was extracted from the [Authentication & RBAC Guide, §5](infra-auth-and-rbac.md#5-stateless-rest-api-authentication-jwt--bearer-token). JWT is one of the **mutually exclusive login methods**: a project picks either the stateful session lifecycle ([Authentication & RBAC Guide, §4](infra-auth-and-rbac.md#4-stateful-session-authentication-lifecycle-yiisoftuser)), stateless JWT (this guide), or external OAuth2/OIDC login ([OAuth2/OIDC Login Guide](infra-auth-oauth2.md)) — resolve which method is installed via the project's `composer.json` (`yiisoft/auth-jwt` vs `yiisoft/yii-auth-client`; session-only projects install neither) or the [Package Catalog, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family). RBAC authorization layers on top of any of these methods.

---

## Table of Contents
- [1. DI Binding for JWT Authenticator](#1-di-binding-for-jwt-authenticator)
- [2. Issuing JSON Web Tokens](#2-issuing-json-web-tokens)
- [3. Anti-Patterns & Common Traps](#3-anti-patterns--common-traps)
- [Related Topic Guides](#related-topic-guides)

---

For stateless REST APIs, avoid session cookies entirely. Clients send `Authorization: Bearer <token>` on every request.

## 1. DI Binding for JWT Authenticator

Configure `Yiisoft\Auth\Jwt\JwtMethod` in `config/web/di/auth.php`:

```php
declare(strict_types=1);

use Yiisoft\Auth\AuthenticatorInterface;
use Yiisoft\Auth\AuthenticatorWithChallengeInterface;
use Yiisoft\Auth\Jwt\JwtMethod;

return [
    AuthenticatorInterface::class => JwtMethod::class,
    AuthenticatorWithChallengeInterface::class => JwtMethod::class,
];
```

> [!NOTE]
> `AuthenticationMethodInterface` is `@deprecated`. Bind modern `AuthenticatorInterface` and `AuthenticatorWithChallengeInterface` instead.

## 2. Issuing JSON Web Tokens

`TokenFactoryInterface::create(array $payload, string $format, ?int $signatureIndex = null): string` creates signed JWT strings.

> [!IMPORTANT]
> The second parameter `$format` is **mandatory** (omitting it throws an `ArgumentCountError`). Pass `\Jose\Component\Signature\Serializer\CompactSerializer::NAME` or `'jws_compact'`.

```php
declare(strict_types=1);

namespace App\Presentation\Action\Api;

use App\Domain\User\Model\UserIdentity;
use Jose\Component\Signature\Serializer\CompactSerializer;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\Auth\Jwt\TokenFactoryInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;

final readonly class TokenIssueAction
{
    public function __construct(
        private TokenFactoryInterface $tokenFactory,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function createTokenForUser(UserIdentity $user): ResponseInterface
    {
        $payload = [
            'sub' => $user->getId(),
            'name' => $user->getLogin(),
            'iat' => time(),
            'exp' => time() + 3600, // 1 hour expiration
            'iss' => 'my-api',
        ];

        // Format argument MUST be passed explicitly:
        $token = $this->tokenFactory->create($payload, CompactSerializer::NAME);

        return $this->responseFactory->createResponse([
            'token' => $token,
            'expires_in' => 3600,
            'token_type' => 'Bearer',
        ]);
    }
}
```

## 3. Anti-Patterns & Common Traps

| # | Anti-Pattern | Why It Breaks | Correct Yii3 Approach |
|:---:|---|---|---|
| **1** | Omitting `$format` in `TokenFactory::create()` | Parameter 2 `$format` has no default; omitting it throws an `ArgumentCountError`. | Pass `CompactSerializer::NAME` or `'jws_compact'` explicitly. |

---

## Related Topic Guides

- [Authentication & RBAC Guide](infra-auth-and-rbac.md) — Identity repositories, the stateful session lifecycle alternative, route protection, and RBAC permission checks layered on top of JWT authentication.
- [OAuth2/OIDC Login Guide](infra-auth-oauth2.md) — The alternative external-login method (`yiisoft/yii-auth-client`): provider clients, `AuthAction` callback middleware, and identity mapping.
- [PSR-15 Middlewares Guide](http-middlewares.md) — Global pipeline registration with the canonical authenticated order (`Authentication` → `LoginMiddleware`).
- [Actions & Controllers Guide](http-actions-and-controllers.md) — Authentication and permission checks (`CurrentUser::can()`) inside presentation actions.
- [OpenAPI & Swagger Guide](http-openapi-swagger.md) — Documenting JWT bearer-token security schemes in OpenAPI.
