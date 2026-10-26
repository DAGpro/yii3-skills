# Yii3 Authentication & RBAC Guide

> Practical guide and configuration recipes for user authentication, password hashing, session/JWT token methods, and role-based access control (RBAC) in Yii3.

---

## Table of Contents
- [1. Authentication Architecture & Core Contracts](#1-authentication-architecture--core-contracts)
- [2. Identity & Identity Repository Implementation](#2-identity--identity-repository-implementation)
- [3. Password Hashing with PasswordHasher](#3-password-hashing-with-passwordhasher)
- [4. Authentication Mechanisms (Web Session vs Stateless JWT)](#4-authentication-mechanisms-web-session-vs-stateless-jwt)
  - [4.1. Stateful Web Application (WebAuth / Cookie Login)](#41-stateful-web-application-webauth--cookie-login)
  - [4.2. Stateless REST API (JwtMethod / HttpBearer)](#42-stateless-rest-api-jwtmethod--httpbearer)
- [5. Route Protection via Authentication & RBAC Middleware](#5-route-protection-via-authentication--rbac-middleware)
- [6. Role-Based Access Control (RBAC) Architecture](#6-role-based-access-control-rbac-architecture)
  - [6.1. RBAC Items, Roles, and Permissions](#61-rbac-items-roles-and-permissions)
  - [6.2. Custom Business Rules (RuleInterface)](#62-custom-business-rules-ruleinterface)
  - [6.3. Registering Rules via rbac-rules-container](#63-registering-rules-via-rbac-rules-container)
- [7. Checking Permissions in Code](#7-checking-permissions-in-code)
- [8. Anti-Patterns & Common Traps](#8-anti-patterns--common-traps)
- [9. Related Topic Guides](#9-related-topic-guides)

---

## 1. Authentication Architecture & Core Contracts

In Yii3, user authentication and access control are divided into independent, decoupled packages:

| Package | FQCN / Core Interfaces | Purpose |
|---|---|---|
| `yiisoft/user` | `Yiisoft\User\CurrentUser`<br>`Yiisoft\User\Method\WebAuth` | Current user context, session state, login/logout, guest check, and high-level `can()` facade. |
| `yiisoft/auth` | `Yiisoft\Auth\IdentityInterface`<br>`Yiisoft\Auth\IdentityRepositoryInterface`<br>`Yiisoft\Auth\Middleware\Authentication`<br>`Yiisoft\Auth\Method\HttpBearer` | Abstract authentication contracts, token-based repositories, and PSR-15 authentication middleware. |
| `yiisoft/auth-jwt` | `Yiisoft\Auth\Jwt\JwtMethod`<br>`Yiisoft\Auth\Jwt\TokenFactoryInterface`<br>`Yiisoft\Auth\Jwt\TokenRepositoryInterface` | Stateless JSON Web Token authentication, claim verification, and token issuance. |
| `yiisoft/security` | `Yiisoft\Security\PasswordHasher`<br>`Yiisoft\Security\Random` | Cryptographically secure password hashing (BCrypt/Argon2) and CSPRNG token generation. |
| `yiisoft/rbac` | `Yiisoft\Rbac\ManagerInterface`<br>`Yiisoft\Rbac\Role`<br>`Yiisoft\Rbac\Permission`<br>`Yiisoft\Rbac\RuleInterface` | Hierarchical RBAC item manager, rule evaluation engine, and permission checker. |
| `yiisoft/rbac-db` | `Yiisoft\Rbac\Db\ItemsStorage`<br>`Yiisoft\Rbac\Db\AssignmentsStorage` | Database persistence driver for RBAC items and assignments using `yiisoft/db`. |
| `yiisoft/rbac-rules-container` | `Yiisoft\Rbac\Rules\Container\RulesContainer` | Rule factory resolving custom `RuleInterface` implementations via PSR-11 container. |

---

## 2. Identity & Identity Repository Implementation

### 2.1. Identity Model

An identity represents an authenticated user entity implementing `Yiisoft\Auth\IdentityInterface`:

```php
declare(strict_types=1);

namespace App\Domain\User\Model;

use Yiisoft\Auth\IdentityInterface;

final readonly class UserIdentity implements IdentityInterface
{
    public function __construct(
        private string $id,
        private string $login,
        private string $passwordHash,
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
}
```

### 2.2. Identity Repository

`Yiisoft\Auth\IdentityRepositoryInterface` provides lookup by user identifier:

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

        if ($row === null) {
            return null;
        }

        return new UserIdentity(
            id: (string) $row['id'],
            login: (string) $row['username'],
            passwordHash: (string) $row['password_hash'],
            isActive: (bool) $row['is_active'],
        );
    }
}
```

Register in `config/common/di/auth.php`:
```php
use App\Infrastructure\Persistence\Repository\UserIdentityRepository;
use Yiisoft\Auth\IdentityRepositoryInterface;

return [
    IdentityRepositoryInterface::class => UserIdentityRepository::class,
];
```

---

## 3. Password Hashing with PasswordHasher

`Yiisoft\Security\PasswordHasher` provides secure password hashing using safe defaults (cost 13 for BCrypt or system-default algorithm):

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

        // Save $username and $hash to persistence repository
    }

    public function verifyPassword(#[SensitiveParameter] string $password, string $storedHash): bool
    {
        // Validates password against hash
        return $this->passwordHasher->validate($password, $storedHash);
    }
}
```

---

## 4. Authentication Mechanisms (Web Session vs Stateless JWT)

### 4.1. Stateful Web Application (WebAuth / Cookie Login)

For standard web apps using sessions and cookies:
1. When a user submits credentials in a login action, verify password and invoke `$currentUser->login($identity)`.
2. `CurrentUser` stores user ID in `Yiisoft\Session\SessionInterface`.
3. Protected routes use `Yiisoft\User\Method\WebAuth`. If the user is a guest, `WebAuth::challenge()` redirects to `$authUrl` (default `/login`).

Login Action example:
```php
declare(strict_types=1);

namespace App\Presentation\Action\Auth;

use App\Application\User\Service\UserAuthService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\User\CurrentUser;

final readonly class LoginAction
{
    public function __construct(
        private CurrentUser $currentUser,
        private UserAuthService $authService,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $body = (array) $request->getParsedBody();
        $identity = $this->authService->authenticate(
            username: (string) ($body['username'] ?? ''),
            password: (string) ($body['password'] ?? ''),
        );

        if ($identity === null) {
            return $this->responseFactory->createResponse(
                ['error' => 'Invalid username or password'],
                Status::UNAUTHORIZED,
            );
        }

        $this->currentUser->login($identity);

        return $this->responseFactory->createResponse(['status' => 'ok']);
    }
}
```

### 4.2. Stateless REST API (JwtMethod / HttpBearer)

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
use Psr\Http\Message\ServerRequestInterface;
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

## 5. Route Protection via Authentication & RBAC Middleware

`Yiisoft\Auth\Middleware\Authentication` intercepts requests, runs the configured authentication method, and populates the request attribute `Authentication::class` with the authenticated `IdentityInterface`. If authentication fails and the route is not marked optional, it halts execution and issues a challenge (e.g. 401 Unauthorized or 302 Redirect).

### 5.1. Route Definition with Authentication (`config/routes.php`)

Modern Yii3 routes use dedicated verb classes (`new Get()`, `new Post()`) and `new Group()`:

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

### 5.2. Protecting Routes with RBAC Permissions

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

> [!TIP]
> For detailed route group syntax, parameter constraints, and execution order hierarchies, see [Routing Guide](routes.md). For middleware pipeline mechanics, see [PSR-15 Middlewares Guide](middlewares.md).

---

## 6. Role-Based Access Control (RBAC) Architecture

Yii3 RBAC consists of **Roles**, **Permissions**, **Assignments**, and dynamic **Rules**.

### 6.1. RBAC Items, Roles, and Permissions

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

### 6.2. Custom Business Rules (RuleInterface)

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

### 6.3. Registering Rules via rbac-rules-container

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

## 7. Checking Permissions in Code

### 7.1. In Presentation Actions

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

        // Execute post update logic...
        return $this->responseFactory->createResponse(['status' => 'updated']);
    }
}
```

### 7.2. In Application Services / Use Cases

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

## 8. Anti-Patterns & Common Traps

| Anti-Pattern | Why It Breaks | Correct Yii3 Approach |
|---|---|---|
| `Yii::$app->user->can(...)` | Yii3 has no global service locator or static facades. | Inject `Yiisoft\User\CurrentUser` into Action or Use Case. |
| Hardcoding role checks `if ($role === 'admin')` | Tight coupling; breaks if roles are renamed or fine-grained permissions change. | Check capabilities via `$currentUser->can('permissionName')`. |
| Modifying state in `RuleInterface::execute()` | Rules are executed during evaluation checks and must be pure and side-effect free. | Only return `bool`. Perform state mutations in Use Cases. |
| Storing sensitive tokens in plaintext | Security vulnerability. | Always hash passwords with `PasswordHasher` and verify tokens with HMAC/public key signatures. |
| Putting RBAC assignments in memory in production | Lost on restart / not shared between worker processes. | Use persistent RBAC storage (`yiisoft/rbac-db` or Cycle driver). |

---

## 9. Related Topic Guides

- [Routing Guide](routes.md) — Route groups, pipeline execution order, and attaching authentication/RBAC middlewares.
- [Actions & Controllers Guide](actions-and-controllers.md) — Checking permissions via `CurrentUser::can()` inside actions.
- [PSR-15 Middlewares Guide](middlewares.md) — Guard pipelines, CORS preflight ordering, and custom middleware implementations.
- [HTTP State Guide](http-state.md) — Session authentication, cookie parameters, and remember-me state.

