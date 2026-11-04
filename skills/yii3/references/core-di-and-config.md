# Yii3 Dependency Injection & Configuration Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

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
   - The primary container (`Yiisoft\Di\Container`) is a `final` class that strictly implements `Psr\Container\ContainerInterface` (PSR-11, package `psr/container`).
   - Services are registered declaratively in configuration files and resolved automatically via constructor autowiring.
   - Two services are pre-registered out of the box: the container itself under `Psr\Container\ContainerInterface::class` and `Yiisoft\Di\StateResetter` under its own class name.
   - Caching and events integrate through PSR-16 / PSR-14 interfaces bound by `yiisoft/cache` (see [4.3](#43-service-references-referenceto-and-referenceoptional)) and `yiisoft/yii-event` (see 2.3).
2. **Strict Anti-Service-Locator Rule:**
   - Classes must NEVER inject `Psr\Container\ContainerInterface` to fetch their own dependencies dynamically. This hides dependencies, introduces tight coupling to container internals, and breaks unit testing.
   - All class dependencies MUST be explicitly declared in `__construct()` via constructor property promotion and typed interfaces.
3. **Zero Static Facades & Zero Global State:**
   - Global static state (`Yii::$app`, `Yii::$container`) does not exist in Yii3. Everything is an instantiable, testable, stateless or state-managed object.
4. **Immutable Container Lifecycle:**
   - Unlike Yii2 (`Yii::$container->set(...)`), `Yiisoft\Di\Container` exposes no public mutation API: there is no `set()` method, and definitions are parsed, validated, and stored once when the container is constructed. You cannot register new definitions afterwards.
5. **Worker-Ready State Management:**
   - Persistent PHP runtimes (RoadRunner, FrankenPHP; Swoole is cited in the docs as motivation) keep container instances alive across multiple HTTP requests. Stateful services must implement explicit reset logic via `StateResetter` callbacks. The worker runners ship as `yiisoft/yii-runner-roadrunner` and `yiisoft/yii-runner-frankenphp` (see 5.2).
6. **Separation of Configuration and Logic:**
   - Service wiring, constructor arguments, and environment settings are declared in configuration files returning PHP arrays. Domain and application code remain completely decoupled from framework wiring.

---

## 2. Configuration Architecture & Scopes (`yiisoft/config`)

`yiisoft/config` manages modular configurations distributed across Composer packages and your application. It consists of two distinct components:
- **Composer Plugin (`yiisoft/config`):** Listens to Composer command events and rebuilds the merge plan into `config/.merge-plan.php` on `composer install` / `composer update` (hence also after `composer require` / `composer remove`) and on explicit `composer dump-autoload`; it can also be rebuilt manually via `composer yii-config-rebuild`. Auxiliary commands: `composer yii-config-copy <package> [target] [files...]` (copies a package's config files with prefixed filenames) and `composer yii-config-info [package]` (inspects registered packages and groups). The plugin crawls all configured packages and builds a cached dependency merge plan.
- **Runtime Config Loader (`Yiisoft\Config\Config`):** Reads the merge plan at application startup and builds merged configuration arrays for the requested scope.

### 2.1. The Configuration Layer Hierarchy

Configurations are merged in a strict order of precedence (later layers override earlier ones):
1. **Vendor Default Layer:** Config files shipped by installed packages. Each package declares them in its `composer.json` `extra`; by convention they live in the package's `config/` directory, installed under `vendor/<vendor>/<package>/config/`. Within the vendor layer, packages merge in dependency order — a dependency's config merges before its dependent's.
2. **Vendor Override Layer (`vendor-override-layer`):** Optional sublayer between the vendor and application layers, defined under `"extra": {"config-plugin-options": {"vendor-override-layer": [...]}}` in the application `composer.json`. Packages listed there (by name, or as `yiisoft/strings` wildcard patterns) move entirely into the override sublayer. The override applies per key within a group — not as whole-group replacement — and the application layer still wins on top.
3. **Application Root Layer:** Declared in `config/` of your root project. Overrides vendor defaults.
4. **Environment Layer (`config-plugin-environments`):** Environment-specific overrides (e.g. `dev`, `test`, `prod`) that merge on top of application and vendor configs. Environments are application-level only — vendor packages never declare them.

> [!CAUTION]
> Duplicate keys within the *same* layer are strictly forbidden and throw an `ErrorException`
> (`Duplicate key "..." in the following configs while building "..." group: ...`). Overrides are only permitted across distinct layers — cross-layer duplicates are allowed and the later layer wins. Same-layer duplicates remain fatal even under the `ReverseMerge` modifier.

> [!NOTE]
> **Default merge semantics:** values are replaced by string key; integer-keyed arrays are appended; nested arrays are *not* merged recursively unless the group is covered by the `RecursiveMerge` modifier (see 2.5).

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

The generated `.merge-plan.php` begins with the header comment `// Do not edit. Content will be replaced.` and is rewritten whenever its content changes — manual edits never survive the next rebuild.

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
        // Container delegates and providers
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
        // App\Environment is a final class with string constants —
        // DEV = 'dev', TEST = 'test', PROD = 'prod' (not an enum).
        // Plain-string keys ('dev', 'test', 'prod') are equally valid.
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

The map above is the complete `yiisoft/app` set — **19 groups**. There is deliberately **no `di-tags*` group**: tagging is a DI feature (`'tags'` metadata on definitions, `ContainerConfig::withTags()` — see 5.1), not a configuration group. Group names are plain array keys — arbitrary names are legal.

`config-plugin-options` — the complete option list:

| Option | Type / Default | Meaning |
|---|---|---|
| `source-directory` | string, `''` | Directory holding the config files, relative to the `composer.json` owning the options. Default: the package/composer.json directory itself. |
| `merge-plan-file` | string, `.merge-plan.php` | Custom merge-plan path, relative to the source directory. If changed, mirror it in the fifth `Config` constructor argument (see 2.5). |
| `build-merge-plan` | bool, `true` | `false` disables merge-plan generation (used by packages under development). |
| `vendor-override-layer` | string or string[] | Package names (or `yiisoft/strings` wildcard patterns) moved into the override sublayer (see 2.1). Duplicate keys *within the sublayer* are fatal. |
| `package-types` | string[], `['library', 'composer-plugin']` | Composer package types the plugin scans. A package with a custom `type` must be listed here for its configuration to be picked up. |

**Package-side configuration.** Packages participate through their own `composer.json` `extra`: a `config-plugin` map (group => files), `config-plugin-options`, or a `config-plugin-file` pointing to a PHP map with the same schema as above (when `config-plugin-file` is set, inline `config-plugin*` extras are ignored). The plugin scans every installed package of the configured `package-types` and merges their groups into the merge plan.

> [!NOTE]
> **The `events*` groups are consumed by `yiisoft/yii-event`.** The package's params key selects the active group — `'yiisoft/yii-event' => ['eventsConfigGroup' => 'events-web']` (or `'events-console'`) — and its own DI wiring loads that group through the `$config` local variable (see [3.1](#31-rules-for-parameters)): `ListenerCollection::class => static fn (Factory $factory) => $factory->create($config->get($params['yiisoft/yii-event']['eventsConfigGroup']))`. Event names inside an events group must be event class names — no wildcards. The shipped PSR-14 DI bindings and the empty-group availability guarantees are owned by the [Events & Listeners Guide](core-events-and-listeners.md), sections 1 and 4.1.

### 2.4. File Syntax Markers in Config Groups

- **`?` (Optional File):** If the file does not exist, it is silently skipped instead of throwing an exception:
  `'?common/params-local.php'`. A missing file *not* marked with `?` throws `The "<path>" file does not found.`
- **`*` (Wildcard Directory Match):** Single-level glob over the directory — `'common/di/*.php'` (there is no `**` recursion). Zero matches are silently skipped. Wildcards are evaluated both at plugin time and at runtime, and paths may escape the source directory with `../`. Configs packaged inside PHAR archives break wildcard collection — list such files explicitly.
- **`$` (Group Reference):** Imports and merges all contents of another named config group:
  `'$di'` or `'$params'`. A variable must not reference the group it is declared inside — self-reference throws `The variable "%s" must not be located inside the "%s" config group.` A reference to an undeclared group throws `The "<group>" configuration group does not exist.`, so a group consumed only via `$` must still be declared somewhere — even as `[]`.

---

### 2.5. Booting the Application: Runners and `Config`

Application templates do NOT construct `Config` manually. Entrypoints (`public/index.php`, `./yii`) instantiate runners — `Yiisoft\Yii\Runner\Http\HttpApplicationRunner` or `Yiisoft\Yii\Runner\Console\ConsoleApplicationRunner` — which create `Config` and the DI container lazily. The entry point constructs `HttpApplicationRunner` with `environment` (an ordinary `?string` constructor parameter — the template's `App\Environment::appEnv()` resolves it) and `temporaryErrorHandler` (the bootstrap error handler used while configuration and the container are still being compiled) — both passed before the container exists.

> [!TIP]
> **Runners & Runtimes Reference:**
> For the complete reference on the `public/index.php` entry point, full `HttpApplicationRunner` construction (including environment detection), and two-phase temporary error handling, see the [Runners & Runtimes Guide, §2.1–§2.2](infra-runners-and-runtimes.md#21-publicindexphp-entry-point--cli-server-bypass).

The HTTP runner defaults to the groups `bootstrap-web`, `events-web`, `di-web`, `di-providers-web`, `di-delegates-web`, `di-tags-web`, `params-web`, plus `nestedParamsGroups: ['params']` and `nestedEventsGroups: ['events']`; the console runner defaults to the `-console` counterparts (`di-console`, `params-console`, ...). Every group is consulted only when it actually exists (a `has()` check) — the `yiisoft/app` template defines no `di-tags*` group (see 2.3).

Under the hood (`Yiisoft\Yii\Runner\ApplicationRunner::createDefaultConfig()`), the runner constructs `Config` like this:

```php
<?php

declare(strict_types=1);

use Yiisoft\Config\Config;
use Yiisoft\Config\ConfigPaths;
use Yiisoft\Config\Modifier\RecursiveMerge;
use Yiisoft\Config\Modifier\ReverseMerge;

$rootPath = dirname(__DIR__);
$environment = null; // the runner's `environment` constructor argument (?string, defaults to null)

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

For the HTTP defaults shown, this is exactly what `createDefaultConfig()` builds (it also passes the merge-plan file as the fifth argument and hands `ConfigPaths` the vendor directory, which defaults to `'vendor'`). User-supplied `configModifiers` are appended **after** the built-in modifiers.

**Merge modifiers.** The modifier APIs are variadic: `ReverseMerge::groups(string ...$groups)`, `RecursiveMerge::groups(string ...$groups)`, and `RecursiveMerge::groupsWithDepth(array $groups, ?int $depth)` for a custom recursion depth per group.

> [!WARNING]
> Some older documentation shows `RecursiveMerge::groups(['params-web', 'params'], 1)`. That form is **invalid** against the current variadic API and fails at runtime — use `RecursiveMerge::groupsWithDepth(['params-web', 'params'], 1)` instead.

Full constructor signature (`Yiisoft\Config\Config`):
`__construct(ConfigPaths $paths, ?string $environment = null, array $modifiers = [], ?string $paramsGroup = 'params', string $mergePlanFile = '.merge-plan.php')`.
`Yiisoft\Config\ConfigPaths::__construct(string $rootPath, ?string $configDirectory = null, ?string $vendorDirectory = null)`.

`Config` exposes `get(string $group): array` and `has(string $group): bool`. `get()` on an unknown group throws `ErrorException` (`The "<group>" configuration group does not exist.`); `has()` never throws. An unknown environment throws in the constructor: `The "<env>" configuration environment does not exist.` The default environment is the literal `'/'`. Runners additionally expose immutable overrides — `$runner = $runner->withConfig($config);` and `$runner = $runner->withContainer($container);` (both return `static`; reassign the result).

---

## 3. Parameter Management (`params.php`)

Parameters are primitive values (strings, integers, floats, booleans, arrays) consumed by service definitions.

### 3.1. Rules for Parameters
1. **Primitives Only (convention):** Keep parameters primitive — scalars and plain arrays; class-string values (`Formatter::class`) are acceptable and idiomatic. Do not put closures, anonymous functions, or instantiated service objects in `params.php`: parameters are merged across packages and environments, shared with DI files, and should remain introspectable and overridable. Factories belong in `config/*/di/*.php`, not in params. Vendor-defined keys that carry *definitions* or immutable value objects are the documented exceptions: `yiisoft/queue`'s `middlewares-push` / `middlewares-consume` / `middlewares-fail` (fed into middleware dispatcher constructors, closures allowed) and the `yiisoft/db-<driver>` `dsn` (a `Dsn` value object, see 4.9).
2. **Package Namespacing:** Always namespace third-party package configuration under the vendor/package key (e.g. `'yiisoft/view'`, `'yiisoft/yii-view-renderer'`) — every vendor package ships its params under its own composer name. The application layer overrides package defaults for the same string key (later layers win, see 2.1).
3. **Environment Separation:** Read sensitive secrets or deployment-specific values from `$_ENV`. In the `yiisoft/app` template, `.env` loading is a **dev convenience only**: `vlucas/phpdotenv` is a `require-dev` dependency loaded through a guarded `Dotenv::createImmutable(...)->safeLoad()`. Production values come from the server/container environment — do not treat `.env` files as a production secrets mechanism.
4. **Local Scope Variables:** When `Config` builds a configuration file, it evaluates the file with two variables available in the local scope: `$params` (the merged parameters group, e.g. `params-web`; an empty array if no params group is configured) and `$config` (the `Yiisoft\Config\Config` instance itself, usable for `$config->has(...)` / `$config->get(...)` of other groups).
   **Exception — params files see NEITHER variable.** Files belonging to the params group itself are evaluated without `$params` and without `$config` (a params file cannot read its own group). DI, events, routes, and bootstrap files get both — `yiisoft/yii-event`'s DI wiring, for example, calls `$config->get(...)` (see 2.3).

### 3.2. Example Parameter Configuration (`config/common/params.php`)

The `app` and `mailer` blocks are illustrative application parameters; the two `yiisoft/*` blocks show real package parameter schemas.

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
    // Package defaults (vendor/yiisoft/yii-view-renderer/config/params.php) are all null / [].
    // The `layout` value below is the yiisoft/app template's.
    'yiisoft/yii-view-renderer' => [
        'viewPath' => null,
        'layout' => '@src/Web/Shared/Layout/Main/layout.php',
        'injections' => [],
    ],
    // Package default (vendor/yiisoft/data-response/config/params.php) —
    // the three formatter classes are @deprecated, see the note below.
    'yiisoft/data-response' => [
        'contentFormatters' => [
            'text/html' => HtmlDataResponseFormatter::class,
            'application/xml' => XmlDataResponseFormatter::class,
            'application/json' => JsonDataResponseFormatter::class,
        ],
    ],
];
```

> [!NOTE]
> **`yiisoft/yii-view-renderer` schema:** the package default is `['viewPath' => null, 'layout' => null, 'injections' => []]`. `viewPath: null` disables relative view paths (reading the view path then throws `The view path is not set.`); `layout: null` means no layout. The template also fills `injections` (e.g. `Reference::to(CsrfViewInjection::class)`). View-domain coverage of this schema (renderers, layout injections) belongs to the [Views & Widgets Guide](http-views-and-widgets.md); the Twig engine variant is owned by the [Twig Template Engine Guide](http-views-twig.md).
>
> **Deprecated API note:** the three `Yiisoft\DataResponse\Formatter\*DataResponseFormatter` classes and `Yiisoft\DataResponse\Middleware\ContentNegotiator` are `@deprecated`. The replacement is `DataStream` together with `Yiisoft\DataResponse\Formatter\HtmlFormatter` / `JsonFormatter` / `XmlFormatter` and the `ContentNegotiatorDataResponseMiddleware` middleware. They remain the package's shipped defaults, so the block above keeps working as-is.

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

A bare concrete class-string used as a definition instructs the container to instantiate that class; strings that are *not* existing classes (interfaces, aliases) are treated as references to container IDs. The container caches instances per service ID — if the same concrete class is reachable under two IDs (its own name via autowiring *and* an interface binding), each ID resolves its own instance. Use `Reference::to(ConcreteClass::class)` in another definition to point at a specific ID's instance rather than creating a duplicate.

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
> 5. **Positional and named arguments must not be mixed:** within one `'__construct()'` (or method-args) array, use either int-keyed (positional) or string-keyed (named) values — mixing throws `Arguments indexed both by name and by position are not allowed in the same array.`
> 6. **Error Messages differ by flow.** Inside the DI container, unknown keys of an array definition are parsed as *metadata* (only `tags` and `reset` are allowed) and throw from `Yiisoft\Di\Container::validateMeta()`:
>    `Invalid definition: metadata "timeout" is not allowed. Did you mean "timeout()" or "$timeout"?`
>    In flows that validate the raw array directly (`Yiisoft\Factory\Factory`, `DynamicReference`), `DefinitionValidator` throws:
>    `Invalid definition: key "timeout" is not allowed. Did you mean "$timeout"?` — with a single suggestion (`"$timeout"` for an existing public property, `"timeout()"` for an existing public method).

> [!NOTE]
> **Repeated method calls:** a method-call key must contain exactly one `()`; to call the same method several times, append a unique numeric suffix — `'add()' => [2]`, `'add()2' => [3]`.
> **Method-call autowiring:** method-call arguments are autowired like constructor arguments — only explicitly provided arguments are overridden; entries apply in configuration order, and a fluent setter returning the same class replaces the object.
> **Definition objects in arguments:** only `ReferenceInterface` objects (`Reference::to(...)`, `TagReference::to(...)`) are accepted as definition objects — anything else (e.g. `new ValueDefinition(...)`) throws `Only references are allowed in constructor arguments, a definition object was provided: ...` (see 4.8).
> **Readonly properties** (and PHP 8.4 private-set/protected-set) cannot be targeted by `'$property'` injection — `Invalid definition: property "..." must be public and writable.`

---

### 4.3. Service References (`Reference::to` and `Reference::optional`)

Use `Yiisoft\Definitions\Reference` to point to another service in the container without instantiating it eagerly. The example below shows the canonical `yiisoft/cache` wiring (the package ships exactly these bindings in `vendor/yiisoft/cache/config/di.php`):

```php
<?php

declare(strict_types=1);

use App\Domain\Audit\AuditLoggerInterface;
use App\Domain\Service\NotificationService;
use Psr\SimpleCache\CacheInterface;
use Yiisoft\Cache\ArrayCache;
use Yiisoft\Cache\Cache;
use Yiisoft\Cache\CacheInterface as YiisoftCacheInterface;
use Yiisoft\Definitions\Reference;

/** @var array $params */

return [
    // PSR-16 storage — ArrayCache is the in-memory default shipped by yiisoft/cache
    CacheInterface::class => ArrayCache::class,

    // Stampede-safe getOrSet() wrapper; autowires the PSR-16 binding above
    YiisoftCacheInterface::class => Cache::class,

    // Optional reference: resolves to null if AuditLoggerInterface is not bound
    'myService' => [
        'class' => NotificationService::class,
        '__construct()' => [
            'auditLogger' => Reference::optional(AuditLoggerInterface::class),
        ],
    ],
];
```

Signatures: `Reference::to(mixed $id)` and `Reference::optional(mixed $id)`. The `Reference ID must be string.` check (`InvalidConfigException`) fires **eagerly at `to()` / `optional()` call time** — i.e. when the definition file is loaded — not during service resolution. `Reference::optional(...)` resolves to `null` when the referenced ID is not bound in the container.

> [!NOTE]
> **`yiisoft/cache` ships no persistent backends.** Redis, file, DB, APCu, etc. are separate packages (`yiisoft/cache-redis`, `yiisoft/cache-file`, ...). To use Redis, run `composer require yiisoft/cache-redis` and bind `Psr\SimpleCache\CacheInterface` to that package's PSR-16 implementation (check `vendor/yiisoft/cache-redis/src/` for the exact class name).

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

> [!WARNING]
> **Deprecated API:** `Yiisoft\DataResponse\Middleware\ContentNegotiator` is `@deprecated` — the replacement is `Yiisoft\DataResponse\Middleware\ContentNegotiatorDataResponseMiddleware` (see 3.2). The example is kept because the package itself still ships and consumes these defaults: its own DI wiring builds the formatter map with `DynamicReferencesArray::from(...)`.

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

> [!CAUTION]
> **Inline resolution nuance:** only arrays, callables, and concrete class-strings are resolved truly inline. A string passed to `DynamicReference::to()` that is *not* an existing class (an interface or alias ID) degenerates into a normal container-ID lookup.

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

Signature: `AliasReference::to(mixed $id)`. The `Alias must be a string.` check (`InvalidArgumentException`) fires **eagerly at `to()` call time** — no container is needed to trigger it. The alias *path* resolution is lazy: at dependent-service creation it fetches `Yiisoft\Aliases\Aliases` from the container and returns `$aliases->get($alias)` (a resolved absolute path string). Aliases themselves are defined in `config/common/aliases.php`, required into the `'yiisoft/aliases'` params, and consumed by the `Aliases` service.

Useful `Aliases` API: `get(string $alias): string` (non-`@` strings are returned unchanged; an unresolved root throws `InvalidArgumentException` with `Invalid path alias: $alias`; chained alias values resolve recursively; a more-specific root wins), `set(string $alias, string $path): void`, `remove(string $alias)`, `getArray(array $aliases): array` for bulk lookups, and `getAll(): array` — which takes **no** arguments (older documentation showing `getAll([...])` is stale; do not copy it).

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

Notes: closures are represented by `Yiisoft\Definitions\CallableDefinition` — there is no separate `ClosureDefinition` class. The `yiisoft/definitions` package requires PHP 8.1+.

---

### 4.8. Raw Values under an Identifier

If you need the container to return an array or scalar directly under an identifier (instead of treating it as an array definition), use a **closure factory**:

```php
<?php

declare(strict_types=1);

return [
    'app.allowed_locales' => static fn (): array => ['en', 'de', 'fr', 'es'],
];
```

The closure is a `CallableDefinition`; the container invokes it and shares the result as a singleton. Its body may also declare type-hinted arguments, which are autowired like any other closure (see 4.7).

> [!WARNING]
> Do **not** write `'app.allowed_locales' => new ValueDefinition([...])`. Definition objects are rejected as definition values: validation accepts only `ReferenceInterface` objects (`Reference::to(...)`, `TagReference::to(...)`) where a definition object is expected, so this throws `InvalidConfigException` at container construction — and with `validate(false)` it still fails at resolution.
>
> Ready **objects** passed as definition values need no wrapper at all: they are automatically wrapped into `Yiisoft\Definitions\ValueDefinition` and returned as-is. `ValueDefinition::__construct(mixed $value, ?string $type = null)` exists (the value is returned as-is on resolution), but it is an internal building block — not a config-facing recipe.

---

### 4.9. Database Connection Recipe (`yiisoft/db` 2.x)

`yiisoft/db` requires a driver package at the Composer level (the virtual package `yiisoft/db-implementation` is provided by `yiisoft/db-mysql`, `yiisoft/db-sqlite`, `yiisoft/db-pgsql`, `yiisoft/db-mssql`, `yiisoft/db-oracle` — pick exactly one). The design is driver-first: credentials live on the Driver object, and the Connection wraps it. The shape below mirrors the official recipe from the `yiisoft/db` docs — the driver's `Dsn` value object lives in params, and the DI file only wires `Driver` + `Connection`.

`config/common/params.php`:

```php
<?php

declare(strict_types=1);

use Yiisoft\Db\Mysql\Dsn;

return [
    'yiisoft/db-mysql' => [
        'dsn' => new Dsn(
            'mysql',
            (string) ($_ENV['DB_HOST'] ?? '127.0.0.1'),
            (string) ($_ENV['DB_NAME'] ?? 'yiitest'),
            (string) ($_ENV['DB_PORT'] ?? '3306'),
            ['charset' => 'utf8mb4'],
        ),
        'username' => (string) ($_ENV['DB_USERNAME'] ?? ''),
        'password' => (string) ($_ENV['DB_PASSWORD'] ?? ''),
    ],
];
```

`config/common/di/db-mysql.php` (picked up by the `'di' => 'common/di/*.php'` wildcard):

```php
<?php

declare(strict_types=1);

use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Mysql\Connection;
use Yiisoft\Db\Mysql\Driver;

/** @var array $params */

return [
    ConnectionInterface::class => [
        'class' => Connection::class,
        '__construct()' => [
            'driver' => new Driver(
                $params['yiisoft/db-mysql']['dsn'],
                $params['yiisoft/db-mysql']['username'],
                $params['yiisoft/db-mysql']['password'],
            ),
        ],
    ],
];
```

> [!NOTE]
> - Signatures shown target `yiisoft/db` **2.x** (`AbstractPdoDriver::__construct(string|Stringable $dsn, string $username = '', string $password = '', array $attributes = [])`; `AbstractPdoConnection::__construct(PdoDriverInterface $driver, SchemaCache $schemaCache = new SchemaCache(), ?ColumnFactoryInterface $columnFactory = null)`). Always verify the exact classes in `vendor/yiisoft/db-<driver>/src/`.
> - **`Dsn` in params is the documented vendor shape** (immutable value object, not a service) — an explicit exception to the primitives-only convention in [3.1](#31-rules-for-parameters). Credentials themselves still come from `$_ENV`, never hardcoded (see the anti-pattern matrix in 8).
> - **`charset()` is a method, not a constructor parameter** — pass the charset via the Dsn attributes (as above) or call `charset()` on the driver; `'charset' => ...` inside the Driver constructor arguments is an error.
> - The `Dsn` is an immutable `Stringable` object: per-environment overrides must replace the whole value, not a fragment. For SQLite (`yiisoft/db-sqlite`), the same shape applies with that package's `Dsn`: `new Dsn('sqlite', '/path/to/app.db')` (constructor `__construct(string $driver = 'sqlite', string $databaseName = '')`).
> - Per-driver `Dsn` variants (`DsnSocket`, PostgreSQL, SQLite in-memory/file, MSSQL, Oracle) are catalogued in the [Databases Guide](persistence-db.md), section 6.2.
> - **Schema caching:** the default `new SchemaCache()` falls back to `NullCache` (no caching). For production, pass a `SchemaCache` built over your PSR-16 cache as the `schemaCache` constructor argument.

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

Signatures: `TagReference::to(string $tag): Yiisoft\Definitions\Reference` (namespace `Yiisoft\Di\Reference\TagReference`). Resolving a tag alias yields the **array** of tagged service instances (empty array if none are tagged). The tag alias is the literal `'tag@' . $tag` — `TagReference::id('console.command')` returns it (available since `yiisoft/di` 1.4.0), and other definitions may point at it directly with `Reference::to('tag@console.command')`. Tag sources merge config-level tags first, then definition-level `'tags'`, deduplicated. Alternatively, tags can be registered in bulk via `ContainerConfig::create()->withTags(['console.command' => [CleanupCommand::class, ExportCommand::class]])`, or retrieved directly via `$container->get(TagReference::id('console.command'))`.

---

### 5.2. State Resetting for Persistent Runtimes (`StateResetter`)

In long-running workers (`yiisoft/yii-runner-roadrunner`, `yiisoft/yii-runner-frankenphp`), services kept as singletons in the DI container survive between requests. If a service accumulates per-request state (e.g. current user, breadcrumbs, collected queries), it WILL leak between users unless reset.

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

The `'reset'` callback must be a `Closure` — the container binds it to the service instance (`$callback->bindTo($instance, $instance::class)`), so `$this` inside the callback is the service object with private/protected property access; alternatively the closure may declare `function (ContainerInterface $container)` and receive the container instead. For non-array definitions (plain class strings or closures), wrap them in a `'definition'` meta key to attach metadata:
`EngineInterface::class => ['definition' => EngineMarkOne::class, 'reset' => function (): void { /* ... */ }]`.

> [!TIP]
> **Worker State Reset Reference:**
> For the complete reference on persistent-runtime state safety — the silent drop of definition resetters when `StateResetter::class` is overridden (§2), idiomatic per-service `'reset'` declarations (§3), and closure scope binding (§5) — see the [Long-Running Worker Safety & StateResetter Guide](infra-state-resetter.md). The per-iteration worker-loop contract (`afterEmit()` → `StateResetter::reset()` → `gc_collect_cycles()`) lives in the [RoadRunner](infra-runtime-roadrunner.md) and [FrankenPHP](infra-runtime-frankenphp.md) worker runtime guides.

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

> [!WARNING]
> **Deprecated API:** `MiddlewareDispatcher::withMiddlewares()` is deprecated since `yiisoft/middleware-dispatcher` 5.5.0 — pass middleware definitions to the `MiddlewareDispatcher` **constructor** instead. The example is kept because it demonstrates the extension mechanism; in new code, wire middleware definitions through the constructor argument or the application's middleware stack.

> [!TIP]
> **Middlewares Reference:**
> For the complete reference on the idiomatic middleware stack — declaring middleware in the global application pipeline — see the [PSR-15 Middlewares Guide, §4.1. Global Application Pipeline](http-middlewares.md#41-global-application-pipeline-configwebdiapplicationphp).

Providers are accepted as class-strings or instances; class-strings are instantiated with `new $provider()`, so a provider needs a no-argument constructor. `getDefinitions()` runs at container construction; extensions collected from all providers are applied after all definitions, so an extension may target another provider's service.

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

Each delegate must be a `Closure` in the format `function (ContainerInterface $container): ContainerInterface`; it receives the primary container and must return a PSR-11 container. Exact validation messages: `Delegate must be callable in format "function (ContainerInterface $container): ContainerInterface".` and `Delegate callable must return an object that implements ContainerInterface.`

Delegates are consulted only when primary resolution throws a PSR `NotFoundExceptionInterface`; they also serve autowired dependencies resolved during definition building. Runtime errors thrown inside a delegate are wrapped in `Yiisoft\Di\BuildingException` (`Caught unhandled error "..." while building "..."`).

`Yiisoft\Di\ContainerConfig` is immutable; its constructor is private — `ContainerConfig::create()` is the only entry point. Full public API:

| Method | Effect (default) |
|---|---|
| `withDefinitions(array $definitions): self` | Service ID => definition map (`[]`) |
| `withProviders(array $providers): self` | Service provider class-strings or instances (`[]`) |
| `withTags(array $tags): self` | Tag ID => list of service IDs (`[]`) |
| `withDelegates(array $delegates): self` | Fallback container factories (`[]`) |
| `withValidate(bool $validate = true): self` | Eager validation of definitions, meta, tags, providers, and delegates at `new Container(...)` (`true`) |
| `withStrictMode(bool $useStrictMode = true): self` | Restrict `has()` / `get()` to explicitly defined IDs (`false`) |

Each `with*()` has a matching getter (`getDefinitions()`, `getProviders()`, `getTags()`, `getDelegates()`, `shouldValidate()`, `useStrictMode()`). In default (non-strict) mode `has()` returns `true` for any autoloadable class even without an explicit definition. `withValidate(false)` is the documented production tuning: construction skips validation, and invalid definitions surface only when the affected service is resolved.

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

Signatures: `Injector::__construct(?ContainerInterface $container = null)`, `invoke(callable $callable, array $arguments = [])` (no declared return type), `make(string $class, array $arguments = []): object`. With `new Injector()` (no container), only explicitly provided arguments and defaults can be resolved.

**Argument rules.** Named (string-keyed) arguments are matched by parameter name. **Positional (int-keyed) arguments must be objects** and are matched by type, not position — a scalar positional value throws `Yiisoft\Injector\InvalidArgumentException` (`Invalid argument "..." when calling "..."... Non-interface argument should be named explicitly when passed.`). Nullable typed parameters without defaults resolve to `null` — unlike the `Factory` flow, which throws `NotInstantiableClassException` for an unresolvable nullable dependency (see 6.2). Class-typed variadic parameters are not filled from the container. For long-running workers, `withCacheReflections(bool $cacheReflections = true)` memoizes reflection data (off by default).

The framework itself relies on this mechanism: controller actions and middleware are invoked through `Injector` (`yiisoft/middleware-dispatcher`).

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
**The second argument is a map of pre-registered definitions (service ID => definition), NOT a list of default option values.** Passing an arbitrary array such as `['defaultTimeout' => 30]` fails validation with `InvalidConfigException` (`Invalid definition: 30` — the message contains only the offending value, not the key). Pre-registered definitions are merged with same-class definitions passed to `create()`, which wins per key.

`Factory::create(mixed $config)` — the parameter is named `$config` — accepts a registered ID string, an existing class-string (autowired), an array definition, or a callable; an unknown class-string throws `Yiisoft\Factory\NotFoundException` (`No definition or class found or resolvable for "<id>".`). Every `create()` call produces a fresh object: `Factory` is a per-call replacement for `new`, not a service container. `withDefinitions(array $definitions)` **replaces** the whole definitions map instead of merging.

> [!NOTE]
> **`validate=false`** (third constructor argument) defers validation: the `Factory` constructs successfully even with invalid definitions, and the failure surfaces at `create()` as `InvalidConfigException`. This is the documented production tuning.

**Nullable-parameter difference:** instantiating a class whose nullable typed dependency has no default and cannot be resolved throws `NotInstantiableClassException` in the `Factory` flow, while `Injector` resolves it to `null` (see 6.1).

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

Signature: `StrictFactory::__construct(array $definitions, ?ContainerInterface $container = null, bool $validate = true)` (definitions come **first**), `create(string $id): mixed`, `has(string $id): bool`. Available since `yiisoft/factory` 1.3.0; dependencies of created objects still resolve through the injected container.

`create()` is **string-typed**. An unregistered class-string throws `Yiisoft\Factory\NotFoundException` (`No definition or class found or resolvable for "<id>".`). An inline definition array (or a callable) **cannot be passed at all** — it fails with a PHP `TypeError` at the call site, not `NotFoundException`.

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
- **Solution:** Use either definition-level `'reset'` callbacks OR a manually configured `StateResetter` — never both. Container internals: [StateResetter Guide, §2](infra-state-resetter.md#2-the-stateresetterclass-definition-trap).

### 7.9. Resolution Exception Map

Container resolution failures surface as a small, well-defined exception set. Know which package each lives in; catch the PSR interface (`Psr\Container\NotFoundExceptionInterface`) for portability.

| Exception | Lives in | Thrown when | Message shape |
|---|---|---|---|
| `Yiisoft\Di\NotFoundException` | `yiisoft/di` (implements PSR-11 `NotFoundExceptionInterface`) | `get()` cannot resolve an ID | `No definition or class found or resolvable for "<id>".` (build stack appended when nested; exposes `getId()`, `getBuildStack()`) |
| `Yiisoft\Di\BuildingException` | `yiisoft/di` | A non-PSR error occurs while building a service | `Caught unhandled error "<message>" while building "<stack>".` |
| `CircularReferenceException` | `Yiisoft\Definitions\Exception\` (`yiisoft/definitions`) | A service (indirectly) depends on itself | `Circular reference to "<id>" detected while building: <stack>.` |
| `NotInstantiableException` / `NotInstantiableClassException` | `yiisoft/definitions` (same `Yiisoft\Definitions\Exception\` namespace) | A scalar/class-typed constructor parameter has no value and no default | `Can not determine value of the "<param>" parameter of type "<type>" ...` |
| `Yiisoft\Factory\NotFoundException` | `yiisoft/factory` | `Factory::create()` / `StrictFactory::create()` gets an unknown class-string | `No definition or class found or resolvable for "<id>".` |
| `Yiisoft\Injector\MissingRequiredArgumentException` | `yiisoft/injector` | A required scalar argument is not provided | `Missing required argument "<param>" when calling "<callable>" ...` |
| `Yiisoft\Injector\InvalidArgumentException` | `yiisoft/injector` | A scalar value is passed positionally | `Invalid argument "<arg>" when calling "<callable>"... Non-interface argument should be named explicitly when passed.` |

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
| ❌ **Leaving stateful singletons without `'reset'` in workers** | In persistent worker mode (RoadRunner, FrankenPHP, Swoole), singleton properties persist across HTTP requests, leaking user data. | ✅ Add `'reset' => function (): void { $this->resetInternalState(); }` to the service definition — see the [Long-Running Worker Safety & StateResetter Guide](infra-state-resetter.md). |
| ❌ **Defining `StateResetter::class` while also using `'reset'` metadata** | Definition-level resetters are silently ignored when `StateResetter` is overridden in definitions or providers. | ✅ Choose one mechanism: definition-level `'reset'` callbacks or a manually configured `StateResetter` — see [StateResetter Guide, §2](infra-state-resetter.md#2-the-stateresetterclass-definition-trap). |
| ❌ **Passing default option values as the second `Factory` constructor argument** | `Factory::__construct(?ContainerInterface $container = null, array $definitions = [], ...)` expects a definitions map; arbitrary scalar arrays fail `DefinitionValidator`. | ✅ Pass real definitions (`['service-id' => [...definition...]]`) or omit the argument; use `create()` for per-call configuration. |
| ❌ **Using `StrictFactory::create()` with a class name or inline array** | `StrictFactory::create(string $id)` is string-typed: an unregistered class-string throws `NotFoundException`; an inline definition array fails with a PHP `TypeError` before any factory logic runs. | ✅ Register a definition for the ID first, or use `Factory` / `Injector::make()` for ad-hoc creation. |
| ❌ **Circular dependencies (`ServiceA` -> `ServiceB` -> `ServiceA`)** | Causes `Yiisoft\Definitions\Exception\CircularReferenceException` during container resolution. | ✅ Refactor using domain events (PSR-14), dedicated use cases, or extract an intermediate interface/provider. |
| ❌ **Using `new Service()` inside Actions or Domain classes** | Bypasses DI container, prevents mocking in unit tests, couples high-level modules to concrete low-level classes. | ✅ Inject interface in action/service constructor and let DI instantiate it. |
| ❌ **Hardcoding credentials in DI definition files** | Leaks secrets into version control and breaks multi-environment deployments. | ✅ Put secrets in real environment variables, read them via `params.php` (`$_ENV['SECRET']`), and inject via `$params['key']`. (`.env` via `vlucas/phpdotenv` is a `require-dev` convenience in the templates; production values come from the server/container.) |
| ❌ **Using `$_GET` or `$_POST` inside DI definitions** | Superglobals break CLI runners, queue workers, tests, and persistent HTTP runtimes. | ✅ Read parameters from `$params` or inject PSR-7 `ServerRequestInterface` / `CurrentRoute` at the presentation layer. |
| ❌ **Specifying `environment` as `?environments/{$environment}/di.php`** | `yiisoft/config` does not evaluate `{$environment}` strings in group paths. | ✅ Use `config-plugin-environments` in `composer.json` or `config/configuration.php`. |

### 8.1. Automated Verification with `check-di-syntax.php`

To catch configuration typos, invalid keys, unmapped interface bindings, and closure violations before booting the application or running tests, execute the deterministic static checker from the skill package directory:

```bash
php scripts/check-di-syntax.php [path-to-project]
```

- **Checks:** PHP syntax of `config/**/di/*.php` (including `di.php` and `di-*.php` files) and `params*.php` files; Yii 2 legacy keys (`'__class'`); constructor typos (`'__construct'`, plus `constructor` / `construct` variants); class-key typos (`classname`, `target`, `class_name`); `tag` / `resetter` key typos; missing `()` on method calls; missing `$` on properties; interface self-bindings and unbound interfaces; a warning when closures are stored in params; reflection-based checks when a vendor autoloader is available.
- **Flags:** `--path=`, `--file=`, `--format=text|json`, `--quiet`, `--verbose`, `--help`. Exit codes: `0` — pass, `1` — issues found, `2` — fatal error.
- **CI / Agent Automation:** Use `--format=json` for machine-readable output and automated quality gates in AI Factory verification loops. JSON schema: `{status, exit_code, summary: {files_scanned, definitions_count, errors_count, warnings_count}, issues: [{type, file, line, rule, message}]}`.

---

## 9. Related Topic Guides

- [Runners & Runtimes Guide](infra-runners-and-runtimes.md) — Application runner architecture, `HttpApplicationRunner`, `ConsoleApplicationRunner`, and the runtime selection matrix.
- [Long-Running Worker Safety & StateResetter Guide](infra-state-resetter.md) — Worker state reset mechanics, the `StateResetter::class` trap, and the built-in package resetter catalog.
- [Logging Guide](infra-logging.md) — PSR-3 logger wiring and targets, including the `StreamTarget` used by runner temporary error handlers.
- [Events & Listeners Guide](core-events-and-listeners.md) — PSR-14 event mapping and listener registration in config groups.
