# Yii3 Authentication & RBAC Guide

> Practical guide and configuration recipes for user authentication, password hashing, session/JWT token methods, remember-me cookies, user lifecycle events, and role-based access control (RBAC) in Yii3.

---

## Table of Contents
- [1. Authentication Architecture & Core Contracts](#1-authentication-architecture--core-contracts)
- [2. Identity & Identity Repository Implementation](#2-identity--identity-repository-implementation)
  - [2.1. Identity Model with Auto-Login Support](#21-identity-model-with-auto-login-support)
  - [2.2. Identity Repository](#22-identity-repository)
- [3. Password Hashing with PasswordHasher](#3-password-hashing-with-passwordhasher)
- [4. Stateful Session Authentication Lifecycle (`yiisoft/user`)](#4-stateful-session-authentication-lifecycle-yiisoftuser)
  - [4.1. `CurrentUser` Configuration & Timeouts](#41-currentuser-configuration--timeouts)
  - [4.2. Full Login Lifecycle & Anti-Fixation](#42-full-login-lifecycle--anti-fixation)
  - [4.3. Full Logout Lifecycle & State Reset](#43-full-logout-lifecycle--state-reset)
  - [4.4. Remember-Me Auto-Login Cookies (`CookieLogin`)](#44-remember-me-auto-login-cookies-cookielogin)
  - [4.5. PSR-14 User Authentication Events](#45-psr-14-user-authentication-events)
- [5. Stateless REST API Authentication (JWT / Bearer Token)](#5-stateless-rest-api-authentication-jwt--bearer-token)
- [6. Route Protection via Authentication & RBAC Middleware](#6-route-protection-via-authentication--rbac-middleware)
  - [6.1. Route Definition with Authentication](#61-route-definition-with-authentication)
  - [6.2. Protecting Routes with RBAC Permissions](#62-protecting-routes-with-rbac-permissions)
- [7. Role-Based Access Control (RBAC) Architecture](#7-role-based-access-control-rbac-architecture)
  - [7.1. RBAC Items, Roles, and Permissions](#71-rbac-items-roles-and-permissions)
  - [7.2. Custom Business Rules (`RuleInterface`)](#72-custom-business-rules-ruleinterface)
  - [7.3. Registering Rules via `rbac-rules-container`](#73-registering-rules-via-rbac-rules-container)
- [8. Checking Permissions in Code](#8-checking-permissions-in-code)
  - [8.1. In Presentation Actions](#81-in-presentation-actions)
  - [8.2. In Application Services / Use Cases](#82-in-application-services--use-cases)
- [9. Anti-Patterns & Common Traps](#9-anti-patterns--common-traps)
- [10. Related Topic Guides](#10-related-topic-guides)

---

## 1. Authentication Architecture & Core Contracts

In Yii3, user authentication and access control are divided into independent, decoupled packages:

| Package | FQCN / Core Interfaces | Purpose |
|---|---|---|
| `yiisoft/user` | `Yiisoft\User\CurrentUser`<br>`Yiisoft\User\Method\WebAuth`<br>`Yiisoft\User\Login\Cookie\CookieLogin` | Current user context, session state, login/logout, guest check, auto-login cookies, lifecycle events, and `can()` facade. |
| `yiisoft/auth` | `Yiisoft\Auth\IdentityInterface`<br>`Yiisoft\Auth\IdentityRepositoryInterface`<br>`Yiisoft\Auth\Middleware\Authentication`<br>`Yiisoft\Auth\Method\HttpBearer` | Abstract authentication contracts, token-based repositories, and PSR-15 authentication middleware. |
| `yiisoft/auth-jwt` | `Yiisoft\Auth\Jwt\JwtMethod`<br>`Yiisoft\Auth\Jwt\TokenFactoryInterface`<br>`Yiisoft\Auth\Jwt\TokenRepositoryInterface` | Stateless JSON Web Token authentication, claim verification, and token issuance. |
| `yiisoft/security` | `Yiisoft\Security\PasswordHasher`<br>`Yiisoft\Security\Random` | Cryptographically secure password hashing (BCrypt/Argon2) and CSPRNG token generation. |
| `yiisoft/rbac` | `Yiisoft\Rbac\ManagerInterface`<br>`Yiisoft\Rbac\Role`<br>`Yiisoft\Rbac\Permission`<br>`Yiisoft\Rbac\RuleInterface` | Hierarchical RBAC item manager, rule evaluation engine, and permission checker. |
| `yiisoft/rbac-db` | `Yiisoft\Rbac\Db\ItemsStorage`<br>`Yiisoft\Rbac\Db\AssignmentsStorage` | Database persistence driver for RBAC items and assignments using `yiisoft/db`. |
| `yiisoft/rbac-rules-container` | `Yiisoft\Rbac\Rules\Container\RulesContainer` | Rule factory resolving custom `RuleInterface` implementations via PSR-11 container. |

---

## 2. Identity & Identity Repository Implementation

### 2.1. Identity Model with Auto-Login Support

An identity represents an authenticated user entity. To support both session authentication and persistent "remember-me" cookies, implement `Yiisoft\User\Login\Cookie\CookieLoginIdentityInterface` (which extends `Yiisoft\Auth\IdentityInterface`):

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
        return hash_equals($this->authKey, $key);
    }
}
```

### 2.2. Identity Repository

`Yiisoft\Auth\IdentityRepositoryInterface` provides user lookup by identifier:

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
            ->where(['id' => $id, 'status' => 'active'])
            ->one();

        if ($row === false) {
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

---

## 3. Password Hashing with PasswordHasher

`Yiisoft\Security\PasswordHasher` provides secure password hashing using safe defaults (cost 13 for BCrypt or Argon2id):

```php
declare(strict_types=1);

namespace App\Application\User\Service;

use SensitiveParameter;
use Yiisoft\Security\PasswordHasher;

final readonly class UserRegistrationService
{
    public function __construct(
        private PasswordHasher $passwordHasher,
    ) {}

    public function register(string $username, #[SensitiveParameter] string $password): void
    {
        // Generates cryptographically secure hash
        $hash = $this->passwordHasher->hash($password);
        // Persist $username and $hash...
    }

    public function verifyPassword(#[SensitiveParameter] string $password, string $storedHash): bool
    {
        return $this->passwordHasher->validate($password, $storedHash);
    }
}
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
            // Inactivity timeout: logout after 1800 seconds (30 mins) of idle time
            ->withAuthTimeout(1800)
            // Absolute timeout: force logout after 86400 seconds (24 hours) regardless of activity
            ->withAbsoluteAuthTimeout(86400);
    },
];
```

### 4.2. Full Login Lifecycle & Anti-Fixation

When `$currentUser->login($identity)` is called:
1. **Event Dispatch:** Triggers `Yiisoft\User\Event\BeforeLogin`. If a listener calls `$event->invalidate()`, the login process aborts and returns `false`.
2. **Session Regeneration (Anti-Fixation):** Calls `$session->regenerateID()` to assign a fresh session ID, preventing session fixation attacks.
3. **Session State Storage:**
   - Clears old auth session variables (`__auth_id`, `__auth_expire`, `__auth_absolute_expire`).
   - Stores user ID into session key `__auth_id`.
   - Computes and stores sliding timeout `__auth_expire` (`time() + $authTimeout`).
   - Computes and stores absolute timeout `__auth_absolute_expire` (`time() + $absoluteAuthTimeout`).
4. **Event Dispatch:** Triggers `Yiisoft\User\Event\AfterLogin`.
5. Returns `true` if authentication succeeded.

#### Login Action Example (with Remember-Me)

```php
declare(strict_types=1);

namespace App\Presentation\Action\Auth;

use App\Application\User\Service\UserAuthService;
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
        private UserAuthService $authService,
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

### 4.3. Full Logout Lifecycle & State Reset

When `$currentUser->logout()` is called:
1. Returns `false` immediately if `$currentUser->isGuest()`.
2. Triggers `Yiisoft\User\Event\BeforeLogout`. If a listener calls `$event->invalidate()`, logout aborts.
3. Switches identity to guest (`$guestIdentityFactory->create()`):
   - Calls `$session->regenerateID()`.
   - Removes `__auth_id`, `__auth_expire`, and `__auth_absolute_expire` from session.
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

In persistent daemon runtimes (RoadRunner, FrankenPHP), the `CurrentUser` instance stays in memory. It **must** be reset between requests:

```php
// In DI config for Yiisoft\Di\StateResetter:
CurrentUser::class => function () {
    /** @var CurrentUser $this */
    $this->clear(); // Clears cached identity and identityOverride
},
```

### 4.4. Remember-Me Auto-Login Cookies (`CookieLogin`)

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
            'duration' => new DateInterval('P14D'), // Default 14 days
            'signatureKey' => $params['app']['cookieAuthKey'], // Secret HMAC key
            'secureCookie' => true, // Enforce HTTPS
        ],
    ],
];
```

> [!WARNING]
> Always configure a strong `signatureKey` for `CookieLogin`. Without it, anyone able to edit cookies can tamper with user IDs and impersonate other accounts!

#### Attaching `CookieLoginMiddleware` to Pipeline

In `config/web/di/application.php`, register `CookieLoginMiddleware` in the global middleware stack immediately after `SessionMiddleware`:

```php
use Yiisoft\Session\SessionMiddleware;
use Yiisoft\User\Login\Cookie\CookieLoginMiddleware;

'middlewareDefinitions' => [
    ErrorCatcher::class,
    SessionMiddleware::class,
    CookieLoginMiddleware::class, // Auto-authenticates guest users from cookie
    // ...
    Router::class,
],
```

### 4.5. PSR-14 User Authentication Events

`yiisoft/user` dispatches four PSR-14 events during the login and logout cycles:

| Event Class | Cancellable | Payload Methods | Primary Use Cases |
|---|---|---|---|
| `Yiisoft\User\Event\BeforeLogin` | Yes (`$event->invalidate()`) | `getIdentity(): IdentityInterface`<br>`isValid(): bool` | Account suspension checks, maintenance lockouts, IP blacklists. |
| `Yiisoft\User\Event\AfterLogin` | No | `getIdentity(): IdentityInterface` | Update `last_login_at` timestamp, write security audit log, reset brute-force counters. |
| `Yiisoft\User\Event\BeforeLogout` | Yes (`$event->invalidate()`) | `getIdentity(): IdentityInterface`<br>`isValid(): bool` | Confirm unsaved work, enforce mandatory workflow completion. |
| `Yiisoft\User\Event\AfterLogout` | No | `getIdentity(): IdentityInterface` | Audit logging, revoke external API refresh tokens, purge caches. |

#### Registering Event Listeners (`config/events-web.php`)

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

Configuring `Yiisoft\Auth\Jwt\JwtMethod` in `config/web/di/auth.php`:

```php
use Yiisoft\Auth\AuthenticationMethodInterface;
use Yiisoft\Auth\Jwt\JwtMethod;

return [
    AuthenticationMethodInterface::class => JwtMethod::class,
];
```

Creating and signing tokens:

```php
declare(strict_types=1);

namespace App\Presentation\Action\Api;

use App\Domain\User\Model\UserIdentity;
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
            'exp' => time() + 3600,
        ];

        $token = $this->tokenFactory->create($payload);

        return $this->responseFactory->createResponse([
            'token' => $token,
            'expires_in' => 3600,
        ]);
    }
}
```

---

## 6. Route Protection via Authentication & RBAC Middleware

`Yiisoft\Auth\Middleware\Authentication` intercepts requests, runs the configured authentication method, and populates the request attribute `Authentication::class` with the authenticated `IdentityInterface`. If authentication fails and the route is not marked optional, it halts execution and issues a challenge (e.g. 401 Unauthorized or 302 Redirect).

### 6.1. Route Definition with Authentication

```php
declare(strict_types=1);

use App\Presentation\Action\Auth\LoginAction;
use App\Presentation\Action\Profile\ViewProfileAction;
use App\Presentation\Action\Order\CreateOrderAction;
use Yiisoft\Auth\Middleware\Authentication;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route\Get;
use Yiisoft\Router\Route\Post;

return [
    // Public routes
    (new Post('/auth/login'))
        ->action(LoginAction::class)
        ->name('auth.login'),

    // Protected API group
    (new Group('/api'))
        ->middleware(Authentication::class)
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

### 6.2. Protecting Routes with RBAC Permissions

To enforce permission requirements directly on route groups or endpoints, register a custom PSR-15 permission guard middleware:

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
(new Group('/admin'))
    ->middleware(Authentication::class)
    ->middleware(new AccessCheckerMiddleware(permission: 'adminAccess', ...))
    ->routes(
        (new Get('/users'))
            ->action(ListUsersAction::class)
            ->middleware(new AccessCheckerMiddleware(permission: 'manageUsers', ...))
            ->name('admin.users'),
    );
```

---

## 7. Role-Based Access Control (RBAC) Architecture

Yii3 RBAC consists of **Roles**, **Permissions**, **Assignments**, and dynamic **Rules**.

### 7.1. RBAC Items, Roles, and Permissions

Manage roles and permissions using `Yiisoft\Rbac\ManagerInterface`:

```php
use Yiisoft\Rbac\ManagerInterface;
use Yiisoft\Rbac\Permission;
use Yiisoft\Rbac\Role;

public function initRbac(ManagerInterface $manager): void
{
    // 1. Create permissions
    $viewPost = new Permission('viewPost');
    $createPost = new Permission('createPost');
    $updatePost = new Permission('updatePost');
    $manager->addPermission($viewPost);
    $manager->addPermission($createPost);
    $manager->addPermission($updatePost);

    // 2. Create roles and build hierarchy
    $author = new Role('author');
    $manager->addRole($author);
    $manager->addChild('author', 'createPost');

    $admin = new Role('admin');
    $manager->addRole($admin);
    $manager->addChild('admin', 'author');
    $manager->addChild('admin', 'updatePost');

    // 3. Assign role to user
    $manager->assign(itemName: 'author', userId: '42');
}
```

### 7.2. Custom Business Rules (`RuleInterface`)

When permissions depend on contextual parameters (e.g. "a user may only edit their own post"), implement `Yiisoft\Rbac\RuleInterface`:

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

        return (string) $authorId === $userId;
    }
}
```

Associate the rule with a permission:

```php
$editOwnPost = (new Permission('editOwnPost'))->withRuleName(AuthorRule::class);
$manager->addPermission($editOwnPost);
$manager->addChild('author', 'editOwnPost');
```

### 7.3. Registering Rules via `rbac-rules-container`

`yiisoft/rbac-rules-container` dynamically resolves rule dependencies via PSR-11 container. Register rules in `config/common/params.php`:

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

---

## 8. Checking Permissions in Code

### 8.1. In Presentation Actions

Inject `Yiisoft\User\CurrentUser` into the action handler:

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

        // Evaluate permission with contextual parameter
        if (!$this->currentUser->can('editOwnPost', ['authorId' => $post->getAuthorId()])) {
            return $this->responseFactory->createResponse(
                ['error' => 'Forbidden'],
                Status::FORBIDDEN,
            );
        }

        return $this->responseFactory->createResponse(['status' => 'updated']);
    }
}
```

### 8.2. In Application Services / Use Cases

Inject `Yiisoft\Rbac\ManagerInterface` directly into domain or application services when decoupled from HTTP session context:

```php
declare(strict_types=1);

namespace App\Application\Post;

use Yiisoft\Rbac\ManagerInterface;

final readonly class PostAuthorizationService
{
    public function __construct(
        private ManagerInterface $rbacManager,
    ) {}

    public function canEditPost(string $userId, string $authorId): bool
    {
        return $this->rbacManager->userHasPermission(
            $userId,
            'editOwnPost',
            ['authorId' => $authorId],
        );
    }
}
```

---

## 9. Anti-Patterns & Common Traps

| Anti-Pattern | Why It Breaks | Correct Yii3 Approach |
|---|---|---|
| `Yii::$app->user->can(...)` | Yii3 has no global service locator or static facades. | Inject `Yiisoft\User\CurrentUser` into Action or Use Case. |
| **Omitting `StateResetter` in worker runtimes** | `CurrentUser` cached identity bleeds into other users' requests in RoadRunner/FrankenPHP. | Register `CurrentUser::class => fn () => $this->clear()` in `StateResetter`. |
| **Missing signature key for `CookieLogin`** | Unsigned cookies allow attackers to tamper with the JSON payload and spoof any user ID. | Always configure a cryptographically secure `signatureKey`. |
| **Hardcoding role checks `if ($role === 'admin')`** | Tight coupling; breaks if roles are renamed or permissions evolve. | Check capabilities via `$currentUser->can('permissionName')`. |
| **Modifying state in `RuleInterface::execute()`** | Rules are executed during evaluation checks and must be pure and side-effect free. | Only return `bool`. Perform state mutations in Use Cases. |
| **Storing sensitive tokens in plaintext** | Security vulnerability. | Always hash passwords with `PasswordHasher` and verify tokens with HMAC/public key signatures. |

---

## 10. Related Topic Guides

- [Routing Guide](routes.md) — Route groups, pipeline execution order, and attaching authentication/RBAC middlewares.
- [Actions & Controllers Guide](actions-and-controllers.md) — Checking permissions via `CurrentUser::can()` inside actions.
- [PSR-15 Middlewares Guide](middlewares.md) — Guard pipelines, CORS preflight ordering, and custom middleware implementations.
- [HTTP State Guide](http-state.md) — Session authentication, cookie parameters, and remember-me state.
- [Runners & Runtimes Guide](runners-and-runtimes.md) — Application runners, worker event loops, and `StateResetter` configuration.
- [OpenAPI & Swagger Guide](openapi-swagger.md) — Documenting authenticated endpoints and security schemes.
