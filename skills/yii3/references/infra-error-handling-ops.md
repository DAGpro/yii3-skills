# Yii3 Error Handling: Logging, Sentry, Console & Low-Level

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Part of the [Error Handling Guide](infra-error-handling.md) split — the anti-pattern matrix and related guides live there.

## 8. Logging & Sentry Monitoring (`yiisoft/yii-sentry`)

### 8.1. PSR-14 Event Listener (`ApplicationError`)

When `ErrorCatcher` catches an uncaught exception, it dispatches the `Yiisoft\ErrorHandler\Event\ApplicationError` event — **but only if a PSR-14 dispatcher was injected** into `ErrorCatcher`'s optional second constructor parameter (`?EventDispatcherInterface $eventDispatcher = null`; the same applies to `ErrorHandler`). `Yiisoft\ErrorHandler\Event\ApplicationError` is a final event exposing `getThrowable(): Throwable`; it is dispatched from two sites: `ErrorCatcher::process()` and `ErrorHandler::renderThrowableAndTerminate()`.

> [!IMPORTANT]
> Installing `yiisoft/error-handler` alone provides **no** PSR-14 dispatcher (`psr/event-dispatcher` is only a `require-dev` dependency of the package). The actual PSR-14 wiring ships with `yiisoft/yii-event` — the binding list is owned by the [Events & Listeners Guide, §1](core-events-design.md#1-psr-14-event-architecture-in-yii3). Without a dispatcher reaching `ErrorCatcher` / `ErrorHandler`, no `ApplicationError` listener ever runs.

> [!TIP]
> For logger DI wiring, targets (file/db/email/syslog/stream), categories, and placeholders, see [Logging Guide](infra-logging.md). Note that `yiisoft/log` ships its own listeners that flush the logger on `Yiisoft\Yii\Http\Event\AfterEmit` (web) and `ConsoleTerminateEvent` (console).

In `src/Infrastructure/Error/Listener/LogApplicationErrorListener.php`:

```php
<?php

declare(strict_types=1);

namespace App\Infrastructure\Error\Listener;

use Psr\Log\LoggerInterface;
use Yiisoft\ErrorHandler\Event\ApplicationError;

final readonly class LogApplicationErrorListener
{
    public function __construct(
        private LoggerInterface $logger,
    ) {}

    public function __invoke(ApplicationError $event): void
    {
        $throwable = $event->getThrowable();

        $this->logger->error(
            'Uncaught application error: {message}',
            [
                'message' => $throwable->getMessage(),
                'exception' => $throwable,
                'file' => $throwable->getFile(),
                'line' => $throwable->getLine(),
            ],
        );
    }
}
```

Register the listener in `config/common/events.php`. The full listener-definition table is owned by the [Events & Listeners Guide, §4.2](core-events-design.md#42-declarative-event-mapping--supported-listener-formats) — note the common mistake here: a one-element array such as `[[LogApplicationErrorListener::class]]` is **not** a valid definition and throws `Yiisoft\Yii\Event\InvalidListenerConfigurationException`:

```php
<?php

declare(strict_types=1);

use App\Infrastructure\Error\Listener\LogApplicationErrorListener;
use Yiisoft\ErrorHandler\Event\ApplicationError;

return [
    ApplicationError::class => [
        LogApplicationErrorListener::class,
    ],

    // Alternative two-element form:
    // ApplicationError::class => [[LogApplicationErrorListener::class, '__invoke']],
];
```

**Where app event maps live.** `yiisoft/yii-event` reads the listener map from its params group (`'yiisoft/yii-event' => ['eventsConfigGroup' => ...]`), defaulting to the `events-web` group (web) and `events-console` group (console). Group declarations, the `$events` reference wiring, merge modifiers, and the full listener-format table are owned by the [Events & Listeners Guide, §4](core-events-design.md#4-event-configuration-yiisoftconfig--yiisoftyii-event) — register your `config/common/events.php` under the shared `events` group there; error-handling-specific listeners follow the exact same mechanics.

Failure timing and validation (details and the complete six-form table: [Events & Listeners Guide, §4.2](core-events-design.md#42-declarative-event-mapping--supported-listener-formats)):

- Invalid listener **format** (non-string event key, non-iterable listener list) throws eagerly, when the DI container first resolves `ListenerCollection::class` (i.e. when the PSR-14 dispatcher is constructed) — not at event-dispatch time. Invalid listener **definitions** (e.g. the one-element array above, or `[X::class, 'method']` with a missing method) pass config build and fail lazily — `CallableFactory::create()` runs inside the wrapping closure, so `InvalidListenerConfigurationException` surfaces at **first dispatch**.
- When a runner is constructed with `checkEvents: true`, it runs `Yiisoft\Yii\Event\ListenerConfigurationChecker::check()` over the events group, eagerly validating the whole map (dev/tests only — resource-greedy).

> [!WARNING]
> If an `ApplicationError` listener (or the dispatcher itself) throws, `ErrorCatcher` wraps the failure together with the original throwable in `Yiisoft\ErrorHandler\CompositeException` and still renders an error response (default 500) — the original throwable is not lost. Keep listeners defensive: wrap their bodies in try/catch so a logging failure cannot mask the original error.

### 8.2. Sentry Web Integration (`SentryMiddleware`)

`Yiisoft\Yii\Sentry\SentryMiddleware` is a final PSR-15 middleware whose only constructor dependency is `Sentry\State\HubInterface`. Its `process()` catches `Throwable`, calls `$this->hub->captureException($e)`, and **always re-throws** — so exceptions still reach `ErrorCatcher` for rendering. PHP fatal errors (instances of `\Error`) are handled too, since the middleware catches `Throwable`. `yiisoft/yii-sentry` performs no breadcrumb capture and provides no PSR-3-to-Sentry log bridge — the PSR-3 logger in its bootstrap is the Sentry SDK's internal client logger only.

Configure `yiisoft/yii-sentry` in `config/common/params.php`. The params group root key `'yiisoft/yii-sentry'` has exactly three keys (`handleConsoleErrors`, `cron-monitoring`, `options`) — there is no `enabled` key:

```php
<?php

declare(strict_types=1);

use Sentry\Event;
use Yiisoft\ErrorHandler\Exception\ErrorException;

return [
    'yiisoft/yii-sentry' => [
        // Registers SentryConsoleHandler for ConsoleErrorEvent (see section 8.3). Default: true.
        'handleConsoleErrors' => true,

        // Sentry cron monitoring (see section 8.3). Note the hyphenated key name.
        'cron-monitoring' => [],

        // Passed verbatim as the single constructor argument of Sentry\Options.
        'options' => [
            'dsn' => $_ENV['SENTRY_DSN'] ?? null,
            // Source-attested and test-verified to reach the SDK client options.
            'environment' => $_ENV['YII_ENV'] ?? null,
            // Shipped default (defined in the package's own params): drop Sentry events
            // for PHP warnings/notices converted to ErrorException. The exception itself
            // still propagates (SentryMiddleware re-throws). Overriding `before_send`
            // re-enables reporting of ErrorException events.
            'before_send' => static function (Event $event): ?Event {
                foreach ($event->getExceptions() as $exception) {
                    if ($exception->getType() === ErrorException::class) {
                        return null;
                    }
                }
                return $event;
            },
        ],
    ],
];
```

> [!IMPORTANT]
> yii-sentry passes the whole `'options'` map **verbatim** into `Sentry\Options` — it normalizes and validates nothing. Keys verified from yii-sentry's own sources are `dsn`, `environment`, `before_send`, `logger` (SDK client logger), and `transport`. Any other key — e.g. `release` or `traces_sample_rate` — is a **Sentry SDK option**, not a yii-sentry key: its name and value are validated by the Sentry SDK at runtime. Consult the official Sentry PHP SDK documentation (docs.sentry.io → PHP → Configuration → Options) for the full list.

DI and bootstrap, shipped by the package:

- `config/di.php` builds `Sentry\Options` from the params group, binds `HubInterface::class => Hub::class`, and wires `SentryCronMonitor` with the `cron-monitoring` params. `SentryMiddleware` and `SentryConsoleHandler` are autowire-only.
- `config/bootstrap.php` builds the client via `ClientBuilder`, sets the container's `Psr\Log\LoggerInterface` as the SDK client logger when no SDK logger is configured, binds the client to the container `HubInterface`, and registers the hub as the current hub (`SentrySdk::setCurrentHub()`).

Placement: `SentryMiddleware` must be added **right after `ErrorCatcher`** in the middleware pipeline — expressed through the canonical `Application` / `MiddlewareDispatcher` wiring shown in section 2 (there is no `'middlewares'` params key):

```php
// config/web/di/application.php (excerpt) — pipeline context in section 2,
// the complete Application::class definition in the PSR-15 Middlewares Guide, §4.1.
'middlewareDefinitions' => [
    ErrorCatcher::class,
    SentryMiddleware::class,   // <-- right after ErrorCatcher
    // ... ExceptionResponder, application middlewares, Router
],
```

### 8.3. Sentry Console Integration & Cron Monitoring

When the DSN is set, `yiisoft/yii-sentry`'s shipped `config/events-console.php` registers its console listeners. The whole file returns `[]` when `$params['yiisoft/yii-sentry']['options']['dsn']` is empty — **without a DSN, all console integration (including cron monitoring) is inactive**.

**Error capture.** With `'handleConsoleErrors' => true` (default), the package registers `Yiisoft\Yii\Sentry\SentryConsoleHandler` under Symfony Console's `ConsoleErrorEvent`. Its `handle(ConsoleErrorEvent $event)` calls `$this->hub->captureException($event->getError())` without stopping or modifying the event. Any exception escaping a CLI command is thus reported to Sentry (see section 9 for the surrounding console error architecture).

**Cron monitoring.** The `'cron-monitoring'` params map keys are **console command names** (matched against `$command->getName()`); unmapped and unnamed commands are silently ignored. Each value is either a plain slug string or an array:

- **Plain string** — check-ins only; no monitor configuration is upserted.
- **Array** — additionally upserts the monitor configuration on each check-in. Keys are **camelCase**:

| Key | Type | Meaning |
|---|---|---|
| `slug` | string, required, non-empty | Sentry monitor slug (throws `InvalidArgumentException` when missing/empty) |
| `schedule` | string, optional | Crontab expression; **required for the monitor-config upsert** (absent → check-in sent without upsert) |
| `timezone` | string, optional | Defaults to `date_default_timezone_get()` |
| `checkinMargin` | int | Margin in minutes |
| `maxRuntime` | int | Maximum runtime in minutes |
| `failureIssueThreshold` | int | Forwarded only when the installed `sentry/sentry` version supports it (added in 4.4) |
| `recoveryThreshold` | int | Forwarded only when the installed `sentry/sentry` version supports it (added in 4.4) |

In `config/common/params.php`:

```php
<?php

declare(strict_types=1);

return [
    'yiisoft/yii-sentry' => [
        'cron-monitoring' => [
            // Plain-string form: check-ins only, no monitor configuration upsert.
            'backup:run' => 'database-backup',

            // Array form: upserts the monitor configuration on each check-in.
            'reports:generate' => [
                'slug' => 'daily-reports',
                'schedule' => '0 2 * * *',
                'timezone' => 'UTC',
                'checkinMargin' => 5,
                'maxRuntime' => 30,
                'failureIssueThreshold' => 3,
                'recoveryThreshold' => 1,
            ],
        ],
    ],
];
```

Check-in lifecycle: on `ConsoleCommandEvent`, `SentryCronMonitor::handleCommand()` sends an `in_progress` check-in (`monitorConfig` is passed only for the array form). On `ConsoleTerminateEvent`, `handleTerminate()` derives the final status from the exit code — `ok` when `$event->getExitCode() === 0`, `error` otherwise — and sends the final check-in with the measured duration. Cron monitoring requires the DSN to be set and works for commands run via `yiisoft/yii-console`. Per the package docblock: since the final status is sent on `ConsoleTerminateEvent` only, an error listener that resets the exit code to `0` results in an `ok` check-in.

---

## 9. Console Error Handling Architecture

In CLI environments (`yiisoft/yii-console` and `yiisoft/yii-runner-console`), error handling operates through Symfony Console events rather than PSR-15 middlewares. `yiisoft/yii-console` does **not** dispatch `ApplicationError`; the delivery chain is: Symfony Console event surface → `Yiisoft\Yii\Console\SymfonyEventDispatcher` (implements the Symfony dispatcher contract, delegates to the PSR-14 dispatcher) → PSR-14 listener maps.

Execution flow of `Yiisoft\Yii\Runner\Console\ConsoleApplicationRunner::run()`:

1. **`$application->start($input)`** then **`$application->run($input, $output)`** inside a `try` block.
2. On a `Throwable` escaping the application: **`Yiisoft\Yii\Console\Application::renderThrowable()`** renders the exception to terminal output. If it implements `FriendlyExceptionInterface`, the friendly title and solution note are printed via Symfony Console styles (or raw ANSI tags); the stack trace is always appended.
3. In the `finally` block: `$application->shutdown($exitCode)` and `exit($exitCode)`. An escaping throwable leaves the exit code at its initial value `1` (`Yiisoft\Yii\Console\ExitCode::UNSPECIFIED_ERROR`).
4. **`ConsoleErrorEvent` logging**: handled by `Yiisoft\Yii\Console\ErrorListener::onError(ConsoleErrorEvent $event)` — one PSR-3 `error()` entry with message `'%s: %s in %s:%s while running console command "%s".'` and context `['exception' => $exception]`. The listener's constructor takes `?LoggerInterface $logger = null` and returns early without a logger.

Console error logging works **out of the box**: `yiisoft/yii-console` ships its own `events-console` group subscribing `ConsoleErrorEvent` to `[ErrorListener::class, 'onError']` (the shipped group is quoted in the [Events & Listeners Guide, §6.2](core-events-reference.md#62-console-application-lifecycle-yiisoftyii-console)), which `yiisoft/config` auto-merges. The app template ships no events file of its own. Register an app-level file under the shared `events` group in `config/configuration.php` (see section 8.1) only to customize behavior — e.g. swapping in a different listener.

---

## 10. Low-Level PHP Error Handling (`ErrorHandler`)

`Yiisoft\ErrorHandler\ErrorHandler` handles out-of-memory errors, fatals, warnings, notices and exceptions outside the PSR-15 HTTP pipeline (e.g. in console or long-running scripts; the HTTP runner also uses it as a temporary error handler before the DI container exists).

Constructor (exact names, order, and defaults):

```php
public function __construct(
    \Psr\Log\LoggerInterface $logger,
    \Yiisoft\ErrorHandler\ThrowableRendererInterface $defaultRenderer,
    ?\Psr\EventDispatcher\EventDispatcherInterface $eventDispatcher = null,
    int $exitShutdownHandlerDepth = 2,
)
```

Key API and behavior:

- **`debug`** defaults to `false` (production mode). `debug(bool $enable = true): void` toggles it; `handle()` renders via `renderVerbose()` when debug is enabled and via `render()` otherwise.
- **`handle(Throwable $t, ?ThrowableRendererInterface $renderer = null, ?ServerRequestInterface $request = null): ErrorData`** always logs first: `$this->logger->error($t->getMessage(), ['throwable' => $t])` (PSR-3 level `error`, context key `throwable`). If rendering itself throws, it falls back to `new ErrorData((string) $t)`. Pass `Psr\Log\NullLogger` to disable logging.
- **`register()`** is idempotent (guarded by an internal flag): it pre-allocates the memory reserve, registers `set_exception_handler` (renders and terminates), and registers `set_error_handler` converting warnings and notices honoring the `error_reporting()` mask into `Yiisoft\ErrorHandler\Exception\ErrorException` (capturing detailed Xdebug backtraces when `xdebug_get_function_stack` exists and, on Xdebug 3+, `xdebug.mode` contains `develop`).
- **`unregister()`** clears the memory reserve and disables handling.
- **Memory reserve (`memoryReserveSize(int $size)`)**: pre-allocates memory (default: `262_144` = 256 KB, `0` disables) so OOM fatals can still be formatted and logged.
- Initialization sets `ini_set('display_errors', '0')` and registers a shutdown function that, on `error_get_last()` + `ErrorException::isFatalError()` (covering `E_ERROR`, `E_PARSE`, `E_CORE_ERROR`, `E_CORE_WARNING`, `E_COMPILE_ERROR`, `E_COMPILE_WARNING`), builds an `ErrorException` and renders + terminates.
- **`renderThrowableAndTerminate()`** (used by the exception handler): restores the working directory, calls `unregister()`, preventively sets `http_response_code(500)`, echoes `handle($t)`, dispatches `ApplicationError` (only when a dispatcher was injected), and terminates with exit code `1`.

Minimal console-script usage (from the package README):

```php
<?php

declare(strict_types=1);

use Psr\Log\LoggerInterface;
use Yiisoft\ErrorHandler\ErrorHandler;
use Yiisoft\ErrorHandler\Renderer\HtmlRenderer;

/** @var LoggerInterface $logger Resolved from the DI container. */
$errorHandler = new ErrorHandler($logger, new HtmlRenderer());
$errorHandler->memoryReserveSize(524_288); // Optional; default is 262_144 (256 KB).
$errorHandler->register(); // Idempotent; once per process.
```

**Runner integration.** Before the DI container exists, `yiisoft/yii-runner-http` creates a temporary error handler — `new ErrorHandler($logger ?? new NullLogger(), new HtmlRenderer())` — so early failures are still rendered and logged. After the container is built, the container-configured `ErrorHandler::class` replaces it: the runner unregisters the temporary instance and enables `debug()` when the runner runs in debug mode.

---
