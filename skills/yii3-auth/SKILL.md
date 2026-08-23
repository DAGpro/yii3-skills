---
name: yii3-auth
description: >-
  Implement authentication and authorization in Yii3: IdentityInterface + IdentityRepositoryInterface,
  yiisoft/user CurrentUser (login/logout/isGuest/can), route protection via Authentication middleware,
  and RBAC hierarchy (yiisoft/rbac with PHP or DB storage, rules, console init), password flows
  (hashing via yiisoft/security PasswordHasher, signup, change/reset password). Use when user says
  "add login", "authentication", "authorization", "roles", "permissions", "RBAC", "protect routes",
  "signup", "password", "reset password".
argument-hint: "[auth feature description]"
allowed-tools: Read Glob Grep Write Edit Bash(php -l *; composer *; ./yii *; php yii *; make yii *) AskUserQuestion Questions
disable-model-invocation: false
metadata:
  author: DAGpro (https://github.com/DAGpro)
  version: "0.1"
  category: framework-yii3
---

# Yii3 Authentication & Authorization

Implement auth in a Yii3 app with `yiisoft/user`, `yiisoft/auth` and `yiisoft/rbac`.

## Step 0: Analyze the Project

1. Load context per `yii3` master skill.
2. Check installed packages: `yiisoft/user`, `yiisoft/auth`, `yiisoft/rbac-php` / `yiisoft/rbac-db`,
   `yiisoft/session`. Install missing ones per the flow below.
3. Ask: session-based web login, stateless API tokens, or both? Which RBAC storage? Existing user table?

## Part A — Authentication

### Packages

```sh
composer require yiisoft/user yiisoft/auth yiisoft/session
```

### DI configuration

`config/common/di/user.php`:

```php
<?php

use Yiisoft\Auth\IdentityRepositoryInterface;
use Yiisoft\User\CurrentUser;
use Yiisoft\Definitions\Reference;

/** @var array $params */

return [
    IdentityRepositoryInterface::class => App\User\IdentityRepository::class,

    CurrentUser::class => [
        'withSession()' => [Reference::to(\Yiisoft\Session\SessionInterface::class)],
    ],
];
```

For API/stateless auth also configure the method:

```php
use Yiisoft\Auth\AuthenticationMethodInterface;
use Yiisoft\User\Method\WebAuth;

return [
    AuthenticationMethodInterface::class => WebAuth::class,
    // ...
];
```

### Identity

```php
<?php

declare(strict_types=1);

namespace App\User;

use Yiisoft\Auth\IdentityInterface;

final readonly class Identity implements IdentityInterface
{
    public function __construct(
        private string $id,
    ) {}

    public function getId(): string
    {
        return $this->id;
    }
}
```

### Identity Repository

```php
<?php

declare(strict_types=1);

namespace App\User;

use Yiisoft\Auth\IdentityInterface;
use Yiisoft\Auth\IdentityRepositoryInterface;

final readonly class IdentityRepository implements IdentityRepositoryInterface
{
    public function __construct(
        private UserRepository $userRepository, // your domain repository
    ) {}

    public function findIdentity(string $id): ?IdentityInterface
    {
        $user = $this->userRepository->findById($id);

        return $user === null ? null : new Identity($user->id);
    }

    public function findIdentityByToken(string $token, string $type): ?IdentityInterface
    {
        // stateless APIs: lookup by access token
        $user = $this->userRepository->findByToken($token);

        return $user === null ? null : new Identity($user->id);
    }
}
```

### Login / Logout / Current User

Inject `Yiisoft\User\CurrentUser` anywhere:

```php
$this->user->isGuest();          // bool
$identity = $this->user->getIdentity();
$this->user->login($identity);   // stores identity in session
$this->user->logout();
$this->user->getId();            // shortcut for identity id
```

Events available: `BeforeLogin`, `AfterLogin`, `BeforeLogout`, `AfterLogout`
(`Yiisoft\User\Event\*`) — call `invalidate()` on Before* to cancel.

### Protecting Routes

```php
use Yiisoft\Auth\Middleware\Authentication;

Group::create('/admin')
    ->middleware(Authentication::class)
    ->routes(/* ... */)
```

or per-route: `Route::post('/create')->middleware(Authentication::class)->...`

## Part B — Authorization (RBAC)

### Storage setup

Pick one storage and install:

- PHP files: `composer require yiisoft/rbac-php` (simple projects, fixed hierarchy)
- DB: `composer require yiisoft/rbac-db` (+ one of yiisoft/db-* drivers)

DI (`config/common/di/rbac.php`, PHP storage example):

```php
use Yiisoft\Rbac\ItemsStorageInterface;
use Yiisoft\Rbac\AssignmentsStorageInterface;
use Yiisoft\Rbac\ManagerInterface;
use Yiisoft\Rbac\Php\ItemsStorage;
use Yiisoft\Rbac\Php\AssignmentsStorage;
use Yiisoft\Access\AccessCheckerInterface;
use Yiisoft\User\CurrentUser;

/** @var array $params */

return [
    ItemsStorageInterface::class => [
        'class' => ItemsStorage::class,
        '__construct()' => ['filePath' => $params['rbacItemsStorageFilePath']],
    ],
    AssignmentsStorageInterface::class => [
        'class' => AssignmentsStorage::class,
        '__construct()' => ['filePath' => $params['rbacAssignmentsStorageFilePath']],
    ],
    AccessCheckerInterface::class => ManagerInterface::class,

    CurrentUser::class => [
        'withAccessChecker()' => [Reference::to(AccessCheckerInterface::class)],
    ],
];
```

DB storage: register `Yiisoft\Rbac\Db\ItemsStorage` / `AssignmentsStorage`, add vendor migrations
to params:

```php
'yiisoft/db-migration' => [
    'sourcePaths' => [
        __DIR__ . '/../../vendor/yiisoft/rbac-db/migrations/items',
        __DIR__ . '/../../vendor/yiisoft/rbac-db/migrations/assignments',
    ],
],
```

then run `./yii migrate:up`.

### Building the hierarchy — console command

Console command template (`#[AsCommand]` class registered in console params):

```php
$this->manager->addPermission((new Permission('updatePost'))->withDescription('Update post'));
$this->manager->addRole(new Role('author'));
$this->manager->addChild('author', 'updatePost');
$this->manager->assign('author', $userId);
```

Do not hardcode `assign()` calls for dynamic user bases — build an admin UI or assignment command instead.
For changing hierarchies use migrations calling the same `ManagerInterface` API.

### Rules (dynamic conditions)

```php
final readonly class AuthorRule implements RuleInterface
{
    public function execute(?string $userId, Item $item, RuleContext $context): bool
    {
        $post = $context->getParameterValue('post');

        return $post !== null && $post->getAuthorId() == $userId;
    }
}
```

Attach to a permission: `(new Permission('updateOwnPost'))->withRuleName(AuthorRule::class);`

### Access checks

Simple permission check:

```php
if (!$this->user->can('updatePost')) {
    return $this->responseFactory->createResponse(Status::FORBIDDEN);
}
```

With rule parameters:

```php
if ($this->user->can('updateOwnPost', ['post' => $post])) {
    // ...
}
```

Custom access checkers implement `Yiisoft\Access\AccessCheckerInterface::userHasPermission()`
and are registered instead of RBAC's `ManagerInterface`.

## Part C - Passwords & Account Flows

Password handling with `yiisoft/security` (bind `PasswordHasherInterface` via DI; default argon2).

### Hashing

```php
use Yiisoft\Security\PasswordHasher;

final readonly class UserService
{
    public function __construct(private PasswordHasher $hasher) {}

    public function register(SignupInput $input): User
    {
        // hash on write; never store plain text, never log it
        $hash = $this->hasher->hash($input->password);
    }

    public function login(...): bool
    {
        return $this->hasher->validate($plainPassword, $user->getPasswordHash());
    }
}
```

### Signup Flow

1. FormModel (`#[Required]`, `#[Email]`, password + confirmation rules).
2. Validate -> hash password -> persist user in transaction.
3. Optional: verification token (`random_bytes(32)` + bin2hex, stored hashed with expiry).
4. Flash message + redirect to login.

### Change Password

Require current password (`PasswordHasher::validate`) before setting the new one;
invalidate other sessions after change if needed.

### Password Reset

1. Request: always respond the same way regardless of account existence (no user enumeration);
   generate single-use token with TTL, send link by email (`/yii3-email`).
2. Reset: validate token (not expired, not used), show new-password form, re-hash, mark token used.
3. Tokens are random, stored hashed, expire quickly.

### Crypt Utilities

For symmetric encryption of sensitive values (not passwords) use `Yiisoft\Security\Crypt`
with a key from env - never commit keys, never use encryption for password storage.

### Console init command

Seed the hierarchy via a project-defined `rbac:init` command (`src/Console/RbacInitCommand.php`):

```php
<?php

declare(strict_types=1);

namespace App\Console;

use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Yiisoft\Rbac\ManagerInterface;
use Yiisoft\Rbac\Permission;
use Yiisoft\Rbac\Role;

#[AsCommand(name: 'rbac:init', description: 'Initializes RBAC hierarchy')]
final readonly class RbacInitCommand extends Command
{
    public function __construct(private ManagerInterface $manager)
    {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $this->manager->removeAll();

        $this->manager->addPermission(new Permission('manageUsers'));
        $this->manager->addRole(new Role('admin'));
        $this->manager->addChild('admin', 'manageUsers');

        foreach ($this->adminIds() as $id) {
            $this->manager->assign('admin', $id);
        }

        $output->writeln('<info>RBAC hierarchy initialized</info>');
        return Command::SUCCESS;
    }

    private function adminIds(): array
    {
        return array_map('intval', explode(',', (string) getenv('ADMIN_USER_IDS')));
    }
}
```

Register it in console params under `'yiisoft/yii-console' => ['commands' => ['rbac:init' => RbacInitCommand::class]]`.

## Verification Checklist

1. `php -l` all created files.
2. Guest hitting a protected route gets redirected/401; authenticated user passes.
3. `$this->user->can(...)` returns expected results before/after role assignment.
4. Session login persists across requests; API token auth works without session.

## Related Skills

- `/yii3-di` — details of DI registration patterns
