# Yii3 Authentication & RBAC Guide

> Practical guide and configuration recipes for user authentication, password hashing, stateful session/cookie methods, stateless JWT token methods, external OAuth2/OIDC login, user lifecycle events, and role-based access control (RBAC) in Yii3.

---

## Table of Contents
- [1. Authentication Architecture & Core Contracts](#1-authentication-architecture--core-contracts)
- [2. Identity & Identity Repository Implementation](#2-identity--identity-repository-implementation)
  - [2.1. Identity Model with Auto-Login Support](#21-identity-model-with-auto-login-support)
  - [2.2. Web Identity Repository](#22-web-identity-repository)
  - [2.3. Dual Identity Repository (Sessions + API Tokens)](#23-dual-identity-repository-sessions--api-tokens)
- [3. Password Hashing with PasswordHasher & Cryptographic Primitives](#3-password-hashing-with-passwordhasher--cryptographic-primitives)
  - [3.1. Key Signatures and Security Invariants](#31-key-signatures-and-security-invariants)
  - [3.2. Cryptographic Token Generation (`Random`)](#32-cryptographic-token-generation-random)
- [4. Stateful Session Authentication Lifecycle (`yiisoft/user`)](#4-stateful-session-authentication-lifecycle-yiisoftuser)
  - [4.1. `CurrentUser` Configuration & Timeouts](#41-currentuser-configuration--timeouts)
  - [4.2. Full Login Lifecycle & Anti-Fixation](#42-full-login-lifecycle--anti-fixation)
  - [4.3. Canonical Web Login Authenticator (`WebAuth`) & Login Bridge](#43-canonical-web-login-authenticator-webauth--login-bridge)
  - [4.4. Full Logout Lifecycle & State Reset](#44-full-logout-lifecycle--state-reset)
  - [4.5. Remember-Me Auto-Login Cookies (`CookieLogin`)](#45-remember-me-auto-login-cookies-cookielogin)
  - [4.6. Web Login Security: CSRF & Brute-Force Rate Limiting](#46-web-login-security-csrf--brute-force-rate-limiting)
  - [4.7. PSR-14 User Authentication Events](#47-psr-14-user-authentication-events)
- [5. Stateless REST API Authentication (JWT / Bearer Token)](#5-stateless-rest-api-authentication-jwt--bearer-token)
  - [5.1. DI Binding for JWT Authenticator](#51-di-binding-for-jwt-authenticator)
  - [5.2. Issuing JSON Web Tokens](#52-issuing-json-web-tokens)
- [6. External OAuth2 / OIDC Login (`yiisoft/yii-auth-client`)](#6-external-oauth2--oidc-login-yiisoftyii-auth-client)
  - [6.1. Package Architecture & Core Contracts](#61-package-architecture--core-contracts)
  - [6.2. Wiring `AuthAction` (Callback Route + DI)](#62-wiring-authaction-callback-route--di)
  - [6.3. Configuring Clients via `Collection` Params](#63-configuring-clients-via-collection-params)
  - [6.4. OpenID Connect (`Client\OpenIdConnect`)](#64-openid-connect-clientopenidconnect)
  - [6.5. `AuthChoice` Button Widget](#65-authchoice-button-widget)
  - [6.6. Mapping Provider Attributes to Your Identity & Critical Gotchas](#66-mapping-provider-attributes-to-your-identity--critical-gotchas)
- [7. Route Protection via Authentication & RBAC Middleware](#7-route-protection-via-authentication--rbac-middleware)
  - [7.1. Route Definition with Authentication & Login Bridge](#71-route-definition-with-authentication--login-bridge)
  - [7.2. Protecting Routes with RBAC Permissions](#72-protecting-routes-with-rbac-permissions)
- [8. Role-Based Access Control (RBAC) Architecture](#8-role-based-access-control-rbac-architecture)
  - [8.1. RBAC Items, Roles, Permissions, and `ManagerInterface`](#81-rbac-items-roles-permissions-and-managerinterface)
  - [8.2. Dynamic Business Rules (`RuleInterface` & `RuleContext`)](#82-dynamic-business-rules-ruleinterface--rulecontext)
  - [8.3. Registering Rules via `rbac-rules-container`](#83-registering-rules-via-rbac-rules-container)
  - [8.4. Relational Database Storage (`yiisoft/rbac-db`)](#84-relational-database-storage-yiisoftrbac-db)
  - [8.5. PHP File Storage (`yiisoft/rbac-php`)](#85-php-file-storage-yiisoftrbac-php)
  - [8.6. Cycle Database Storage (`yiisoft/rbac-cycle-db`)](#86-cycle-database-storage-yiisoftrbac-cycle-db)
  - [8.7. Hybrid Storage Architectures](#87-hybrid-storage-architectures)
- [9. Checking Permissions in Code](#9-checking-permissions-in-code)
  - [9.1. In Presentation Actions](#91-in-presentation-actions)
  - [9.2. In Application Services / Use Cases (`AccessCheckerInterface`)](#92-in-application-services--use-cases-accesscheckerinterface)
- [10. Anti-Patterns & Common Traps](#10-anti-patterns--common-traps)
- [11. Related Topic Guides](#11-related-topic-guides)

---

## 1. Authentication Architecture & Core Contracts

In Yii3, user authentication, session state management, and hierarchical access control are segregated into decoupled packages under the `yiisoft` vendor namespace:

| Package | FQCN / Core Interfaces | Purpose |
|---|---|---|
| `yiisoft/user` | `Yiisoft\User\CurrentUser`<br>`Yiisoft\User\Method\WebAuth`<br>`Yiisoft\User\Login\LoginMiddleware`<br>`Yiisoft\User\Login\Cookie\CookieLogin` | Current user context, session state, login/logout, guest check, auto-login cookies, lifecycle events, and the `can()` permission facade. |
| `yiisoft/auth` | `Yiisoft\Auth\IdentityInterface`<br>`Yiisoft\Auth\IdentityRepositoryInterface`<br>`Yiisoft\Auth\IdentityWithTokenRepositoryInterface`<br>`Yiisoft\Auth\AuthenticatorInterface`<br>`Yiisoft\Auth\AuthenticatorWithChallengeInterface`<br>`Yiisoft\Auth\Middleware\Authentication`<br>`Yiisoft\Auth\Method\HttpBearer` | Identity contracts, token-based identity lookups, PSR-15 authentication middleware, challenge responders, and HTTP header token extractors. *(Note: `AuthenticationMethodInterface` is `@deprecated` in favor of `AuthenticatorWithChallengeInterface`).* |
| `yiisoft/auth-jwt` | `Yiisoft\Auth\Jwt\JwtMethod`<br>`Yiisoft\Auth\Jwt\TokenFactoryInterface`<br>`Yiisoft\Auth\Jwt\TokenRepositoryInterface` | Stateless JSON Web Token authentication, claims validation, and token issuance. |
| `yiisoft/yii-auth-client` | `Yiisoft\Yii\AuthClient\Collection`<br>`Yiisoft\Yii\AuthClient\AuthAction`<br>`Yiisoft\Yii\AuthClient\Client\OpenIdConnect`<br>`Yiisoft\Yii\AuthClient\Widget\AuthChoice` | External OAuth 2.0 / OpenID Connect login (Google, GitHub, Microsoft, X, VK, etc.): provider clients, PSR-15 callback middleware, and button widgets. See §6. |
| `yiisoft/security` | `Yiisoft\Security\PasswordHasher`<br>`Yiisoft\Security\Random` | Cryptographically secure password hashing (BCrypt/Argon2), transparent rehash verification, and CSPRNG token generation. |
| `yiisoft/csrf` | `Yiisoft\Csrf\CsrfTokenMiddleware`<br>`Yiisoft\Csrf\CsrfTokenInterface` | Synchronizer token pattern CSRF defense for stateful forms. *(Note: `CsrfMiddleware` is `@deprecated`).* |
| `yiisoft/rate-limiter` | `Yiisoft\Yii\RateLimiter\LimitRequestsMiddleware`<br>`Yiisoft\Yii\RateLimiter\Counter` | Request rate limiting with GCRA (leaky bucket) to protect endpoints against brute-force attacks. |
| `yiisoft/access` | `Yiisoft\Access\AccessCheckerInterface` | Abstract access verification contract implemented by RBAC managers and consumed by `CurrentUser`. |
| `yiisoft/rbac` | `Yiisoft\Rbac\ManagerInterface`<br>`Yiisoft\Rbac\Role`<br>`Yiisoft\Rbac\Permission`<br>`Yiisoft\Rbac\RuleInterface`<br>`Yiisoft\Rbac\RuleContext`<br>`Yiisoft\Rbac\CompositeRule` | Hierarchical RBAC item manager, assignment coordinator, and dynamic business rule evaluator. |
| `yiisoft/rbac-db` | `Yiisoft\Rbac\Db\ItemsStorage`<br>`Yiisoft\Rbac\Db\AssignmentsStorage`<br>`Yiisoft\Rbac\Db\TransactionalManagerDecorator` | Relational database persistence driver for RBAC items and assignments using `yiisoft/db`. Includes migrations. See §8.4. |
| `yiisoft/rbac-php` | `Yiisoft\Rbac\Php\ItemsStorage`<br>`Yiisoft\Rbac\Php\AssignmentsStorage`<br>`Yiisoft\Rbac\Php\ConcurrentItemsStorageDecorator`<br>`Yiisoft\Rbac\Php\ConcurrentAssignmentsStorageDecorator` | PHP file storage driver for RBAC items and assignments (version-controlled roles, no database). See §8.5. |
| `yiisoft/rbac-cycle-db` | `Yiisoft\Rbac\Cycle\ItemsStorage`<br>`Yiisoft\Rbac\Cycle\AssignmentsStorage`<br>`Yiisoft\Rbac\Cycle\TransactionalManagerDecorator` | Database persistence driver for RBAC using `cycle/database` (Cycle migrations included). See §8.6. |
| `yiisoft/rbac-rules-container` | `Yiisoft\Rbac\Rules\Container\RulesContainer` | Rule factory resolving custom `RuleInterface` implementations via a PSR-11 container. |

---

## 2. Identity & Identity Repository Implementation

### 2.1. Identity Model with Auto-Login Support

An identity represents an authenticated user entity. To support both stateful session authentication and persistent "remember-me" cookies, implement `Yiisoft\User\Login\Cookie\CookieLoginIdentityInterface` (which extends `Yiisoft\Auth\IdentityInterface`):

```php
declare(strict_types=1);

namespace App\Domain\User\Model;

use SensitiveParameter;
use Yiisoft\User\Login\Cookie\CookieLoginIdentityInterface;

final readonly class UserIdentity implements CookieLoginIdentityInterface
{
    public function __construct(
        private string $id,
        private string $login,
        #[SensitiveParameter]
        private string $passwordHash,
        private string $authKey,
        private bool $isActive = true,
    ) {}

    public function getId(): ?string
    {
        return $this->id;
    }

    public function getLogin(): string
    {
        return $this->login;
    }

    public function getPasswordHash(): string
    {
        return $this->passwordHash;
    }

    public function isActive(): bool
    {
        return $this->isActive;
    }

    public function getCookieLoginKey(): string
    {
        return $this->authKey;
    }

    public function validateCookieLoginKey(string $key): bool
    {
        // Prevent timing side-channels via constant-time comparison
        return hash_equals($this->authKey, $key);
    }
}
```

### 2.2. Web Identity Repository

`Yiisoft\Auth\IdentityRepositoryInterface` provides user lookup by identifier for web sessions:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\Repository;

use App\Domain\User\Model\UserIdentity;
use Yiisoft\Auth\IdentityInterface;
use Yiisoft\Auth\IdentityRepositoryInterface;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;

final readonly class UserIdentityRepository implements IdentityRepositoryInterface
{
    public function __construct(
        private ConnectionInterface $db,
    ) {}

    public function findIdentity(string $id): ?IdentityInterface
    {
        $row = (new Query($this->db))
            ->from('{{%user}}')
            ->where(['id' => $id, 'is_active' => true])
            ->one();

        if ($row === null) {
            return null;
        }

        return new UserIdentity(
            id: (string) $row['id'],
            login: (string) $row['username'],
            passwordHash: (string) $row['password_hash'],
            authKey: (string) ($row['auth_key'] ?? ''),
            isActive: (bool) ($row['is_active'] ?? true),
        );
    }
}
```

### 2.3. Dual Identity Repository (Sessions + API Tokens)

When an application supports both stateful web sessions and stateless HTTP Bearer/API tokens, implement both `IdentityRepositoryInterface` and `Yiisoft\Auth\IdentityWithTokenRepositoryInterface`:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\Repository;

use App\Domain\User\Model\UserIdentity;
use Yiisoft\Auth\IdentityInterface;
use Yiisoft\Auth\IdentityRepositoryInterface;
use Yiisoft\Auth\IdentityWithTokenRepositoryInterface;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;

final readonly class DualUserIdentityRepository implements
    IdentityRepositoryInterface,
    IdentityWithTokenRepositoryInterface
{
    public function __construct(
        private ConnectionInterface $db,
    ) {}

    public function findIdentity(string $id): ?IdentityInterface
    {
        $row = (new Query($this->db))
            ->from('{{%user}}')
            ->where(['id' => $id, 'is_active' => true])
            ->one();

        return $row !== null ? $this->mapRowToIdentity($row) : null;
    }

    public function findIdentityByToken(string $token, ?string $type = null): ?IdentityInterface
    {
        $query = (new Query($this->db))
            ->from('{{%user}}')
            ->where(['is_active' => true]);

        if ($type === 'api_token' || $type === null) {
            $query->andWhere(['api_token' => $token]);
        } else {
            return null;
        }

        $row = $query->one();

        return $row !== null ? $this->mapRowToIdentity($row) : null;
    }

    private function mapRowToIdentity(array $row): UserIdentity
    {
        return new UserIdentity(
            id: (string) $row['id'],
            login: (string) $row['username'],
            passwordHash: (string) $row['password_hash'],
            authKey: (string) ($row['auth_key'] ?? ''),
            isActive: (bool) ($row['is_active'] ?? true),
        );
    }
}
```

Register both interfaces in `config/common/di/identity.php`:

```php
declare(strict_types=1);

use App\Infrastructure\Persistence\Repository\DualUserIdentityRepository;
use Yiisoft\Auth\IdentityRepositoryInterface;
use Yiisoft\Auth\IdentityWithTokenRepositoryInterface;

return [
    IdentityRepositoryInterface::class => DualUserIdentityRepository::class,
    IdentityWithTokenRepositoryInterface::class => DualUserIdentityRepository::class,
];
```

---

## 3. Password Hashing with PasswordHasher & Cryptographic Primitives

`Yiisoft\Security\PasswordHasher` wraps PHP's native password hashing APIs with hardened security defaults:
- Default algorithm: `PASSWORD_DEFAULT`.
- BCrypt cost is preset to `13` (`cost => 13`).
- Argon2 (`PASSWORD_ARGON2ID`, `PASSWORD_ARGON2I`) falls back to PHP engine defaults unless custom parameters are passed to the constructor.

### 3.1. Key Signatures and Security Invariants

- `hash(#[SensitiveParameter] string $password): string`: Generates a secure hash string.
- `validate(#[SensitiveParameter] string $password, #[SensitiveParameter] string $hash): bool`: Verifies a plaintext password against a hash using `password_verify()`. Both arguments are protected with PHP 8.2 `#[SensitiveParameter]` to prevent leakage in stack traces. Passing an empty string `$password === ''` throws an `InvalidArgumentException`.
- `needsRehash(#[SensitiveParameter] string $hash): bool`: Verifies if a stored hash was created with an older algorithm or lower cost, enabling transparent on-the-fly hash upgrades upon successful login.

```php
declare(strict_types=1);

namespace App\Application\User\Service;

use App\Domain\User\Model\UserIdentity;
use App\Domain\User\Repository\UserRepositoryInterface;
use InvalidArgumentException;
use SensitiveParameter;
use Yiisoft\Security\PasswordHasher;

final readonly class UserAuthenticationService
{
    public function __construct(
        private PasswordHasher $passwordHasher,
        private UserRepositoryInterface $userRepository,
    ) {}

    public function registerUser(string $login, #[SensitiveParameter] string $password): void
    {
        if ($password === '') {
            throw new InvalidArgumentException('Password cannot be empty.');
        }

        $passwordHash = $this->passwordHasher->hash($password);
        $this->userRepository->create($login, $passwordHash);
    }

    public function authenticate(string $login, #[SensitiveParameter] string $password): ?UserIdentity
    {
        if ($password === '') {
            return null;
        }

        $user = $this->userRepository->findByLogin($login);
        if ($user === null) {
            return null;
        }

        if (!$this->passwordHasher->validate($password, $user->getPasswordHash())) {
            return null;
        }

        // Transparent hash upgrade when cost or algorithm evolves
        if ($this->passwordHasher->needsRehash($user->getPasswordHash())) {
            $newHash = $this->passwordHasher->hash($password);
            $this->userRepository->updatePasswordHash($user->getId(), $newHash);
        }

        return $user;
    }
}
```

### 3.2. Cryptographic Token Generation (`Random`)

Use `Yiisoft\Security\Random::string(int $length = 32): string` to generate cryptographically secure, URL-safe pseudo-random tokens (using `[A-Za-z0-9_-]+`) for email verification, password reset tokens, or auth keys:

```php
use Yiisoft\Security\Random;

$authKey = Random::string(32);
$resetToken = Random::string(64);
```

---

## 4. Stateful Session Authentication Lifecycle (`yiisoft/user`)

The `Yiisoft\User\CurrentUser` service manages the user session, guest state, and authorization checks.

### 4.1. `CurrentUser` Configuration & Timeouts

In `config/web/di/auth.php`, configure `CurrentUser` with session storage and timeouts:

```php
declare(strict_types=1);

use Psr\EventDispatcher\EventDispatcherInterface;
use Yiisoft\Access\AccessCheckerInterface;
use Yiisoft\Auth\IdentityRepositoryInterface;
use Yiisoft\Session\SessionInterface;
use Yiisoft\User\CurrentUser;

return [
    CurrentUser::class => static function (
        IdentityRepositoryInterface $identityRepository,
        EventDispatcherInterface $eventDispatcher,
        SessionInterface $session,
        AccessCheckerInterface $accessChecker,
    ): CurrentUser {
        return (new CurrentUser($identityRepository, $eventDispatcher))
            ->withSession($session)
            ->withAccessChecker($accessChecker)
            // Sliding inactivity timeout: logout after 1800 seconds (30 mins) of idle time
            ->withAuthTimeout(1800)
            // Absolute timeout: force logout after 86400 seconds (24 hours) regardless of activity
            ->withAbsoluteAuthTimeout(86400);
    },
];
```

> [!NOTE]
> `CurrentUser` manages session auth keys (`SESSION_AUTH_ID`, `SESSION_AUTH_EXPIRE`, `SESSION_AUTH_ABSOLUTE_EXPIRE`) internally. Do not mutate these keys manually.

### 4.2. Full Login Lifecycle & Anti-Fixation

When `$currentUser->login($identity)` is called:
1. **Event Dispatch:** Triggers `Yiisoft\User\Event\BeforeLogin`. If a listener calls `$event->invalidate()`, the login process aborts without switching identity, and `login()` returns whether the resulting identity is non-guest.
2. **Session Regeneration (Anti-Fixation):** Calls `$session->regenerateID()` to assign a fresh session ID, eliminating session fixation vulnerabilities.
3. **Session State Storage:**
   - Clears old auth session variables.
   - Stores user ID into the session auth key.
   - Computes and stores sliding timeout (`time() + $authTimeout`).
   - Computes and stores absolute timeout (`time() + $absoluteAuthTimeout`).
4. **Event Dispatch:** Triggers `Yiisoft\User\Event\AfterLogin`.
5. Returns `true` if authentication succeeded (`!$this->isGuest()`).

#### Login Action Example (with Remember-Me)

```php
declare(strict_types=1);

namespace App\Presentation\Action\Auth;

use App\Application\User\Service\UserAuthenticationService;
use DateInterval;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\User\CurrentUser;
use Yiisoft\User\Login\Cookie\CookieLogin;

final readonly class LoginAction
{
    public function __construct(
        private CurrentUser $currentUser,
        private UserAuthenticationService $authService,
        private CookieLogin $cookieLogin,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $body = (array) $request->getParsedBody();
        $username = (string) ($body['username'] ?? '');
        $password = (string) ($body['password'] ?? '');
        $rememberMe = (bool) ($body['rememberMe'] ?? false);

        $identity = $this->authService->authenticate($username, $password);

        if ($identity === null) {
            return $this->responseFactory->createResponse(
                ['error' => 'Invalid credentials'],
                Status::UNAUTHORIZED,
            );
        }

        // 1. Log in user into session (regenerates session ID)
        $this->currentUser->login($identity);

        $response = $this->responseFactory->createResponse(['status' => 'authenticated']);

        // 2. Issue persistent remember-me cookie if requested
        if ($rememberMe) {
            $response = $this->cookieLogin->addCookie(
                $identity,
                $response,
                new DateInterval('P30D') // 30-day lifetime
            );
        }

        return $response;
    }
}
```

### 4.3. Canonical Web Login Authenticator (`WebAuth`) & Login Bridge

In traditional web applications, unauthenticated users attempting to access protected routes must be redirected to a login page.

#### `Yiisoft\User\Method\WebAuth`

`Yiisoft\User\Method\WebAuth` implements `AuthenticatorWithChallengeInterface`. When challenged, it issues an HTTP 302 Found redirect to `/login` (customizable via `withAuthUrl()`):

> [!WARNING]
> `Yiisoft\User\UserAuth` is `@deprecated` and will be removed in the next major version. Always use `Yiisoft\User\Method\WebAuth`.

In `config/web/di/auth.php`:

```php
declare(strict_types=1);

use Psr\Http\Message\ResponseFactoryInterface;
use Yiisoft\Auth\AuthenticatorInterface;
use Yiisoft\Auth\AuthenticatorWithChallengeInterface;
use Yiisoft\User\CurrentUser;
use Yiisoft\User\Method\WebAuth;

return [
    WebAuth::class => static fn (
        CurrentUser $currentUser,
        ResponseFactoryInterface $responseFactory,
    ): WebAuth => (new WebAuth($currentUser, $responseFactory))
        ->withAuthUrl('/auth/login'),

    AuthenticatorInterface::class => WebAuth::class,
    AuthenticatorWithChallengeInterface::class => WebAuth::class,
];
```

#### `Yiisoft\User\Login\LoginMiddleware` (The Identity Bridge)

`Yiisoft\Auth\Middleware\Authentication` inspects credentials and places the authenticated `IdentityInterface` into the request attribute `Yiisoft\Auth\Middleware\Authentication::class`. However, it does not mutate `CurrentUser`.

`Yiisoft\User\Login\LoginMiddleware` bridges this gap: if `CurrentUser::isGuest()` is true, it reads the `Authentication::class` request attribute and automatically calls `$currentUser->login($identity)`:

```php
use Yiisoft\Auth\Middleware\Authentication;
use Yiisoft\User\Login\LoginMiddleware;

// In route group middleware definition:
$group
    ->middleware(Authentication::class) // Evaluates credentials, sets request attribute
    ->middleware(LoginMiddleware::class); // Logs identity into CurrentUser session
```

### 4.4. Full Logout Lifecycle & State Reset

When `$currentUser->logout()` is called:
1. Returns `false` immediately if `$currentUser->isGuest()`.
2. Triggers `Yiisoft\User\Event\BeforeLogout`. If a listener calls `$event->invalidate()`, logout aborts.
3. Switches identity to guest:
   - Calls `$session->regenerateID()`.
   - Clears session auth timeout keys.
4. Triggers `Yiisoft\User\Event\AfterLogout`.
5. Returns `true`.

#### Logout Action Example

```php
declare(strict_types=1);

namespace App\Presentation\Action\Auth;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\User\CurrentUser;
use Yiisoft\User\Login\Cookie\CookieLogin;

final readonly class LogoutAction
{
    public function __construct(
        private CurrentUser $currentUser,
        private CookieLogin $cookieLogin,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $this->currentUser->logout();

        $response = $this->responseFactory->createResponse(['status' => 'logged_out']);

        // Expire client auto-login cookie
        return $this->cookieLogin->expireCookie($response);
    }
}
```

#### Long-Running Worker Reset (`StateResetter`)

In persistent daemon runtimes (RoadRunner, FrankenPHP, Swoole), the `CurrentUser` singleton remains in memory across requests. It **must** be reset to avoid identity bleeding (User B inheriting User A's identity and privileges).

**Rely on built-in package resetters.** `yiisoft/user` already ships the correct reset closure for `CurrentUser` in its `config/di-web.php`:

```php
// vendor/yiisoft/user/config/di-web.php — shipped by the package; do NOT duplicate it:
CurrentUser::class => [
    'reset' => function () {
        $this->clear(); // Clears cached identity and identityOverride
    },
],
```

All official packages (`yiisoft/user`, `yiisoft/session`, `yiisoft/router`, etc.) contribute their own `'reset'` callbacks automatically — see the ground-truth catalog in [runners-and-runtimes.md](infra-runners-and-runtimes.md), section 6.4. No application-level registration is required.

**Custom stateful application services** declare a `'reset'` key directly on their own DI definition in `config/di-web.php` — full per-service examples: [Runners & Runtimes Guide, §6.3](infra-runners-and-runtimes.md).

> [!CAUTION]
> **Never define or override `StateResetter::class` in application DI configuration.** An app-level definition is treated as a full override and silently disables every built-in package resetter — identity, session, route, and view state then leak across worker requests. Internal mechanics and full analysis: [Runners & Runtimes Guide, §6.2](infra-runners-and-runtimes.md), and the DI & Configuration Guide's anti-pattern matrix.

### 4.5. Remember-Me Auto-Login Cookies (`CookieLogin`)

`yiisoft/user` provides `CookieLogin` and `CookieLoginMiddleware` to securely restore user sessions across browser visits without storing raw credentials:

```
Browser Request ──> CookieLoginMiddleware
                         │
                         ├─ If Guest & Cookie Present:
                         │    1. Validates HMAC-SHA256 signature against secret key
                         │    2. Extracts user ID and login key
                         │    3. Finds identity in IdentityRepositoryInterface
                         │    4. Validates $identity->validateCookieLoginKey($key)
                         │    5. Checks lifetime expiration
                         │    6. Invokes $currentUser->login($identity)
                         │
                         ▼
                    Next Middleware / Handler
```

#### Configuring `CookieLogin` in `config/web/di/auth.php`

```php
declare(strict_types=1);

use DateInterval;
use Yiisoft\User\Login\Cookie\CookieLogin;

/** @var array $params */

return [
    CookieLogin::class => [
        '__construct()' => [
            'duration' => new DateInterval('P14D'), // 14-day lifetime; default null is a session cookie
            'signatureKey' => $params['app']['cookieAuthKey'], // Secret HMAC-SHA256 key
            'secureCookie' => true, // Enforce HTTPS
        ],
    ],
];
```

> [!WARNING]
> Always configure a strong `signatureKey` for `CookieLogin`. Without it, anyone able to edit cookies can tamper with user IDs and impersonate other accounts!

#### Attaching `CookieLoginMiddleware` to Pipeline

There is **no** `"middlewares"` params key — no package consumes it. The middleware pipeline is wired through the `Application::class` DI definition in `config/web/di/application.php`, whose `dispatcher` constructor parameter receives a `MiddlewareDispatcher` with middleware definitions passed to its constructor (`withMiddlewares()` is deprecated since `yiisoft/middleware-dispatcher` 5.5.0 — see [error-handling.md](infra-error-handling.md), section 2). Register `CookieLoginMiddleware` immediately after `SessionMiddleware`:

```php
// config/web/di/application.php
use Yiisoft\Definitions\DynamicReference;
use Yiisoft\ErrorHandler\Middleware\ErrorCatcher;
use Yiisoft\Middleware\Dispatcher\MiddlewareDispatcher;
use Yiisoft\Router\Middleware\Router;
use Yiisoft\Session\SessionMiddleware;
use Yiisoft\User\Login\Cookie\CookieLoginMiddleware;
use Yiisoft\Yii\Http\Application;

return [
    Application::class => [
        '__construct()' => [
            'dispatcher' => DynamicReference::to([
                'class' => MiddlewareDispatcher::class,
                '__construct()' => [
                    'middlewareDefinitions' => [
                        ErrorCatcher::class,
                        SessionMiddleware::class,
                        CookieLoginMiddleware::class, // Auto-authenticates guest users from cookie
                        // ... other application middlewares
                        Router::class,
                    ],
                ],
            ]),
        ],
    ],
];
```

### 4.6. Web Login Security: CSRF & Brute-Force Rate Limiting

#### CSRF Protection with `CsrfTokenMiddleware`

All state-changing web login forms must validate CSRF tokens using `Yiisoft\Csrf\CsrfTokenMiddleware`:

> [!WARNING]
> `Yiisoft\Csrf\CsrfMiddleware` is `@deprecated`. Always use `Yiisoft\Csrf\CsrfTokenMiddleware`.

1. **Pipeline registration (`config/web/di/application.php`):** there is **no** `"middlewares"` params key — the stack is wired on the `Application::class` DI definition via the `MiddlewareDispatcher` constructor argument `middlewareDefinitions` (`withMiddlewares()` is deprecated since `yiisoft/middleware-dispatcher` 5.5.0 — see [error-handling.md](infra-error-handling.md), section 2):
   ```php
   use Yiisoft\Csrf\CsrfTokenMiddleware;
   use Yiisoft\Definitions\DynamicReference;
   use Yiisoft\Middleware\Dispatcher\MiddlewareDispatcher;
   use Yiisoft\Router\Middleware\Router;
   use Yiisoft\Session\SessionMiddleware;
   use Yiisoft\User\Login\Cookie\CookieLoginMiddleware;
   use Yiisoft\Yii\Http\Application;

   return [
       Application::class => [
           '__construct()' => [
               'dispatcher' => DynamicReference::to([
                   'class' => MiddlewareDispatcher::class,
                   '__construct()' => [
                       'middlewareDefinitions' => [
                           \Yiisoft\ErrorHandler\Middleware\ErrorCatcher::class,
                           SessionMiddleware::class,
                           CsrfTokenMiddleware::class,
                           CookieLoginMiddleware::class,
                           Router::class,
                       ],
                   ],
               ]),
           ],
       ],
   ];
   ```

2. **Login View Form Template:**
   ```php
   /** @var Yiisoft\Csrf\CsrfTokenInterface $csrfToken */
   ?>
   <form method="post" action="/auth/login">
       <input type="hidden" name="_csrf" value="<?= \Yiisoft\Html\Html::encode($csrfToken->getValue()) ?>">
       <div class="mb-3">
           <label for="username">Username or Email</label>
           <input type="text" id="username" name="username" class="form-control" required>
       </div>
       <div class="mb-3">
           <label for="password">Password</label>
           <input type="password" id="password" name="password" class="form-control" required>
       </div>
       <div class="mb-3 form-check">
           <input type="checkbox" id="rememberMe" name="rememberMe" value="1" class="form-check-input">
           <label for="rememberMe" class="form-check-label">Remember me</label>
       </div>
       <button type="submit" class="btn btn-primary">Sign In</button>
   </form>
   ```

#### Brute-Force Rate Limiting (`LimitRequestsMiddleware`)

Protect authentication endpoints from credential-stuffing and brute-force dictionary attacks using `Yiisoft\Yii\RateLimiter\LimitRequestsMiddleware`. It uses the Generic Cell Rate Algorithm (GCRA leaky bucket):

```php
declare(strict_types=1);

use Psr\Http\Message\ResponseFactoryInterface;
use Psr\SimpleCache\CacheInterface;
use Yiisoft\Router\Route;
use Yiisoft\Yii\RateLimiter\Counter;
use Yiisoft\Yii\RateLimiter\LimitRequestsMiddleware;
use Yiisoft\Yii\RateLimiter\Policy\LimitPerIp;
use Yiisoft\Yii\RateLimiter\Storage\SimpleCacheStorage;

// Restrict login attempts to 5 per 60 seconds per client IP:
Route::post('/auth/login')
    ->middleware(
        static fn (
            ResponseFactoryInterface $responseFactory,
            CacheInterface $cache,
        ): LimitRequestsMiddleware => new LimitRequestsMiddleware(
            counter: new Counter(
                storage: new SimpleCacheStorage($cache),
                limit: 5,
                periodInSeconds: 60,
            ),
            responseFactory: $responseFactory,
            limitingPolicy: new LimitPerIp(),
        )
    )
    ->action(LoginAction::class);
```

### 4.7. PSR-14 User Authentication Events

`yiisoft/user` dispatches four PSR-14 events during the login and logout cycles: `BeforeLogin`, `AfterLogin`, `BeforeLogout`, `AfterLogout`. The full event table — payload accessors, the `invalidate()` veto semantics, and the `Yiisoft\Auth\IdentityInterface` import note — is owned by the [Events & Listeners Guide](core-events-and-listeners.md), section 6.3. Auth-specific use cases: `BeforeLogin`/`BeforeLogout` are cancellable via `$event->invalidate()` (account suspension checks, maintenance lockouts, IP blacklists, mandatory workflow completion); `AfterLogin`/`AfterLogout` are observational (audit logging, `last_login_at` updates, brute-force counter resets, refresh-token revocation, cache purging).

#### Registering Event Listeners (`config/common/events.php`)

Map the file into the shared `events` group in `config/configuration.php` (`'events' => 'common/events.php'`); the base runner reverse-merges it into `events-web` — see [Events Guide, §4.1](core-events-and-listeners.md):

```php
declare(strict_types=1);

use App\Application\User\Listener\AuditLoginListener;
use App\Application\User\Listener\CheckUserActiveListener;
use Yiisoft\User\Event\AfterLogin;
use Yiisoft\User\Event\BeforeLogin;

return [
    BeforeLogin::class => [
        [CheckUserActiveListener::class, 'handle'],
    ],
    AfterLogin::class => [
        [AuditLoginListener::class, 'handle'],
    ],
];
```

#### Listener Implementation Example

```php
declare(strict_types=1);

namespace App\Application\User\Listener;

use App\Domain\User\Model\UserIdentity;
use Psr\Log\LoggerInterface;
use Yiisoft\User\Event\BeforeLogin;

final readonly class CheckUserActiveListener
{
    public function __construct(
        private LoggerInterface $logger,
    ) {}

    public function handle(BeforeLogin $event): void
    {
        $identity = $event->getIdentity();

        if ($identity instanceof UserIdentity && !$identity->isActive()) {
            $this->logger->warning("Blocked login attempt for inactive user #{$identity->getId()}");
            $event->invalidate(); // Aborts login process
        }
    }
}
```

---

## 5. Stateless REST API Authentication (JWT / Bearer Token)

For stateless REST APIs, avoid session cookies entirely. Clients send `Authorization: Bearer <token>` on every request.

### 5.1. DI Binding for JWT Authenticator

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

### 5.2. Issuing JSON Web Tokens

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

---

## 6. External OAuth2 / OIDC Login (`yiisoft/yii-auth-client`)

For "Sign in with Google / GitHub / Microsoft / X ..." flows, use `yiisoft/yii-auth-client`:

```shell
composer require yiisoft/yii-auth-client
```

The package ships:
- `Yiisoft\Yii\AuthClient\Collection` — registry of configured OAuth2 clients keyed by client name.
- `Yiisoft\Yii\AuthClient\AuthAction` — a **PSR-15 middleware** bound to a callback route: it redirects the user to the provider, exchanges the returned `code` for an access token, and hands the authenticated client to your success/cancel callbacks.
- Ready-made clients under `Yiisoft\Yii\AuthClient\Client\`: `Google`, `GitHub`, `Facebook`, `X`, `Microsoft`, `Discord`, `LinkedIn`, `TikTok`, `Yandex`, `VKontakte`, and `OpenIdConnect`.
- `Yiisoft\Yii\AuthClient\Widget\AuthChoice` — renders "Sign in with ..." buttons with built-in inline SVG logos.
- It intentionally does **not** provide user/session management — map provider attributes onto your own identity in a success callback (§6.6).

### 6.1. Package Architecture & Core Contracts

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

### 6.2. Wiring `AuthAction` (Callback Route + DI)

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
                    // Map provider attributes to local identity (see §6.6)
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

### 6.3. Configuring Clients via `Collection` Params

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

### 6.4. OpenID Connect (`Client\OpenIdConnect`)

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

### 6.5. `AuthChoice` Button Widget

`Yiisoft\Yii\AuthClient\Widget\AuthChoice` renders buttons linking to the `AuthAction` route:

```php
<?= Yiisoft\Yii\AuthClient\Widget\AuthChoice::widget()->authRoute('site/auth') ?>
```

- **Popup mode is on by default** (`popupMode(true)`); it requires the `@assets` / `@assetsUrl` aliases to publish the package JS asset (`AuthChoiceAsset`, `authchoice.js`).
- Setting `->popupMode(false)` performs standard top-level navigation, eliminating the need for asset publishing aliases.

### 6.6. Mapping Provider Attributes to Your Identity & Critical Gotchas

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

#### Critical Gotchas Matrix

| Gotcha | Detail |
|---|---|
| Route argument only | `AuthAction` reads `{authclient}` exclusively from `CurrentRoute`, never from request body or attributes. |
| State is session-backed | CSRF `state` and nonce values go to `StateStorageInterface` (default `SessionStateStorage`). CSRF `state` validation is on by default (`$validateAuthState = true`) — do not disable it. |
| Token clearing | `setAccessToken(null)` is not supported; `setAccessToken([])` does not purge stored tokens. |
| PKCE-only providers | `VKontakte` has no client secret (PKCE-only flow); `X` uses Authorization Code Flow with PKCE. |
| Microsoft tenants | `Microsoft` uses `{$tenant}` URL templates, default tenant `common`; override with the `tenant` config key. |
| Events | No PSR-14 events are dispatched by `yii-auth-client` — audit logging belongs in your success callback. |

---

## 7. Route Protection via Authentication & RBAC Middleware

### 7.1. Route Definition with Authentication & Login Bridge

`Yiisoft\Auth\Middleware\Authentication` intercepts requests, evaluates credentials using the registered authenticator, and populates the request attribute `Yiisoft\Auth\Middleware\Authentication::class` with `?IdentityInterface`. If authentication fails and the route is not marked optional, it halts execution and issues a challenge (401 Unauthorized or 302 Redirect).

Combine it with `Yiisoft\User\Login\LoginMiddleware` to automatically log the authenticated identity into `CurrentUser`:

```php
declare(strict_types=1);

use App\Presentation\Action\Auth\LoginAction;
use App\Presentation\Action\Order\CreateOrderAction;
use App\Presentation\Action\Profile\ViewProfileAction;
use Yiisoft\Auth\Middleware\Authentication;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route;
use Yiisoft\User\Login\LoginMiddleware;

return [
    // Public routes
    Route::post('/auth/login')
        ->action(LoginAction::class)
        ->name('auth.login'),

    // Protected API group
    Group::create('/api')
        ->middleware(Authentication::class) // Authenticates credentials
        ->middleware(LoginMiddleware::class) // Bridges identity to CurrentUser session
        ->routes(
            Route::get('/profile')
                ->action(ViewProfileAction::class)
                ->name('api.profile'),
            Route::post('/orders')
                ->action(CreateOrderAction::class)
                ->name('api.orders.create'),
        ),
];
```

#### Middleware Pipeline Order Invariant

In standard web applications, middlewares must run in this exact sequence:
1. `ErrorCatcher`
2. `SessionMiddleware`
3. `CsrfTokenMiddleware`
4. `CookieLoginMiddleware`
5. `Authentication`
6. `LoginMiddleware`
7. `Router`
8. Route-specific access guards (`AccessCheckerMiddleware`)

### 7.2. Protecting Routes with RBAC Permissions

To enforce permission checks directly on route groups or endpoints, register a custom PSR-15 permission guard middleware:

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

Attaching the RBAC guard to route definitions:

```php
declare(strict_types=1);

use App\Presentation\Action\Admin\ListUsersAction;
use App\Presentation\Middleware\AccessCheckerMiddleware;
use Yiisoft\Auth\Middleware\Authentication;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route;
use Yiisoft\User\CurrentUser;
use Yiisoft\User\Login\LoginMiddleware;

Group::create('/admin')
    ->middleware(Authentication::class)
    ->middleware(LoginMiddleware::class)
    ->middleware(
        static fn (
            CurrentUser $currentUser,
            DataResponseFactoryInterface $responseFactory,
        ): AccessCheckerMiddleware => new AccessCheckerMiddleware('adminAccess', $currentUser, $responseFactory)
    )
    ->routes(
        Route::get('/users')
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

---

## 8. Role-Based Access Control (RBAC) Architecture

Yii3 RBAC consists of **Roles**, **Permissions**, **Assignments**, and dynamic **Rules**.

### 8.1. RBAC Items, Roles, Permissions, and `ManagerInterface`

Manage roles and permissions using `Yiisoft\Rbac\ManagerInterface`.

#### Constructor Invariants of `Yiisoft\Rbac\Manager`

```php
public function __construct(
    ItemsStorageInterface $itemsStorage,
    AssignmentsStorageInterface $assignmentsStorage,
    ?RuleFactoryInterface $ruleFactory = null,
    bool $enableDirectPermissions = false,
    bool $includeRolesInAccessChecks = false,
    ?ClockInterface $clock = null,
)
```

- `$enableDirectPermissions` defaults to **`false`**: Assigning permissions directly to users throws an `InvalidArgumentException`. You must assign roles to users and add permissions to roles.
- `$includeRolesInAccessChecks` defaults to **`false`**: Passing a role name to `userHasPermission()` or `$currentUser->can()` returns `false`. Always check permissions rather than roles.
- `setDefaultRoleNames(array|Closure $roleNames)`: Registers roles automatically assigned to all authenticated users without requiring database rows.
- `setGuestRoleName(?string $name)`: Evaluated when user ID is `null`.
- `revoke(string $itemName, int|Stringable|string $userId)`: Revokes a specific assignment.
- `revokeAll(int|Stringable|string $userId)`: Revokes all assignments for the given user.

#### RBAC Setup Example

```php
declare(strict_types=1);

use Yiisoft\Rbac\ManagerInterface;
use Yiisoft\Rbac\Permission;
use Yiisoft\Rbac\Role;

function initRbac(ManagerInterface $manager): void
{
    // 1. Create permissions
    $viewPost = new Permission('posts.view');
    $createPost = new Permission('posts.create');
    $updatePost = new Permission('posts.update');
    $manager->addPermission($viewPost);
    $manager->addPermission($createPost);
    $manager->addPermission($updatePost);

    // 2. Create roles and build hierarchy
    $author = new Role('author');
    $manager->addRole($author);
    $manager->addChild('author', 'posts.create');

    $admin = new Role('admin');
    $manager->addRole($admin);
    $manager->addChild('admin', 'author');
    $manager->addChild('admin', 'posts.update');

    // 3. Assign role to user
    $manager->assign(itemName: 'author', userId: '42');
}
```

### 8.2. Dynamic Business Rules (`RuleInterface` & `RuleContext`)

When permissions depend on runtime parameters (e.g. "a user may only edit their own post"), implement `Yiisoft\Rbac\RuleInterface`:

```php
public function execute(?string $userId, Item $item, RuleContext $context): bool;
```

> [!IMPORTANT]
> The third parameter of `execute()` is strictly `RuleContext $context`, **not** an array. Type-hinting or passing an array triggers a fatal PHP `TypeError`. Retrieve parameters using `$context->getParameterValue('paramName')`.

```php
declare(strict_types=1);

namespace App\Infrastructure\Rbac\Rule;

use Yiisoft\Rbac\Item;
use Yiisoft\Rbac\RuleContext;
use Yiisoft\Rbac\RuleInterface;

final readonly class AuthorRule implements RuleInterface
{
    public function execute(?string $userId, Item $item, RuleContext $context): bool
    {
        if ($userId === null) {
            return false;
        }

        $authorId = $context->getParameterValue('authorId');
        if ($authorId === null) {
            return false;
        }

        return (string) $authorId === $userId;
    }
}
```

#### Attaching Rules to Items

```php
$editOwnPost = (new Permission('posts.editOwn'))->withRuleName(AuthorRule::class);
$manager->addPermission($editOwnPost);
$manager->addChild('author', 'posts.editOwn');
$manager->addChild('posts.editOwn', 'posts.update');
```

#### Combining Rules with `CompositeRule`

Use `Yiisoft\Rbac\CompositeRule` to combine multiple rules using logical AND / OR operators without writing custom boilerplate:

```php
use Yiisoft\Rbac\CompositeRule;

// Post must be fresh AND owned by the user:
$compositeRule = new CompositeRule(CompositeRule::AND, [FreshRule::class, AuthorRule::class]);

// Permission granted if user is author OR editor:
$orRule = new CompositeRule(CompositeRule::OR, [AuthorRule::class, EditorRule::class]);
```

### 8.3. Registering Rules via `rbac-rules-container`

`yiisoft/rbac-rules-container` dynamically resolves rule dependencies through your PSR-11 container. Register rules in `config/common/params.php`:

```php
use App\Infrastructure\Rbac\Rule\AuthorRule;

return [
    'yiisoft/rbac-rules-container' => [
        'rules' => [
            AuthorRule::class => AuthorRule::class,
        ],
    ],
];
```

The package automatically provides the DI binding for `Yiisoft\Rbac\RuleFactoryInterface::class => RulesContainer::class`.

### 8.4. Relational Database Storage (`yiisoft/rbac-db`)

`yiisoft/rbac-db` persists RBAC data in relational database tables using `yiisoft/db`.

#### Default Database Tables
- `yii_rbac_item`: Stores roles and permissions.
- `yii_rbac_item_child`: Stores parent-child inheritance relationships.
- `yii_rbac_assignment`: Stores user-role bindings.

> [!WARNING]
> Yii 3 table names default to `yii_rbac_*`. The legacy Yii 2 table names (`auth_item`, `auth_assignment`) are **not** used.

#### Running Relational Migrations

Run the migrations that ship with the package:

```shell
./yii migrate:up --path=@vendor/yiisoft/rbac-db/migrations/items
./yii migrate:up --path=@vendor/yiisoft/rbac-db/migrations/assignments
```

#### DI Configuration for `yiisoft/rbac-db`

In `config/common/di/rbac.php`:

```php
declare(strict_types=1);

use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Definitions\Reference;
use Yiisoft\Rbac\AssignmentsStorageInterface;
use Yiisoft\Rbac\Db\AssignmentsStorage;
use Yiisoft\Rbac\Db\ItemsStorage;
use Yiisoft\Rbac\Db\TransactionalManagerDecorator;
use Yiisoft\Rbac\ItemsStorageInterface;
use Yiisoft\Rbac\Manager;
use Yiisoft\Rbac\ManagerInterface;
use Yiisoft\Rbac\RuleFactoryInterface;

return [
    ItemsStorageInterface::class => [
        'class' => ItemsStorage::class,
        '__construct()' => [
            'database' => Reference::to(ConnectionInterface::class),
            'tableName' => 'yii_rbac_item',
            'childrenTableName' => 'yii_rbac_item_child',
            'namesSeparator' => ',',
        ],
    ],

    AssignmentsStorageInterface::class => [
        'class' => AssignmentsStorage::class,
        '__construct()' => [
            'database' => Reference::to(ConnectionInterface::class),
            'tableName' => 'yii_rbac_assignment',
        ],
    ],

    ManagerInterface::class => [
        'class' => TransactionalManagerDecorator::class,
        '__construct()' => [
            'manager' => static fn (
                ItemsStorageInterface $itemsStorage,
                AssignmentsStorageInterface $assignmentsStorage,
                RuleFactoryInterface $rulesContainer,
            ): ManagerInterface => new Manager(
                itemsStorage: $itemsStorage,
                assignmentsStorage: $assignmentsStorage,
                ruleFactory: $rulesContainer,
                enableDirectPermissions: false,
                includeRolesInAccessChecks: false,
            ),
            'database' => Reference::to(ConnectionInterface::class),
        ],
    ],
];
```

- `TransactionalManagerDecorator` wraps mutating operations (`updateRole()`, `updatePermission()`) inside database transactions, ensuring referential integrity.
- `ItemTreeTraversalFactory` automatically selects recursive Common Table Expressions (CTE) for modern databases (PostgreSQL, SQLite ≥ 3.8.3, MySQL 8+) and falls back to a recursive query strategy for MySQL 5.

### 8.5. PHP File Storage (`yiisoft/rbac-php`)

`yiisoft/rbac-php` stores items and assignments in version-controlled PHP files:

```php
declare(strict_types=1);

use Yiisoft\Rbac\Manager;
use Yiisoft\Rbac\Permission;
use Yiisoft\Rbac\Php\AssignmentsStorage;
use Yiisoft\Rbac\Php\ConcurrentAssignmentsStorageDecorator;
use Yiisoft\Rbac\Php\ConcurrentItemsStorageDecorator;
use Yiisoft\Rbac\Php\ItemsStorage;
use Yiisoft\Rbac\RuleFactoryInterface;

$directory = __DIR__ . '/../resources/rbac';

$itemsStorage = new ConcurrentItemsStorageDecorator(
    new ItemsStorage($directory . '/items.php')
);

$assignmentsStorage = new ConcurrentAssignmentsStorageDecorator(
    new AssignmentsStorage($directory . '/assignments.php')
);

$manager = new Manager(
    itemsStorage: $itemsStorage,
    assignmentsStorage: $assignmentsStorage,
    ruleFactory: $ruleFactory,
);
```

> [!WARNING]
> **Concurrent write safety:** In PHP-FPM environments where assignments change at runtime, always wrap storages with `ConcurrentItemsStorageDecorator` and `ConcurrentAssignmentsStorageDecorator` to prevent lost updates.

#### File Schema Example (`items.php`)

```php
return [
    [
        'name' => 'posts.update',
        'type' => 'permission',
        'description' => 'Update a post',
        'rule_name' => 'is_author',
    ],
    [
        'name' => 'author',
        'type' => 'role',
        'children' => ['posts.update'],
    ],
];
```

### 8.6. Cycle Database Storage (`yiisoft/rbac-cycle-db`)

`yiisoft/rbac-cycle-db` stores items and assignments via the Cycle Database abstraction layer (`Cycle\Database\DatabaseInterface`):

```php
declare(strict_types=1);

use Cycle\Database\DatabaseInterface;
use Yiisoft\Rbac\Cycle\AssignmentsStorage;
use Yiisoft\Rbac\Cycle\ItemsStorage;
use Yiisoft\Rbac\Cycle\TransactionalManagerDecorator;
use Yiisoft\Rbac\Manager;
use Yiisoft\Rbac\RuleFactoryInterface;

/** @var DatabaseInterface $database */

$manager = new TransactionalManagerDecorator(
    new Manager(
        itemsStorage: new ItemsStorage($database),
        assignmentsStorage: new AssignmentsStorage($database),
        ruleFactory: $ruleFactory,
    ),
    $database,
);
```

Run Cycle migrations via:
```shell
./vendor/bin/cycle-migrate --path=vendor/yiisoft/rbac-cycle-db/migrations/items
./vendor/bin/cycle-migrate --path=vendor/yiisoft/rbac-cycle-db/migrations/assignments
```

### 8.7. Hybrid Storage Architectures

Because items storage and assignments storage are decoupled interfaces, you can combine drivers:
- **Items in PHP files (`rbac-php`)**: Keep the roles, permissions, and rule bindings in version-controlled PHP files reviewed via pull requests.
- **Assignments in Database (`rbac-db` or `rbac-cycle-db`)**: Manage dynamic user assignments in relational tables.

```php
$manager = new Manager(
    itemsStorage: new ItemsStorage(__DIR__ . '/items.php'), // rbac-php
    assignmentsStorage: new AssignmentsStorage($dbConnection), // rbac-db
    ruleFactory: $ruleFactory,
);
```

---

## 9. Checking Permissions in Code

### 9.1. In Presentation Actions

Inject `Yiisoft\User\CurrentUser` into the action handler and call `$currentUser->can()`:

```php
declare(strict_types=1);

namespace App\Presentation\Action\Post;

use App\Application\Post\PostRepositoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\User\CurrentUser;

final readonly class UpdatePostAction
{
    public function __construct(
        private CurrentUser $currentUser,
        private PostRepositoryInterface $postRepository,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $postId = (string) $request->getAttribute('id');
        $post = $this->postRepository->findById($postId);

        if ($post === null) {
            return $this->responseFactory->createResponse(
                ['error' => 'Post not found'],
                Status::NOT_FOUND,
            );
        }

        // Evaluate permission with contextual arguments (supports string or BackedEnum)
        if (!$this->currentUser->can('posts.editOwn', ['authorId' => $post->getAuthorId()])) {
            return $this->responseFactory->createResponse(
                ['error' => 'Forbidden'],
                Status::FORBIDDEN,
            );
        }

        return $this->responseFactory->createResponse(['status' => 'updated']);
    }
}
```

### 9.2. In Application Services / Use Cases (`AccessCheckerInterface`)

When evaluating permissions in application services or background jobs decoupled from HTTP sessions, inject `Yiisoft\Access\AccessCheckerInterface` or `Yiisoft\Rbac\ManagerInterface`:

```php
declare(strict_types=1);

namespace App\Application\Post;

use Yiisoft\Access\AccessCheckerInterface;

final readonly class PostAuthorizationService
{
    public function __construct(
        private AccessCheckerInterface $accessChecker,
    ) {}

    public function canEditPost(int|string $userId, string $authorId): bool
    {
        return $this->accessChecker->userHasPermission(
            $userId,
            'posts.editOwn',
            ['authorId' => $authorId],
        );
    }
}
```

---

## 10. Anti-Patterns & Common Traps

| # | Anti-Pattern | Why It Breaks | Correct Yii3 Approach |
|:---:|---|---|---|
| **1** | `Yii::$app->user->can(...)` | Yii 3 has no global service locator or static facades. | Inject `Yiisoft\User\CurrentUser` into Action or Use Case. |
| **2** | Checking roles via `can('admin')` | By default `$includeRolesInAccessChecks = false`, so role checks always return `false`. | Check permissions (e.g. `can('posts.update')`). Keep roles strictly as permission containers. |
| **3** | Direct permission assignment to user | By default `$enableDirectPermissions = false`; `$manager->assign('permissionName', $userId)` throws `InvalidArgumentException`. | Assign roles to users (`$manager->assign('roleName', $userId)`) and attach permissions to roles. |
| **4** | Type-hinting `array $params` in `RuleInterface::execute()` | In Yii 3, the third parameter is strictly `RuleContext $context`. Typehinting an array triggers a fatal PHP `TypeError`. | Use `RuleContext $context` and retrieve values via `$context->getParameterValue('param')`. |
| **5** | Calling storage methods on `Manager` | `Manager` manages access checks and hierarchy edges. Querying items or assignments belongs in storages. | Inject `ItemsStorageInterface` or `AssignmentsStorageInterface` for storage queries. |
| **6** | Using legacy Yii 2 table names (`auth_*`) | Yii 3 `rbac-db` default tables are `yii_rbac_item`, `yii_rbac_item_child`, and `yii_rbac_assignment`. | Use standard `yii_rbac_*` tables or configure custom table names in storage constructors. |
| **7** | Omitting `$format` in `TokenFactory::create()` | Parameter 2 `$format` has no default; omitting it throws an `ArgumentCountError`. | Pass `CompactSerializer::NAME` or `'jws_compact'` explicitly. |
| **8** | Omitting `withSuccessUrl()` in `AuthAction` | Callbacks returning `void` fall back to `$this->successUrl`. If omitted, PHP 8.2 throws an uninitialized typed property fatal error. | Always configure `withSuccessUrl()` and `withCancelUrl()`, or return a `ResponseInterface` from the callback. |
| **9** | Using deprecated `CsrfMiddleware` or `UserAuth` | Both are `@deprecated` and scheduled for removal. | Use `Yiisoft\Csrf\CsrfTokenMiddleware` and `Yiisoft\User\Method\WebAuth`. |
| **10** | Binding `AuthenticationMethodInterface` | Deprecated interface in `yiisoft/auth`. | Bind `AuthenticatorWithChallengeInterface` or `AuthenticatorInterface`. |
| **11** | Defining `StateResetter::class` in DI (or omitting worker state reset) | `CurrentUser` cached identity bleeds into subsequent worker requests in RoadRunner/FrankenPHP; worse, an application-level `StateResetter::class` definition acts as a full override and silently disables **all** built-in package resetters. | Rely on built-in package resetters (catalog: [runners-and-runtimes.md](infra-runners-and-runtimes.md) §6.4); for custom services use the per-service `'reset'` definition key (§6.3). `yiisoft/user` already ships `'reset' => $this->clear()` for `CurrentUser`. |
| **12** | Missing `signatureKey` for `CookieLogin` | Remember-me cookies are unsigned, allowing attackers to forge user IDs. | Always set a strong, random `signatureKey` in `CookieLogin` configuration. |
| **13** | Mutating state in `RuleInterface::execute()` | Rules are executed during evaluation checks and must remain pure and side-effect free. | Only return `bool`. Perform state mutations in Application Use Cases. |
| **14** | Storing plaintext tokens or passwords | Severe security vulnerability. | Hash passwords with `PasswordHasher` and sign tokens with cryptographic HMAC or asymmetric keys. |

---

## 11. Related Topic Guides

- [Routing Guide](http-routes.md) — Route groups, pipeline execution order, and attaching authentication/RBAC middlewares.
- [Actions & Controllers Guide](http-actions-and-controllers.md) — Checking permissions via `CurrentUser::can()` inside actions.
- [PSR-15 Middlewares Guide](http-middlewares.md) — Guard pipelines, CORS preflight ordering, and custom middleware implementations.
- [HTTP State Guide](http-state.md) — Session authentication, cookie parameters, and remember-me state.
- [Runners & Runtimes Guide](infra-runners-and-runtimes.md) — Application runners, worker event loops, and `StateResetter` configuration.
- [Caching Guide](persistence-caching.md) — PSR-16 cache configuration required for OpenID Connect discovery.
- [OpenAPI & Swagger Guide](http-openapi-swagger.md) — Documenting authenticated endpoints and security schemes.
