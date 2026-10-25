# Yii3 Logging Guide

> Practical guide for PSR-3 logging with `yiisoft/log`, target packages (`log-target-file`, `log-target-db`,
> `log-target-email`, `log-target-syslog`), message placeholders, context providers, and DI wiring.
>
> **Source of Truth & Verification Rule for AI Models:**
> In projects using this extension, always verify exact method signatures, constructor arguments, and parameter keys
> directly in `vendor/yiisoft/<package>/src/` for installed packages.
> When generating code, if an installed package's method signature or config key is unfamiliar or in doubt,
> **read its source files in `vendor/yiisoft/<package>/src/`** rather than guessing or relying on Yii2 habits.

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
- [8. Custom Targets](#8-custom-targets)
- [9. Flushing Behavior](#9-flushing-behavior)
- [10. Anti-Pattern Matrix](#10-anti-pattern-matrix)

---

## 1. Architecture: Core, Targets, Context Providers

| Class | FQCN | Role |
|---|---|---|
| **`Logger`** | `Yiisoft\Log\Logger` | `final` PSR-3 implementation (`implements Psr\Log\LoggerInterface` via `LoggerTrait`). Collects messages and dispatches them to targets. Constructor: `__construct(array $targets = [], ?ContextProviderInterface $contextProvider = null)`. |
| **`Target`** | `Yiisoft\Log\Target` | `abstract` base for all targets — **there is no `TargetInterface`**. Filters by levels/categories, formats lines, defines `abstract protected function export(): void`. |
| **`Message`** | `Yiisoft\Log\Message` | Immutable record: `level()`, `message()`, `context()`, `category()`, `trace()`, `time()`. Default category: `'application'` (`Message::DEFAULT_CATEGORY`). |
| **Context providers** | `Yiisoft\Log\ContextProvider\*` | `ContextProviderInterface::getContext(): array` implementations merged into every message's context. |
| **Built-in targets** | `Yiisoft\Log\StreamTarget`, `Yiisoft\Log\PsrTarget` | stdout stream and forwarding to another PSR-3 logger. The file/db/email/syslog targets live in separate packages. |

Levels are the **`Psr\Log\LogLevel` string constants**: `emergency`, `alert`, `critical`, `error`, `warning`,
`notice`, `info`, `debug`. There is no `Yiisoft\Log\Level` class — always pass `LogLevel::*` constants or the raw
strings; anything else throws `Psr\Log\InvalidArgumentException`.

> [!IMPORTANT]
> None of the logging packages registers `Psr\Log\LoggerInterface` in DI (verified: `yiisoft/log` ships only
> `config/events-web.php` / `config/events-console.php`; the target packages register their own target services
> only). **The application must add the binding itself** — see §2.

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

> [!TIP]
> Different loggers per use (e.g. an audit logger) are just additional services: define a named alias
> (e.g. `LoggerInterface::class . '#audit'`) with its own targets, and inject it explicitly where needed.

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
> This guide covers application logging. Uncaught-exception logging (ErrorCatcher → logger, Sentry via
> `yiisoft/yii-sentry`) is covered in `references/error-handling.md`.

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
> `setTimestampFormat()`, `setEnabled()` setters on `Target` (and `setTraceLevel()` / `setExcludedTracePaths()` on
> `Logger`) are **deprecated since 2.1** (to be removed in 3.0) — pass constructor arguments instead. Some shipped
> package `config/di.php` files still call the setters internally; application config should use constructor params.

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
(the logger itself also records a failed target's exception this way).

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

The directory is auto-created (`FileHelper::ensureDirectory`), writes use `LOCK_EX`, and failed/partial writes throw
`RuntimeException`. Rotation is done by `Yiisoft\Log\Target\File\FileRotator`:
`__construct(int $maxFileSize = 10240, int $maxFiles = 5, ?int $fileMode = null, bool $compressRotatedFiles = false)`
— `$maxFileSize` is in **kilobytes**; gzip compression requires `ext-zlib`.

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
`references/mailer.md`). Export sends a plain-text message (`wordwrap(..., 70)`) with the formatted batch; send
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
> `exportInterval` low for this target (e.g. `1`) if every critical error must be mailed right away, and remember it
> depends on a working `yiisoft/mailer-symfony` transport.

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

Maps `LogLevel::*` to `LOG_*` constants, opens/closes the log per export (`openlog`/`syslog`/`closelog`), and
fixes its line format to `[level][category] message`. Parameters key:

```php
return [
    'yiisoft/log-target-syslog' => [
        'syslogTarget' => [
            'identity' => 'app',
        ],
    ],
];
```

### 6.5. Built-In: StreamTarget & PsrTarget (`yiisoft/log`)

The core package ships two targets (no external package needed):

- `Yiisoft\Log\StreamTarget` — constructor: `__construct($stream = 'php://stdout', array $levels = [], /* Target params */)`.
  Ideal for Docker/FrankenPHP/RoadRunner workers where logs must go to stdout/stderr instead of files.
- `Yiisoft\Log\PsrTarget` — constructor: `__construct(LoggerInterface $logger, array $levels = [], /* Target params */)`.
  Forwards messages (with full context) to another PSR-3 logger — useful as a bridge, e.g. to route a category
  subtree into a dedicated handler.

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

## 8. Custom Targets

Extend the abstract `Yiisoft\Log\Target` and implement the single abstract method:

```php
public function export(): void;
```

Inside `export()` the subclass uses the protected helpers `getMessages(): Message[]`,
`getFormattedMessages(): string[]`, and `formatMessages(string $separator = ''): string` (line format:
`"{time} {prefix}[{level}][{category}] {message}{context}"`, timestamp format `Y-m-d H:i:s.u` by default).

```php
declare(strict_types=1);

namespace App\Infrastructure\Log;

use Yiisoft\Log\Message;
use Yiisoft\Log\Target;

final readonly class InMemoryTarget extends Target
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

## 9. Flushing Behavior

Messages are buffered per target and exported in batches:

- `Target::DEFAULT_EXPORT_INTERVAL = 1000` — export runs every 1000 collected messages; override via the
  constructor's `$exportInterval` (or the params key for the file target).
- `Logger::setFlushInterval(int $flushInterval)` (default `1000`; `0` = flush only at application end) controls
  how often buffered messages are pushed to targets.
- `Logger::flush(bool $final = false)` forces an export; `flush(true)` marks the final flush.
- The package ships event configs that flush at lifecycle boundaries: `config/events-web.php` flushes on
  `Yiisoft\Yii\Http\Event\AfterEmit`, `config/events-console.php` on
  `Symfony\Component\Console\Event\ConsoleTerminateEvent` — both call `$logger->flush(true)` when the resolved
  PSR-3 logger is a `Yiisoft\Log\Logger`. The `Logger` destructor also performs a final flush.
- Resilience: if a target's export throws, the logger **disables that target** and logs a warning about the
  failure — one broken target cannot take the application down.

## 10. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks | Idiomatic Yii3 Solution |
|---|---|---|
| Yii2-style `Yii::error()`, `Yii::getLogger()` | Static facades do not exist in Yii3; the code is untestable and dead on arrival | Inject `Psr\Log\LoggerInterface` via constructor (§3) |
| Type-hinting `Yiisoft\Log\Logger` (concrete class) in services | Couples application code to the implementation; blocks test doubles | Hint `Psr\Log\LoggerInterface`; keep `Logger` only in DI definitions |
| Expecting `LoggerInterface` to be bound after installing `yiisoft/log` | The package ships no `di.php`; resolution fails with "no definition" | Add the app-level binding from §2 mapping `LoggerInterface::class` to `Logger` with targets |
| Inventing log channels (`Logger($targets, 'payments')`) | No channel parameter exists in `yiisoft/log` 2.x | Use the `category` context key + per-target `categories`/`exceptCategories` filters (§4) |
| Passing `Yiisoft\Log\Level::ERROR` or int levels | No `Yiisoft\Log\Level` class exists; levels are `Psr\Log\LogLevel` strings; invalid levels throw `Psr\Log\InvalidArgumentException` | Use `LogLevel::*` constants |
| Calling deprecated `setLevels()` / `setFormat()` / `setTraceLevel()` in app config | Deprecated since 2.1, removed in 3.0; setter versions throw with a custom context provider | Pass constructor arguments (§4, §6, §7) |
| Writing to `DbTarget` before creating `{{%yii_log}}` | Every export fails with `RuntimeException`; the target gets disabled and logs disappear silently | Run the `sql/*-up.sql` scripts or `DbSchemaManager::ensureTable()` at deploy (§6.2) |
| Assuming `EmailTarget` sends immediately | Export happens per batch (`exportInterval`, default 1000) | Set a low `exportInterval` for the email target; verify the mailer transport works (§6.3) |
| Expecting a "from" option on `EmailTarget` | The constructor has no from parameter | Configure the sender on the mailer level (`references/mailer.md`) |
| Logging to files in worker mode (RoadRunner/FrankenPHP) without stdout | Long-running workers keep file handles; containerized stdout is the expected sink | Use `StreamTarget('php://stdout')` for worker/container setups (§6.5) |
| String-building messages with `sprintf()` + full object dumps in context | Loses structured context; huge payloads in every sink | Use `{placeholder}` interpolation with scalar context; pass the `Throwable` under `'exception'` (§5) |
| Logging sensitive data (passwords, tokens) into unfiltered targets | Plain-text sinks (file/db/email) keep them forever | Keep secrets out of context; filter noisy/sensitive categories via `exceptCategories` |
| Expecting `trace` in every message by default | `SystemContextProvider` defaults to `traceLevel = 0` | Construct the provider with a `traceLevel > 0` when traces are needed (§7) |
