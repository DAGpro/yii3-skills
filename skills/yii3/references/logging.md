# Yii3 Logging Guide

> Practical guide for PSR-3 logging with `yiisoft/log`, target packages (`log-target-file`, `log-target-db`,
> `log-target-email`, `log-target-syslog`), message placeholders, context providers, custom formats, testing,
> and DI wiring.

---

## Table of Contents
- [1. Architecture: Core, Targets, Context Providers](#1-architecture-core-targets-context-providers)
- [2. DI Wiring: Bind Psr\Log\LoggerInterface Yourself](#2-di-wiring-bind-psrlogloggerinterface-yourself)
- [3. Logging in Application Code](#3-logging-in-application-code)
- [4. Categories Instead of Channels](#4-categories-instead-of-channels)
- [5. Message Placeholders & Context](#5-message-placeholders--context)
- [6. Target Catalog & Configuration](#6-target-catalog--configuration)
  - [6.1. FileTarget (yiisoft/log-target-file)](#61-filetarget-yiisoftlog-target-file)
  - [6.2. DbTarget (yiisoft/log-target-db)](#62-dbtarget-yiisoftlog-target-db)
  - [6.3. EmailTarget (yiisoft/log-target-email)](#63-emailtarget-yiisoftlog-target-email)
  - [6.4. SyslogTarget (yiisoft/log-target-syslog)](#64-syslogtarget-yiisoftlog-target-syslog)
  - [6.5. Built-In: StreamTarget & PsrTarget (yiisoft/log)](#65-built-in-streamtarget--psrtarget-yiisoftlog)
- [7. Context Providers](#7-context-providers)
- [8. Custom Targets & Formats](#8-custom-targets--formats)
  - [8.1. Custom Targets](#81-custom-targets)
  - [8.2. Custom Format Callable & JSON Logs](#82-custom-format-callable--json-logs)
- [9. Flushing Behavior](#9-flushing-behavior)
- [10. Uncaught Exceptions & the Debug Panel](#10-uncaught-exceptions--the-debug-panel)
- [11. Testing Logging Code](#11-testing-logging-code)
- [12. Anti-Pattern Matrix](#12-anti-pattern-matrix)

---

## 1. Architecture: Core, Targets, Context Providers

| Class | FQCN | Role |
|---|---|---|
| **`Logger`** | `Yiisoft\Log\Logger` | `final` PSR-3 implementation (`implements Psr\Log\LoggerInterface` via `LoggerTrait`). Collects messages and dispatches them to targets. Constructor: `__construct(array $targets = [], ?ContextProviderInterface $contextProvider = null)`. |
| **`Target`** | `Yiisoft\Log\Target` | `abstract` base for all targets — **there is no `TargetInterface`**. Filters by levels/categories, formats lines, defines `abstract protected function export(): void`. |
| **`Message`** | `Yiisoft\Log\Message` | Immutable record: `level()`, `message()`, `context()`, `category()`, `trace()`, `time()`. Default category: `'application'` (`Message::DEFAULT_CATEGORY`). |
| **`Context providers`** | `Yiisoft\Log\ContextProvider\*` | `ContextProviderInterface::getContext(): array` implementations merged into every message's context. |
| **`Built-in targets`** | `Yiisoft\Log\StreamTarget`, `Yiisoft\Log\PsrTarget` | stdout stream and forwarding to another PSR-3 logger. The file/db/email/syslog targets live in separate packages. |

Levels are the **`Psr\Log\LogLevel` string constants**: `emergency`, `alert`, `critical`, `error`, `warning`,
`notice`, `info`, `debug`. There is no `Yiisoft\Log\Level` class — always pass `LogLevel::*` constants or the raw
strings; anything else throws `Psr\Log\InvalidArgumentException`.

> [!IMPORTANT]
> None of the logging packages registers `Psr\Log\LoggerInterface` in DI (verified: `yiisoft/log` ships only
> `config/events-web.php` / `config/events-console.php`; the target packages register their own target services
> only). **The application must add the binding itself** — see §2 and the per-package list there.

## 2. DI Wiring: Bind `Psr\Log\LoggerInterface` Yourself

Application code must always type-hint **`Psr\Log\LoggerInterface`**, never the concrete `Yiisoft\Log\Logger`.
Create the binding in `config/common/di/logger.php`, composing the targets installed in the project:

```php
declare(strict_types=1);

use Psr\Log\LoggerInterface;
use Yiisoft\Definitions\ReferencesArray;
use Yiisoft\Log\Logger;
use Yiisoft\Log\Target\File\FileTarget;
use Yiisoft\Log\StreamTarget;

return [
    LoggerInterface::class => [
        'class' => Logger::class,
        '__construct()' => [
            'targets' => ReferencesArray::from([
                FileTarget::class,
                StreamTarget::class,
            ]),
        ],
    ],
];
```

Each target is registered as its own DI service (`FileTarget::class`, `EmailTarget::class`, …) — either by the
target package's shipped `config/di.php` or by your own definition — and then referenced from the `targets` array.
What each package registers for you (verified against the shipped `config/` directories):

- `yiisoft/log` — no `config/di.php`; only `config/events-web.php` / `config/events-console.php` (flush hooks, §9).
  `StreamTarget` and `PsrTarget` services must be defined by your own config (§6.5).
- `yiisoft/log-target-file` — `config/di.php` registers `FileTarget` + `FileRotatorInterface`; `config/params.php`
  supplies defaults (§6.1).
- `yiisoft/log-target-email` — `config/di.php` registers `EmailTarget`; `config/params.php` supplies defaults (§6.3).
- `yiisoft/log-target-syslog` — `config/di.php` registers `SyslogTarget`; `config/params.php` supplies defaults (§6.4).
- `yiisoft/log-target-db` — no `config/` at all; define `DbTarget` yourself (§6.2).

None of these packages binds `LoggerInterface` — the binding above is always the application's job.

> [!TIP]
> Different loggers per use (e.g. an audit logger) are just additional services. The `#` in
> `LoggerInterface::class . '#audit'` is **not** framework syntax — it is an arbitrary string id agreed on by your
> application. Register the logger definition under that exact key and inject it only through an explicit
> `Reference::to(...)`; a bare `LoggerInterface` type-hint always resolves the default binding only.

```php
declare(strict_types=1);

use App\Audit\AuditTrail;
use Psr\Log\LoggerInterface;
use Yiisoft\Definitions\Reference;
use Yiisoft\Definitions\ReferencesArray;
use Yiisoft\Log\Logger;
use Yiisoft\Log\StreamTarget;

return [
    // Default binding — every bare LoggerInterface hint resolves here:
    LoggerInterface::class => [
        'class' => Logger::class,
        '__construct()' => [
            'targets' => ReferencesArray::from([StreamTarget::class]),
        ],
    ],
    // Second logger under your own string id ('#audit' carries no special meaning):
    LoggerInterface::class . '#audit' => [
        'class' => Logger::class,
        '__construct()' => [
            'targets' => ReferencesArray::from([StreamTarget::class]),
        ],
    ],
    // Consumers opt into the audit logger via an explicit reference:
    AuditTrail::class => [
        '__construct()' => [
            'logger' => Reference::to(LoggerInterface::class . '#audit'),
        ],
    ],
];
```

## 3. Logging in Application Code

Inject the PSR-3 interface into services and use cases — same rule as any other port:

```php
declare(strict_types=1);

namespace App\Application\Order;

use Psr\Log\LoggerInterface;
use Psr\Log\LogLevel;

final readonly class OrderProcessor
{
    public function __construct(
        private LoggerInterface $logger,
        private OrderRepositoryInterface $orders,
    ) {}

    public function process(string $orderId): void
    {
        $this->logger->info('Processing order {orderId}.', ['orderId' => $orderId, 'category' => 'order.processor']);

        try {
            $this->orders->markProcessing($orderId);
        } catch (\Throwable $e) {
            $this->logger->log(LogLevel::ERROR, 'Order processing failed: {error}', [
                'category' => 'order.processor',
                'error' => $e->getMessage(),
                'exception' => $e,
            ]);
            throw $e;
        }
    }
}
```

Standard PSR-3 methods: `emergency()`, `alert()`, `critical()`, `error()`, `warning()`, `notice()`, `info()`,
`debug()`, plus the generic `log(mixed $level, string|Stringable $message, array $context = [])`.

> [!NOTE]
> This guide covers application logging. What is written to the log when an exception goes uncaught — and Sentry
> capture via `yiisoft/yii-sentry` — is covered in [Error Handling Guide](error-handling.md); the exact
> logger-level chain is described in §10.

## 4. Categories Instead of Channels

There is **no channel concept** in `yiisoft/log` 2.x (no `Logger($targets, $channel)` — verified by source grep).
Filtering granularity is the `category` **context key** instead:

- Default category: `'application'` (`Message::DEFAULT_CATEGORY`).
- Pass `'category' => 'your.topic'` in the context array per message, or supply it as a common context key via
  a context provider (§7).
- Categories are dotted namespace-like strings; the `CategoryFilter` matches trailing-`*` wildcard prefixes:
  `except: ['Yiisoft\Db\*']` excludes every `Yiisoft\Db\…` category.

Target filtering by category happens through the `Target` constructor:
`__construct(array $levels = [], array $categories = [], array $exceptCategories = [], ?callable $format = null, ?callable $prefix = null, ?string $timestampFormat = null, int $exportInterval = self::DEFAULT_EXPORT_INTERVAL, bool|callable $enabled = true)`.

> [!WARNING]
> The `setLevels()`, `setCategories()`, `setExcept()`, `setFormat()`, `setPrefix()`, `setExportInterval()`,
> `setTimestampFormat()`, `setEnabled()` setters on `Target` are **deprecated, to be removed in 3.0** — pass
> constructor arguments instead. The same removal applies to `Logger::setTraceLevel()` / `setExcludedTracePaths()`
> (deprecated since 2.1) — and these two additionally **throw a `RuntimeException`** when the logger was built with
> a custom context provider; the `Target` setters never throw. Some shipped package `config/di.php` files still
> call the setters internally; application config should use constructor params.

## 5. Message Placeholders & Context

PSR-3 brace placeholders are interpolated by `Message` at construction time (README "PSR-3 Message Placeholders"):

```php
$logger->info('User {user.name} ordered {productCount} items.', [
    'category' => 'shop.order',
    'user' => ['name' => 'Alice'],
    'productCount' => 3,
]);
// → "User Alice ordered 3 items."
```

- Placeholders match `/\{([\w\.\\\\_]+)\}/`; dot notation reaches nested context values (`{user.name}`).
- Scalars, `Stringable`, and `null` are stringified (`null` → empty string); arrays and objects are dumped via
  `Yiisoft\VarDumper`.
- Unresolved placeholders are **left as-is** in the output.
- Standard context keys merged by the default `SystemContextProvider`: `category` (string), `memory` (int),
  `time` (float, `microtime(true)`), `trace` (array; only populated when `traceLevel > 0`, see §7).

Exception context: pass the `Throwable` under `'exception'` — it is preserved in the context for targets to use
(the logger itself also records a failed target's exception this way; for uncaught exceptions the error handler
uses the `'throwable'` key, see §10).

## 6. Target Catalog & Configuration

### 6.1. FileTarget (`yiisoft/log-target-file`)

Constructor (from `src/FileTarget.php`):

```php
public function __construct(
    private string $logFile = '/tmp/app.log',
    private ?FileRotatorInterface $rotator = null,
    private int $dirMode = 0775,
    private ?int $fileMode = null,
    array $levels = [],
)
```

The directory is auto-created by `Yiisoft\Files\FileHelper::ensureDirectory()` (package `yiisoft/files`) on the
first export with messages, writes use `flock(LOCK_EX)`, and failed/partial writes throw `RuntimeException`.
Rotation is done by `Yiisoft\Log\Target\File\FileRotator`
(`__construct(int $maxFileSize = 10240, int $maxFiles = 5, ?int $fileMode = null, bool $compressRotatedFiles = false)`)
— `$maxFileSize` is in **kilobytes**, and rotation works by **copy + truncate** (the active file is copied to
`app.log.1`, …, then truncated under a lock — not renamed). Note that `ext-zlib` is a hard composer requirement of
the package, not an optional feature.

The constructor accepts only the file-specific arguments plus `$levels`; the `Target`-wide options
(`$categories`, `$exceptCategories`, `$format`, `$prefix`, `$timestampFormat`, `$exportInterval`, `$enabled`)
are **not** forwarded — configure them through the deprecated setters (the path the shipped `config/di.php` still
uses) or your own DI factory (§8.2).

The package ships DI + params config. Parameter keys in `config/common/params.php` (defaults verbatim from the
package's `config/params.php`):

```php
return [
    'yiisoft/log-target-file' => [
        'fileTarget' => [
            'file' => '@runtime/logs/app.log',
            'levels' => [\Psr\Log\LogLevel::EMERGENCY, \Psr\Log\LogLevel::ERROR, \Psr\Log\LogLevel::WARNING,
                         \Psr\Log\LogLevel::INFO, \Psr\Log\LogLevel::DEBUG],
            'categories' => [],
            'except' => [],
            'exportInterval' => 1000,
            'dirMode' => 0755,
            'fileMode' => null,
        ],
        'fileRotator' => [
            'maxFileSize' => 10240,
            'maxFiles' => 5,
            'fileMode' => null,
            'compressRotatedFiles' => false,
        ],
    ],
];
```

Two details on these defaults:

- `dirMode` is **not** a contradiction: the params value `0755` overrides the constructor default `0775` when the
  target is wired through the shipped package config (`config/di.php` passes params into the constructor), while
  instantiating `new FileTarget()` directly uses the constructor default `0775`.
- The `'@runtime/logs/app.log'` alias is resolved by the shipped `config/di.php` via `Aliases::get()`
  (`Yiisoft\Aliases\Aliases`, package `yiisoft/aliases`). Constructing `new FileTarget('@runtime/logs/app.log')`
  manually would create a **literal `@runtime` directory** — resolve the alias yourself first.

### 6.2. DbTarget (`yiisoft/log-target-db`)

Constructor (from `src/DbTarget.php`):

```php
public function __construct(
    private readonly ConnectionInterface $db,   // Yiisoft\Db\Connection\ConnectionInterface
    private readonly string $table = '{{%yii_log}}',
    array $levels = [],
)
```

`export()` inserts one row per message (`level`, `category`, `log_time`, `message`).

**The package ships no `config/` and no config-plugin entries** — wire it by hand:

```php
declare(strict_types=1);

use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Log\Target\Db\DbTarget;

return [
    DbTarget::class => static fn (ConnectionInterface $db) => new DbTarget($db, '{{%yii_log}}'),
];
```

The table is **not created automatically**. Either run the SQL files shipped in the package's `sql/` directory
(`mysql|pgsql|sqlite|sqlsrv|oci-up.sql` for table `yii_log`: `id` BIGINT PK, `level varchar(16)`, `category
varchar(255)`, `log_time timestamp(6)`, `message text`, indexes on category/level/time) or call
`Yiisoft\Log\Target\Db\DbSchemaManager::ensureTable()` (constructor takes `ConnectionInterface`; there is also
`ensureNoTable()` for teardown).

### 6.3. EmailTarget (`yiisoft/log-target-email`)

Constructor (from `src/EmailTarget.php`):

```php
public function __construct(
    private readonly MailerInterface $mailer,   // Yiisoft\Mailer\MailerInterface
    array|string $emailTo,                      // required, non-empty; [email => name] format allowed
    string $subjectEmail = '',                  // defaults to 'Application Log'
    array $levels = [],
)
```

There is **no "from" parameter** — the envelope sender comes from the mailer configuration (see
[Mailer Guide](mailer.md)). Export sends a plain-text message (`wordwrap(..., 70)`) with the formatted batch; send
failures throw `RuntimeException`. Default levels: `critical`, `emergency`, `error`, `warning` (package params).

Parameters key (`config/params.php` of the package):

```php
return [
    'yiisoft/log-target-email' => [
        'emailTarget' => [
            'emailTo' => 'admin@example.com',
            'subjectEmail' => 'Application Log',
            'levels' => [\Psr\Log\LogLevel::CRITICAL, \Psr\Log\LogLevel::EMERGENCY,
                         \Psr\Log\LogLevel::ERROR, \Psr\Log\LogLevel::WARNING],
        ],
    ],
];
```

> [!WARNING]
> EmailTarget is an **export-on-batch** target: messages are sent per export cycle, not immediately. Keep
> `exportInterval` low for this target (e.g. `1`) if every critical error must be mailed right away. The package
> requires `yiisoft/mailer ^6.0` — a configured `MailerInterface`; a working transport (typically
> `yiisoft/mailer-symfony`) is a separate package that you install and configure yourself.

### 6.4. SyslogTarget (`yiisoft/log-target-syslog`)

Constructor (from `src/SyslogTarget.php`):

```php
public function __construct(
    private string $identity,
    private int $options = LOG_ODELAY | LOG_PID,
    private int $facility = LOG_USER,
    array $levels = [],
)
```

Maps `LogLevel::*` to `LOG_*` constants and opens/closes the log per export (`openlog`/`syslog`/`closelog`).
The line format `[level][category] message` is only the **default** — set in the constructor through the
deprecated `setFormat()` — and can be overridden with a custom `$format` callable (§8.2). Messages without a
`category` context key render **empty brackets** (`[]`) rather than `[application]`, because the target reads the
category with an empty-string fallback. Parameters key:

```php
return [
    'yiisoft/log-target-syslog' => [
        'syslogTarget' => [
            'identity' => 'app',
        ],
    ],
];
```

`options` and `facility` are not exposed as params — define the target yourself if the defaults
(`LOG_ODELAY | LOG_PID`, `LOG_USER`) do not fit. The package does not declare `ext-syslog` in its composer
requirements — verify the extension is available on your platform.

### 6.5. Built-In: StreamTarget & PsrTarget (`yiisoft/log`)

The core package ships two targets (no external package needed):

- `Yiisoft\Log\StreamTarget` — constructor: `__construct($stream = 'php://stdout', array $levels = [], /* Target params */)`
  (`$stream` is untyped — docblock `resource|string`). Ideal for Docker/FrankenPHP/RoadRunner workers where logs
  must go to stdout/stderr instead of files.
- `Yiisoft\Log\PsrTarget` — constructor: `__construct(LoggerInterface $logger, array $levels = [], /* Target params */)`.
  On export every message is forwarded as `$logger->log($level, $message, $context)` — level, message, and the
  full context — which makes it the bridge to third-party PSR-3 loggers.

`yiisoft/log` ships no `config/di.php`, so register these services in your own definitions (§2):

```php
declare(strict_types=1);

use Psr\Log\LogLevel;
use Yiisoft\Definitions\Reference;
use Yiisoft\Log\PsrTarget;

return [
    PsrTarget::class => [
        '__construct()' => [
            // Explicit reference: a bare LoggerInterface hint would resolve the
            // application's default Logger binding, not the external logger.
            'logger' => Reference::to('app.externalPsr3Logger'), // your own id for the external PSR-3 logger (e.g. Monolog)
            'levels' => [LogLevel::ERROR, LogLevel::CRITICAL],
        ],
    ],
];
```

## 7. Context Providers

A context provider merges common data into every message's context
(`ContextProviderInterface::getContext(): array`):

| Provider | Purpose |
|---|---|
| `Yiisoft\Log\ContextProvider\SystemContextProvider` | Default. `__construct(int $traceLevel = 0, array $excludedTracePaths = [])`. Supplies `time`, `memory`, `category` (default), and `trace` (only when `$traceLevel > 0`; paths containing any excluded substring are skipped). |
| `Yiisoft\Log\ContextProvider\CommonContextProvider` | `__construct(array $data)` — returns the array verbatim. Add app-wide context here (environment, release tag, tenant id). |
| `Yiisoft\Log\ContextProvider\CompositeContextProvider` | `__construct(ContextProviderInterface ...$providers)` — `array_merge` of all providers. |

```php
$logger = new Logger(
    targets: [$fileTarget],
    contextProvider: new CompositeContextProvider(
        new SystemContextProvider(traceLevel: 3, excludedTracePaths: ['/vendor/']),
        new CommonContextProvider(['environment' => 'production', 'release' => '1.4.2']),
    ),
);
```

A custom provider implements `Yiisoft\Log\ContextProvider\ContextProviderInterface` — a single `getContext(): array`
method that the logger invokes on **every `log()` call**:

```php
declare(strict_types=1);

namespace App\Infrastructure\Log;

use Yiisoft\Log\ContextProvider\ContextProviderInterface;

final readonly class TenantContextProvider implements ContextProviderInterface
{
    public function __construct(
        private string $tenantId,
    ) {}

    public function getContext(): array
    {
        return ['tenant' => $this->tenantId];
    }
}
```

Provider keys are merged **before** the per-call context (`array_merge($providerContext, $callContext)`), so a
`'category' => ...` passed at the call site always wins over a provider default. Combine custom and built-in
providers with `CompositeContextProvider` (see the example above).

## 8. Custom Targets & Formats

### 8.1. Custom Targets

Extend the abstract `Yiisoft\Log\Target` and implement the single abstract method:

```php
protected function export(): void;
```

Inside `export()` the subclass uses the protected helpers `getMessages(): Message[]`,
`getFormattedMessages(): string[]`, and `formatMessages(string $separator = ''): string` (line format:
`"{time} {prefix}[{level}][{category}] {message}{context}"`, timestamp format `Y-m-d H:i:s.u` by default).

```php
declare(strict_types=1);

namespace App\Infrastructure\Log;

use Yiisoft\Log\Message;
use Yiisoft\Log\Target;

final class InMemoryTarget extends Target
{
    public array $exported = [];

    protected function export(): void
    {
        foreach ($this->getMessages() as $message) {
            $this->exported[] = $message->message();
        }
    }
}
```

Register the instance as a DI service and add it to the `Logger` targets array (§2).

### 8.2. Custom Format Callable & JSON Logs

Every target accepts a `$format` callable via the `Target` constructor (`?callable $format = null`, §4). The
verified contract:

```php
function (Message $message, array $commonContext): string
```

It receives the message and the merged common context (§7) and must return a string — anything else throws
`RuntimeException`. If a `$prefix` callable is configured, its result is prepended to the formatted output.
`Message` exposes only getters — `level(): string`, `message(): string`, `context(?string $name = null,
mixed $default = null): mixed`, `category(): string`, `trace(): ?array`, `time(): DateTimeImmutable`. A JSON line
format follows naturally (the example below is derived from this verified callable contract and the `Message` API):

```php
declare(strict_types=1);

use DateTimeInterface;
use Yiisoft\Log\Message;
use Yiisoft\Log\StreamTarget;

$format = static function (Message $message, array $commonContext): string {
    return json_encode([
        'time' => $message->time()->format(DateTimeInterface::ATOM),
        'level' => $message->level(),
        'category' => $message->category(),
        'message' => $message->message(),
        'context' => $message->context(),
    ], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
};

// Targets that forward the option to `Target` accept it as a constructor argument:
$target = new StreamTarget(stream: 'php://stdout', format: $format);
```

Note that `FileTarget`'s constructor does **not** accept `$format` (§6.1) — for JSON file logs use the deprecated
`setFormat()` setter (the same path the shipped `config/di.php` uses for other options), or write a custom target
(§8.1) whose constructor forwards `$format` to `parent::__construct()`.

## 9. Flushing Behavior

Messages are buffered per target and exported in batches:

- `Target::DEFAULT_EXPORT_INTERVAL = 1000` — export runs every 1000 collected messages; override via the
  constructor's `$exportInterval` (or the params key for the file target).
- `Logger::setFlushInterval(int $flushInterval)` (default `1000`; `0` = no automatic flush until application end)
  controls how often buffered messages are pushed to targets.
- `Logger::flush(bool $final = false)` pushes the buffered messages to the targets; an actual export runs when
  `exportInterval` is reached **or** when `$final` is `true` — so forcing an export means calling `flush(true)`.
- The package ships event configs that flush at lifecycle boundaries: `config/events-web.php` flushes on
  `Yiisoft\Yii\Http\Event\AfterEmit`, `config/events-console.php` on
  `Symfony\Component\Console\Event\ConsoleTerminateEvent` — both call `$logger->flush(true)` when the resolved
  PSR-3 logger is a `Yiisoft\Log\Logger`.
- The final flush lives in the `Logger` destructor (`__destruct()` → `flush(true)`; moved there from
  `register_shutdown_function()` in 2.2.1). **Long-running workers never reach it** — the process does not
  terminate between tasks, so call `$logger->flush(true)` explicitly at task boundaries (e.g. after each job),
  otherwise the buffered tail is lost when the worker is killed.
- Resilience: if a target's export throws, the logger **disables that target** and logs a warning about the
  failure — one broken target cannot take the application down.

## 10. Uncaught Exceptions & the Debug Panel

The logging package itself never logs uncaught exceptions — that is the job of `yiisoft/error-handler`:

- The `ErrorCatcher` middleware (`Yiisoft\ErrorHandler\Middleware\ErrorCatcher`) catches throwables and builds the
  error response, but it does **not** receive a logger: its constructor takes a `ThrowableResponseFactoryInterface`
  and an optional PSR-14 event dispatcher only.
- The log record comes from `Yiisoft\ErrorHandler\ErrorHandler`, which type-hints `LoggerInterface` and writes
  `$logger->error($t->getMessage(), ['throwable' => $t])` — level `error`, context key **`'throwable'`**. Mind the
  difference from the application-side convention of passing throwables under `'exception'` (§5).

The debug panel (`yiisoft/yii-debug`, `require-dev`) collects logs through PSR-3 proxy decoration rather than a log
target: while the `'yiisoft/yii-debug'` params `enabled` flag is `true`, the container wraps the `LoggerInterface`
service in a `LoggerInterfaceProxy` that feeds every PSR-3 call into its `LogCollector` and then delegates to the
real logger. With debug disabled nothing is decorated — production logging configuration is untouched.

## 11. Testing Logging Code

`yiisoft/test-support` (`composer require --dev yiisoft/test-support`) provides
`Yiisoft\Test\Support\Log\SimpleLogger` — a `final` PSR-3 implementation (`LoggerInterface` via `LoggerTrait`)
that accumulates every logged message in memory:

- The constructor takes no arguments. Each record is a flat array `['level' => string, 'message' => string,
  'context' => array]` — **not** a `Yiisoft\Log\Message` object. Read everything with `getMessages(): array`.
- Level validation mirrors PSR-3: a non-string or unsupported level throws `Psr\Log\InvalidArgumentException`.
- Placeholders are interpolated by **top-level** context keys only — `{user.name}` is *not* resolved from nested
  `'user' => ['name' => …]` context (unlike `Yiisoft\Log\Message`, §5).

```php
declare(strict_types=1);

namespace App\Tests\Order;

use App\Application\Order\OrderProcessor;
use App\Application\Order\OrderRepositoryInterface;
use PHPUnit\Framework\TestCase;
use Psr\Log\LogLevel;
use RuntimeException;
use Yiisoft\Test\Support\Log\SimpleLogger;

final class OrderProcessorTest extends TestCase
{
    public function testFailureIsLoggedWithCategory(): void
    {
        $logger = new SimpleLogger();
        $orders = $this->createMock(OrderRepositoryInterface::class);
        $orders->method('markProcessing')->willThrowException(new RuntimeException('Queue is full.'));

        try {
            (new OrderProcessor($logger, $orders))->process('42');
            self::fail('RuntimeException was expected.');
        } catch (RuntimeException) {
            // expected — the service re-throws after logging
        }

        $messages = $logger->getMessages();
        self::assertCount(2, $messages);
        self::assertSame(LogLevel::ERROR, $messages[1]['level']);
        self::assertSame('Order processing failed: Queue is full.', $messages[1]['message']);
        self::assertSame('order.processor', $messages[1]['context']['category']);
    }
}
```

## 12. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks | Idiomatic Yii3 Solution |
|---|---|---|
| Yii2-style `Yii::error()`, `Yii::getLogger()` | Static facades do not exist in Yii3; the code is untestable and dead on arrival | Inject `Psr\Log\LoggerInterface` via constructor (§3) |
| Type-hinting `Yiisoft\Log\Logger` (concrete class) in services | Couples application code to the implementation; blocks test doubles | Hint `Psr\Log\LoggerInterface`; keep `Logger` only in DI definitions |
| Expecting `LoggerInterface` to be bound after installing `yiisoft/log` | The package ships no `di.php`; resolution fails with "no definition" | Add the app-level binding from §2 mapping `LoggerInterface::class` to `Logger` with targets |
| Inventing log channels (`Logger($targets, 'payments')`) | No channel parameter exists in `yiisoft/log` 2.x | Use the `category` context key + per-target `categories`/`exceptCategories` filters (§4) |
| Passing `Yiisoft\Log\Level::ERROR` or int levels | No `Yiisoft\Log\Level` class exists; levels are `Psr\Log\LogLevel` strings; invalid levels throw `Psr\Log\InvalidArgumentException` | Use `LogLevel::*` constants |
| Calling deprecated `setLevels()` / `setFormat()` / `setTraceLevel()` in app config | Deprecated, to be removed in 3.0; only `Logger::setTraceLevel()` / `setExcludedTracePaths()` throw `RuntimeException` with a custom context provider — `Target` setters never throw | Pass constructor arguments (§4, §6, §7) |
| Writing to `DbTarget` before creating `{{%yii_log}}` | Every export fails with `RuntimeException`; the target gets disabled and logs disappear silently | Run the `sql/*-up.sql` scripts or `DbSchemaManager::ensureTable()` at deploy (§6.2) |
| Assuming `EmailTarget` sends immediately | Export happens per batch (`exportInterval`, default 1000) | Set a low `exportInterval` for the email target; ensure a configured mailer with a working transport (§6.3) |
| Expecting a "from" option on `EmailTarget` | The constructor has no from parameter | Configure the sender on the mailer level ([Mailer Guide](mailer.md)) |
| Logging to files in worker mode (RoadRunner/FrankenPHP) without stdout | `FileTarget` holds no open handle between exports, but the logger buffers in memory: a killed worker loses the buffered tail (final flush only in the `Logger` destructor), and copy+truncate rotation is uncoordinated between worker processes; containerized stdout is the expected sink | Use `StreamTarget('php://stdout')` for worker/container setups (§6.5) |
| Relying on the `Logger` destructor to flush in long-running workers | The destructor never runs between tasks; buffered messages are lost when the worker is killed | Call `$logger->flush(true)` explicitly at task boundaries (§9) |
| Constructing `new FileTarget('@runtime/logs/app.log')` manually | Aliases are resolved by the shipped package config (`Aliases::get()`), not by `FileTarget`; a literal `@runtime` directory is created | Wire the target through DI or resolve the alias yourself first (§6.1) |
| String-building messages with `sprintf()` + full object dumps in context | Loses structured context; huge payloads in every sink | Use `{placeholder}` interpolation with scalar context; pass the `Throwable` under `'exception'` (§5) |
| Logging sensitive data (passwords, tokens) into unfiltered targets | Plain-text sinks (file/db/email) keep them forever | Keep secrets out of context; filter noisy/sensitive categories via `exceptCategories` |
| Expecting `trace` in every message by default | `SystemContextProvider` defaults to `traceLevel = 0` | Construct the provider with a `traceLevel > 0` when traces are needed (§7) |
