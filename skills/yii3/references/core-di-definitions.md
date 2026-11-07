# Yii3 DI: Definition Syntax Recipes (`yiisoft/definitions`)

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Part of the [DI & Configuration Guide](core-di-and-config.md) split — the anti-pattern matrix and related guides live there.

## 4. Definition Syntax Recipes (`yiisoft/definitions`)

DI definition files return an array mapping identifiers (typically interface FQCNs or string aliases) to definitions.
Inside DI configuration files, the `$params` array (and the `$config` loader instance) are available as local variables (see [Configuration Architecture & Parameters, §3.1](core-config-tree.md#31-rules-for-parameters)).

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
> **Deprecated API:** `Yiisoft\DataResponse\Middleware\ContentNegotiator` is `@deprecated` — the replacement is `Yiisoft\DataResponse\Middleware\ContentNegotiatorDataResponseMiddleware` (see [Configuration Architecture & Parameters, §3.2](core-config-tree.md#32-example-parameter-configuration-configcommonparamsphp)). The example is kept because the package itself still ships and consumes these defaults: its own DI wiring builds the formatter map with `DynamicReferencesArray::from(...)`.

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
> - **`Dsn` in params is the documented vendor shape** (immutable value object, not a service) — an explicit exception to the primitives-only convention in [3.1](core-config-tree.md#31-rules-for-parameters). Credentials themselves still come from `$_ENV`, never hardcoded (see the [anti-pattern matrix in the DI & Configuration Guide, §8](core-di-and-config.md#8-anti-pattern-matrix-di--configuration)).
> - **`charset()` is a method, not a constructor parameter** — pass the charset via the Dsn attributes (as above) or call `charset()` on the driver; `'charset' => ...` inside the Driver constructor arguments is an error.
> - The `Dsn` is an immutable `Stringable` object: per-environment overrides must replace the whole value, not a fragment. For SQLite (`yiisoft/db-sqlite`), the same shape applies with that package's `Dsn`: `new Dsn('sqlite', '/path/to/app.db')` (constructor `__construct(string $driver = 'sqlite', string $databaseName = '')`).
> - Per-driver `Dsn` variants (`DsnSocket`, PostgreSQL, SQLite in-memory/file, MSSQL, Oracle) are catalogued in the [Databases: Readers & Drivers Guide, §6.2](persistence-db-readers-and-drivers.md#62-canonical-connection-configuration).
> - **Schema caching:** the default `new SchemaCache()` falls back to `NullCache` (no caching). For production, pass a `SchemaCache` built over your PSR-16 cache as the `schemaCache` constructor argument.
