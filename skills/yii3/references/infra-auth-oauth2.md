# Yii3 External OAuth2 / OIDC Login Guide

> [!IMPORTANT]
> **Grounding rule:** this guide is authoring synthesis for navigation and patterns. The source of truth for every class name, method signature, constructor argument, and configuration key is the installed package source under `vendor/yiisoft/<pkg>/src/`. Verify there before writing code; never substitute this guide for vendor sources, and never write Yii 2 APIs.

> Reference guide for external identity provider login ("Sign in with Google / GitHub / Microsoft / X ...") with `yiisoft/yii-auth-client`: package architecture and core contracts, wiring the `AuthAction` callback middleware, configuring provider clients via `Collection` params, OpenID Connect, the `AuthChoice` button widget, and mapping provider attributes to your own identity.

**Scope & Ownership:** This guide is the single source of truth for external OAuth2/OIDC login; it was extracted from the [Authentication & RBAC Guide, §6](infra-auth-and-rbac.md#6-external-oauth2--oidc-login-yiisoftyii-auth-client). OAuth2/OIDC login is one of the **mutually exclusive login methods**: a project picks either the stateful session lifecycle ([Authentication & RBAC Guide, §4](infra-auth-and-rbac.md#4-stateful-session-authentication-lifecycle-yiisoftuser)), stateless JWT ([Stateless JWT Authentication Guide](infra-auth-jwt.md)), or external OAuth2/OIDC login (this guide) — resolve which method is installed via the project's `composer.json` (`yiisoft/yii-auth-client` vs `yiisoft/auth-jwt`; session-only projects install neither) or the [Package Catalog, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family). RBAC authorization layers on top of any of these methods.

---

## Table of Contents
- [1. Package Architecture & Core Contracts](#1-package-architecture--core-contracts)
- [2. Wiring `AuthAction` (Callback Route + DI)](#2-wiring-authaction-callback-route--di)
- [3. Configuring Clients via `Collection` Params](#3-configuring-clients-via-collection-params)
- [4. OpenID Connect (`Client\OpenIdConnect`)](#4-openid-connect-clientopenidconnect)
- [5. `AuthChoice` Button Widget](#5-authchoice-button-widget)
- [6. Mapping Provider Attributes to Your Identity & Critical Gotchas](#6-mapping-provider-attributes-to-your-identity--critical-gotchas)
- [7. Anti-Patterns & Common Traps](#7-anti-patterns--common-traps)
- [Related Topic Guides](#related-topic-guides)

---

```shell
composer require yiisoft/yii-auth-client
```

The package ships:
- `Yiisoft\Yii\AuthClient\Collection` — registry of configured OAuth2 clients keyed by client name.
- `Yiisoft\Yii\AuthClient\AuthAction` — a **PSR-15 middleware** bound to a callback route: it redirects the user to the provider, exchanges the returned `code` for an access token, and hands the authenticated client to your success/cancel callbacks.
- Ready-made clients under `Yiisoft\Yii\AuthClient\Client\`: `Google`, `GitHub`, `Facebook`, `X`, `Microsoft`, `Discord`, `LinkedIn`, `TikTok`, `Yandex`, `VKontakte`, and `OpenIdConnect`.
- `Yiisoft\Yii\AuthClient\Widget\AuthChoice` — renders "Sign in with ..." buttons with built-in inline SVG logos.
- It intentionally does **not** provide user/session management — map provider attributes onto your own identity in a success callback (§6).

## 1. Package Architecture & Core Contracts

```php
interface AuthClientInterface
{
    public function getName(): string;
    public function getTitle(): string;
    public function getViewOptions(): array;
    public function getUserAttributes(): array;
    public function getClientId(): string;
    public function buildAuthUrl(ServerRequestInterface $incomingRequest, array $params): string;
}
```

Key types:

| Type | Role |
|---|---|
| `Yiisoft\Yii\AuthClient\OAuth2` (abstract) | Full authorization-code flow. Constructor: `__construct(ClientInterface $httpClient, RequestFactoryInterface $requestFactory, StateStorageInterface $stateStorage, Factory $factory, SessionInterface $session)`. Key methods: `buildAuthUrl()`, `fetchAccessToken($request, $authCode): OAuthToken`, `refreshAccessToken($token): OAuthToken`, `getAccessToken(): ?OAuthToken`. |
| `Collection` | `__construct(array $clients)`; `getClient(string $name): OAuth2Interface` throws `InvalidArgumentException` for unknown names. Built from params by `Factory\CollectionFactory`. |
| `StateStorage\SessionStateStorage` | Default `StateStorageInterface` implementation (DI binding shipped in the package `config/di.php`) — persists `state`/nonce between redirect and callback via `SessionInterface`. `StateStorage\DummyStateStorage` is a no-op double for tests/CLI. |
| `OAuthToken` | Token value object: `getToken()`, `getIsExpired()`, `getExpireDuration()`; expiry is auto-detected from the `expires_in` parameter. |

Container bindings required from the application:

```php
// config/common/di/http-client.php — a PSR-18 client + PSR-17 request factory
use Psr\Http\Client\ClientInterface;
use Symfony\Component\HttpClient\Psr18Client;

return [
    ClientInterface::class => Psr18Client::class,
];
```

```php
// config/web/di/session.php — session must be available
use Yiisoft\Session\SessionInterface;

return [
    SessionInterface::class => Yiisoft\Session\Session::class,
];
```

## 2. Wiring `AuthAction` (Callback Route + DI)

`AuthAction` is a terminal PSR-15 middleware mapped to a dedicated callback route. It reads the provider name exclusively from the **route argument** `{authclient}` via the injected `CurrentRoute` service:

> [!CAUTION]
> **Fatal crash warning:** In `AuthAction`, typed properties `$successUrl` and `$cancelUrl` are uninitialized by default. If a callback returns `void` or `null`, `AuthAction` attempts to redirect to these URLs. If `withSuccessUrl()` or `withCancelUrl()` was not called, PHP 8.2+ throws a fatal error: `Error: Typed property Yiisoft\Yii\AuthClient\AuthAction::$successUrl must not be accessed before initialization`. Always configure both URLs or return a `ResponseInterface` directly from callbacks!

```php
// config/common/di/auth-client.php
declare(strict_types=1);

use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\Aliases\Aliases;
use Yiisoft\Router\CurrentRoute;
use Yiisoft\View\WebView;
use Yiisoft\Yii\AuthClient\AuthAction;
use Yiisoft\Yii\AuthClient\AuthClientInterface;
use Yiisoft\Yii\AuthClient\Collection;

return [
    AuthAction::class => static function (
        Collection $clientCollection,
        Aliases $aliases,
        WebView $view,
        ResponseFactoryInterface $responseFactory,
        CurrentRoute $currentRoute,
    ): AuthAction {
        return (new AuthAction($clientCollection, $aliases, $view, $responseFactory, $currentRoute))
            ->withSuccessUrl('/account/overview')
            ->withCancelUrl('/auth/login')
            ->withSuccessCallback(
                static function (AuthClientInterface $client): ?ResponseInterface {
                    // Map provider attributes to local identity (see §6)
                    return null; // Safe: falls back to configured successUrl
                }
            )
            ->withCancelCallback(
                static function (AuthClientInterface $client): ?ResponseInterface {
                    return null; // Safe: falls back to configured cancelUrl
                }
            );
    },
];
```

```php
// config/routes.php
declare(strict_types=1);

use Yiisoft\Http\Method;
use Yiisoft\Router\Route;
use Yiisoft\Yii\AuthClient\AuthAction;

return [
    Route::methods([Method::GET, Method::POST], '/auth/{authclient}')
        ->action(AuthAction::class)
        ->name('site/auth'),
];
```

## 3. Configuring Clients via `Collection` Params

Clients are declared in `params['yiisoft/yii-auth-client']['clients']`. The shipped `Factory\CollectionFactory` instantiates each `'class'` and maps every remaining key to a `set*()` method:

```php
// config/common/params.php
return [
    'yiisoft/yii-auth-client' => [
        'clients' => [
            'google' => [
                'class' => Yiisoft\Yii\AuthClient\Client\Google::class,
                'clientId' => $_ENV['GOOGLE_CLIENT_ID'],
                'clientSecret' => $_ENV['GOOGLE_CLIENT_SECRET'],
                'oauth2ReturnUrl' => 'https://example.com/auth/google',
            ],
            'github' => [
                'class' => Yiisoft\Yii\AuthClient\Client\GitHub::class,
                'clientId' => $_ENV['GITHUB_CLIENT_ID'],
                'clientSecret' => $_ENV['GITHUB_CLIENT_SECRET'],
                'oauth2ReturnUrl' => 'https://example.com/auth/github',
            ],
        ],
    ],
];
```

> [!WARNING]
> **`oauth2ReturnUrl` must be configured explicitly.** It is sent verbatim as `redirect_uri` and must match the provider's registered callback URL **exactly** (scheme, host, path).

Config-key rules (enforced by `CollectionFactory`):
- The `'name'` key is **forbidden**. The name is inferred from the array key (e.g. `'google'`).
- Every array key must have a matching `set*()` method on the client class. Any unknown key throws `InvalidArgumentException`.

## 4. OpenID Connect (`Client\OpenIdConnect`)

`OpenIdConnect` extends `OAuth2` with discovery (`{issuerUrl}/.well-known/openid-configuration`), `id_token` JWS validation (`web-token/jwt-library`), nonce validation, and RP-initiated logout:

```php
'google-oidc' => [
    'class' => Yiisoft\Yii\AuthClient\Client\OpenIdConnect::class,
    'title' => 'Google OpenID Connect',
    'issuerUrl' => 'https://accounts.google.com',
    'clientId' => $_ENV['GOOGLE_CLIENT_ID'],
    'clientSecret' => $_ENV['GOOGLE_CLIENT_SECRET'],
],
```

Additional requirements and tools:
- **A PSR-16 cache binding is mandatory**: `OpenIdConnect` takes `Psr\SimpleCache\CacheInterface $cache` in its constructor to cache discovery documents and JWK sets.
- JWS validation is enabled by default (`$validateJws = true`). Because `withoutValidateJws()` is an immutable wither rather than a setter, JWS validation **cannot** be disabled via `params.php`.

## 5. `AuthChoice` Button Widget

`Yiisoft\Yii\AuthClient\Widget\AuthChoice` renders buttons linking to the `AuthAction` route:

```php
<?= Yiisoft\Yii\AuthClient\Widget\AuthChoice::widget()->authRoute('site/auth') ?>
```

- **Popup mode is on by default** (`popupMode(true)`); it requires the `@assets` / `@assetsUrl` aliases to publish the package JS asset (`AuthChoiceAsset`, `authchoice.js`).
- Setting `->popupMode(false)` performs standard top-level navigation, eliminating the need for asset publishing aliases.

## 6. Mapping Provider Attributes to Your Identity & Critical Gotchas

The package does not log users in automatically. In the success callback, fetch `$client->getUserAttributes()` and match or link them to a local user identity:

```php
declare(strict_types=1);

namespace App\Application\Auth;

use App\Domain\User\Repository\UserRepositoryInterface;
use Yiisoft\User\CurrentUser;
use Yiisoft\Yii\AuthClient\AuthClientInterface;

final readonly class OAuthSuccessHandler
{
    public function __construct(
        private CurrentUser $currentUser,
        private UserRepositoryInterface $userRepository,
    ) {}

    public function handle(AuthClientInterface $client): void
    {
        $attributes = $client->getUserAttributes();
        $source = $client->getName();
        $sourceId = (string) ($attributes['id'] ?? $attributes['sub'] ?? '');

        $identity = $this->userRepository->findByOAuth($source, $sourceId)
            ?? $this->userRepository->createFromOAuth($source, $sourceId, (string) ($attributes['email'] ?? ''));

        $this->currentUser->login($identity);
    }
}
```

### Critical Gotchas Matrix

| Gotcha | Detail |
|---|---|
| Route argument only | `AuthAction` reads `{authclient}` exclusively from `CurrentRoute`, never from request body or attributes. |
| State is session-backed | CSRF `state` and nonce values go to `StateStorageInterface` (default `SessionStateStorage`). CSRF `state` validation is on by default (`$validateAuthState = true`) — do not disable it. |
| Token clearing | `setAccessToken(null)` is not supported; `setAccessToken([])` does not purge stored tokens. |
| PKCE-only providers | `VKontakte` has no client secret (PKCE-only flow); `X` uses Authorization Code Flow with PKCE. |
| Microsoft tenants | `Microsoft` uses `{$tenant}` URL templates, default tenant `common`; override with the `tenant` config key. |
| Events | No PSR-14 events are dispatched by `yii-auth-client` — audit logging belongs in your success callback. |

## 7. Anti-Patterns & Common Traps

| # | Anti-Pattern | Why It Breaks | Correct Yii3 Approach |
|:---:|---|---|---|
| **1** | Omitting `withSuccessUrl()` in `AuthAction` | Callbacks returning `void` fall back to `$this->successUrl`. If omitted, PHP 8.2 throws an uninitialized typed property fatal error. | Always configure `withSuccessUrl()` and `withCancelUrl()`, or return a `ResponseInterface` from the callback. |

---

## Related Topic Guides

- [Authentication & RBAC Guide](infra-auth-and-rbac.md) — Identity repositories, the stateful session lifecycle alternative, route protection, and RBAC permission checks layered on top of OAuth2 login.
- [Stateless JWT Authentication Guide](infra-auth-jwt.md) — The alternative stateless API-login method (`yiisoft/auth-jwt`): authenticator DI binding and token issuance.
- [HTTP State Guide](http-state.md) — Session state backing the OAuth2 `state`/nonce storage and the post-login session.
- [Caching Guide](persistence-caching.md) — PSR-16 cache configuration required for OpenID Connect discovery.
- [Routing Guide](http-routes.md) — Route groups and registering the `/auth/{authclient}` callback route.
