# Yii3 Dependency Injection & Configuration Guide

> Practical recommendations and configuration recipes for `yiisoft/di`, `yiisoft/definitions`, `yiisoft/config`, `yiisoft/injector`, `yiisoft/factory`, and `yiisoft/aliases`.

---

## Table of Contents
- [1. Core DI Architecture & Philosophy in Yii3](#1-core-di-architecture--philosophy-in-yii3)
- [2. Configuration Architecture & Scopes (yiisoft/config)](#2-configuration-architecture--scopes-yiisoftconfig)
- [3. Parameter Management (params.php)](#3-parameter-management-paramsphp)
- [4. Definition Syntax Recipes (yiisoft/definitions)](#4-definition-syntax-recipes-yiisoftdefinitions)
- [5. Advanced DI Features (yiisoft/di)](#5-advanced-di-features-yiisoftdi)
- [6. Dynamic Invocation & Factories (yiisoft/injector & yiisoft/factory)](#6-dynamic-invocation--factories-yiisoftinjector--yiisoftfactory)
- [7. Hidden Pitfalls & Execution Realities](#7-hidden-pitfalls--execution-realities)
- [8. Anti-Pattern Matrix: DI & Configuration](#8-anti-pattern-matrix-di--configuration)
  - [8.1. Automated Verification with check-di-syntax.php](#81-automated-verification-with-check-di-syntaxphp)
- [9. Related Topic Guides](#9-related-topic-guides)

---

## 1. Core DI Architecture & Philosophy in Yii3

Yii3 completely departs from the Yii2 service locator pattern (`Yii::$app->service`) and static container registries:

1. **Pure PSR-11 Container:**
   - The primary container (`Yiisoft\Di\Container`) strictly implements `Psr\Container\ContainerInterface`.
   - Services are registered declaratively in configuration files and resolved automatically via constructor autowiring.
2. **Strict Anti-Service-Locator Rule:**
   - Classes must NEVER inject `Psr\Container\ContainerInterface` to fetch their own dependencies dynamically. This hides dependencies, introduces tight coupling to container internals, and breaks unit testing.
   - All class dependencies MUST be explicitly declared in `__construct()` via constructor property promotion and typed interfaces.
3. **Zero Static Facades & Zero Global State:**
   - Global static state (`Yii::$app`, `Yii::$container`) does not exist in Yii3. Everything is an instantiable, testable, stateless or state-managed object.
4. **Immutable Container Lifecycle:**
   - Unlike Yii2 (`Yii::$container->set(...)`), `Yiisoft\Di\Container` exposes no public mutation API: there is no `set()` method, and definitions are parsed, validated, and stored once when the container is constructed. You cannot register new definitions afterwards.
5. **Worker-Ready State Management:**
   - Persistent PHP runtimes (RoadRunner, FrankenPHP, Swoole) keep container instances alive across multiple HTTP requests. Stateful services must implement explicit reset logic via `StateResetter` callbacks.
6. **Separation of Configuration and Logic:**
   - Service wiring, constructor arguments, and environment settings are declared in configuration files returning PHP arrays. Domain and application code remain completely decoupled from framework wiring.

---

## 2. Configuration Architecture & Scopes (`yiisoft/config`)

`yiisoft/config` manages modular configurations distributed across Composer packages and your application. It consists of two distinct components:
- **Composer Plugin (`yiisoft/config`):** Listens to Composer command events and rebuilds the merge plan into `config/.merge-plan.php` on `composer dump-autoload` (which also runs after `composer require` / `composer update`), or explicitly via `composer yii-config-rebuild`. It crawls all configured packages and builds a cached dependency merge plan.
- **Runtime Config Loader (`Yiisoft\Config\Config`):** Reads the merge plan at application startup and builds merged configuration arrays for the requested scope.

### 2.1. The Configuration Layer Hierarchy

Configurations are merged in a strict order of precedence (later layers override earlier ones):
1. **Vendor Default Layer:** Distributed in `vendor/*/*/config/*.php` by installed packages.
2. **Vendor Override Layer (`vendor-override-layer`):** Optional sublayer between the vendor and application layers, defined under `"extra": {"config-plugin-options": {"vendor-override-layer": [...]}}` in the application `composer.json`. It allocates specific packages whose configurations override regular vendor defaults before application code is applied.
3. **Application Root Layer:** Declared in `config/` of your root project. Overrides vendor defaults.
4. **Environment Layer (`config-plugin-environments`):** Environment-specific overrides (e.g. `dev`, `test`, `prod`) that merge on top of application and vendor configs.

> [!CAUTION]
> Duplicate keys within the *same* layer are strictly forbidden and throw an `ErrorException`
> (`Duplicate key "..." in the following configs while building "..." group: ...`). Overrides are only permitted across distinct layers.

---

### 2.2. Directory Structure

The official `yiisoft/app` application template organizes configuration as follows:

```text
config/
├── .merge-plan.php              # ⚠️ AUTO-GENERATED by composer. NEVER edit manually!
├── configuration.php            # Root config-plugin & environments map (or in composer.json)
├── common/
│   ├── aliases.php              # Path aliases (@root, @runtime, @public, ...)
│   ├── application.php          # Shared application-level parameters mapping
│   ├── di/                      # Shared DI definitions (every *.php file is picked up)
│   │   ├── application.php      # Application parameters services
│   │   ├── error-handler.php    # Error handler renderer configuration
│   │   ├── logger.php           # Logger & log targets wiring
│   │   └── router.php           # Router configuration
│   ├── params.php               # Shared primitive application parameters
│   ├── routes.php               # Shared route definitions
│   └── bootstrap.php            # Shared application bootstrap runners
├── web/
│   ├── di/                      # Web-specific services
│   │   ├── application.php      # Web application configuration (middleware stack, etc.)
│   │   └── psr17.php            # PSR-17 request/response factory bindings
│   └── params.php               # Web parameters
├── console/
│   ├── commands.php             # Console command list
│   └── params.php               # Console parameters
└── environments/
    ├── dev/
    │   └── params.php           # Development overrides (debug toolbar, verbose logs)
    ├── test/
    │   └── params.php           # Testing overrides (in-memory sqlite, mock APIs)
    └── prod/
        └── params.php           # Production overrides (strict caching, production keys)
```

Add your own files — such as `common/di/db.php`, `common/di/mailer.php`, or `web/di/session.php` — freely: the `'di' => 'common/di/*.php'` wildcard picks up every PHP file in the directory. The exact set of files varies between templates (`yiisoft/app`, `yiisoft/app-api`, `yiisoft/app-console`); always inspect the actual project's `config/` before editing.

---

### 2.3. Root Configuration Map (`config/configuration.php`)

When using `"extra": {"config-plugin-file": "config/configuration.php"}` in `composer.json`, your application defines all merge groups and environment overlays in PHP (as in the `yiisoft/app` template):

```php
<?php

declare(strict_types=1);

use App\Environment;

// NOTE: After making changes in this file, run `composer yii-config-rebuild` to update the merge plan.
return [
    'config-plugin' => [
        // Parameters
        'params' => 'common/params.php',
        'params-web' => [
            '$params',
            'web/params.php',
        ],
        'params-console' => [
            '$params',
            'console/params.php',
        ],
        // Container definitions
        'di' => 'common/di/*.php',
        'di-web' => [
            '$di',
            'web/di/*.php',
        ],
        'di-console' => '$di',
        // Container delegates, providers, tags
        'di-delegates' => [],
        'di-delegates-web' => '$di-delegates',
        'di-delegates-console' => '$di-delegates',
        'di-providers' => [],
        'di-providers-web' => [
            '$di-providers',
        ],
        'di-providers-console' => [
            '$di-providers',
        ],
        'di-tags' => [],
        'di-tags-web' => '$di-tags',
        'di-tags-console' => '$di-tags',
        // Events and routes
        'events' => [],
        'events-web' => ['$events'],
        'events-console' => ['$events'],
        'routes' => 'common/routes.php',
        'bootstrap' => 'common/bootstrap.php',
        'bootstrap-web' => '$bootstrap',
        'bootstrap-console' => '$bootstrap',
    ],
    'config-plugin-environments' => [
        Environment::DEV => [
            'params' => [
                'environments/dev/params.php',
            ],
        ],
        Environment::TEST => [
            'params' => [
                'environments/test/params.php',
            ],
        ],
        Environment::PROD => [
            'params' => [
                'environments/prod/params.php',
            ],
        ],
    ],
    'config-plugin-options' => [
        'source-directory' => 'config',
    ],
];
```

`config-plugin-options` also supports: `merge-plan-file` (custom merge plan path), `build-merge-plan` (bool), `vendor-override-layer` (package name or list of package names), and `package-types`.

### 2.4. File Syntax Markers in Config Groups

- **`?` (Optional File):** If the file does not exist, it is silently skipped instead of throwing an exception:
  `'?common/params-local.php'`. Absence of a file *not* marked with `?` throws an exception.
- **`*` (Wildcard Directory Match):** Matches all matching files in the directory:
  `'common/di/*.php'`
- **`$` (Group Reference):** Imports and merges all contents from another named config group:
  `'$di'` or `'$params'`. A variable must not reference the group it is declared inside.

---

### 2.5. Booting the Application: Runners and `Config`

Application templates do NOT construct `Config` manually. Entrypoints (`public/index.php`, `./yii`) instantiate runners — `Yiisoft\Yii\Runner\Http\HttpApplicationRunner` or `Yiisoft\Yii\Runner\Console\ConsoleApplicationRunner` — which internally create `Config` and the DI container:

```php
<?php

declare(strict_types=1);

use Yiisoft\ErrorHandler\ErrorHandler;
use Yiisoft\ErrorHandler\Renderer\HtmlRenderer;
use Yiisoft\Log\Logger;
use Yiisoft\Log\StreamTarget;
use Yiisoft\Yii\Runner\Http\HttpApplicationRunner;

$root = dirname(__DIR__);

$runner = new HttpApplicationRunner(
    rootPath: $root,
    debug: (bool) ($_ENV['APP_DEBUG'] ?? false),
    checkEvents: (bool) ($_ENV['APP_DEBUG'] ?? false),
    environment: $_ENV['YII_ENV'] ?? null,
    temporaryErrorHandler: new ErrorHandler(
        new Logger([
            (new StreamTarget())->setLevels([
                \Psr\Log\LogLevel::EMERGENCY,
                \Psr\Log\LogLevel::ERROR,
                \Psr\Log\LogLevel::WARNING,
            ]),
        ]),
        new HtmlRenderer(),
    ),
);
$runner->run();
```

The HTTP runner defaults to the groups `di-web`, `params-web`, `di-providers-web`, `di-delegates-web`, `di-tags-web`, `bootstrap-web`, `events-web`; the console runner defaults to the `-console` counterparts (`di-console`, `params-console`, ...).

Under the hood (`Yiisoft\Yii\Runner\ApplicationRunner::createDefaultConfig()`), the runner constructs `Config` like this:

```php
<?php

declare(strict_types=1);

use Yiisoft\Config\Config;
use Yiisoft\Config\ConfigPaths;
use Yiisoft\Config\Modifier\RecursiveMerge;
use Yiisoft\Config\Modifier\ReverseMerge;

$rootPath = dirname(__DIR__);
$environment = $_ENV['YII_ENV'] ?? null;

$config = new Config(
    paths: new ConfigPaths($rootPath, 'config'),
    environment: $environment,
    modifiers: [
        ReverseMerge::groups('events-web', 'events'),
        RecursiveMerge::groups('params-web', 'params', 'events-web', 'events'),
    ],
    paramsGroup: 'params-web',
);

$webParams = $config->get('params-web');
$webDefinitions = $config->get('di-web');
```

Full constructor signature (`Yiisoft\Config\Config`):
`__construct(ConfigPaths $paths, ?string $environment = null, array $modifiers = [], ?string $paramsGroup = 'params', string $mergePlanFile = '.merge-plan.php')`.
`Yiisoft\Config\ConfigPaths::__construct(string $rootPath, ?string $configDirectory = null, ?string $vendorDirectory = null)`.

---

## 3. Parameter Management (`params.php`)

Parameters are primitive values (strings, integers, floats, booleans, arrays) consumed by service definitions.

### 3.1. Rules for Parameters
1. **Primitives Only (convention):** Keep parameters primitive — scalars and plain arrays; class-string values (`Formatter::class`) are acceptable and idiomatic. Do not put closures, anonymous functions, or instantiated service objects in `params.php`: parameters are merged across packages and environments, shared with DI files, and should remain introspectable and overridable. Factories belong in `config/*/di/*.php`, not in params.
2. **Package Namespacing:** Always namespace third-party package configuration under the vendor/package key (e.g. `'yiisoft/view'`, `'yiisoft/yii-view-renderer'`).
3. **Environment Separation:** Read sensitive secrets or deployment-specific values from `$_ENV` (backed by `.env`).
4. **Local Scope Variables:** When `Config` builds any configuration file (params, DI definitions, events, ...), it evaluates the file with two variables available in the local scope: `$params` (the merged parameters group, e.g. `params-web`; an empty array if no params group is configured) and `$config` (the `Yiisoft\Config\Config` instance itself, usable for `$config->has(...)` / `$config->get(...)` of other groups).

### 3.2. Example Parameter Configuration (`config/common/params.php`)

```php
<?php

declare(strict_types=1);

use Yiisoft\DataResponse\Formatter\HtmlDataResponseFormatter;
use Yiisoft\DataResponse\Formatter\JsonDataResponseFormatter;
use Yiisoft\DataResponse\Formatter\XmlDataResponseFormatter;

return [
    'app' => [
        'name' => 'My Yii3 Application',
        'charset' => 'UTF-8',
        'debug' => (bool) ($_ENV['APP_DEBUG'] ?? false),
    ],
    'mailer' => [
        'host' => (string) ($_ENV['MAILER_HOST'] ?? 'smtp.example.com'),
        'port' => (int) ($_ENV['MAILER_PORT'] ?? 587),
        'encryption' => (string) ($_ENV['MAILER_ENCRYPTION'] ?? 'tls'),
        'username' => (string) ($_ENV['MAILER_USER'] ?? 'support@example.com'),
        'password' => (string) ($_ENV['MAILER_PASSWORD'] ?? ''),
    ],
    'yiisoft/yii-view-renderer' => [
        'viewPath' => '@views',
        'layout' => '@views/layout/main',
    ],
    'yiisoft/data-response' => [
        'contentFormatters' => [
            'text/html' => HtmlDataResponseFormatter::class,
            'application/xml' => XmlDataResponseFormatter::class,
            'application/json' => JsonDataResponseFormatter::class,
        ],
    ],
];
```

---

## 4. Definition Syntax Recipes (`yiisoft/definitions`)

DI definition files return an array mapping identifiers (typically interface FQCNs or string aliases) to definitions.
Inside DI configuration files, the `$params` array (and the `$config` loader instance) are available as local variables (see [3.1](#31-rules-for-parameters)).

### 4.1. Interface-to-Implementation Binding (Autowiring)
When all constructor dependencies of the concrete class can be resolved via container autowiring, bind the interface directly to the concrete class string:

```php
<?php

declare(strict_types=1);

use App\Domain\User\UserRepositoryInterface;
use App\Infrastructure\Persistence\CycleUserRepository;

/** @var array $params */

return [
    UserRepositoryInterface::class => CycleUserRepository::class,
];
```

---

### 4.2. Array Definition (`class`, `__construct()`, Method Calls, Properties)

When an object requires scalar parameters, specific service references, method calls, or property injection, use an array definition:

```php
<?php

declare(strict_types=1);

use App\Infrastructure\Payment\PaymentGatewayInterface;
use App\Infrastructure\Payment\StripePaymentGateway;
use Psr\Log\LoggerInterface;
use Yiisoft\Definitions\Reference;

/** @var array $params */

return [
    PaymentGatewayInterface::class => [
        'class' => StripePaymentGateway::class,
        '__construct()' => [
            'apiKey' => $params['payment']['stripe_api_key'],
            'logger' => Reference::to(LoggerInterface::class),
        ],
        // Method calls performed immediately after instantiation (methodName() syntax)
        'setTimeout()' => [30],
        'setSandboxMode()' => [$params['payment']['sandbox_mode']],
        // Public property injection ($propertyName syntax - MUST include $)
        '$defaultCurrency' => 'USD',
    ],
];
```

> [!WARNING]
> **Strict Syntax Requirements for Array Definitions (`DefinitionValidator`):**
> 1. **Class Name:** The key MUST be `'class'` (`ArrayDefinition::CLASS_NAME`). Using Yii2 `'__class'` will fail validation.
> 2. **Constructor Arguments:** MUST be under `'__construct()' => [...]`.
> 3. **Method Calls:** MUST end with `()` (e.g. `'setTimeout()' => [30]`). Omitting `()` causes `InvalidConfigException`.
> 4. **Property Injection:** MUST start with `$` (e.g. `'$defaultCurrency' => 'USD'`).
> 5. **Error Messages differ by flow.** Inside the DI container, unknown keys of an array definition are parsed as *metadata* (only `tags` and `reset` are allowed) and throw from `Yiisoft\Di\Container::validateMeta()`:
>    `Invalid definition: metadata "timeout" is not allowed. Did you mean "timeout()" or "$timeout"?`
>    In flows that validate the raw array directly (`Yiisoft\Factory\Factory`, `DynamicReference`), `DefinitionValidator` throws:
>    `Invalid definition: key "timeout" is not allowed. Did you mean "$timeout"?` — with a single suggestion (`"$timeout"` for an existing public property, `"timeout()"` for an existing public method).

---

### 4.3. Service References (`Reference::to` and `Reference::optional`)

Use `Yiisoft\Definitions\Reference` to point to another service in the container without instantiating it eagerly:

```php
<?php

declare(strict_types=1);

use App\Domain\Audit\AuditLoggerInterface;
use App\Domain\Service\NotificationService;
use App\Infrastructure\Cache\RedisCache;
use Psr\SimpleCache\CacheInterface;
use Yiisoft\Definitions\Reference;

/** @var array $params */

return [
    // Bind alias or interface to another container service ID
    CacheInterface::class => Reference::to(RedisCache::class),

    // Optional reference: resolves to null if AuditLoggerInterface is not bound
    'myService' => [
        'class' => NotificationService::class,
        '__construct()' => [
            'auditLogger' => Reference::optional(AuditLoggerInterface::class),
        ],
    ],
];
```

Signatures: `Reference::to(mixed $id)` and `Reference::optional(mixed $id)`. The ID must be a string at runtime, otherwise `InvalidConfigException` (`Reference ID must be string.`) is thrown during resolution.

---

### 4.4. References Array (`ReferencesArray::from`)

When configuring a collection of services (such as formatters, handlers, or middleware) defined in `$params`, use `ReferencesArray::from()` to transform an associative array of class strings into lazy references:

```php
<?php

declare(strict_types=1);

use Yiisoft\DataResponse\Middleware\ContentNegotiator;
use Yiisoft\Definitions\ReferencesArray;

/** @var array $params */

return [
    ContentNegotiator::class => [
        '__construct()' => [
            'contentFormatters' => ReferencesArray::from(
                $params['yiisoft/data-response']['contentFormatters'],
            ),
        ],
    ],
];
```

Signature: `ReferencesArray::from(array $ids): array` — values must be strings (class names or aliases), otherwise `InvalidConfigException` (`Values of an array must be string alias or class name.`).

---

### 4.5. Dynamic References (`DynamicReference::to` & `DynamicReferencesArray::from`)

Use `Yiisoft\Definitions\DynamicReference` when a dependency must NOT be looked up as a service ID in the container, but instead defined inline: `DynamicReference::to(...)` wraps a definition (array definition, class name, or callable) that is resolved in place, not fetched from the container by identifier:

```php
<?php

declare(strict_types=1);

use App\Domain\Billing\InvoiceGenerator;
use App\Infrastructure\Pdf\DompdfRenderer;
use Yiisoft\Definitions\DynamicReference;

/** @var array $params */

return [
    InvoiceGenerator::class => [
        'class' => InvoiceGenerator::class,
        '__construct()' => [
            'pdfRenderer' => DynamicReference::to([
                'class' => DompdfRenderer::class,
                '$paperSize' => 'A4',
                '$orientation' => 'portrait',
            ]),
        ],
    ],
];
```

Signature: `DynamicReference::to(mixed $id)`. Objects that are not callable are rejected (`DynamicReference don't support object as definition.`). For arrays of definitions, use `DynamicReferencesArray::from(array $definitions)` — each value (class string or inline definition array) is wrapped with `DynamicReference::to()`.

---

### 4.6. Path Aliases in DI (`Yiisoft\Aliases\AliasReference`)

Passing a raw string like `'@runtime/logs/app.log'` in DI definitions does NOT automatically resolve aliases in Yii3 (unlike Yii2). To lazily resolve an alias path at object creation, use `Yiisoft\Aliases\AliasReference::to()`:

```php
<?php

declare(strict_types=1);

use App\Infrastructure\Logging\FileLogger;
use Psr\Log\LoggerInterface;
use Yiisoft\Aliases\AliasReference;

/** @var array $params */

return [
    LoggerInterface::class => [
        'class' => FileLogger::class,
        '__construct()' => [
            'logFile' => AliasReference::to('@runtime/logs/app.log'),
        ],
    ],
];
```

Signature: `AliasReference::to(mixed $id)`. At resolution time it fetches `Yiisoft\Aliases\Aliases` from the container and returns `$aliases->get($alias)` (a resolved absolute path string); non-string IDs throw `InvalidArgumentException` (`Alias must be a string.`). Aliases themselves are defined in `config/common/aliases.php` and consumed by the `Aliases` service.

---

### 4.7. Factory Closures & Callable Definitions

Use factory closures for complex setup, third-party libraries without standard constructors, or SDK client instantiation. Type-hinted arguments in the closure are **automatically autowired** by `Yiisoft\Definitions\CallableDefinition`:

```php
<?php

declare(strict_types=1);

use App\Domain\Service\MailerInterface;
use App\Infrastructure\Mailer\SmtpMailer;
use Psr\Log\LoggerInterface;

/** @var array $params */

return [
    // Argument $logger is autowired from the container!
    MailerInterface::class => static function (LoggerInterface $logger) use ($params): MailerInterface {
        $config = $params['mailer'];

        $mailer = new SmtpMailer(
            host: $config['host'],
            port: (int) $config['port'],
            user: $config['username'],
            password: $config['password'],
        );

        $mailer->setLogger($logger);

        return $mailer;
    },
];
```

Scalar closure parameters without defaults cannot be autowired — provide them only via `$params` captured with `use`, not as closure arguments.

---

### 4.8. Raw Values (`ValueDefinition`)

If you need the container to return an array or scalar directly under an identifier without treating it as an array definition:

```php
<?php

declare(strict_types=1);

use Yiisoft\Definitions\ValueDefinition;

return [
    'app.allowed_locales' => new ValueDefinition(['en', 'de', 'fr', 'es']),
];
```

Signature: `new ValueDefinition(mixed $value, ?string $type = null)` — the value is returned as is on resolution.

---

## 5. Advanced DI Features (`yiisoft/di`)

### 5.1. Service Tagging (`TagReference`)

Service tagging allows grouping multiple services together so they can be injected as a collection (e.g. event listeners, console commands, security voters):

#### Step 1: Tag Services in Definitions
```php
<?php

declare(strict_types=1);

use App\Infrastructure\Console\Command\CleanupCommand;
use App\Infrastructure\Console\Command\ExportCommand;

return [
    CleanupCommand::class => [
        'class' => CleanupCommand::class,
        'tags' => ['console.command'],
    ],
    ExportCommand::class => [
        'class' => ExportCommand::class,
        'tags' => ['console.command'],
    ],
];
```

#### Step 2: Inject Tagged Services via `TagReference::to()`
```php
<?php

declare(strict_types=1);

use App\Infrastructure\Console\CommandCollection;
use Yiisoft\Di\Reference\TagReference;

return [
    CommandCollection::class => [
        'class' => CommandCollection::class,
        '__construct()' => [
            'commands' => TagReference::to('console.command'),
        ],
    ],
];
```

Signatures: `TagReference::to(string $tag): Yiisoft\Definitions\Reference` (namespace `Yiisoft\Di\Reference\TagReference`). Resolving a tag alias yields the **array** of tagged service instances (empty array if none are tagged). Alternatively, tags can be registered in bulk via `ContainerConfig::create()->withTags(['console.command' => [CleanupCommand::class, ExportCommand::class]])`, or retrieved directly via `$container->get(TagReference::id('console.command'))`.

---

### 5.2. State Resetting for Persistent Runtimes (`StateResetter`)

In long-running workers (RoadRunner, FrankenPHP, Swoole), services kept as singletons in the DI container survive between requests. If a service accumulates per-request state (e.g. current user, breadcrumbs, collected queries), it WILL leak between users unless reset.

Yii3 provides `Yiisoft\Di\StateResetter` built directly into `Yiisoft\Di\Container`. You attach a `'reset'` callback to any service definition:

```php
<?php

declare(strict_types=1);

use App\Infrastructure\Security\CurrentUserState;

return [
    CurrentUserState::class => [
        'class' => CurrentUserState::class,
        'reset' => function (): void {
            // $this is bound to the CurrentUserState instance!
            $this->currentUser = null;
            $this->permissions = [];
        },
    ],
];
```

> [!TIP]
> **Closure Binding:** The `'reset'` callback must be a `Closure`; it is automatically bound to the service instance (`$callback->bindTo($instance, $instance::class)`). Inside the callback, `$this` refers directly to the service object, giving you direct access to reset private and protected properties without having to re-instantiate the object.
>
> **Worker loop trigger:** in worker runners (RoadRunner, FrankenPHP), the runner calls `$container->get(StateResetter::class)->reset()` after emitting the PSR-7 response, followed by `gc_collect_cycles()`.
>
> **Caveats:**
> - Resetters from definitions are applied only to services that have actually been instantiated.
> - Resetters from definitions are ignored if you override `StateResetter::class` in definitions or service providers.
> - For non-array definitions (plain class strings or closures), wrap them in a `'definition'` meta key to attach metadata:
>   `EngineInterface::class => ['definition' => EngineMarkOne::class, 'reset' => function (): void { /* ... */ }]`.

---

### 5.3. Service Providers (`ServiceProviderInterface`)

Service providers allow packages or modules to encapsulate service definitions and extensions:

```php
<?php

declare(strict_types=1);

namespace App\Infrastructure\Provider;

use App\Http\Middleware\UserActivityMiddleware;
use App\Domain\User\UserRepositoryInterface;
use App\Infrastructure\Persistence\CycleUserRepository;
use Psr\Container\ContainerInterface;
use Yiisoft\Di\ServiceProviderInterface;
use Yiisoft\Middleware\Dispatcher\MiddlewareDispatcher;

final class UserModuleServiceProvider implements ServiceProviderInterface
{
    public function getDefinitions(): array
    {
        return [
            UserRepositoryInterface::class => CycleUserRepository::class,
        ];
    }

    public function getExtensions(): array
    {
        return [
            // Extends or decorates services defined elsewhere in the container.
            // The extension callable is invoked as ($container, $service)
            // and must return the modified service (or null to keep it unchanged).
            MiddlewareDispatcher::class => static function (
                ContainerInterface $container,
                MiddlewareDispatcher $dispatcher
            ): MiddlewareDispatcher {
                return $dispatcher->withMiddlewares([
                    UserActivityMiddleware::class,
                ]);
            },
        ];
    }
}
```

`withMiddlewares(array $middlewareDefinitions)` comes from `Yiisoft\Middleware\Dispatcher\MiddlewareDispatcher` (package `yiisoft/middleware-dispatcher`) and returns a new immutable dispatcher instance.

Register service providers in your runner or `configuration.php` under `'di-providers'` / `'di-providers-web'`:
```php
<?php

declare(strict_types=1);

return [
    'config-plugin' => [
        'di-providers-web' => [
            \App\Infrastructure\Provider\UserModuleServiceProvider::class,
        ],
    ],
];
```

Note: extension keys must reference an already-registered service ID; extending a non-existent service throws `InvalidConfigException` (`Extended service "..." doesn't exist.`), and extending `ContainerInterface::class` is forbidden.

---

### 5.4. Composite Containers & Delegates

To query secondary containers (such as Symfony DependencyInjection or a sub-system container) when a service cannot be found in the primary container:

```php
<?php

declare(strict_types=1);

use Psr\Container\ContainerInterface;
use Yiisoft\Di\Container;
use Yiisoft\Di\ContainerConfig;

$config = ContainerConfig::create()
    ->withDefinitions($definitions)
    ->withDelegates([
        static function (ContainerInterface $container): ContainerInterface {
            return new ExternalCustomContainer();
        },
    ]);

$container = new Container($config);
```

Each delegate must be a `Closure` in the format `function (ContainerInterface $container): ContainerInterface`; it receives the primary container and must return a PSR-11 container, otherwise `InvalidConfigException` is thrown. Delegates are consulted only when the primary container cannot resolve a service.

---

## 6. Dynamic Invocation & Factories (`yiisoft/injector` & `yiisoft/factory`)

When you need to invoke callables or instantiate objects dynamically at runtime (outside of compile-time DI definitions), use `Injector` and `Factory`.

### 6.1. `Yiisoft\Injector\Injector`

The `Injector` analyzes callable or constructor parameter types and resolves them from a PSR-11 container, optionally combining them with runtime arguments:

```php
<?php

declare(strict_types=1);

use App\Domain\Report\ReportGenerator;
use Psr\Container\ContainerInterface;
use Psr\Log\LoggerInterface;
use Yiisoft\Injector\Injector;

/** @var ContainerInterface $container */
$injector = new Injector($container);

// 1. Invoking a callable with autowired dependencies + explicit runtime parameters
$result = $injector->invoke(
    static function (string $period, LoggerInterface $logger): array {
        $logger->info("Generating report for $period");
        return ['period' => $period, 'data' => []];
    },
    ['period' => '2026-Q1'] // $logger is autowired from $container!
);

// 2. Instantiating an object dynamically with container autowiring (Enhanced new)
$generator = $injector->make(ReportGenerator::class, [
    'exportFormat' => 'pdf',
]);
```

Signatures: `Injector::__construct(?ContainerInterface $container = null)`, `invoke(callable $callable, array $arguments = [])`, `make(string $class, array $arguments = []): object`. Arguments may be passed positionally or by name. Scalar parameters must either have defaults or be provided in `$arguments` — otherwise `Yiisoft\Injector\MissingRequiredArgumentException` is thrown.

> [!NOTE]
> **Difference Between `Container::get()` and `Injector::make()`:**
> - `$container->get(Service::class)` returns the registered shared (singleton) service definition — the same instance on every call.
> - `$injector->make(Class::class, ['arg' => $val])` creates a **new instance** every time, autowiring type-hinted constructor parameters and merging in runtime arguments.

---

### 6.2. `Yiisoft\Factory\Factory` & `StrictFactory`

`Yiisoft\Factory\Factory` creates objects based on definition arrays, class names, or callables, falling back to a PSR-11 container:

```php
<?php

declare(strict_types=1);

use App\Infrastructure\Database\CustomConnection;
use Psr\Container\ContainerInterface;
use Yiisoft\Factory\Factory;

/** @var ContainerInterface $container */
$factory = new Factory($container);

// Dynamically create an object from an array definition at runtime
$connection = $factory->create([
    'class' => CustomConnection::class,
    '__construct()' => [
        'dsn' => 'sqlite::memory:',
    ],
    'setTimeout()' => [60],
]);
```

Signature: `Factory::__construct(?ContainerInterface $container = null, array $definitions = [], bool $validate = true)`.
**The second argument is a map of pre-registered definitions (service ID => definition), NOT a list of default option values.** Passing an arbitrary array such as `['defaultTimeout' => 30]` fails validation with `InvalidConfigException` (`Invalid definition: 30`). Pre-registered definitions are merged with same-class definitions passed to `create()`.

`Yiisoft\Factory\StrictFactory` creates objects **only** from pre-registered definitions and has a different constructor argument order:

```php
<?php

declare(strict_types=1);

use App\Infrastructure\Database\CustomConnection;
use Psr\Container\ContainerInterface;
use Yiisoft\Factory\StrictFactory;

/** @var ContainerInterface $container */
$factory = new StrictFactory(
    definitions: [
        CustomConnection::class => [
            'class' => CustomConnection::class,
            '__construct()' => [
                'dsn' => 'sqlite::memory:',
            ],
        ],
    ],
    container: $container,
);

// Only IDs with registered definitions resolve; everything else throws NotFoundException
$connection = $factory->create(CustomConnection::class);
```

Signature: `StrictFactory::__construct(array $definitions, ?ContainerInterface $container = null, bool $validate = true)` (definitions come **first**), `create(string $id)`, `has(string $id): bool`. Unlike `Factory`, `StrictFactory::create()` accepts only a registered ID — class names or inline definition arrays throw `NotFoundException`.

---

## 7. Hidden Pitfalls & Execution Realities

### 7.1. Array Definition Property Syntax Error
- **Pitfall:** Writing `'timeout' => 30` or `'apiKey' => 'xyz'` directly in an array definition.
- **Consequence:** In the DI container flow, unknown keys are treated as metadata and rejected by `Yiisoft\Di\Container::validateMeta()` with `InvalidConfigException`:
  `Invalid definition: metadata "timeout" is not allowed. Did you mean "timeout()" or "$timeout"?`
  (In `Factory`/`DynamicReference` flows, `DefinitionValidator` instead reports: `Invalid definition: key "timeout" is not allowed. Did you mean "$timeout"?`.)
- **Solution:** Public properties MUST be prefixed with `$` (`'$timeout' => 30`). Setter methods MUST end with `()` (`'setTimeout()' => [30]`). Constructor arguments MUST be inside `'__construct()' => [...]`.

### 7.2. Using `'__class'` Instead of `'class'`
- **Pitfall:** Using `'__class' => MyService::class` (early prototype syntax).
- **Consequence:** `InvalidConfigException: Invalid definition: metadata "__class" is not allowed. Did you mean "__class()" or "$__class"?` (container flow; `DefinitionValidator` flow: `Invalid definition: key "__class" is not allowed. ...`).
- **Solution:** Always use `'class' => MyService::class` (`ArrayDefinition::CLASS_NAME`).

### 7.3. Unresolved Path Aliases
- **Pitfall:** Passing `'@runtime/cache'` or `'@views'` as a raw string into constructor arguments.
- **Consequence:** The service receives the literal string `"@runtime/cache"` without translation to an absolute filesystem path.
- **Solution:** Wrap alias strings in `Yiisoft\Aliases\AliasReference::to('@runtime/cache')` or inject `Yiisoft\Aliases\Aliases` into the service constructor and call `$aliases->get('@runtime/cache')`. Define the aliases themselves in `config/common/aliases.php`.

### 7.4. Modifying Container at Runtime
- **Pitfall:** Trying to call `$container->set(MyService::class, ...)` or registering definitions in controller actions.
- **Consequence:** `Yiisoft\Di\Container` has NO `set()` method. Definitions are parsed and stored once in the container constructor and cannot be added afterwards.
- **Solution:** Register all definitions in `config/*/di/*.php` or use `Factory` / `Injector` for dynamic runtime creation.

### 7.5. Persistent Worker Memory Leakage
- **Pitfall:** Storing per-request state (user ID, session tokens, tenant identifiers) in singleton service properties without reset logic in RoadRunner / FrankenPHP.
- **Consequence:** User A's credentials or tenant data leak into User B's subsequent HTTP request.
- **Solution:** Add `'reset' => function (): void { $this->state = null; }` to stateful service definitions, or inject request-scoped DTOs into action methods rather than storing them in services.

### 7.6. PHP 8 Named Arguments — Exact Parameter Names
- **Pitfall:** Passing wrong parameter names in named arguments:
  `TagReference::to(id: 'my-tag')` instead of `TagReference::to(tag: 'my-tag')`.
- **Consequence:** Fatal Error: `Unknown named parameter $id`.
- **Solution:** Verify exact parameter names in `vendor/yiisoft/<package>/src/`. Verified list:
  - `TagReference::to(string $tag)` — `Yiisoft\Di\Reference\TagReference`
  - `Reference::to(mixed $id)` — `Yiisoft\Definitions\Reference`
  - `Reference::optional(mixed $id)` — `Yiisoft\Definitions\Reference`
  - `AliasReference::to(mixed $id)` — `Yiisoft\Aliases\AliasReference`
  - `ReferencesArray::from(array $ids)` / `DynamicReferencesArray::from(array $definitions)` — `Yiisoft\Definitions`
  - `DynamicReference::to(mixed $id)` — `Yiisoft\Definitions\DynamicReference`
  - `ValueDefinition::__construct(mixed $value, ?string $type = null)` — `Yiisoft\Definitions\ValueDefinition`
  - `Injector::make(string $class, array $arguments = [])`
  - `Injector::invoke(callable $callable, array $arguments = [])`
  - `Config::__construct(ConfigPaths $paths, ?string $environment = null, array $modifiers = [], ?string $paramsGroup = 'params', string $mergePlanFile = '.merge-plan.php')`

### 7.7. Missing Scalar Arguments for `Injector`
- **Pitfall:** Invoking a callable or class with untyped/scalar parameters that have no default values and are not provided in the `$arguments` array.
- **Consequence:** `Yiisoft\Injector\MissingRequiredArgumentException`.
- **Solution:** Provide named arguments explicitly: `$injector->invoke($callable, ['period' => '2026-Q1'])`, or give scalar constructor parameters sensible defaults.

### 7.8. Overriding `StateResetter` Kills Definition Resetters
- **Pitfall:** Defining `StateResetter::class` in definitions or service providers while also using `'reset'` metadata on service definitions.
- **Consequence:** Resetters registered via `'reset'` metadata are silently ignored; per-request state stops being cleared.
- **Solution:** Use either definition-level `'reset'` callbacks OR a manually configured `StateResetter` — never both.

---

## 8. Anti-Pattern Matrix: DI & Configuration

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| ❌ **`Yii::$app->service` or `Yii::$container->get(...)`** | Yii3 completely eliminated global static facades and `Yii::$app`. Static service locators destroy testability and cause concurrency bugs. | ✅ Inject dependencies explicitly via constructor property promotion in `__construct()`. |
| ❌ **Injecting `ContainerInterface` into Services to fetch dependencies** | Anti-pattern: turns the service into a Service Locator, hides dependencies, couples code to container implementation. | ✅ Declare required interfaces directly in `__construct()`. Let autowiring resolve them. |
| ❌ **Editing `config/.merge-plan.php` manually** | `.merge-plan.php` is auto-generated by the Composer plugin. Any manual changes are wiped on the next rebuild. | ✅ Put definitions in `config/common/di/`, `config/web/di/`, or `config/configuration.php` and run `composer yii-config-rebuild`. |
| ❌ **Using `'__class' => Service::class` in definitions** | Deprecated early syntax. Rejected as unknown metadata/definition key. | ✅ Use `'class' => Service::class` (`ArrayDefinition::CLASS_NAME`). |
| ❌ **Configuring properties without `$` (e.g. `'timeout' => 30`)** | Unknown keys are parsed as definition metadata and rejected: `Invalid definition: metadata "timeout" is not allowed. Did you mean "timeout()" or "$timeout"?` | ✅ Write `'$timeout' => 30` for public properties or `'setTimeout()' => [30]` for setter methods. |
| ❌ **Passing raw alias `'@runtime/logs'` to constructor** | In Yii3, DI definitions do not automatically parse `@` string prefixes into paths. | ✅ Use `\Yiisoft\Aliases\AliasReference::to('@runtime/logs')` or inject `Yiisoft\Aliases\Aliases`. |
| ❌ **Calling `$container->set(...)` at runtime** | `Yiisoft\Di\Container` is an immutable PSR-11 container; it has no `set()` method. | ✅ Declare all definitions in configuration arrays, or use `Yiisoft\Factory\Factory` / `Injector` for runtime instantiation. |
| ❌ **Storing closures or service objects in `params.php`** | Parameters are merged across packages, environments, and DI files; closures hide service wiring in parameter files, resist environment overrides, and cannot be introspected. | ✅ Put service definitions and factory closures in `config/*/di/*.php`, never in `params.php`. |
| ❌ **Leaving stateful singletons without `'reset'` in workers** | In persistent worker mode (RoadRunner, FrankenPHP, Swoole), singleton properties persist across HTTP requests, leaking user data. | ✅ Add `'reset' => function (): void { $this->resetInternalState(); }` to the service definition. |
| ❌ **Defining `StateResetter::class` while also using `'reset'` metadata** | Definition-level resetters are silently ignored when `StateResetter` is overridden in definitions or providers. | ✅ Choose one mechanism: definition-level `'reset'` callbacks or a manually configured `StateResetter`. |
| ❌ **Passing default option values as the second `Factory` constructor argument** | `Factory::__construct(?ContainerInterface $container = null, array $definitions = [], ...)` expects a definitions map; arbitrary scalar arrays fail `DefinitionValidator`. | ✅ Pass real definitions (`['service-id' => [...definition...]]`) or omit the argument; use `create()` for per-call configuration. |
| ❌ **Using `StrictFactory::create()` with a class name or inline array** | `StrictFactory` resolves only pre-registered definition IDs; anything else throws `NotFoundException`. | ✅ Register a definition for the ID first, or use `Factory` / `Injector::make()` for ad-hoc creation. |
| ❌ **Circular dependencies (`ServiceA` -> `ServiceB` -> `ServiceA`)** | Causes `Yiisoft\Definitions\Exception\CircularReferenceException` during container resolution. | ✅ Refactor using domain events (PSR-14), dedicated use cases, or extract an intermediate interface/provider. |
| ❌ **Using `new Service()` inside Actions or Domain classes** | Bypasses DI container, prevents mocking in unit tests, couples high-level modules to concrete low-level classes. | ✅ Inject interface in action/service constructor and let DI instantiate it. |
| ❌ **Hardcoding credentials in DI definition files** | Leaks secrets into version control and breaks multi-environment deployments. | ✅ Put secrets in `.env`, read via `params.php` (`$_ENV['SECRET']`), and inject via `$params['key']`. |
| ❌ **Using `$_GET` or `$_POST` inside DI definitions** | Superglobals break CLI runners, queue workers, tests, and persistent HTTP runtimes. | ✅ Read parameters from `$params` or inject PSR-7 `ServerRequestInterface` / `CurrentRoute` at the presentation layer. |
| ❌ **Specifying `environment` as `?environments/{$environment}/di.php`** | `yiisoft/config` does not evaluate `{$environment}` strings in group paths. | ✅ Use `config-plugin-environments` in `composer.json` or `config/configuration.php`. |

### 8.1. Automated Verification with `check-di-syntax.php`

To catch configuration typos, invalid keys, unmapped interface bindings, and closure violations before booting the application or running tests, execute the deterministic static checker from the skill package directory:

```bash
php scripts/check-di-syntax.php [path-to-project]
```

- **Checks:** syntax errors in `config/**/di/*.php` and `params.php`, Yii 2 legacy keys (`'__class'`), constructor typos (`'__construct'`), missing `()` on method calls, missing `$` on properties, self-referencing and unbound interfaces.
- **CI / Agent Automation:** Use `--format=json` for machine-readable JSON output and automated quality gates in AI Factory verification loops.

---

## 9. Related Topic Guides

- [Runners & Runtimes Guide](runners-and-runtimes.md) — Application runner architecture, `HttpApplicationRunner`, `ConsoleApplicationRunner`, and RoadRunner/FrankenPHP workers with `StateResetter`.
- [Events & Listeners Guide](events-and-listeners.md) — PSR-14 event mapping and listener registration in config groups.
- [Conventions Guide](conventions.md) — Architectural invariants, configuration directories, and SSOT verification rule.
