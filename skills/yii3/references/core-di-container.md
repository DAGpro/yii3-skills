# Yii3 DI Container: Advanced Features & Dynamic Invocation

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Part of the [DI & Configuration Guide](core-di-and-config.md) split — the anti-pattern matrix and related guides live there.

## 1. Core DI Architecture & Philosophy in Yii3

Yii3 completely departs from the Yii2 service locator pattern (`Yii::$app->service`) and static container registries:

1. **Pure PSR-11 Container:**
   - The primary container (`Yiisoft\Di\Container`) is a `final` class that strictly implements `Psr\Container\ContainerInterface` (PSR-11, package `psr/container`).
   - Services are registered declaratively in configuration files and resolved automatically via constructor autowiring.
   - Two services are pre-registered out of the box: the container itself under `Psr\Container\ContainerInterface::class` and `Yiisoft\Di\StateResetter` under its own class name.
   - Caching and events integrate through PSR-16 / PSR-14 interfaces bound by `yiisoft/cache` (see [Definition Syntax Recipes, §4.3](core-di-definitions.md#43-service-references-referenceto-and-referenceoptional)) and `yiisoft/yii-event` (see [Configuration Architecture & Parameters, §2.3](core-config-tree.md#23-root-configuration-map-configconfigurationphp)).
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

Register service providers in your runner or `configuration.php` under `'di-providers'` / `'di-providers-web'`. Config-plugin group values are **file paths** (or `'$group'` references to other groups) — never class names; the referenced file returns the list of provider class-strings:
```php
// configuration.php
<?php

declare(strict_types=1);

return [
    'config-plugin' => [
        'di-providers' => 'common/di-providers.php',
        'di-providers-web' => [
            '$di-providers',
            'web/di-providers.php',
        ],
    ],
];
```
```php
// common/di-providers.php
<?php

declare(strict_types=1);

use App\Infrastructure\Provider\UserModuleServiceProvider;

return [
    UserModuleServiceProvider::class,
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

`Factory::create(mixed $config)` — the parameter is named `$config` — accepts a registered ID string, an existing class-string (autowired), an array definition, or a callable; an unknown class-string throws `Yiisoft\Factory\NotFoundException` (`No definition or class found or resolvable for <id>.`). Every `create()` call produces a fresh object: `Factory` is a per-call replacement for `new`, not a service container. `withDefinitions(array $definitions)` **replaces** the whole definitions map instead of merging.

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

`create()` is **string-typed**. An unregistered class-string throws `Yiisoft\Factory\NotFoundException` (`No definition or class found or resolvable for <id>.`). An inline definition array (or a callable) **cannot be passed at all** — it fails with a PHP `TypeError` at the call site, not `NotFoundException`.


---


## 7. Common Pitfalls

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
| `Yiisoft\Factory\NotFoundException` | `yiisoft/factory` | `Factory::create()` / `StrictFactory::create()` gets an unknown class-string | `No definition or class found or resolvable for <id>.` (no quotes — unlike the `yiisoft/di` variant) |
| `Yiisoft\Injector\MissingRequiredArgumentException` | `yiisoft/injector` | A required scalar argument is not provided | `Missing required argument "<param>" when calling "<callable>" ...` |
| `Yiisoft\Injector\InvalidArgumentException` | `yiisoft/injector` | A scalar value is passed positionally | `Invalid argument "<arg>" when calling "<callable>"... Non-interface argument should be named explicitly when passed.` |
