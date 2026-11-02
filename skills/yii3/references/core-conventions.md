# Yii 3 Architecture & Coding Conventions

> **Architectural Authority Note:**  
> The directory layout and conventions detailed below represent canonical best practices derived from official Yii 3 packages (`yiisoft/*`) and templates (`yiisoft/app`, `yiisoft/app-api`).  
> In existing projects, project-specific architecture definitions (such as `.ai-factory/ARCHITECTURE.md`) and actual codebase layouts in `src/` and `config/` always take precedence over generic fallback conventions. See [Architecture Alignment Guide](core-architecture-alignment.md).

---

## Table of Contents
- [1. Single Source of Truth (SSOT) & Verification Hierarchy](#1-single-source-of-truth-ssot--verification-hierarchy)
- [2. Directory Layout & Feature-Oriented Architecture](#2-directory-layout--feature-oriented-architecture)
- [3. Configuration System & Application Environment](#3-configuration-system--application-environment)
- [4. Dependency Injection & Service Definitions](#4-dependency-injection--service-definitions)
- [5. Application Runners & Entry Points](#5-application-runners--entry-points)
- [6. Web & HTTP Layer](#6-web--http-layer)
- [7. Request DTOs, Hydration & Validation](#7-request-dtos-hydration--validation)
- [8. Views, Layouts & HTML Forms](#8-views-layouts--html-forms)
- [9. Data Persistence & Database](#9-data-persistence--database)
- [10. Events & Logging](#10-events--logging)
- [11. Security, Authentication & Session](#11-security-authentication--session)
- [12. Console Commands](#12-console-commands)
- [13. Testing & Code Quality Assurance](#13-testing--code-quality-assurance)
- [14. Comprehensive Anti-Patterns & Yii2 Migration Matrix](#14-comprehensive-anti-patterns--yii2-migration-matrix)

---

## 1. Single Source of Truth (SSOT) & Verification Hierarchy

AI agents and developers writing Yii 3 code must strictly observe the following verification hierarchy and grounding principles:

### 1.1. Three-Tier Resolution Hierarchy
1. **Tier 1 — Target Project Codebase (`src/`, `config/`, `composer.json`, `.ai-factory/ARCHITECTURE.md`):**  
   The project's established conventions, directory layout, and active architectural patterns are the supreme authority.
2. **Tier 2 — Installed Package Source Code (`vendor/yiisoft/<package>/src/`):**  
   The ultimate authority for exact class names, interfaces, method signatures, argument order, types, and configuration defaults.
3. **Tier 3 — Skill Reference Guides (`references/*.md`):**  
   Authoring synthesis, usage recipes, and idiomatic migration patterns.

### 1.2. Mandatory Grounding & Zero-Hallucination Policy
- **Never guess or assume APIs:** Do not extrapolate method names or parameter lists from pre-trained generic PHP memory or legacy Yii 2 habits.
- **Inspect installed package sources:** When in doubt about any method signature, interface contract, or DI definition key, inspect the physical file in `vendor/yiisoft/<package>/src/`.
- **Absolute ban on Yii 2 static constructs:** Never invent static facades (`Yii::$app`, `Yii::getAlias()`, `Yii::info()`, `ActiveRecord::find()`), behaviors (`TimestampBehavior`), or model validation methods (`rules()`, `behaviors()`).
- **Package version awareness:** Inspect `composer.lock` to determine whether installed packages have introduced specific syntax changes (for example, constructor-based routes in `yiisoft/router` 4.0+ vs older static factories, or `WebViewRenderer` vs deprecated `ViewRenderer`).

---

## 2. Directory Layout & Feature-Oriented Architecture

Yii 3 eliminates the monolithic directory structures of older frameworks in favor of modular, feature-oriented organization.

### 2.1. Canonical Application Skeleton
The layout below reflects the standard structure used by `yiisoft/app` (Web) and `yiisoft/app-api` (REST API):

```
config/
  common/             # Cross-cutting DI definitions, params, routes, and aliases
    di/*.php          # Modular DI definitions (application.php, router.php, db.php)
    params.php        # Application parameters and package configurations
    routes.php        # HTTP route definitions
    bootstrap.php     # Early container bootstrapping (e.g. ConnectionProvider)
    aliases.php       # Path aliases mapping (@root, @src, @runtime, @views)
  web/                # Web-specific configurations
    di/*.php          # Web DI definitions (application.php, psr17.php)
    params.php        # Web-specific parameters
    events.php        # Optional web event listener mappings
  console/            # CLI-specific configurations
    commands.php      # CLI command mappings
    params.php        # Mounts commands into $params['yiisoft/yii-console']
    di/*.php          # Optional console-specific DI definitions
  environments/       # Environment overlays
    dev/params.php    # Development settings (debug enabled, local caching)
    test/params.php   # Test environment settings
    prod/params.php   # Production settings
  configuration.php   # Group mappings for yiisoft/config plugin
  .merge-plan.php     # Generated by yiisoft/config — NEVER edit manually
src/                  # Application source code (Feature-Oriented structure)
  Web/                # Web feature slices
    HomePage/         # Feature directory
      Action.php      # Invokable single-action handler
      template.php    # Colocated view template for HomePage
    NotFound/         # 404 handler and error presentation
      NotFoundHandler.php
      template.php
    Shared/           # Shared web presentation elements
      Layout/Main/layout.php
  Api/                # API endpoints and presenters (in API applications)
    IndexAction.php
    Shared/
      ResponseFactory.php
  Console/            # Symfony Console command classes
    HelloCommand.php
  Shared/             # Cross-cutting domain DTOs, entities, and services
    ApplicationParams.php
public/               # Web server document root
  index.php           # HTTP entry point (runs HttpApplicationRunner)
yii                   # CLI entry point script (runs ConsoleApplicationRunner)
runtime/              # Temporary cache, logs, and compiler artifacts (in .gitignore)
tests/                # Unit, functional, and acceptance test suites
```

### 2.2. Feature-Oriented Colocation in `src/`
Modern Yii 3 applications group related elements by business feature rather than technical type:
- An action and its dedicated template live in the same directory: `src/Web/HomePage/Action.php` and `src/Web/HomePage/template.php`.
- The template is rendered using the directory constant: `$this->viewRenderer->render(__DIR__ . '/template')`.
- Shared layouts and common partials live in a designated shared folder: `src/Web/Shared/Layout/Main/layout.php`.

### 2.3. Runtime Directory Isolation
The `runtime/` directory is reserved for transient data (logs, caching, temporary uploads). It must be excluded from version control (`.gitignore`) and resolved in application code using the `@runtime` path alias.

---

## 3. Configuration System & Application Environment

Yii 3 uses the `yiisoft/config` Composer plugin to merge configurations across packages, applications, and environments.

### 3.1. Group Mapping via `config/configuration.php`
Application skeletons configure the plugin using `"extra": {"config-plugin-file": "config/configuration.php"}` in `composer.json`. The `configuration.php` file returns an array with three top-level keys:

```php
<?php

declare(strict_types=1);

return [
    'config-plugin' => [
        'params' => 'common/params.php',
        'params-web' => [
            '$params',
            'web/params.php',
        ],
        'params-console' => [
            '$params',
            'console/params.php',
        ],
        'di' => 'common/di/*.php',
        'di-web' => [
            '$di',
            'web/di/*.php',
        ],
        'di-console' => [
            '$di',
            'console/di/*.php',
        ],
        'routes' => 'common/routes.php',
        'events' => [],
        'events-web' => ['$events'],
        'events-console' => ['$events'],
        'bootstrap' => 'common/bootstrap.php',
    ],
    'config-plugin-environments' => [
        'dev' => [
            'params' => [
                'environments/dev/params.php',
                '?params-local.php',
            ],
        ],
        'test' => [
            'params' => 'environments/test/params.php',
        ],
        'prod' => [
            'params' => 'environments/prod/params.php',
        ],
    ],
    'config-plugin-options' => [
        'source-directory' => 'config',
    ],
];
```

> [!NOTE]
> The official `yiisoft/app` template ships only `environments/dev/params.php` for the dev environment (see its `config/configuration.php`). The untracked `'?params-local.php'` override shown above is an optional local-development addition, not a template default.

### 3.2. Four-Layer Merge Hierarchy
The configuration files are merged deterministically in four progressive layers:
1. **Layer 1 (Vendor Defaults):** Packages register their own default `params.php` and `di.php` via their `composer.json` `extra.config-plugin` section.
2. **Layer 2 (Application Common):** Application-wide configurations in `config/common/` (`params.php`, `di/*.php`, `routes.php`).
3. **Layer 3 (Context Environment):** Context-specific layers such as `config/web/` (`di-web`, `params-web`) or `config/console/` (`di-console`, `params-console`).
4. **Layer 4 (Deployment Environment):** Environment overrides from `config/environments/{dev,test,prod}/` and optional untracked local overrides (`?params-local.php`).

### 3.3. Syntactic Prefixes in Configuration Groups
- **`$` (Variable Inclusion):** Includes another configuration group. For example, `'di-web' => ['$di', 'web/di/*.php']` imports the base `$di` group and appends web-specific definitions.
- **`*` (Wildcard Globbing):** Expands all files matching the shell pattern (e.g., `'common/di/*.php'`).
- **`?` (Optional File):** If the file does not exist on disk (such as `'?params-local.php'`), the loader skips it silently without throwing an exception.

### 3.4. Merge Plan & Rebuild Invariant
The file `config/.merge-plan.php` is generated automatically by `yiisoft/config` during Composer operations (`install`, `update`, `dump-autoload`).  
- **Rule:** Never edit `config/.merge-plan.php` manually.
- **Rebuild Command:** Whenever you add, rename, or delete any configuration file in `config/`, you must immediately execute:
  ```bash
  composer yii-config-rebuild
  ```

### 3.5. Critical Scoping Rules for `$params`
- In files belonging to **`di`**, **`routes`**, **`events`**, or **`bootstrap`** groups, the combined parameters array is injected into local scope as **`$params`**.
- In files belonging to the **`params`** group (`config/common/params.php`, `config/environments/*/params.php`), the variable `$params` **is not available**. The parameters array is being assembled at that moment; referencing `$params` inside `params.php` causes a fatal `Undefined variable $params` error.

---

## 4. Dependency Injection & Service Definitions

Yii 3 features a pure PSR-11 dependency injection container (`Yiisoft\Di\Container`).

### 4.1. Core Container Invariants
- **Strictly PSR-11 compliant:** Implements `Psr\Container\ContainerInterface` (`get()` and `has()`).
- **No static state:** There is no `Yii::$app->get('service')`, no global service locator, and no static container registry.
- **Stateless by default:** Services registered in DI are shared instances (singletons) across the container lifetime. Domain services must remain stateless.
- **No container injection:** Services must not inject `ContainerInterface` to pull dependencies manually; all dependencies must be declared explicitly in constructor parameters.

### 4.2. Definition Syntax Recipes (`yiisoft/definitions`)
Configuration files in `config/common/di/*.php` return arrays of service definitions:

```php
<?php

declare(strict_types=1);

use App\Shared\Domain\Service\PaymentGateway;
use App\Shared\Domain\Service\PaymentGatewayInterface;
use Psr\Container\ContainerInterface;
use Psr\Http\Client\ClientInterface;
use Psr\Log\LoggerInterface;
use Yiisoft\Definitions\Reference;

/** @var array $params */

return [
    // 1. Direct interface-to-implementation mapping
    PaymentGatewayInterface::class => PaymentGateway::class,

    // 2. Full definition array with constructor arguments, property injection, and method calls
    PaymentGateway::class => [
        'class' => PaymentGateway::class, // Optional if array key is the FQCN
        '__construct()' => [
            'apiKey' => $params['app']['payment']['apiKey'],
            'httpClient' => Reference::to(ClientInterface::class),
            'logger' => Reference::optional(LoggerInterface::class), // null if not bound
        ],
        '$timeout' => 30, // Public property injection with '$' prefix
        'setEnvironment()' => ['production'], // Method call
        'withDebugMode()' => [true], // Immutable with*() call (supports clone return)
    ],

    // 3. Factory closure definition
    'custom.service' => static function (ContainerInterface $container) use ($params): PaymentGateway {
        return new PaymentGateway(
            apiKey: (string) $params['app']['payment']['apiKey'],
            httpClient: $container->get(ClientInterface::class),
        );
    },
];
```

### 4.3. Service Tagging and State Resetting
- **Tagging services:** Services can be grouped under tags for batch retrieval:
  ```php
  MyExportHandler::class => [
      'class' => MyExportHandler::class,
      'tags' => ['export-handlers'],
  ],
  ```
  The collection is injected using `Yiisoft\Di\Reference\TagReference::to('export-handlers')`.
- **State resetting (Worker mode compatibility):** Stateful services (such as `Yiisoft\User\CurrentUser`) require a reset closure to clear memory between worker iterations in RoadRunner or FrankenPHP:
  ```php
  CurrentUser::class => [
      'reset' => function (): void {
          $this->clear();
      },
  ],
  ```

### 4.4. Named Path Aliases (`Yiisoft\Aliases\Aliases`)
Path aliases provide portable, environment-independent file paths.
- Aliases are defined in `config/common/aliases.php`:
  ```php
  <?php

  declare(strict_types=1);

  return [
      '@root' => dirname(__DIR__, 2),
      '@src' => '@root/src',
      '@assets' => '@public/assets',
      '@assetsUrl' => '@baseUrl/assets',
      '@baseUrl' => '/',
      '@public' => '@root/public',
      '@runtime' => '@root/runtime',
      '@vendor' => '@root/vendor',
  ];
  ```
- Mounted in `config/common/params.php`:
  ```php
  'yiisoft/aliases' => [
      'aliases' => require __DIR__ . '/aliases.php',
  ],
  ```
- Consumed in services by injecting `Yiisoft\Aliases\Aliases`:
  ```php
  $logPath = $aliases->get('@runtime/logs/app.log');
  ```
  *Note:* Static `Yii::getAlias()` does not exist.

---

## 5. Application Runners & Entry Points

Application lifecycles in Yii 3 are managed by dedicated runner packages.

### 5.1. HTTP Web Entry Point (`public/index.php`)
The entry point initializes the environment and delegates execution to `Yiisoft\Yii\Runner\Http\HttpApplicationRunner`:

```php
<?php

declare(strict_types=1);

use App\Environment;
use Yiisoft\Yii\Runner\Http\HttpApplicationRunner;

$root = dirname(__DIR__);

require_once $root . '/src/bootstrap.php';

// Route static assets for PHP built-in web server
if (PHP_SAPI === 'cli-server') {
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
    if ($path !== false && is_file(__DIR__ . $path)) {
        return false;
    }
    $_SERVER['SCRIPT_NAME'] = '/index.php';
}

$runner = new HttpApplicationRunner(
    rootPath: $root,
    debug: Environment::appDebug(),
    checkEvents: Environment::appDebug(),
    environment: Environment::appEnv(),
);
$runner->run();
```

The runner loads the `web` configuration groups, builds the container, invokes `Application::start()`, dispatches the PSR-7 request through the middleware pipeline, emits the response via `SapiEmitter`, and calls `Application::shutdown()`.

### 5.2. Console Entry Point Script (`./yii`)
The root `./yii` script delegates execution to `Yiisoft\Yii\Runner\Console\ConsoleApplicationRunner`:

```php
#!/usr/bin/env php
<?php

declare(strict_types=1);

use App\Environment;
use Yiisoft\Yii\Runner\Console\ConsoleApplicationRunner;

require_once __DIR__ . '/src/bootstrap.php';

$runner = new ConsoleApplicationRunner(
    rootPath: __DIR__,
    debug: Environment::appDebug(),
    checkEvents: Environment::appDebug(),
    environment: Environment::appEnv(),
);
$runner->run();
```

The runner loads `console` configuration groups and dispatches commands through `Yiisoft\Yii\Console\Application`.

---

## 6. Web & HTTP Layer

The web layer relies on PSR-7 (HTTP Messages), PSR-15 (HTTP Handlers & Middleware), and `yiisoft/router`.

### 6.1. Single-Action Invokable Classes (Canonical Standard)
Actions in Yii 3 are clean, invokable PHP classes without any framework base class:

```php
<?php

declare(strict_types=1);

namespace App\Web\Post;

use App\Shared\Domain\Repository\PostRepositoryInterface;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class ViewAction
{
    public function __construct(
        private PostRepositoryInterface $postRepository,
        private WebViewRenderer $viewRenderer,
    ) {}

    public function __invoke(CurrentRoute $currentRoute): ResponseInterface
    {
        $id = (int) $currentRoute->getArgument('id');
        $post = $this->postRepository->findById($id);

        if ($post === null) {
            return $this->viewRenderer
                ->render(__DIR__ . '/NotFound/template')
                ->withStatus(Status::NOT_FOUND);
        }

        return $this->viewRenderer->render(__DIR__ . '/template', [
            'post' => $post,
        ]);
    }
}
```

- **Dependency Resolution:** Action dependencies are injected via the constructor. Action parameters (such as `CurrentRoute`, `ServerRequestInterface`, or custom DTOs) are dynamically resolved via `Yiisoft\Injector\Injector`.
- **Controllers Support:** Multi-action controller classes are supported by `MiddlewareFactory` using callable arrays `[PostController::class, 'view']`. However, Yii 3 has **no base Controller class**; controllers are plain classes without magic methods like `$this->render()` or `$this->request`.

### 6.2. Route Definitions (`yiisoft/router` v4.0+)
In `yiisoft/router` v4.0+, routes are declared by instantiating typed route classes:

```php
<?php

declare(strict_types=1);

use App\Web\Admin\DashboardAction;
use App\Web\Admin\Middleware\AdminAuthMiddleware;
use App\Web\Post\CreateAction;
use App\Web\Post\ListAction;
use App\Web\Post\ViewAction;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route\Get;
use Yiisoft\Router\Route\Post;

return [
    new Get('/', action: ListAction::class, name: 'home'),
    new Get('/posts', action: ListAction::class, name: 'post.list'),
    new Get('/posts/{id:\d+}', action: ViewAction::class, name: 'post.view'),
    new Post('/posts', action: CreateAction::class, name: 'post.create'),

    (new Group('/admin'))
        ->middleware(AdminAuthMiddleware::class)
        ->routes(
            new Get('/dashboard', action: DashboardAction::class, name: 'admin.dashboard'),
        ),
];
```

> [!WARNING]
> Static factory methods (`Route::get()`, `Route::post()`, `Group::create()`) are **deprecated** in `yiisoft/router` v4.0+. Use direct constructor instantiation (`new Get(...)`, `new Post(...)`, `new Group(...)`).  
> Route and Group instances are **immutable**: chaining methods (`name()`, `middleware()`) returns a cloned instance.

### 6.3. URL Generation (`UrlGeneratorInterface`)
URLs are generated by injecting `Yiisoft\Router\UrlGeneratorInterface`:

```php
$url = $this->urlGenerator->generate(
    name: 'post.view',
    arguments: ['id' => 42],            // Argument 2: route path arguments
    queryParameters: ['ref' => 'feed'], // Argument 3: query string parameters
    hash: 'comments',                   // Argument 4: URL anchor fragment
);
// Generates: /posts/42?ref=feed#comments
```

### 6.4. Canonical Middleware Pipeline Order
The standard PSR-15 middleware execution stack in Yii 3 must be ordered logically to ensure error handling, session persistence, and CSRF protection function correctly. The canonical core order (as wired in the official `yiisoft/app` template, `config/web/di/application.php`) is `ErrorCatcher` → `SessionMiddleware` → `CsrfTokenMiddleware` → `RequestCatcherMiddleware` → `Router`:

```
1. ErrorCatcher             (Catches unhandled throwables, logs errors, renders error response)
2. CorsMiddleware           (Handles preflight OPTIONS and adds CORS headers; API applications)
3. RequestBodyParser        (Parses incoming JSON or URL-encoded request bodies into parsedBody)
4. SessionMiddleware        (Starts session before routing and commits Set-Cookie on response)
5. CsrfTokenMiddleware      (Validates CSRF token on mutating POST/PUT/DELETE requests)
6. RequestCatcherMiddleware (Captures the current PSR-7 request for later retrieval — yiisoft/request-provider)
7. Router                   (Yiisoft\Router\Middleware\Router — matches the request URI to routes and populates CurrentRoute)
8. Authentication           (Authenticates user identity for protected routes)
9. Action / Handler         (Executes application business logic)
```

---

## 7. Request DTOs, Hydration & Validation

Yii 3 strictly decouples incoming HTTP request handling from domain entities and persistence models.

### 7.1. Clean Separation of Roles
- **DTO / Input Class:** Strongly-typed representation of incoming request payload (`yiisoft/input-http` + `yiisoft/hydrator`).
- **FormModel:** Specialized model for binding HTML form fields, generating labels, and formatting validation errors for UI presentation (`yiisoft/form-model`).
- **ActiveRecord / Entity:** Database persistence model. Models **never** validate raw user input and contain **no `rules()` method**.

### 7.2. DTO Declaration with Validation Attributes
Request DTOs define PHP 8 attributes from `yiisoft/validator`:

```php
<?php

declare(strict_types=1);

namespace App\Web\Post\Input;

use Yiisoft\Input\Http\AbstractInput;
use Yiisoft\Input\Http\Attribute\Data\FromBody;
use Yiisoft\Validator\Rule\Email;
use Yiisoft\Validator\Rule\Integer;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\Rule\StringValue;

#[FromBody]
final class CreatePostInput extends AbstractInput
{
    #[Required]
    #[StringValue]
    #[Length(min: 3, max: 255)]
    public string $title = '';

    #[Required]
    #[StringValue]
    public string $content = '';

    #[Required]
    #[Integer]
    public int $categoryId = 0;

    #[Email]
    public string $notifyEmail = '';
}
```

### 7.3. Executing Validation and Processing Results
Validation produces an instance of `Yiisoft\Validator\Result` (not `ValidationResult`):

```php
$result = $validator->validate($input);

if (!$result->isValid()) {
    // For flat forms: indexed by property name
    $errorsByProp = $result->getErrorMessagesIndexedByProperty();

    // For nested structures or JSON APIs: indexed by dot-separated path
    $errorsByPath = $result->getErrorMessagesIndexedByPath();
}
```

---

## 8. Views, Layouts & HTML Forms

HTML rendering in Yii 3 is decoupled from controller instances.

### 8.1. Canonical `WebViewRenderer`
Actions inject `Yiisoft\Yii\View\Renderer\WebViewRenderer` (the older `ViewRenderer` is **deprecated**):

```php
use Psr\Http\Message\ResponseInterface;
use Yiisoft\Http\Status;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

public function __construct(
    private WebViewRenderer $viewRenderer,
) {}

public function __invoke(): ResponseInterface
{
    // Returns a PSR-7 ResponseInterface with Content-Type: text/html
    return $this->viewRenderer
        ->render(__DIR__ . '/template', ['user' => $user])
        ->withStatus(Status::OK);
}
```

> [!NOTE]
> `WebViewRenderer` does not possess a `withStatus()` method. The method `withStatus()` is called on the resulting PSR-7 `ResponseInterface` object returned by `render()`.

### 8.2. HTML Form Construction & CSRF Protection
Forms are rendered using `Yiisoft\Html\Html` and `Yiisoft\FormModel\Field`:

```php
<?php

declare(strict_types=1);

use App\Web\Auth\LoginForm;
use Yiisoft\FormModel\Field;
use Yiisoft\Html\Html;
use Yiisoft\Yii\View\Renderer\Csrf;

/**
 * @var Csrf $csrf Injected globally by CsrfViewInjection
 * @var LoginForm $formModel
 */

$form = Html::form('/auth/login')->post()->csrf($csrf);
?>

<?= $form->open() ?>
    <?= Field::text($formModel, 'login')->label('Username or Email') ?>
    <?= Field::password($formModel, 'password')->label('Password') ?>
    <?= Field::submitButton('Sign In', ['class' => 'btn btn-primary']) ?>
<?= $form->close() ?>
```

- **CSRF Token Origin:** The `$csrf` variable is injected into all templates automatically by `Yiisoft\Yii\View\Renderer\CsrfViewInjection`. It is an instance of `Yiisoft\Yii\View\Renderer\Csrf` (which implements `\Stringable`).
- **Form Closing Idiom:** `$form->close()` is an instance method on the form object. Alternatively, standard native `</form>` or `Html::closeTag('form')` may be used. Never call static `Form::close()`.
- **Submit Button Helper:** Use `Field::submitButton(...)`, not `Field::submit()`.

---

## 9. Data Persistence & Database

Yii 3 provides database access through `yiisoft/db` and optional ORM layers.

### 9.1. Low-Level Database Access via `ConnectionInterface`
Repositories and persistence services inject `Yiisoft\Db\Connection\ConnectionInterface`:

```php
<?php

declare(strict_types=1);

namespace App\Shared\Infrastructure\Repository;

use Yiisoft\Db\Connection\ConnectionInterface;

final readonly class PostSqlRepository
{
    public function __construct(
        private ConnectionInterface $db,
    ) {}

    public function findPublished(): array
    {
        // Safe parameterized query with automatic table and column quoting
        return $this->db
            ->createCommand(
                'SELECT * FROM {{%post}} WHERE [[status]] = :status ORDER BY [[created_at]] DESC',
                [':status' => 'published'],
            )
            ->queryAll();
    }
}
```

- Always quote table names with `{{%table}}` and columns with `[[column]]`.
- Always pass parameters via `:param` placeholders to guarantee immunity against SQL injection.
- Fetch methods: `queryAll()`, `queryOne()`, `queryColumn()`, `queryScalar()`, or `query()` (for cursor-based `DataReaderInterface`).

### 9.2. Transaction Management
Use the closure-based transaction helper for automatic commit and rollback:

```php
$result = $this->db->transaction(function (ConnectionInterface $db): int {
    $db->createCommand('UPDATE {{%account}} SET [[balance]] = [[balance]] - 100 WHERE [[id]] = 1')->execute();
    $db->createCommand('UPDATE {{%account}} SET [[balance]] = [[balance]] + 100 WHERE [[id]] = 2')->execute();
    return 100;
});
```

### 9.3. Database Migrations (`yiisoft/db-migration`)
Migrations implement `Yiisoft\Db\Migration\MigrationInterface` and `RevertibleMigrationInterface` (there is **no `BaseMigration`**):

```php
<?php

declare(strict_types=1);

use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;
use Yiisoft\Db\Migration\TransactionalMigrationInterface;

final class M261101120000CreatePostTable implements RevertibleMigrationInterface, TransactionalMigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $column = $b->columnBuilder();

        $b->createTable('{{%post}}', [
            'id' => $column::primaryKey(),
            'title' => $column::string(255)->notNull(),
            'content' => $column::text()->notNull(),
            'status' => $column::string(32)->defaultValue('draft')->notNull(),
            'created_at' => $column::integer()->notNull(),
        ]);

        $b->createIndex('{{%post}}', 'idx-post-status', ['status']);
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropTable('{{%post}}');
    }
}
```

CLI migration commands use standard Symfony Console colon separators:
```bash
./yii migrate:create create_user_table
./yii migrate:up
./yii migrate:down
```

### 9.4. Active Record Conventions (`yiisoft/active-record`)
When using Active Record:
- Extend `Yiisoft\ActiveRecord\ActiveRecord` and implement `tableName(): string`.
- Define explicit, typed properties (e.g. `protected string $title;` with getters and setters).
- Execute queries using `Model::query()`:
  ```php
  $post = Post::query()->where(['status' => 'published'])->one();
  ```
  *(Note: `Post::find()` is not built into `ActiveRecord`; it requires importing `Yiisoft\ActiveRecord\Trait\RepositoryTrait`.)*
- Save records with `$model->save()`.

### 9.5. Strict Single ORM Rule
An application must strictly choose **one** persistence approach:
- **Stack A:** `yiisoft/db` + `yiisoft/active-record` + `yiisoft/db-migration`
- **Stack B:** `yiisoft/yii-cycle` (`cycle/orm` + `cycle/database` + `cycle/migrations`)
- **Stack C:** Pure `yiisoft/db` (Query Builder / Table Data Gateway)

Never mix Active Record and Cycle ORM in the same application. They use incompatible DBALs, separate connection pools, and isolated transaction managers.

---

## 10. Events & Logging

Yii 3 applications communicate across boundaries via PSR-14 events and log diagnostics via PSR-3.

### 10.1. PSR-14 Domain Events
Domain events are immutable DTOs named in the past tense:

```php
<?php

declare(strict_types=1);

namespace App\Shared\Domain\Event;

final readonly class OrderCreated
{
    public function __construct(
        public int $orderId,
        public int $userId,
        public float $amount,
    ) {}
}
```

Dispatch events by injecting `Psr\EventDispatcher\EventDispatcherInterface`:
```php
$this->eventDispatcher->dispatch(new OrderCreated($orderId, $userId, $amount));
```

### 10.2. Event Listener Registration
Listeners are mapped in `config/common/events.php` (or `config/web/events.php`):

```php
<?php

declare(strict_types=1);

use App\Shared\Domain\Event\OrderCreated;
use App\Shared\Domain\Listener\SendOrderConfirmationEmail;

return [
    OrderCreated::class => [
        [SendOrderConfirmationEmail::class, 'handle'],
    ],
];
```

Register the file in `config/configuration.php` under `'events'` or `'events-web'`, and rebuild the merge plan (`composer yii-config-rebuild`).

### 10.3. PSR-3 Structured Logging
Services inject `Psr\Log\LoggerInterface`:

```php
$this->logger->info('Order #{id} was successfully processed for user #{userId}.', [
    'category' => 'app.order', // Specify log category in context array
    'id' => $orderId,
    'userId' => $userId,
]);
```

- **Log Category:** Unlike Yii 2, the category is not passed as an argument. Pass it inside `$context['category']` (defaults to `'application'`).
- **Placeholder Interpolation:** Use standard PSR-3 `{name}` placeholders and supply values in the context array. Never concatenate raw dynamic variables into the message string.

---

## 11. Security, Authentication & Session

Security and user identity state are strictly decoupled from global applications.

### 11.1. Current User Context (`Yiisoft\User\CurrentUser`)
The user state is accessed by injecting `Yiisoft\User\CurrentUser`:

```php
public function __construct(
    private CurrentUser $currentUser,
) {}

public function __invoke(): ResponseInterface
{
    if ($this->currentUser->isGuest()) {
        // Handle unauthenticated user
    }

    $userId = $this->currentUser->getId(); // Returns ?string (null for guest)
    $identity = $this->currentUser->getIdentity(); // Returns IdentityInterface
}
```

> [!CRITICAL]
> `CurrentUser::getIdentity(): IdentityInterface` is **never null**. When the user is not authenticated, it returns an instance of `GuestIdentityInterface` (`GuestIdentity`).  
> **Always** check authentication status using `$currentUser->isGuest(): bool` or `$currentUser->getId() !== null`. Never write `if ($currentUser->getIdentity() === null)`.

### 11.2. Session vs. Flash Messages
Session storage and flash notifications are handled by two separate interfaces:
- **`Yiisoft\Session\SessionInterface`:** Manages session storage and lifecycle (`get()`, `set()`, `has()`, `remove()`, `open()`, `close()`). It contains **no flash methods**.
- **`Yiisoft\Session\Flash\FlashInterface`:** Dedicated service for temporary flash notifications (`get()`, `getAll()`, `set()`, `add()`):
  ```php
  use Yiisoft\Session\Flash\FlashInterface;

  public function __construct(
      private FlashInterface $flash,
  ) {}

  public function save(): ResponseInterface
  {
      $this->flash->set('success', 'Profile saved successfully.');
  }
  ```

### 11.3. Password Hashing (`Yiisoft\Security\PasswordHasher`)
Passwords are encrypted and verified using `Yiisoft\Security\PasswordHasher`:
```php
$hash = $this->passwordHasher->hash($plainPassword);
$isValid = $this->passwordHasher->validate($plainPassword, $hash);
```

### 11.4. CSRF Middleware
Mutating HTTP requests (POST, PUT, DELETE, PATCH) are verified by `Yiisoft\Csrf\CsrfTokenMiddleware` in the HTTP pipeline (the older `CsrfMiddleware` is **deprecated**).

---

## 12. Console Commands

CLI commands in Yii 3 are built on Symfony Console.

### 12.1. Command Implementation
Commands extend `Symfony\Component\Console\Command\Command`, declare the `#[AsCommand]` attribute, and receive dependencies via constructor DI:

```php
<?php

declare(strict_types=1);

namespace App\Console;

use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Yiisoft\Yii\Console\ExitCode;

#[AsCommand(
    name: 'user:create',
    description: 'Creates a new application user account.',
)]
final class CreateUserCommand extends Command
{
    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $io->title('Creating User');

        // Command execution logic...
        $io->success('User created successfully.');

        return ExitCode::OK;
    }
}
```

### 12.2. Command Registration
Commands are registered in `config/console/commands.php` and mounted in `config/console/params.php`:

```php
// config/console/commands.php
<?php

declare(strict_types=1);

use App\Console\CreateUserCommand;

return [
    'user:create' => CreateUserCommand::class,
];
```

```php
// config/console/params.php
<?php

declare(strict_types=1);

return [
    'yiisoft/yii-console' => [
        'commands' => require __DIR__ . '/commands.php',
    ],
];
```

Commands are instantiated lazily from the DI container only when invoked.

---

## 13. Testing & Code Quality Assurance

Yii 3 projects enforce strict code standards and provide dedicated testing tools.

### 13.1. Code Style & Linting (`yiisoft/code-style`)
- **Official Linter:** `friendsofphp/php-cs-fixer` configured with rulesets from `yiisoft/code-style`:
  - `@Yiisoft/Core`: Safe rules based on PER-CS (single empty line between methods, ordered class elements, unused import removal).
  - `@Yiisoft/Core:risky`: Enforces `declare(strict_types=1);` and optimizes native invocations.
- **ECS Prohibited:** `symplify/easy-coding-standard` (ecs) is not used in Yii 3.
- **Prohibition of `#[Override]`:** The PHP 8.3 attribute `#[Override]` is prohibited by Yii 3 conventions and is automatically removed by Rector rule `RemoveOverrideAttributeRector`.

### 13.2. Exclusive Test Runner Rule
A project must install and run strictly **one** test runner:
- Either **`phpunit/phpunit`**
- Or **`testo/testo`**

Never install both runners simultaneously in `composer.json`.

### 13.3. In-Memory PSR Test Doubles (`yiisoft/test-support`)
For unit tests, `yiisoft/test-support` (`require-dev`) supplies lightweight in-memory test doubles without requiring an application container boot:
- **`SimpleContainer`:** Implements `Psr\Container\ContainerInterface` using a flat memory array:
  ```php
  $container = new SimpleContainer([
      LoggerInterface::class => new SimpleLogger(),
      EventDispatcherInterface::class => new SimpleEventDispatcher(),
  ]);
  ```
- **`SimpleLogger`:** Captures log records in memory; inspect with `$logger->getMessages()`.
- **`SimpleEventDispatcher`:** Tracks dispatched events; verify with `$dispatcher->isClassTriggered(OrderCreated::class)`.
- **`StaticClock`:** Implements `Psr\Clock\ClockInterface` (PSR-20) returning a fixed `DateTimeImmutable`.
- **`StringStream`:** Implements `Psr\Http\Message\StreamInterface` in memory without disk I/O.
- **`MemorySimpleCache`:** In-memory PSR-16 cache implementation.

### 13.4. Standard Quality Gate Commands
Run these commands locally before completing any implementation task:
```bash
composer test                                  # Run test suite
composer cs-fix                                # Run PHP-CS-Fixer
./vendor/bin/psalm --no-cache                  # Static analysis (or phpstan)
./vendor/bin/composer-dependency-analyser      # Check for missing/unused dependencies
```

---

## 14. Comprehensive Anti-Patterns & Yii2 Migration Matrix

The table below lists prohibited legacy patterns, their mandatory Yii 3 replacements, and architectural rationales:

| # | Forbidden Legacy / Anti-Pattern | Mandatory Idiomatic Yii 3 Replacement | Grounding Rationale & Official Contract |
|---|---|---|---|
| 1 | `Yii::$app->db` or `Yii::$app->...` | Inject PSR / Yiisoft interfaces via constructor DI | Container is stateless (`Yiisoft\Di\Container`). The global `Yii` facade is eliminated. |
| 2 | `class SiteController extends Controller` with `actionIndex()` | `final readonly class IndexAction` with `__invoke()` | Yii 3 has no base `Controller`. Actions are invokable classes; dependencies resolve via DI. |
| 3 | `$this->render('index', $data)` inside controllers | Inject `WebViewRenderer` and return `$this->viewRenderer->render(...)` | `ViewRenderer` is deprecated. Actions must return a PSR-7 `ResponseInterface`. |
| 4 | `$request->post('name')` or `$request->get('id')` | Use PSR-7 `$request->getParsedBody()`, or hydrate typed DTOs via `yiisoft/input-http` | PSR-7 requests are immutable. Input must be mapped to typed DTOs and validated. |
| 5 | `$request->get('id')` for route parameters | `CurrentRoute::getArgument('id')` or attribute `#[RouteArgument]` | Route placeholders are parsed by the router into `CurrentRoute` context. |
| 6 | `ActiveForm::begin()` in view templates | `Html::form()->post()->csrf($csrf)->open()` and `Field::text(...)` | No monolithic form widget. HTML tags and FormModel fields are cleanly separated. |
| 7 | `rules()` and `behaviors()` on ActiveRecord models | Validation attributes (`#[Required]`, ...) on DTOs; PSR-14 events replace behaviors | ActiveRecord models are strictly for persistence and have no validation methods. |
| 8 | `Url::to(['/post/view', 'id' => 1])` | Inject `UrlGeneratorInterface` and call `$urlGenerator->generate('post.view', ['id' => 1])` | Routes are named and generated explicitly by `UrlGeneratorInterface`. |
| 9 | `if ($currentUser->getIdentity() === null)` | Check `$currentUser->isGuest()` or `$currentUser->getId() === null` | `CurrentUser::getIdentity()` never returns `null`; it returns `GuestIdentity` for guests. |
| 10 | `$session->getFlash('msg')` or `$session->setFlash(...)` | Inject `FlashInterface` separately and call `$flash->get(...)` / `$flash->set(...)` | `SessionInterface` does not manage flash messages; they are isolated in `FlashInterface`. |
| 11 | `CsrfMiddleware` in HTTP middleware pipeline | Use `Yiisoft\Csrf\CsrfTokenMiddleware` | `CsrfMiddleware` is `@deprecated` in `yiisoft/csrf` v2.0+. |
| 12 | `Route::get('/path')` / `Group::create()` | `new \Yiisoft\Router\Route\Get('/path')`, `new \Yiisoft\Router\Group()` | Static route factory methods are `@deprecated` in `yiisoft/router` v4.0+. |
| 13 | Editing `vendor/` or `config/.merge-plan.php` | Edit `config/**/params.php` or `di/*.php`, then run `composer yii-config-rebuild` | `.merge-plan.php` is generated by `yiisoft/config` and overwritten by Composer. |
| 14 | Executing `./yii migrate/up` (slash separator) | Execute `./yii migrate:up` (colon separator) | Console commands follow Symfony Console conventions with colons. |
| 15 | Calling `echo`, `print`, `die()`, or `exit()` | Return a PSR-7 `ResponseInterface` instance from the action | Direct output breaks `SessionMiddleware::commitSession()` and bypasses `ErrorCatcher`. |
| 16 | Mixing Active Record and Cycle ORM | Choose strictly one persistence stack for the project | Incompatible DBALs, separate connection pools, and isolated transaction managers. |
| 17 | Using `symplify/easy-coding-standard` (ecs) | Use `friendsofphp/php-cs-fixer` with `yiisoft/code-style` | Official coding style package for the Yii 3 ecosystem. |
| 18 | Adding `#[Override]` attribute to methods | Omit `#[Override]` attribute on method overrides | The `#[Override]` attribute is forbidden by Yii 3 conventions and stripped by Rector. |
