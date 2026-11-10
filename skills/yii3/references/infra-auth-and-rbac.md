# Yii3 Authentication & RBAC Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Practical guide and configuration recipes for user authentication, password hashing, stateful session/cookie methods, user lifecycle events, and role-based access control (RBAC) in Yii3. The alternative login methods and RBAC storage drivers are owned by dedicated child guides: the [Stateless JWT Authentication Guide](infra-auth-jwt.md) (§5), the [OAuth2/OIDC Login Guide](infra-auth-oauth2.md) (§6), and the [RBAC Storage Drivers Guide](infra-rbac-storage.md) (§8.4–8.7).

---

> **TL;DR:** Identity & identity repository implementation (§2); password hashing (§3); stateful session login lifecycle (§4); route protection & RBAC architecture (§7–§8). JWT, OAuth2/OIDC, and storage drivers are child guides (§5, §6, §8.4–8.7 links below).
> **Read in full when:** wiring a complete login flow or building the RBAC hierarchy; for stateless APIs jump to the child guides first.

## Table of Contents
- [1. Authentication Architecture & Core Contracts](#1-authentication-architecture--core-contracts)
- [2. Identity & Identity Repository Implementation](#2-identity--identity-repository-implementation)
  - [2.1. Identity Model with Auto-Login Support](#21-identity-model-with-auto-login-support)
  - [2.2. Web Identity Repository](#22-web-identity-repository)
  - [2.3. Dual Identity Repository (Sessions + API Tokens)](#23-dual-identity-repository-sessions--api-tokens)
- [3. Password Hashing with PasswordHasher & Cryptographic Primitives](#3-password-hashing-with-passwordhasher--cryptographic-primitives)
  - [3.1. Key Signatures and Security Invariants](#31-key-signatures-and-security-invariants)
  - [3.2. Cryptographic Token Generation (`Random`)](#32-cryptographic-token-generation-random)
- [4. Stateful Session Authentication Lifecycle (`yiisoft/user`)](#4-stateful-session-authentication-lifecycle-yiisoftuser) — full reference in the [Stateful Web Session Authentication Guide](infra-auth-session.md)
- [5. Stateless REST API Authentication (JWT / Bearer Token)](#5-stateless-rest-api-authentication-jwt--bearer-token) — full reference in the [Stateless JWT Authentication Guide](infra-auth-jwt.md)
- [6. External OAuth2 / OIDC Login (`yiisoft/yii-auth-client`)](#6-external-oauth2--oidc-login-yiisoftyii-auth-client) — full reference in the [OAuth2/OIDC Login Guide](infra-auth-oauth2.md)
- [7. Route Protection via Authentication & RBAC Middleware](#7-route-protection-via-authentication--rbac-middleware)
  - [7.1. Route Definition with Authentication & Login Bridge](#71-route-definition-with-authentication--login-bridge)
  - [7.2. Protecting Routes with RBAC Permissions](#72-protecting-routes-with-rbac-permissions)
- [8. Role-Based Access Control (RBAC) Architecture](#8-role-based-access-control-rbac-architecture)
  - [8.1. RBAC Items, Roles, Permissions, and `ManagerInterface`](#81-rbac-items-roles-permissions-and-managerinterface)
  - [8.2. Dynamic Business Rules (`RuleInterface` & `RuleContext`)](#82-dynamic-business-rules-ruleinterface--rulecontext)
  - [8.3. Registering Rules via `rbac-rules-container`](#83-registering-rules-via-rbac-rules-container)
  - [8.4. Relational Database Storage (`yiisoft/rbac-db`)](#84-relational-database-storage-yiisoftrbac-db) — full reference in the [RBAC Storage Drivers Guide](infra-rbac-storage.md)
  - [8.5. PHP File Storage (`yiisoft/rbac-php`)](#85-php-file-storage-yiisoftrbac-php) — full reference in the [RBAC Storage Drivers Guide](infra-rbac-storage.md)
  - [8.6. Cycle Database Storage (`yiisoft/rbac-cycle-db`)](#86-cycle-database-storage-yiisoftrbac-cycle-db) — full reference in the [RBAC Storage Drivers Guide](infra-rbac-storage.md)
  - [8.7. Hybrid Storage Architectures](#87-hybrid-storage-architectures) — full reference in the [RBAC Storage Drivers Guide](infra-rbac-storage.md)
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
| `yiisoft/auth-jwt` | `Yiisoft\Auth\Jwt\JwtMethod`<br>`Yiisoft\Auth\Jwt\TokenFactoryInterface`<br>`Yiisoft\Auth\Jwt\TokenRepositoryInterface` | Stateless JSON Web Token authentication, claims validation, and token issuance. See the [Stateless JWT Authentication Guide](infra-auth-jwt.md). |
| `yiisoft/yii-auth-client` | `Yiisoft\Yii\AuthClient\Collection`<br>`Yiisoft\Yii\AuthClient\AuthAction`<br>`Yiisoft\Yii\AuthClient\Client\OpenIdConnect`<br>`Yiisoft\Yii\AuthClient\Widget\AuthChoice` | External OAuth 2.0 / OpenID Connect login (Google, GitHub, Microsoft, X, VK, etc.): provider clients, PSR-15 callback middleware, and button widgets. See the [OAuth2/OIDC Login Guide](infra-auth-oauth2.md). |
| `yiisoft/security` | `Yiisoft\Security\PasswordHasher`<br>`Yiisoft\Security\Random` | Cryptographically secure password hashing (BCrypt/Argon2), transparent rehash verification, and CSPRNG token generation. |
| `yiisoft/csrf` | `Yiisoft\Csrf\CsrfTokenMiddleware`<br>`Yiisoft\Csrf\CsrfTokenInterface` | Synchronizer token pattern CSRF defense for stateful forms. *(Note: `CsrfMiddleware` is `@deprecated`).* |
| `yiisoft/rate-limiter` | `Yiisoft\Yii\RateLimiter\LimitRequestsMiddleware`<br>`Yiisoft\Yii\RateLimiter\Counter` | Request rate limiting with GCRA (leaky bucket) to protect endpoints against brute-force attacks. |
| `yiisoft/access` | `Yiisoft\Access\AccessCheckerInterface` | Abstract access verification contract implemented by RBAC managers and consumed by `CurrentUser`. |
| `yiisoft/rbac` | `Yiisoft\Rbac\ManagerInterface`<br>`Yiisoft\Rbac\Role`<br>`Yiisoft\Rbac\Permission`<br>`Yiisoft\Rbac\RuleInterface`<br>`Yiisoft\Rbac\RuleContext`<br>`Yiisoft\Rbac\CompositeRule` | Hierarchical RBAC item manager, assignment coordinator, and dynamic business rule evaluator. |
| `yiisoft/rbac-db` | `Yiisoft\Rbac\Db\ItemsStorage`<br>`Yiisoft\Rbac\Db\AssignmentsStorage`<br>`Yiisoft\Rbac\Db\TransactionalManagerDecorator` | Relational database persistence driver for RBAC items and assignments using `yiisoft/db`. Includes migrations. See the [RBAC Storage Drivers Guide](infra-rbac-storage.md). |
| `yiisoft/rbac-php` | `Yiisoft\Rbac\Php\ItemsStorage`<br>`Yiisoft\Rbac\Php\AssignmentsStorage`<br>`Yiisoft\Rbac\Php\ConcurrentItemsStorageDecorator`<br>`Yiisoft\Rbac\Php\ConcurrentAssignmentsStorageDecorator` | PHP file storage driver for RBAC items and assignments (version-controlled roles, no database). See the [RBAC Storage Drivers Guide](infra-rbac-storage.md). |
| `yiisoft/rbac-cycle-db` | `Yiisoft\Rbac\Cycle\ItemsStorage`<br>`Yiisoft\Rbac\Cycle\AssignmentsStorage`<br>`Yiisoft\Rbac\Cycle\TransactionalManagerDecorator` | Database persistence driver for RBAC using `cycle/database` (Cycle migrations included). See the [RBAC Storage Drivers Guide](infra-rbac-storage.md). |
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

The `Yiisoft\User\CurrentUser` service manages the user session, guest state, and authorization checks in traditional web applications:
- **`CurrentUser` Configuration:** Wired with `IdentityRepositoryInterface`, `EventDispatcherInterface`, `SessionInterface`, and `AccessCheckerInterface`, specifying sliding `withAuthTimeout()` and absolute `withAbsoluteAuthTimeout()`.
- **Anti-Fixation Login:** `$currentUser->login($identity)` automatically regenerates the session ID (`$session->regenerateID()`), stores auth keys, and dispatches `BeforeLogin` / `AfterLogin`.
- **Web Authenticator & Identity Bridge:** `Yiisoft\User\Method\WebAuth` issues HTTP 302 redirects to `/auth/login`; `Yiisoft\User\Login\LoginMiddleware` bridges the `Authentication::class` request attribute into `CurrentUser`.
- **Persistent Remember-Me:** `Yiisoft\User\Login\Cookie\CookieLogin` issues and verifies HMAC-SHA256 signed persistent login cookies without storing credentials.
- **Worker Reset Safety:** Rely on `yiisoft/user`'s built-in reset callback in `config/di-web.php`. Never override `StateResetter::class` at application level.

> [!IMPORTANT]
> For the complete reference on stateful session authentication — login/logout actions, `CookieLoginMiddleware` pipeline ordering, CSRF protection, rate limiting, and PSR-14 authentication events — see the companion guide:
> **[`infra-auth-session.md`](infra-auth-session.md)**.

---

## 5. Stateless REST API Authentication (JWT / Bearer Token)

> **Login-method selection note:** The login method is **picked per project**: stateful sessions ([§4](#4-stateful-session-authentication-lifecycle-yiisoftuser)), stateless JWT / Bearer tokens (this section — `yiisoft/auth-jwt`), or external OAuth2/OIDC login ([§6](#6-external-oauth2--oidc-login-yiisoftyii-auth-client) — `yiisoft/yii-auth-client`). Resolve which method is installed via the project's `composer.json` or the [Package Catalog, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family). RBAC authorization (§8) layers on top of any of them.
>
> One-line trap summary: the factory method is `TokenFactoryInterface::create()` (not `createToken()`), and its second `$format` parameter is mandatory — pass `CompactSerializer::NAME` / `'jws_compact'` explicitly.
>
> **For the complete reference on stateless JWT authentication** — the `JwtMethod` authenticator DI binding for `AuthenticatorInterface` / `AuthenticatorWithChallengeInterface` and issuing signed tokens with `TokenFactoryInterface::create()` — **see the** [Stateless JWT Authentication Guide](infra-auth-jwt.md).

---

## 6. External OAuth2 / OIDC Login (`yiisoft/yii-auth-client`)

> **Login-method selection note:** The login method is **picked per project**: stateful sessions ([§4](#4-stateful-session-authentication-lifecycle-yiisoftuser)), stateless JWT / Bearer tokens ([§5](#5-stateless-rest-api-authentication-jwt--bearer-token) — `yiisoft/auth-jwt`), or external OAuth2/OIDC login (this section — `yiisoft/yii-auth-client`). Resolve which method is installed via the project's `composer.json` or the [Package Catalog, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family). RBAC authorization (§8) layers on top of any of them.
>
> **For the complete reference on external OAuth2/OIDC login** — the package architecture and `AuthClientInterface` contracts, wiring the `AuthAction` callback middleware (with the uninitialized `$successUrl`/`$cancelUrl` fatal-crash trap), configuring provider clients via `Collection` params, OpenID Connect, the `AuthChoice` button widget, and mapping provider attributes to your identity — **see the** [OAuth2/OIDC Login Guide](infra-auth-oauth2.md).

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
use Yiisoft\Router\Route\Get;
use Yiisoft\Router\Route\Post;
use Yiisoft\User\Login\LoginMiddleware;

return [
    // Public routes
    (new Post('/auth/login'))
        ->action(LoginAction::class)
        ->name('auth.login'),

    // Protected API group
    (new Group('/api'))
        ->middleware(Authentication::class) // Authenticates credentials
        ->middleware(LoginMiddleware::class) // Bridges identity to CurrentUser session
        ->routes(
            (new Get('/profile'))
                ->action(ViewProfileAction::class)
                ->name('api.profile'),
            (new Post('/orders'))
                ->action(CreateOrderAction::class)
                ->name('api.orders.create'),
        ),
];
```

#### Middleware Pipeline Order Invariant

The exact global middleware sequence is a middleware-layer concern: route definitions in this guide only attach `Authentication` and `LoginMiddleware` at the route-group scope, and the canonical global order is owned by the Middlewares Guide.

> [!TIP]
> **Middleware Pipeline Reference:**
> For the canonical authenticated-pipeline order (`ErrorCatcher → SessionMiddleware → CsrfTokenMiddleware → CookieLoginMiddleware → Authentication → LoginMiddleware → Router`), the complete `Application::class` DI wiring, and all ordering constraints, see the [PSR-15 Middlewares Guide, §4.1 "Global Application Pipeline"](http-middlewares.md#41-global-application-pipeline-configwebdiapplicationphp).

### 7.2. Protecting Routes with RBAC Permissions

For coarse-grained, endpoint-level authorization (e.g. "only users with the `adminAccess` permission may reach `/admin/*`"), enforce the RBAC permission check as a PSR-15 middleware attached to route groups or single routes, after `Authentication` and `LoginMiddleware` have resolved the identity.

> [!TIP]
> **RBAC Permission Guard Reference:**
> For the complete reference on the `AccessCheckerMiddleware` guard implementation and attaching it to route groups and single routes, see the [PSR-15 Middlewares Guide, §2.6 "RBAC Permission Guard"](http-middlewares.md#26-rbac-permission-guard-accesscheckermiddleware).

Where the permissions, roles, assignments, and dynamic rules evaluated by such guards are defined and stored — the RBAC layer itself — see §8 (Role-Based Access Control Architecture); for fine-grained, object-level permission checks inside actions and services, see §9.

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
- `setDefaultRoleNames(array|Closure $roleNames)`: Registers roles automatically assigned to **every user regardless of authentication state** (per the `Manager` docblock), without requiring database rows; guest users are instead governed by `setGuestRoleName()`.
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

> **Storage-driver selection note — pick exactly ONE:** RBAC items and assignments must be persisted by **one storage driver per project**: `yiisoft/rbac-db` (relational tables via `yiisoft/db`) XOR `yiisoft/rbac-php` (version-controlled PHP files) XOR `yiisoft/rbac-cycle-db` (Cycle database abstraction). Resolve which driver is installed via the project's `composer.json` or the [Package Catalog, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family). One-line trap summary: Yii 3 table names default to `yii_rbac_*` — the legacy Yii 2 names (`auth_item`, `auth_assignment`) are not used.
>
> **For the complete reference on RBAC storage drivers** — default `yii_rbac_*` tables and relational migrations, the full `rbac-db` DI configuration with `TransactionalManagerDecorator` and CTE traversal, `rbac-php` file storages with concurrent-write decorators and the `items.php` schema, `rbac-cycle-db` wiring and Cycle migrations, and hybrid storage architectures — **see the** [RBAC Storage Drivers Guide](infra-rbac-storage.md).

### 8.5. PHP File Storage (`yiisoft/rbac-php`)

> **For the complete reference on PHP file storage** — version-controlled items/assignments files, `ConcurrentItemsStorageDecorator` / `ConcurrentAssignmentsStorageDecorator` write safety, and the `items.php` schema — **see the** [RBAC Storage Drivers Guide, §2](infra-rbac-storage.md#2-php-file-storage-yiisoftrbac-php).

### 8.6. Cycle Database Storage (`yiisoft/rbac-cycle-db`)

> **For the complete reference on Cycle database storage** — the `ItemsStorage` / `AssignmentsStorage` / `TransactionalManagerDecorator` wiring and Cycle migrations — **see the** [RBAC Storage Drivers Guide, §3](infra-rbac-storage.md#3-cycle-database-storage-yiisoftrbac-cycle-db).

### 8.7. Hybrid Storage Architectures

> **For the complete reference on hybrid storage architectures** — combining version-controlled PHP items with database-backed assignments — **see the** [RBAC Storage Drivers Guide, §4](infra-rbac-storage.md#4-hybrid-storage-architectures).

---

## 9. Checking Permissions in Code

### 9.1. In Presentation Actions

Inject `Yiisoft\User\CurrentUser` into the action handler and call `$currentUser->can()`. Pass contextual parameters as the second argument so dynamic RBAC rules (e.g. "author only") can evaluate them — this is the one permission detail that differs from a plain permission-name check:

```php
// Inside an action handler, after loading the post:
if (!$this->currentUser->can('posts.editOwn', ['authorId' => $post->getAuthorId()])) {
    return $this->responseFactory->createResponse(
        ['error' => 'Forbidden'],
        Status::FORBIDDEN, // HTTP 403
    );
}
```

> [!TIP]
> **Action Authorization Reference:**
> For the complete reference on authentication and authorization in presentation actions — guest/401 handling, the full `can()` signature (`can(string|BackedEnum $permissionName, array $params = []): bool`), and the "no access checker attached → `can()` always returns `false`" trap — see the [Actions & Controllers Guide, §3.8 "Authentication & Authorization"](http-actions-concerns.md#38-authentication--authorization-yiisoftuser-yiisoftauth-jwt).

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
| **6** | Using deprecated `CsrfMiddleware` or `UserAuth` | Both are `@deprecated` and scheduled for removal. | Use `Yiisoft\Csrf\CsrfTokenMiddleware` and `Yiisoft\User\Method\WebAuth`. |
| **7** | Binding `AuthenticationMethodInterface` | Deprecated interface in `yiisoft/auth`. | Bind `AuthenticatorWithChallengeInterface` or `AuthenticatorInterface`. |
| **8** | Defining `StateResetter::class` in DI (or omitting worker state reset) | `CurrentUser` cached identity bleeds into subsequent worker requests in RoadRunner/FrankenPHP; worse, an application-level `StateResetter::class` definition acts as a full override and silently disables **all** built-in package resetters. | Rely on built-in package resetters (catalog: [infra-state-resetter.md](infra-state-resetter.md#4-ground-truth-catalog-of-built-in-package-resetters) §4); for custom services use the per-service `'reset'` definition key (§3). `yiisoft/user` already ships `'reset' => $this->clear()` for `CurrentUser`. |
| **9** | Missing `signatureKey` for `CookieLogin` | Remember-me cookies are unsigned, allowing attackers to forge user IDs. | Always set a strong, random `signatureKey` in `CookieLogin` configuration. |
| **10** | Mutating state in `RuleInterface::execute()` | Rules are executed during evaluation checks and must remain pure and side-effect free. | Only return `bool`. Perform state mutations in Application Use Cases. |
| **11** | Storing plaintext tokens or passwords | Severe security vulnerability. | Hash passwords with `PasswordHasher` and sign tokens with cryptographic HMAC or asymmetric keys. |

---

## 11. Related Topic Guides

- [Stateful Web Session Authentication Guide](infra-auth-session.md) — The stateful web session login method (`yiisoft/user`): `CurrentUser` lifecycle, login/logout actions, `CookieLogin`, and authentication events (§4).
- [Stateless JWT Authentication Guide](infra-auth-jwt.md) — The stateless REST API login method (`yiisoft/auth-jwt`): `JwtMethod` authenticator DI binding and token issuance (§5).
- [OAuth2/OIDC Login Guide](infra-auth-oauth2.md) — The external login method (`yiisoft/yii-auth-client`): `AuthAction` callback middleware, provider client configuration, OpenID Connect, and identity mapping (§6).
- [RBAC Storage Drivers Guide](infra-rbac-storage.md) — `rbac-db`, `rbac-php`, and `rbac-cycle-db` persistence drivers and hybrid architectures (§8.4–8.7).
- [Routing Guide](http-routes.md) — Route groups, pipeline execution order, and attaching authentication/RBAC middlewares.
- [Actions & Controllers Guide](http-actions-and-controllers.md) — Authentication and permission checks (`CurrentUser::can()`) inside presentation actions.
- [PSR-15 Middlewares Guide](http-middlewares.md) — Global pipeline registration with the canonical authenticated order, the RBAC permission guard, rate limiting, CORS preflight ordering, and custom middleware implementations.
- [HTTP State Guide](http-state.md) — Session authentication, cookie parameters, and remember-me state.
- [Runners & Runtimes Guide](infra-runners-and-runtimes.md) — Application runners, worker event loops, and the runtime selection matrix.
- [Long-Running Worker Safety & StateResetter Guide](infra-state-resetter.md) — `StateResetter` configuration and per-service resetters for persistent worker runtimes.
- [OpenAPI & Swagger Guide](http-openapi-swagger.md) — Documenting authenticated endpoints and security schemes.
