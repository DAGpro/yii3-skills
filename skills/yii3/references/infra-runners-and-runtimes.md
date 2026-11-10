# Yii3 Application Runners & Runtimes Architecture Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Architecture guide for Yii3 application entry points, the standard HTTP and console runners (`yii-runner-http`, `yii-runner-console`), PSR-14 application lifecycle events, and the runtime selection matrix. The worker runtimes and worker-mode state safety are owned by dedicated child guides: the [RoadRunner Worker Runtime Guide](infra-runtime-roadrunner.md) (§4), the [FrankenPHP Worker Runtime Guide](infra-runtime-frankenphp.md) (§5), and the [Long-Running Worker Safety & StateResetter Guide](infra-state-resetter.md) (§6).

---

> **TL;DR:** Runner architecture & lifecycle events (§1); the standard HTTP runner (§2); console runner (§3); runtime comparison matrix (§7). Worker runtimes and state safety are child guides (§4–§6 pointers below).
> **Read in full when:** choosing or configuring the application entry point (web vs console vs worker) or debugging application lifecycle events.

## Table of Contents
- [1. Application Runner Architecture & Lifecycle](#1-application-runner-architecture--lifecycle)
  - [1.1. Decoupled Bootstrapping & Runner Hierarchy](#11-decoupled-bootstrapping--runner-hierarchy)
  - [1.2. The `ApplicationRunner` Contract & 17 Parameters](#12-the-applicationrunner-contract--17-parameters)
  - [1.3. Bootstrap Phase (`BootstrapRunner`)](#13-bootstrap-phase-bootstraprunner)
  - [1.4. Application Lifecycle Events (HTTP & Console)](#14-application-lifecycle-events-http--console)
- [2. Standard HTTP Runner (`yiisoft/yii-runner-http`)](#2-standard-http-runner-yiisoftyii-runner-http)
  - [2.1. `public/index.php` Entry Point & CLI-Server Bypass](#21-publicindexphp-entry-point--cli-server-bypass)
  - [2.2. Temporary Error Handling Mechanics](#22-temporary-error-handling-mechanics)
  - [2.3. SAPI Response Emitting (`yiisoft/psr-emitter`)](#23-sapi-response-emitting-yiisoftpsr-emitter)
  - [2.4. The `EmitterMiddleware` Double-Emit Trap](#24-the-emittermiddleware-double-emit-trap)
  - [2.5. In-Memory Functional Testing (`runAndGetResponse`)](#25-in-memory-functional-testing-runandgetresponse)
  - [2.6. Runner Response Filtering Middlewares](#26-runner-response-filtering-middlewares)
- [3. Console Application Runner (`yiisoft/yii-runner-console`)](#3-console-application-runner-yiisoftyii-runner-console)
  - [3.1. `yii` Script Entry Point](#31-yii-script-entry-point)
  - [3.2. Console Lifecycle & Process Termination](#32-console-lifecycle--process-termination)
  - [3.3. Lazy Command Loading (`CommandLoader`)](#33-lazy-command-loading-commandloader)
  - [3.4. Semantic Exit Codes (`ExitCode`)](#34-semantic-exit-codes-exitcode)
  - [3.5. Built-in Development Web Server (`yii serve`)](#35-built-in-development-web-server-yii-serve)
  - [3.6. Friendly Exception Console Rendering](#36-friendly-exception-console-rendering)
- [4. RoadRunner Worker Runtime (`yiisoft/yii-runner-roadrunner`)](#4-roadrunner-worker-runtime-yiisoftyii-runner-roadrunner) — full reference in the [RoadRunner Worker Runtime Guide](infra-runtime-roadrunner.md)
- [5. FrankenPHP Worker Runtime (`yiisoft/yii-runner-frankenphp`)](#5-frankenphp-worker-runtime-yiisoftyii-runner-frankenphp) — full reference in the [FrankenPHP Worker Runtime Guide](infra-runtime-frankenphp.md)
- [6. Long-Running Worker Safety & StateResetter](#6-long-running-worker-safety--stateresetter) — full reference in the [Long-Running Worker Safety & StateResetter Guide](infra-state-resetter.md)
- [7. Runtime Comparison Matrix](#7-runtime-comparison-matrix)
- [8. Anti-Patterns & Common Traps](#8-anti-patterns--common-traps)
- [9. Related Topic Guides](#9-related-topic-guides)

---

## 1. Application Runner Architecture & Lifecycle

### 1.1. Decoupled Bootstrapping & Runner Hierarchy

In Yii3, application bootstrapping is completely decoupled from monolithic application classes. There are **no global static facades** such as `Yii::$app->run()`. Instead, execution orchestration is encapsulated inside standalone runner classes implementing `Yiisoft\Yii\Runner\RunnerInterface`:

```php
namespace Yiisoft\Yii\Runner;

interface RunnerInterface
{
    public function run(): void;
}
```

The runner coordinates four distinct bootstrapping phases:

```
┌────────────────────────────────────────────────────────┐
│ 1. Configuration Assembly: Yiisoft\Config\Config       │
│    Reads composer merge plan, merges config groups     │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. Container Compilation: Yiisoft\Di\Container         │
│    Builds PSR-11 container with definitions/delegates  │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 3. Bootstrap & Event Verification                      │
│    Executes bootstrap callbacks; verifies listeners   │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 4. Application Dispatch & Execution                    │
│    Resolves Application instance, runs request pipeline│
└────────────────────────────────────────────────────────┘
```

All concrete application runners extend `Yiisoft\Yii\Runner\ApplicationRunner`:

```
                    ┌───────────────────────────┐
                    │      RunnerInterface      │
                    └─────────────▲─────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │     ApplicationRunner     │ (abstract)
                    └─────────────▲─────────────┘
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
┌────────┴──────────────┐┌────────┴──────────────┐┌────────┴──────────────┐
│  HttpApplicationRunner ││ConsoleApplicationRunner││FrankenPHPApplication- │
│ (yiisoft/yii-runner-  ││ (yiisoft/yii-runner-  ││        Runner         │
│         http)         ││       console)        ││(yiisoft/yii-runner-   │
└───────────────────────┘└───────────────────────┘│      frankenphp)      │
                                                  └───────────────────────┘
                                  │
                                  ├────────────────────────┐
                                  │                        │
                    ┌─────────────┴──────────────┐┌────────┴──────────────┐
                    │RoadRunnerHttpApplication-  ││ RoadRunnerGrpc-       │
                    │           Runner           ││   ApplicationRunner   │
                    │(yiisoft/yii-runner-        ││(yiisoft/yii-runner-   │
                    │        roadrunner)         ││      roadrunner)      │
                    └────────────────────────────┘└───────────────────────┘
```

---

### 1.2. The `ApplicationRunner` Contract & 17 Parameters

The abstract `Yiisoft\Yii\Runner\ApplicationRunner` declares **17 constructor parameters**.

> [!IMPORTANT]
> In the abstract `ApplicationRunner` class, **parameters 1 through 13 have NO default values**. Default values (e.g. `debug: false`, `bootstrapGroup: 'bootstrap-web'`, `eventsGroup: 'events-web'`) are declared strictly by concrete subclasses (`HttpApplicationRunner`, `ConsoleApplicationRunner`, etc.).

| # | Parameter | Type | Default in `ApplicationRunner` | Default in `HttpApplicationRunner` | Default in `ConsoleApplicationRunner` | Purpose |
|:---:|:---|:---|:---:|:---:|:---:|:---|
| 1 | `$rootPath` | `string` | *(none)* | *(required)* | *(required)* | Absolute filesystem path to the project root directory. |
| 2 | `$debug` | `bool` | *(none)* | `false` | `false` | Enables debug mode and validates DI container configuration. |
| 3 | `$checkEvents` | `bool` | *(none)* | `false` | `false` | Validates event listener signatures against event types at boot. |
| 4 | `$environment` | `?string` | *(none)* | `null` | `null` | Environment name for config overrides (e.g. `'dev'`, `'prod'`, `'test'`). |
| 5 | `$bootstrapGroup` | `string` | *(none)* | `'bootstrap-web'` | `'bootstrap-console'` | Config group containing bootstrap callbacks executed before handling requests. |
| 6 | `$eventsGroup` | `string` | *(none)* | `'events-web'` | `'events-console'` | Config group containing PSR-14 event listener mappings. |
| 7 | `$diGroup` | `string` | *(none)* | `'di-web'` | `'di-console'` | Config group containing DI container service definitions. |
| 8 | `$diProvidersGroup` | `string` | *(none)* | `'di-providers-web'` | `'di-providers-console'` | Config group containing Service Provider class names. |
| 9 | `$diDelegatesGroup` | `string` | *(none)* | `'di-delegates-web'` | `'di-delegates-console'` | Config group containing delegating container definitions. |
| 10 | `$diTagsGroup` | `string` | *(none)* | `'di-tags-web'` | `'di-tags-console'` | Config group containing service tag mappings. |
| 11 | `$paramsGroup` | `string` | *(none)* | `'params-web'` | `'params-console'` | Config group containing application parameter arrays. |
| 12 | `$nestedParamsGroups` | `array` | *(none)* | `['params']` | `['params']` | Config groups merged recursively into `$paramsGroup`. |
| 13 | `$nestedEventsGroups` | `array` | *(none)* | `['events']` | `['events']` | Config groups merged recursively and in reverse order into `$eventsGroup`. |
| 14 | `$configModifiers` | `array` | `[]` | `[]` | `[]` | Array of modifier objects for `Yiisoft\Config\Config`. |
| 15 | `$configDirectory` | `string` | `'config'` | `'config'` | `'config'` | Relative directory path from `$rootPath` to configuration files. |
| 16 | `$vendorDirectory` | `string` | `'vendor'` | `'vendor'` | `'vendor'` | Relative directory path from `$rootPath` to Composer vendor directory. |
| 17 | `$configMergePlanFile` | `string` | `'.merge-plan.php'` | `'.merge-plan.php'` | `'.merge-plan.php'` | Relative path from `$configDirectory` to Composer merge plan. |

#### Immutable Modifiers and Lazy Resolvers
`ApplicationRunner` provides immutable methods to replace pre-compiled configurations or containers:
- `withConfig(ConfigInterface $config): static`: Clones the runner with a custom configuration instance.
- `withContainer(ContainerInterface $container): static`: Clones the runner with an externally built PSR-11 container.
- `getConfig(): ConfigInterface`: Lazily creates and caches the default `Yiisoft\Config\Config` instance if not previously set.
- `getContainer(): ContainerInterface`: Lazily builds the DI container. When using `Yiisoft\Di\Container`, it resolves `ContainerInterface::class` from itself to ensure delegating resolution operates correctly.

---

### 1.3. Bootstrap Phase (`BootstrapRunner`)

Before dispatching requests or commands, `ApplicationRunner::runBootstrap()` loads the configured `$bootstrapGroup` from `Config` and executes all entries using `Yiisoft\Yii\Runner\BootstrapRunner`:

```php
namespace Yiisoft\Yii\Runner;

use Psr\Container\ContainerInterface;
use RuntimeException;

final class BootstrapRunner implements RunnerInterface
{
    public function __construct(
        private ContainerInterface $container,
        private array $bootstrapList = [],
    ) {}

    public function run(): void
    {
        foreach ($this->bootstrapList as $callback) {
            if (!is_callable($callback)) {
                throw new RuntimeException(
                    sprintf(
                        'Bootstrap callback must be callable, "%s" given.',
                        get_debug_type($callback),
                    ),
                );
            }
            $callback($this->container);
        }
    }
}
```

#### Bootstrap Execution Guarantees:
1. **Strict Callable Validation:** Every item in the bootstrap group must be a valid PHP callable (`function (ContainerInterface $container): void`). If an invalid entry is encountered, a `RuntimeException` is thrown immediately.
2. **Container Injection:** Each bootstrap callable receives the fully compiled PSR-11 container as its only argument.
3. **Early Exit on Empty Config:** If the configuration group is missing or contains an empty array, `runBootstrap()` returns immediately without allocating `BootstrapRunner`.

---

### 1.4. Application Lifecycle Events (HTTP & Console)

Yii3 applications dispatch PSR-14 events at critical lifecycle boundaries. The event classes, payloads, and exact dispatch points are owned by the [Events Reference Guide](core-events-reference.md), sections [6.1](core-events-reference.md#61-http-application-lifecycle-yiisoftyii-http) (HTTP: `ApplicationStartup`, `BeforeRequest`, `AfterRequest`, `AfterEmit`, `ApplicationShutdown`) and [6.2](core-events-reference.md#62-console-application-lifecycle-yiisoftyii-console) (Console: `ApplicationStartup`, `ApplicationShutdown`) — subscribe to them exactly as described there.

What matters for runtime selection is the **execution frequency**, which differs substantially between classic short-lived SAPI runtimes and persistent worker daemons:

#### Comparative Lifecycle Frequency Matrix

| Lifecycle Hook | Classic HTTP (PHP-FPM / FastCGI) | RoadRunner Persistent Worker | FrankenPHP Worker Mode | Console CLI Command |
|:---|:---|:---|:---|:---|
| **Application Startup** | Every HTTP request | **Once** on worker process launch | **Once** on worker thread boot | Once per CLI invocation |
| **Request / Command Processing** | Every HTTP request | Every HTTP request | Every HTTP request | Once per CLI command |
| **Response Emission / Output** | Every HTTP request | Every HTTP request | Every HTTP request | Live terminal streaming |
| **`StateResetter::reset()`** | N/A (OS reclaims memory) | **Mandatory after every request** | **Mandatory after every request** | N/A (Process exits) |
| **`gc_collect_cycles()`** | N/A | **Executed after every request** | **Executed after every request** | N/A |
| **Application Shutdown** | Every HTTP request | **Once** on daemon worker exit | **Once** on worker recycling | Once on CLI exit |

---

## 2. Standard HTTP Runner (`yiisoft/yii-runner-http`)

The standard HTTP runner operates in classic PHP request-response environments (PHP-FPM, Apache `mod_php`, Nginx FastCGI). The process boots for each request, handles it through the middleware pipeline, emits output to SAPI, and terminates.

```shell
composer require yiisoft/yii-runner-http
```

### 2.1. `public/index.php` Entry Point & CLI-Server Bypass

```php
<?php

declare(strict_types=1);

use App\Environment;
use Psr\Log\LogLevel;
use Yiisoft\ErrorHandler\ErrorHandler;
use Yiisoft\ErrorHandler\Renderer\HtmlRenderer;
use Yiisoft\Log\Logger;
use Yiisoft\Log\StreamTarget;
use Yiisoft\Yii\Runner\Http\HttpApplicationRunner;

$root = dirname(__DIR__);

// 1. Require Composer autoloader and application environment setup
require_once $root . '/src/bootstrap.php';

// 2. Built-in PHP CLI development server static file bypass
if (PHP_SAPI === 'cli-server') {
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
    if ($path !== false && is_file(__DIR__ . $path)) {
        return false; // Let built-in server serve static file as-is
    }
    // Correct script name for URIs containing dots (e.g. /api/v1.0/users)
    $_SERVER['SCRIPT_NAME'] = '/index.php';
}

// 3. Initialize and execute the HTTP Application Runner
$runner = new HttpApplicationRunner(
    rootPath: $root,
    debug: Environment::appDebug(),
    checkEvents: Environment::appDebug(),
    environment: Environment::appEnv(),
    temporaryErrorHandler: new ErrorHandler(
        new Logger([
            new StreamTarget(levels: [
                LogLevel::EMERGENCY,
                LogLevel::ERROR,
                LogLevel::WARNING,
            ]),
        ]),
        new HtmlRenderer(),
    ),
);

$runner->run();
```

#### Constructor Parameters in `HttpApplicationRunner`:
`HttpApplicationRunner` accepts **24 constructor parameters**: the 17 base parameters from `ApplicationRunner`, plus:
- `?ErrorHandler $temporaryErrorHandler = null`: The error handler used while loading configuration and compiling the container.
- `?EmitterInterface $emitter = null`: The response emitter (defaults to `new SapiEmitter()`). Note that **`withEmitter()` does not exist**; inject custom emitters via this constructor parameter.
- *(Deprecated)* `?LoggerInterface $logger = null`: Deprecated in favor of `$temporaryErrorHandler`.
- *(Deprecated)* `?int $bufferSize = null`: Deprecated in favor of passing a configured `SapiEmitter` to `$emitter`.
- *(Deprecated)* `bool $useRemoveBodyByStatusMiddleware = true`: Deprecated in favor of `RemoveBodyMiddleware`.
- *(Deprecated)* `bool $useContentLengthMiddleware = true`: Deprecated in favor of `ContentLengthMiddleware`.
- *(Deprecated)* `bool $useHeadRequestMiddleware = true`: Deprecated in favor of `HeadRequestMiddleware`.

> [!NOTE]
> **The runner reads no environment variables itself** — `environment` is an ordinary constructor parameter (`?string $environment = null`). Environment detection happens one level up: the `yiisoft/app` template passes `App\Environment::appEnv()` (backed by `APP_ENV`, default `'prod'`; invalid values throw `RuntimeException`: `APP_ENV="%s" is invalid. Valid values are "dev", "test", "prod".`) and `App\Environment::appDebug()` (backed by `APP_DEBUG`). Snippets like `$_ENV['YII_ENV'] ?? null` appear only in runner README examples — do not mistake them for runner behavior.

---

### 2.2. Temporary Error Handling Mechanics

Because configuration merging and container compilation can encounter fatal errors before the application error handler is constructed, `HttpApplicationRunner` employs a **two-phase error handling strategy**:

1. **Pre-Container Interception:** Before compiling `Config` and `Container`, the runner registers `$temporaryErrorHandler`. If `$debug` is true, `$temporaryErrorHandler->debug()` is activated. It captures PHP notices, syntax errors, and fatal exceptions that occur while parsing configuration files.
2. **Container Handover:** Once the container compiles successfully, the runner resolves the application's real `Yiisoft\ErrorHandler\ErrorHandler` from the container. It unregisters the temporary error handler and registers the container-configured handler.

---

### 2.3. SAPI Response Emitting (`yiisoft/psr-emitter`)

By default, `HttpApplicationRunner` transmits PSR-7 responses via `Yiisoft\PsrEmitter\SapiEmitter`:

```shell
composer require yiisoft/psr-emitter
```

| Class | Contract / Description |
|:---|:---|
| `Yiisoft\PsrEmitter\EmitterInterface` | Contract: `public function emit(ResponseInterface $response): void;`. Throws `HeadersHaveBeenSentException` if headers were sent. |
| `Yiisoft\PsrEmitter\SapiEmitter` | Sends HTTP headers via `header()`, HTTP status line via `header()`, and streams body chunks via `echo` and `flush()`. |
| `Yiisoft\PsrEmitter\FakeEmitter` | Test double capturing the last response: `getLastResponse(): ?ResponseInterface`. |
| `Yiisoft\PsrEmitter\HeadersHaveBeenSentException` | Friendly exception implementing `FriendlyExceptionInterface` reporting exact filename and line where output began. |

`SapiEmitter::__construct(?int $bufferSize = null)` streams response bodies in chunks of `$bufferSize` bytes (default: `8_388_608` bytes / 8 MB). For streaming large files, lower the buffer size to flush chunks early:

```php
use Yiisoft\PsrEmitter\SapiEmitter;

$emitter = new SapiEmitter(4_194_304); // 4 MB chunk streaming
$emitter->emit($response);
```

#### Grounded Emission Sequence in `SapiEmitter`:
1. Executes `headers_sent()`. If true, immediately throws `HeadersHaveBeenSentException`.
2. Calls `header_remove()` to clear default PHP headers.
3. Iterates over all headers and sends each line via `header("$name: $value", false)`.
4. Sends the HTTP status line (e.g. `HTTP/1.1 200 OK`).
5. Flushes existing output buffers (`ob_end_flush()` / `flush()`).
6. Rewinds a seekable stream body, reads in `$bufferSize` blocks, and echoes chunks until EOF.

---

### 2.4. The `EmitterMiddleware` Double-Emit Trap

> [!CAUTION]
> **CRITICAL ARCHITECTURAL DEFECT:** Never register `EmitterMiddleware::class` in `middlewareDefinitions` of an application managed by `HttpApplicationRunner`!

`EmitterMiddleware` is a PSR-15 middleware provided by `yiisoft/psr-emitter`:

```php
// Yiisoft\PsrEmitter\EmitterMiddleware::process()
public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
{
    $response = $handler->handle($request);
    $this->emitter->emit($response);
    return $response;
}
```

Now examine how `HttpApplicationRunner::runInternal()` completes request dispatching:

```php
// Yiisoft\Yii\Runner\Http\HttpApplicationRunner:220–221
$response = $application->handle($request);
$this->emit($emitter, $request, $response);
```

#### The Failure Cascade:
1. `HttpApplicationRunner` invokes `$application->handle($request)`.
2. The middleware pipeline reaches `EmitterMiddleware`.
3. `EmitterMiddleware` handles the inner pipeline and immediately calls `$this->emitter->emit($response)`, transmitting headers and echoing the body to the client.
4. `EmitterMiddleware` returns `$response` back up the stack.
5. `$application->handle()` finishes and returns `$response` to `HttpApplicationRunner`.
6. `HttpApplicationRunner` invokes its own response emission: `$this->emit($emitter, $request, $response)`.
7. `SapiEmitter::emitHeaders()` checks `headers_sent()`. Because `EmitterMiddleware` already sent the headers in step 3, `headers_sent()` evaluates to `true`.
8. `SapiEmitter` throws `Yiisoft\PsrEmitter\HeadersHaveBeenSentException`; `HttpApplicationRunner::emit()` catches it and rethrows its own `Yiisoft\Yii\Runner\Http\Exception\HeadersHaveBeenSentException` — the exception application code (and error logs) actually observes — **crashing the application on every request**!

#### The Canonical Rule:
- In applications orchestrated by `HttpApplicationRunner` (or `FrankenPHPApplicationRunner`), the **runner is the sole owner of response emission**.
- `EmitterMiddleware` is designed **strictly for standalone micro-frameworks or isolated PSR-15 pipelines** that execute without an application runner.

---

### 2.5. In-Memory Functional Testing (`runAndGetResponse`)

`HttpApplicationRunner` provides first-class support for in-memory functional and integration testing without opening network sockets, starting web servers, or producing SAPI output:

```php
public function runAndGetResponse(?ServerRequestInterface $request = null): ResponseInterface
```

#### Grounded Mechanics:
1. Automatically substitutes `SapiEmitter` with an internal `FakeEmitter`.
2. Accepts an optional custom `ServerRequestInterface`. If omitted, creates the request from superglobals.
3. Dispatches the full application pipeline, firing `ApplicationStartup`, `BeforeRequest`, `AfterRequest`, `AfterEmit`, and `ApplicationShutdown`.
4. Returns the generated PSR-7 `ResponseInterface` directly to the test assertion.

Complete functional test classes — direct `ServerRequestFactory` dispatch, the higher-level `FunctionalTestCase` from `yiisoft/yii-testing` (§1.1 there), and Codeception `Cest` wiring — are owned by the HTTP testing guide:

> [!TIP]
> **In-Memory HTTP Testing Reference:**
> For the complete reference on functional HTTP tests dispatched through `runAndGetResponse()` — full test classes, `FunctionalTestCase`, and Codeception wiring — see the [HTTP Testing Guide, §5. In-Memory HTTP Testing via `HttpApplicationRunner`](testing-http.md#5-in-memory-http-testing-via-httpapplicationrunner).

---

### 2.6. Runner Response Filtering Middlewares

`HttpApplicationRunner` incorporates built-in response compatibility filters:
1. **`removeBodyByStatusMiddleware`:** Clears response body stream for HTTP statuses `100 Continue`, `101 Switching Protocols`, `102 Processing`, `204 No Content`, `205 Reset Content`, and `304 Not Modified`.
2. **`contentLengthMiddleware`:** Calculates and sets `Content-Length` header if missing and body size is determinable (skips if `Transfer-Encoding` is present or status is `1xx`, `204`, `205`, `304`).
3. **`headRequestMiddleware`:** Empties body stream for `HEAD` requests while preserving headers.

> [!NOTE]
> These constructor parameters are marked `@deprecated` in `HttpApplicationRunner`. In modern Yii3 applications, configure `RemoveBodyMiddleware`, `ContentLengthMiddleware`, and `HeadRequestMiddleware` from `yiisoft/http-middleware` directly in the `middlewareDefinitions` configuration group.

---

## 3. Console Application Runner (`yiisoft/yii-runner-console`)

The console runner powers CLI commands and background worker processes built on Symfony Console.

```shell
composer require yiisoft/yii-runner-console
```

### 3.1. `yii` Script Entry Point

Create an executable script `yii` in the project root:

```php
#!/usr/bin/env php
<?php

declare(strict_types=1);

use App\Environment;
use Yiisoft\Yii\Runner\Console\ConsoleApplicationRunner;

$root = __DIR__;

require_once $root . '/src/bootstrap.php';

$runner = new ConsoleApplicationRunner(
    rootPath: $root,
    debug: Environment::appDebug(),
    checkEvents: Environment::appDebug(),
    environment: Environment::appEnv(),
);

$runner->run();
```

Make the script executable:
```bash
chmod +x yii
```

On Windows, add `yii.bat` to the project root:
```bat
@echo off
php "%~dp0yii" %*
```

---

### 3.2. Console Lifecycle & Process Termination

The console lifecycle is managed by `ConsoleApplicationRunner::run()`:

```php
public function run(): void
{
    $this->runBootstrap();
    $this->checkEvents();

    /** @var Application $application */
    $application = $this->getContainer()->get(Application::class);
    $exitCode = ExitCode::UNSPECIFIED_ERROR;

    $input = new ArgvInput();
    $output = new ConsoleBufferedOutput();

    try {
        $application->start($input);
        $exitCode = $application->run($input, $output);
    } catch (Throwable $throwable) {
        $application->renderThrowable($throwable, $output);
    } finally {
        $application->shutdown($exitCode);
        exit($exitCode);
    }
}
```

#### Grounded Execution Sequence:
1. **Bootstrap & Event Verification:** Executes callbacks in `bootstrap-console` via `BootstrapRunner` and verifies listener signatures in `events-console`.
2. **Container Resolution:** Resolves `Yiisoft\Yii\Console\Application` from the container.
3. **Input / Output Allocation:** Creates `Symfony\Component\Console\Input\ArgvInput` and `Yiisoft\Yii\Console\Output\ConsoleBufferedOutput`.
4. **Startup Dispatch:** Calls `$application->start($input)`, dispatching `Yiisoft\Yii\Console\Event\ApplicationStartup` with the first CLI argument (`$input->getFirstArgument()`).
5. **Command Execution:** Calls `$application->run($input, $output)`. Symfony resolves the command and executes its handler.
6. **Exception Trapping:** Catches any unhandled `Throwable` and calls `$application->renderThrowable($throwable, $output)`.
7. **Shutdown Dispatch & Exit:** In `finally`, calls `$application->shutdown($exitCode)` (dispatching `Yiisoft\Yii\Console\Event\ApplicationShutdown`) and invokes `exit($exitCode)`.

> [!IMPORTANT]
> Because `ConsoleApplicationRunner::run()` manages process termination in its `finally` block, `Application::setAutoExit(false)` is mandatory in the console `Application` DI definition (`config/common/di/*.php`).

---

### 3.3. Lazy Command Loading (`CommandLoader`)

To prevent DI container overhead when executing commands or running `./yii list`, commands should be registered via `Yiisoft\Yii\Console\CommandLoader`.

#### Configuration in `config/console/params.php`:

```php
return [
    'yiisoft/yii-console' => [
        'name' => 'Yii Console',
        'version' => '1.0',
        'autoExit' => false,
        'commands' => [
            'serve' => Yiisoft\Yii\Console\Command\Serve::class,
            'user:create|u:c' => App\Command\CreateUserCommand::class,
            '|db:internal-sync' => App\Command\InternalSyncCommand::class,
        ],
    ],
];
```

#### Map Syntax Rules:
1. **Aliases (`name|alias1|alias2`):** Delimited by `|`. The first token is the primary command name; subsequent tokens are registered as aliases.
2. **Hidden Commands (`|command`):** A leading pipe symbol marks the command as hidden, omitting it from `./yii list`.
3. **Lazy Resolution:** `CommandLoader` inspects command descriptions without instantiating command classes (using PHP 8 `#[AsCommand]` attributes or `getDefaultDescription()`), wrapping them in `Symfony\Component\Console\Command\LazyCommand`. Heavy dependencies (database connections, HTTP clients) are never allocated until the command is actually executed.
4. **Namespace Normalization:** `Application::extractNamespace()` normalizes forward slashes (`/`) to colons (`:`), allowing both `./yii user/create` and `./yii user:create`.

---

### 3.4. Semantic Exit Codes (`ExitCode`)

`Yiisoft\Yii\Console\ExitCode` defines 17 standard semantic status codes based on FreeBSD's `sysexits(3)`. For the full constant table (sysexits names and recommended usage), see [Commands Guide, §6](infra-commands.md). Runtime descriptions are available via `ExitCode::getReason(int $code): string` (e.g. `getReason(ExitCode::NOINPUT)` returns `'Input file not found or unreadable'`).

---

### 3.5. Built-in Development Web Server (`yii serve`)

`yiisoft/yii-console` includes a development server command `Yiisoft\Yii\Console\Command\Serve`:

```bash
./yii serve --port=8080 --docroot=public
```

#### CLI Options & Flags:

| Option / Flag | Type | Default | Description |
|:---|:---:|:---|:---|
| `address` | *(argument)* | `'127.0.0.1'` | Host IP to bind (suggestions: `localhost`, `127.0.0.1`, `0.0.0.0`). |
| `--port` (`-p`) | `string` | `'8080'` | Listening port. |
| `--docroot` (`-t`) | `string` | `'public'` | Document root directory. |
| `--router` (`-r`) | `string` | `'public/index.php'` | Custom routing script. |
| `--workers` (`-w`) | `int` | `2` | Worker count for Linux (`PHP_CLI_SERVER_WORKERS`). |
| `--open` (`-o`) | `bool` | `false` | Automatically opens URL in default system web browser. |
| `--xdebug` (`-x`) | `bool` | `false` | Enables Xdebug session flags. |

#### Specific Exit Codes:
- `Serve::EXIT_CODE_NO_DOCUMENT_ROOT = 2`: Specified document root directory does not exist.
- `Serve::EXIT_CODE_NO_ROUTING_FILE = 3`: Specified custom router script does not exist.
- `Serve::EXIT_CODE_ADDRESS_TAKEN_BY_ANOTHER_PROCESS = 5`: Address and port are already in use by another application.

---

### 3.6. Friendly Exception Console Rendering

When an unhandled exception implements `Yiisoft\FriendlyException\FriendlyExceptionInterface`:
1. `Application::renderThrowable()` prints the standard exception message.
2. Formats a dedicated block displaying `$exception->getName()`.
3. If `$exception->getSolution()` is provided, renders the actionable solution in highlighted style (`$output->note()` or `<fg=yellow>`).

---

## 4. RoadRunner Worker Runtime (`yiisoft/yii-runner-roadrunner`)

> **Selection note:** The standard [HTTP runner (§2)](#2-standard-http-runner-yiisoftyii-runner-http) and [console runner (§3)](#3-console-application-runner-yiisoftyii-runner-console) are the default choices for PHP-FPM and CLI applications. The RoadRunner and FrankenPHP worker runtimes are **mutually exclusive with each other**: resolve which runner package is installed via the project's `composer.json` (`yiisoft/yii-runner-roadrunner` / `yiisoft/yii-runner-frankenphp`) or the [Package Catalog, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family).
>
> **For the complete reference on the RoadRunner worker runtime** — process architecture and Spiral companions, the persistent worker request loop, `worker.php` implementation and stderr redirection, `FileTarget` temporary error handling, `.rr.yaml` server configuration, and gRPC/Temporal workflow support — **see the** [RoadRunner Worker Runtime Guide](infra-runtime-roadrunner.md).

---

## 5. FrankenPHP Worker Runtime (`yiisoft/yii-runner-frankenphp`)

> **Selection note:** The standard [HTTP runner (§2)](#2-standard-http-runner-yiisoftyii-runner-http) and [console runner (§3)](#3-console-application-runner-yiisoftyii-runner-console) are the default choices for PHP-FPM and CLI applications. The FrankenPHP and RoadRunner worker runtimes are **mutually exclusive with each other**: resolve which runner package is installed via the project's `composer.json` (`yiisoft/yii-runner-frankenphp` / `yiisoft/yii-runner-roadrunner`) or the [Package Catalog, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family).
>
> **For the complete reference on the FrankenPHP worker runtime** — the Caddy CGO threading model and operating modes, `worker.php` implementation with `ignore_user_abort`, `MAX_REQUESTS` worker recycling, `Caddyfile` production and development configurations, in-memory functional testing, and scoped request access — **see the** [FrankenPHP Worker Runtime Guide](infra-runtime-frankenphp.md).

---

## 6. Long-Running Worker Safety & StateResetter

> **For the complete reference on long-running worker state safety** — the state bleeding and memory accumulation problem, the `StateResetter::class` definition trap, idiomatic per-service `'reset'` declarations, the ground-truth catalog of built-in package resetters, and `Closure::bindTo` scope binding — **see the** [Long-Running Worker Safety & StateResetter Guide](infra-state-resetter.md).
>
> Worker-mode state safety applies to **both** worker runtimes (RoadRunner, FrankenPHP) **and** long-running queue workers (`yiisoft/queue` `queue:listen` daemons) — it is not tied to one runtime.

---

## 7. Runtime Comparison Matrix

> Full worker-runtime references: [RoadRunner Worker Runtime Guide](infra-runtime-roadrunner.md) · [FrankenPHP Worker Runtime Guide](infra-runtime-frankenphp.md). The mandatory state reset for worker runtimes is owned by the [Long-Running Worker Safety & StateResetter Guide](infra-state-resetter.md).

| Feature / Metric | Classic SAPI (`yii-runner-http`) | [RoadRunner](infra-runtime-roadrunner.md) (`yii-runner-roadrunner`) | [FrankenPHP](infra-runtime-frankenphp.md) (`yii-runner-frankenphp`) | Console (`yii-runner-console`) |
|:---|:---|:---|:---|:---|
| **Process Model** | Process per request (forked worker) | Go process daemon + persistent PHP workers | Caddy web server + embedded PHP threads (CGO) | Short-lived CLI command process |
| **Framework Boot Overhead** | ~15–30 ms on every request | **0 ms** (pre-booted in memory) | **0 ms** (pre-booted in memory) | Full boot once per CLI execution |
| **Request Latency** | 20–50 ms | **0.5–2 ms** | **0.3–1.5 ms** | N/A |
| **Throughput (req/sec)** | Baseline (1x) | 5x – 10x | 6x – 12x | N/A |
| **`ApplicationStartup` Event** | Every HTTP request | **Once** on worker process launch | **Once** on worker thread boot | Once per CLI invocation |
| **`ApplicationShutdown` Event** | Every HTTP request | **Once** on worker recycling | **Once** on worker recycling | Once on command exit |
| **State Reset Requirement** | None (OS reclaims memory) | **Mandatory** (`StateResetter::reset()`) | **Mandatory** (`StateResetter::reset()`) | None |
| **In-Memory Functional Testing** | `$runner->runAndGetResponse()` | Custom `$runner->withPsr7Worker()` | `$runner->runAndGetResponse()` | `ConsoleBufferedOutput::fetch()` |
| **Worker Recycling Mechanism** | Native (PHP-FPM `pm.max_requests`) | `.rr.yaml` (`max_jobs: 1000`) | Env variable (`MAX_REQUESTS=500`) | N/A |
| **Binary Protocol Safety** | Standard HTTP headers/echo | `ini_set('display_errors', 'stderr')` | Protected via CGO API | Standard terminal streams |
| **Scoped Request Access** | Superglobals / RequestProvider | `yiisoft/request-provider` | `yiisoft/request-provider` | `ArgvInput` |
| **Local Dev Experience** | Built-in CLI server bypass | Hot reload (`debug: true` or `./rr reset`) | Hot reload (`watch` directive in Caddyfile) | Instant execution on save |

---

## 8. Anti-Patterns & Common Traps

| Anti-Pattern | Why It Fails | Grounded Idiomatic Solution |
|:---|:---|:---|
| **Adding `EmitterMiddleware` to `middlewareDefinitions`** | `HttpApplicationRunner` automatically emits the response after the pipeline finishes. `EmitterMiddleware` sends headers early, causing `HttpApplicationRunner::emit()` to crash with `HeadersHaveBeenSentException`. | Remove `EmitterMiddleware` from `middlewareDefinitions`. Emitters are managed exclusively by the application runner. |
| **Overriding `StateResetter::class` in DI definitions** | Defining `StateResetter::class` sets `$this->useResettersFromMeta = false;` in `Container.php:525`, completely disabling built-in resetters across all official packages (`CurrentUser`, `Session`, `CurrentRoute`, `RequestProvider`, etc.). | Never define `StateResetter::class`. Register custom resetters using `'reset' => function ()` directly inside individual service definitions. |
| **Writing to `stdout` under RoadRunner (`echo`, `var_dump`)** | In RoadRunner, standard I/O pipes are used for Goridge binary framing. Outputting raw text to `stdout` corrupts the payload framing and crashes the worker process. | Write output exclusively to PSR-7 `StreamInterface` or log to `stderr` / disk file. |
| **Forgetting `ini_set('display_errors', 'stderr')` in RoadRunner `worker.php`** | Unhandled PHP notices or engine warnings printed to `stdout` corrupt RoadRunner IPC communication. | Always set `ini_set('display_errors', 'stderr')` at the very top of `worker.php`. |
| **Calling `exit()` or `die()` in actions under persistent workers** | Kills the entire persistent worker process or thread prematurely, breaking worker pools. | Return a proper PSR-7 `ResponseInterface` instead of terminating the script. |
| **Storing state in static class properties** | Static properties persist across worker requests, bleeding data between users and causing unbounded memory leaks. | Use request attributes or services managed with `'reset' => function ()`. |
| **Caching `ServerRequestInterface` in singleton services without `RequestProviderInterface`** | In persistent workers, the cached request remains that of the first user, serving stale data or authorization tokens to subsequent users. | Inject `Yiisoft\RequestProvider\RequestProviderInterface` to obtain the scoped active request. |
| **Forgetting to unregister or clean open DB transactions on error** | An unhandled exception during a database operation leaves the transaction open on the connection, locking tables for all subsequent requests on that worker. | Add a `'reset'` closure to `ConnectionInterface` that checks `$this->getTransaction() !== null` and calls `rollBack()`. |
| **Using `autoExit = true` with `ConsoleApplicationRunner`** | Symfony Console terminates the process inside `Application::run()`, bypassing `ConsoleApplicationRunner`'s `finally` block and `ApplicationShutdown` event. | Set `'autoExit' => false` in `config/console/params.php`. The runner manages process exit explicitly. |

---

## 9. Related Topic Guides

- [RoadRunner Worker Runtime Guide](infra-runtime-roadrunner.md) — RoadRunner process architecture, persistent worker loop, `worker.php`, `.rr.yaml`, and gRPC/Temporal support (child of §4).
- [FrankenPHP Worker Runtime Guide](infra-runtime-frankenphp.md) — Caddy CGO worker threads, `worker.php`, `MAX_REQUESTS` recycling, and `Caddyfile` configurations (child of §5).
- [Long-Running Worker Safety & StateResetter Guide](infra-state-resetter.md) — Worker-mode state reset for RoadRunner, FrankenPHP, and queue workers (child of §6).
- [DI & Configuration Guide](core-di-and-config.md) — Config groups, definitions, modifiers, and container compilation.
- [Console Commands Guide](infra-commands.md) — CLI commands executed via `ConsoleApplicationRunner`.
- [PSR-15 Middlewares Guide](http-middlewares.md) — HTTP pipeline execution order and request catchers.
- [Error Handling Guide](infra-error-handling.md) — ErrorCatcher middleware, friendly exceptions, and temporary error handlers.
- [HTTP State Guide](http-state.md) — Sessions, cookies, and CSRF token handling.
- [Authentication & RBAC Guide](infra-auth-and-rbac.md) — `CurrentUser` lifecycle and identity management.
- [Events Reference Guide](core-events-reference.md) — Application lifecycle event classes, payloads, and dispatch points (§6.1–§6.2).
- [HTTP Testing Guide](testing-http.md) — Functional HTTP testing dispatched in-memory through `HttpApplicationRunner::runAndGetResponse()` (§5).
