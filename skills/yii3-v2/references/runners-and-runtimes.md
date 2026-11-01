# Yii3 Application Runners & Runtimes Architecture Guide

> Comprehensive architecture guide for Yii3 application entry points, runners (`yii-runner`, `yii-runner-http`, `yii-runner-console`), high-performance persistent worker daemons (RoadRunner and FrankenPHP), PSR-14 application lifecycle events, and DI container state safety (`StateResetter`).

---

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
- [4. RoadRunner Worker Runtime (`yiisoft/yii-runner-roadrunner`)](#4-roadrunner-worker-runtime-yiisoftyii-runner-roadrunner)
  - [4.1. Process Architecture & Spiral Companions](#41-process-architecture--spiral-companions)
  - [4.2. Persistent Worker Request Loop](#42-persistent-worker-request-loop)
  - [4.3. `worker.php` Implementation & Stderr Redirection](#43-workerphp-implementation--stderr-redirection)
  - [4.4. Temporary Error Handling with `FileTarget`](#44-temporary-error-handling-with-filetarget)
  - [4.5. RoadRunner Server Configuration (`.rr.yaml`)](#45-roadrunner-server-configuration-rryaml)
  - [4.6. gRPC & Temporal Workflow Support](#46-grpc--temporal-workflow-support)
- [5. FrankenPHP Worker Runtime (`yiisoft/yii-runner-frankenphp`)](#5-frankenphp-worker-runtime-yiisoftyii-runner-frankenphp)
  - [5.1. Caddy CGO Threading Model & Operating Modes](#51-caddy-cgo-threading-model--operating-modes)
  - [5.2. `worker.php` Implementation & `ignore_user_abort`](#52-workerphp-implementation--ignore_user_abort)
  - [5.3. Worker Recycling with `MAX_REQUESTS`](#53-worker-recycling-with-max_requests)
  - [5.4. `Caddyfile` Production & Development Configurations](#54-caddyfile-production--development-configurations)
  - [5.5. In-Memory Functional Testing](#55-in-memory-functional-testing)
  - [5.6. Scoped Request Access (`yiisoft/request-provider`)](#56-scoped-request-access-yiisoftrequest-provider)
- [6. Long-Running Worker Safety & StateResetter](#6-long-running-worker-safety--stateresetter)
  - [6.1. The State Bleeding & Memory Accumulation Problem](#61-the-state-bleeding--memory-accumulation-problem)
  - [6.2. The `StateResetter::class` Definition Trap](#62-the-stateresetterclass-definition-trap)
  - [6.3. Idiomatic Service Resetter Declaration](#63-idiomatic-service-resetter-declaration)
  - [6.4. Ground-Truth Catalog of Built-In Package Resetters](#64-ground-truth-catalog-of-built-in-package-resetters)
  - [6.5. Closure Scope Binding (`Closure::bindTo`)](#65-closure-scope-binding-closurebindto)
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

Yii3 applications dispatch PSR-14 events at critical lifecycle boundaries. The dispatch points and execution frequencies differ substantially between classic short-lived SAPI runtimes and persistent worker daemons.

#### HTTP Application Lifecycle Events (`Yiisoft\Yii\Http\Event\*`)

| Event FQCN | Readonly Payload | Dispatch Point & Frequency |
|:---|:---|:---|
| `Yiisoft\Yii\Http\Event\ApplicationStartup` | *(none, marker)* | Dispatched in `Application::start()`. In classic SAPI: **every request**. In persistent workers (RoadRunner / FrankenPHP): **once** on worker process boot. |
| `Yiisoft\Yii\Http\Event\BeforeRequest` | `public readonly ServerRequestInterface $request` | Dispatched at the top of `Application::handle($request)` before entering the middleware pipeline. Runs on **every request**. |
| `Yiisoft\Yii\Http\Event\AfterRequest` | `public readonly ?ResponseInterface $response` | Dispatched in the `finally` block of `Application::handle()`. Dispatched on **every request**, even if the middleware pipeline throws an unhandled exception (`$response === null`). |
| `Yiisoft\Yii\Http\Event\AfterEmit` | `public readonly ?ResponseInterface $response` | Dispatched in `Application::afterEmit(?ResponseInterface $response)` after the runner has finished transmitting response headers and body to the client. Runs on **every request**. |
| `Yiisoft\Yii\Http\Event\ApplicationShutdown` | *(none, marker)* | Dispatched in `Application::shutdown()`. In classic SAPI: **every request**. In persistent workers: **once** when the worker process terminates or recycles. |

#### Console Application Lifecycle Events (`Yiisoft\Yii\Console\Event\*`)

| Event FQCN | Payload & Accessors | Dispatch Point & Frequency |
|:---|:---|:---|
| `Yiisoft\Yii\Console\Event\ApplicationStartup` | `public ?string $commandName = null` | Dispatched in `Application::start(?ArgvInput $input)` before command execution. Runs **once per CLI command execution**. |
| `Yiisoft\Yii\Console\Event\ApplicationShutdown` | `public function getExitCode(): int` | Dispatched in `Application::shutdown(int $exitCode)` inside `ConsoleApplicationRunner::run()`'s `finally` block. Runs **once per CLI command completion**. |

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
            (new StreamTarget())->setLevels([
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
8. `SapiEmitter` throws `Yiisoft\PsrEmitter\HeadersHaveBeenSentException`, **crashing the application on every request**!

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

#### Canonical Functional Test Example:

```php
<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use HttpSoft\Message\ServerRequestFactory;
use PHPUnit\Framework\TestCase;
use Yiisoft\Http\Method;
use Yiisoft\Http\Status;
use Yiisoft\Yii\Runner\Http\HttpApplicationRunner;

final class SiteControllerTest extends TestCase
{
    public function testIndexPageReturnsSuccessfulResponse(): void
    {
        $root = dirname(__DIR__, 2);

        $runner = new HttpApplicationRunner(
            rootPath: $root,
            debug: true,
            checkEvents: true,
            environment: 'test',
        );

        $request = (new ServerRequestFactory())
            ->createServerRequest(Method::GET, '/');

        $response = $runner->runAndGetResponse($request);

        $this->assertSame(Status::OK, $response->getStatusCode());
        $this->assertSame('text/html; charset=UTF-8', $response->getHeaderLine('Content-Type'));
        $this->assertStringContainsString('Welcome to Yii3', (string) $response->getBody());
    }
}
```

---

### 2.6. Runner Response Filtering Middlewares

`HttpApplicationRunner` incorporates built-in response compatibility filters:
1. **`removeBodyByStatusMiddleware`:** Clears response body stream for HTTP statuses `100 Continue`, `101 Switching Protocols`, `102 Processing`, `204 No Content`, `205 Reset Content`, and `304 Not Modified`.
2. **`contentLengthMiddleware`:** Calculates and sets `Content-Length` header if missing and body size is determinable (skips if `Transfer-Encoding` is present or status is `1xx`, `204`, `304`).
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
> Because `ConsoleApplicationRunner::run()` manages process termination in its `finally` block, `Application::setAutoExit(false)` is mandatory in container configuration (`config/di-console.php`).

---

### 3.3. Lazy Command Loading (`CommandLoader`)

To prevent DI container overhead when executing commands or running `./yii list`, commands should be registered via `Yiisoft\Yii\Console\CommandLoader`.

#### Configuration in `config/params-console.php`:

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

`Yiisoft\Yii\Console\ExitCode` defines 17 standard semantic status codes based on FreeBSD's `sysexits(3)`:

| Constant | Value | Reason (`ExitCode::getReason($code)`) | Semantic Usage |
|:---|:---:|:---|:---|
| `ExitCode::OK` | `0` | `'Success'` | Successful termination. |
| `ExitCode::UNSPECIFIED_ERROR` | `1` | `'Unspecified error'` | Generic failure. |
| `ExitCode::USAGE` | `64` | `'Incorrect usage, argument or option error'` | Syntax error, missing or invalid CLI argument. |
| `ExitCode::DATAERR` | `65` | `'Error in input data'` | User-supplied data format invalid. |
| `ExitCode::NOINPUT` | `66` | `'Input file not found or unreadable'` | Missing input file. |
| `ExitCode::NOUSER` | `67` | `'User not found'` | User identity does not exist. |
| `ExitCode::NOHOST` | `68` | `'Host not found'` | Remote host unreachable. |
| `ExitCode::UNAVAILABLE` | `69` | `'A required service is unavailable'` | External service or dependency is down. |
| `ExitCode::SOFTWARE` | `70` | `'Internal error'` | Internal software exception or logic bug. |
| `ExitCode::OSERR` | `71` | `'Error making system call or using OS service'` | OS syscall failure (cannot fork, pipe error). |
| `ExitCode::OSFILE` | `72` | `'Error accessing system file'` | System file missing or unreadable. |
| `ExitCode::CANTCREAT` | `73` | `'Cannot create output file'` | Target output file cannot be created. |
| `ExitCode::IOERR` | `74` | `'I/O error'` | Hardware or disk I/O error. |
| `ExitCode::TEMPFAIL` | `75` | `'Temporary failure'` | Temporary issue; caller should retry. |
| `ExitCode::PROTOCOL` | `76` | `'Unexpected remote service behavior'` | Remote network protocol error. |
| `ExitCode::NOPERM` | `77` | `'Insufficient permissions'` | Permission denied. |
| `ExitCode::CONFIG` | `78` | `'Configuration error'` | Misconfiguration detected. |

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

[RoadRunner](https://roadrunner.dev/) is an application server and process manager written in Go. Instead of terminating after each request, PHP worker processes remain resident in memory, eliminating framework boot overhead.

```
┌────────────────────────────────────────────────────────┐
│ RoadRunner Go Server (Load Balancer, HTTP, gRPC)       │
└──────────────────────────┬─────────────────────────────┘
                           │ Pipes / Unix Domain Sockets (Goroutines)
                           ▼
┌────────────────────────────────────────────────────────┐
│ Persistent PHP Worker Process (worker.php)             │
│ - DI container stays compiled in memory                │
│ - Configuration remains loaded in memory               │
│ - Request loop receives PSR-7 request, returns response│
│ - StateResetter cleans state between requests          │
└────────────────────────────────────────────────────────┘
```

### 4.1. Process Architecture & Spiral Companions

```shell
composer require yiisoft/yii-runner-roadrunner
./vendor/bin/rr get
```

`yiisoft/yii-runner-roadrunner` pulls required Spiral companion packages transitively:
- `spiral/roadrunner-http`: HTTP worker line protocol and `Spiral\RoadRunner\Http\PSR7Worker`.
- `spiral/roadrunner-worker`: Base Goridge payload protocol.
- `spiral/roadrunner-cli`: Provides `./vendor/bin/rr` to download and run the Go server.
- `spiral/roadrunner-grpc`: gRPC worker support.

In containerized deployments, copy the binary from the official RoadRunner Docker image:

```dockerfile
COPY --from=spiralscout/roadrunner:2023.3 /usr/bin/rr /usr/local/bin/rr
```

---

### 4.2. Persistent Worker Request Loop

The internal worker loop in `RoadRunnerHttpApplicationRunner::runRoadRunner()` executes persistently across requests:

```php
private function runRoadRunner(ContainerInterface $container): void
{
    $worker = new RoadRunnerHttpWorker($container, $this->psr7Worker);

    /** @var Application $application */
    $application = $container->get(Application::class);
    $application->start(); // Dispatched ONCE on worker boot

    while (true) {
        $request = $worker->waitRequest();
        $response = null;

        if ($request === null) {
            break; // RoadRunner requested graceful shutdown / recycling
        }

        if ($request instanceof Throwable) {
            $response = $worker->respondWithError($request);
            $this->afterRespond($application, $container, $response);
            continue;
        }

        try {
            $response = $application->handle($request);
            $worker->respond($response);
        } catch (Throwable $t) {
            $response = $worker->respondWithError($t, $request);
        } finally {
            $this->afterRespond($application, $container, $response);
        }
    }

    $application->shutdown(); // Dispatched ONCE when worker terminates
}
```

#### Grounded Worker Invariants:
1. **`RoadRunnerHttpWorker` Dependency Resolution:** Resolves `ResponseFactoryInterface`, `ServerRequestFactoryInterface`, `StreamFactoryInterface`, `UploadedFileFactoryInterface`, `ErrorCatcher`, and `ErrorHandler` from the container.
2. **Graceful Shutdown (`$request === null`):** When RoadRunner recycles the worker (due to `max_jobs` or server reload), `waitRequest()` returns `null`. The loop breaks and invokes `$application->shutdown()`.
3. **Request Error Isolation:** Deserialization errors return a `Throwable` from `waitRequest()`. The worker responds with 400 Bad Request via `respondWithError()` without crashing the daemon.
4. **Guaranteed Post-Request Cleanup (`afterRespond()`):**
   ```php
   private function afterRespond(
       Application $application,
       ContainerInterface $container,
       ?ResponseInterface $response,
   ): void {
       $application->afterEmit($response);
       $container->get(StateResetter::class)->reset();
       gc_collect_cycles();
   }
   ```
   Always fires `AfterEmit`, executes all registered state resetters, and invokes `gc_collect_cycles()` to clear circular memory references.

---

### 4.3. `worker.php` Implementation & Stderr Redirection

Create `worker.php` in the project root:

```php
<?php

declare(strict_types=1);

// CRITICAL: Direct PHP error output to stderr so RoadRunner can log worker errors
// Writing PHP notices, warnings, or errors to stdout corrupts Goridge binary IPC pipes!
ini_set('display_errors', 'stderr');

use App\Environment;
use Yiisoft\Yii\Runner\RoadRunner\RoadRunnerHttpApplicationRunner;

$root = __DIR__;

require_once $root . '/src/bootstrap.php';

$runner = new RoadRunnerHttpApplicationRunner(
    rootPath: $root,
    debug: Environment::appDebug(),
    checkEvents: Environment::appDebug(),
    environment: Environment::appEnv(),
);

$runner->run();
```

---

### 4.4. Temporary Error Handling with `FileTarget`

In `RoadRunnerHttpApplicationRunner`, the temporary error handler must **never** write to `stdout`:
- Standard `HttpApplicationRunner` uses `StreamTarget` writing to `php://stdout`.
- In RoadRunner, `stdout` is the binary communication pipe between Go and PHP. Writing unformatted text to `stdout` breaks payload framing and crashes the worker.
- For this reason, `RoadRunnerHttpApplicationRunner::createTemporaryErrorHandler()` defaults to `Yiisoft\Log\Target\File\FileTarget("$this->rootPath/runtime/logs/app.log")` and `HtmlRenderer`, writing startup errors safely to disk.

---

### 4.5. RoadRunner Server Configuration (`.rr.yaml`)

```yaml
version: '3'

server:
  command: "php ./worker.php"
  relay: pipes

rpc:
  listen: tcp://127.0.0.1:6001

http:
  address: :8080
  pool:
    num_workers: 8
    max_jobs: 1000 # Recycle worker after 1000 requests to prevent memory leaks
    debug: false
  middleware: ["static", "headers", "gzip"]
  static:
    dir: "./public"
    forbid: [".php", ".htaccess"]
  headers:
    response:
      "X-Powered-By": "Yii3-RoadRunner"

logs:
  mode: production
  level: warn
```

Start RoadRunner:
```bash
./rr serve
```

---

### 4.6. gRPC & Temporal Workflow Support

#### 1. gRPC Support (`RoadRunnerGrpcApplicationRunner`)
For high-performance Protocol Buffer microservices via `spiral/roadrunner-grpc`:
```php
$runner = new RoadRunnerGrpcApplicationRunner($root, $debug);
$runner->setServices([
    App\Grpc\UserServiceInterface::class,
]);
$runner->run();
```
- Note: `setServices(array $services): self` is **mutable** and returns the same instance.
- Cleans state via `StateResetter::reset()` and `gc_collect_cycles()` after each gRPC call.

#### 2. Temporal Workflow Support
Enabled directly on `RoadRunnerHttpApplicationRunner`:
```php
$runner = (new RoadRunnerHttpApplicationRunner($root, $debug))
    ->withTemporalEnabled(true);
$runner->run();
```
- Requires `temporal/sdk`.
- `RoadRunnerHttpApplicationRunner::run()` checks `RR_MODE`. If `RR_MODE === 'temporal'`, it enters the Temporal workflow and activity processing loop.
- Activity finalizers automatically execute `StateResetter::reset()` and `gc_collect_cycles()` after every activity execution.

---

## 5. FrankenPHP Worker Runtime (`yiisoft/yii-runner-frankenphp`)

[FrankenPHP](https://frankenphp.dev/) embeds the PHP interpreter directly into Go threads within the Caddy web server using CGO.

```shell
composer require yiisoft/yii-runner-frankenphp
```

### 5.1. Caddy CGO Threading Model & Operating Modes

FrankenPHP supports dual operating modes inside a single runner class:
1. **Worker Mode:** `function_exists('frankenphp_handle_request')` is `true`. The application pre-boots once, and requests are dispatched inside a persistent Caddy thread loop.
2. **Classic SAPI Fallback:** `function_exists('frankenphp_handle_request')` is `false`. The runner executes a single request and shuts down. This allows the same codebase to run in unit tests or standard CLI scripts without Caddy.

---

### 5.2. `worker.php` Implementation & `ignore_user_abort`

> [!IMPORTANT]
> `FrankenPHPApplicationRunner.php` executes `ignore_user_abort(true)` at file inclusion time. This ensures that if a client closes their browser or cancels a request, the worker thread continues execution until `$application->afterEmit()` and `StateResetter::reset()` complete safely, preventing corrupted container state.

Create `worker.php` in the project root:

```php
<?php

declare(strict_types=1);

use App\Environment;
use Psr\Log\LogLevel;
use Yiisoft\ErrorHandler\ErrorHandler;
use Yiisoft\ErrorHandler\Renderer\PlainTextRenderer;
use Yiisoft\Log\Logger;
use Yiisoft\Log\StreamTarget;
use Yiisoft\Yii\Runner\FrankenPHP\FrankenPHPApplicationRunner;

$root = __DIR__;

require_once $root . '/src/bootstrap.php';

$runner = new FrankenPHPApplicationRunner(
    rootPath: $root,
    debug: Environment::appDebug(),
    checkEvents: Environment::appDebug(),
    environment: Environment::appEnv(),
    temporaryErrorHandler: new ErrorHandler(
        new Logger([
            (new StreamTarget('php://stderr'))->setLevels([
                LogLevel::EMERGENCY,
                LogLevel::ERROR,
                LogLevel::WARNING,
            ]),
        ]),
        new PlainTextRenderer(),
    ),
);

$runner->run();
```

---

### 5.3. Worker Recycling with `MAX_REQUESTS`

FrankenPHP inspects the `MAX_REQUESTS` environment variable:

```php
$maxRequests = (int) ($_SERVER['MAX_REQUESTS'] ?? 0);

if ($maxRequests > 0) {
    for (
        $requestCount = 0;
        $requestCount < $maxRequests && frankenphp_handle_request($handler);
        ++$requestCount
    );
} else {
    while (frankenphp_handle_request($handler));
}

$application->shutdown();
```

When `$maxRequests` is reached, the loop exits, `$application->shutdown()` fires, and Caddy replaces the worker thread with a fresh interpreter instance, preventing memory fragmentation.

---

### 5.4. `Caddyfile` Production & Development Configurations

#### Production (`docker/Caddyfile`)

```caddyfile
{
    skip_install_trust
    frankenphp
}

{$SERVER_NAME::80} {
    encode zstd br gzip
    php_server {
        root /app/public
        worker {
            match *
            file /app/worker.php
        }
    }
}
```

#### Development with Hot Reloading (`docker/dev/Caddyfile`)

```caddyfile
{
    skip_install_trust
    frankenphp
}

{$SERVER_NAME::80} {
    encode zstd br gzip
    php_server {
        root /app/public
        worker {
            match *
            file /app/worker.php
            watch /app/**/*.php
        }
    }
}
```

---

### 5.5. In-Memory Functional Testing

`FrankenPHPApplicationRunner` provides `runAndGetResponse()`:

```php
$response = (new FrankenPHPApplicationRunner($root, debug: true, environment: 'test'))
    ->runAndGetResponse($request);

$this->assertSame(200, $response->getStatusCode());
```

It replaces the emitter with `FakeEmitter`, evaluates the request, runs state cleanup, and returns `ResponseInterface` without sending output to Caddy.

---

### 5.6. Scoped Request Access (`yiisoft/request-provider`)

In persistent workers, passing the active PSR-7 `ServerRequestInterface` to domain services or loggers without static facades or memory leaks is solved by `yiisoft/request-provider`:

```shell
composer require yiisoft/request-provider
```

```php
namespace App\Service;

use Yiisoft\RequestProvider\RequestProviderInterface;

final class AuditLogger
{
    public function __construct(
        private readonly RequestProviderInterface $requestProvider,
    ) {}

    public function recordEvent(string $message): void
    {
        $request = $this->requestProvider->get(); // Current scoped request
        $ip = $request->getServerParams()['REMOTE_ADDR'] ?? 'unknown';
        // ...
    }
}
```

#### Grounded Mechanics:
1. **`RequestProviderInterface`:** Contract with `get(): ServerRequestInterface` and `set(ServerRequestInterface $request): void`. Throws `RequestNotSetException` if called outside an active request cycle.
2. **Automatic Synchronization:** `config/events-web.php` in `yiisoft/request-provider` registers a listener for `Yiisoft\Middleware\Dispatcher\Event\BeforeMiddleware`, updating the provider whenever upstream middleware modifies the request.
3. **Manual Middleware:** If `BeforeMiddleware` is not used, place `Yiisoft\RequestProvider\RequestCatcherMiddleware` at the start of your middleware pipeline.
4. **Automatic Reset:** In `config/di-web.php`, the package registers:
   ```php
   'reset' => function () {
       $this->request = null;
   },
   ```
   Between requests, `StateResetter::reset()` automatically clears the stored request, preventing cross-request data leaks.

---

## 6. Long-Running Worker Safety & StateResetter

### 6.1. The State Bleeding & Memory Accumulation Problem

In persistent worker runtimes (RoadRunner, FrankenPHP):
- **Singletons survive across requests.** DI container instances are compiled once and retained in memory.
- If a service stores request-scoped data (current authenticated user, active session ID, matched route parameters, or rendered HTML blocks), that data **will bleed into subsequent requests** made by other users if not explicitly reset!
- Static arrays accumulate unbounded entries, causing gradual memory exhaustion.
- Uncommitted database transactions left open by unhandled exceptions remain active, locking tables indefinitely.

---

### 6.2. The `StateResetter::class` Definition Trap

> [!CAUTION]
> **CRITICAL ARCHITECTURAL DEFECT:** Never register `StateResetter::class` in application container configuration!

#### The Container Mechanism in `Yiisoft\Di\Container`:

```php
// File: vendor/yiisoft/di/src/Container.php:520–527
private function addDefinitionToStorage(string $id, mixed $definition): void
{
    $this->definitions->set($id, $definition);

    if ($id === StateResetter::class) {
        $this->useResettersFromMeta = false;
    }
}
```

Notice line 525: if an application defines `StateResetter::class` in `config/di.php` or `config/di-web.php`, the container flag `$this->useResettersFromMeta` is flipped to `false`.

Now examine how `Container::prepareStateResetter()` constructs the resetter instance:

```php
// File: vendor/yiisoft/di/src/Container.php:231–251
if ($this->useResettersFromMeta) {
    /** @var StateResetter[] $resetters */
    $resetters = [];
    foreach ($this->resetters as $serviceId => $callback) {
        if (isset($this->instances[$serviceId])) {
            $resetters[$serviceId] = $callback;
        }
    }
    if ($delegatesResetter !== null) {
        $resetters[] = $delegatesResetter;
    }
    $mainResetter->setResetters($resetters);
} elseif ($delegatesResetter !== null) {
    $resetter = new StateResetter($this->get(ContainerInterface::class));
    $resetter->setResetters([$mainResetter, $delegatesResetter]);

    return $resetter;
}

return $mainResetter;
```

#### The Catastrophic Result:
1. When `$this->useResettersFromMeta === false`, the container skips the entire `$this->useResettersFromMeta` block.
2. The compiled `$this->resetters` array—which contains all the `'reset' => function ()` callbacks contributed by vendor packages—is **silently dropped**.
3. **ALL built-in package resetters are completely disabled!**
   - `CurrentUser` authentication leaks across requests (User B inherits User A's identity and privileges).
   - `SessionInterface` keeps previous session IDs open.
   - `CurrentRoute` retains matched route arguments and URIs from earlier requests.
   - `WebView` blocks and page titles accumulate monotonically.
   - `RequestProvider` leaks previous request headers and payloads.

---

### 6.3. Idiomatic Service Resetter Declaration

To register state cleanup for custom stateful application services, declare the `'reset'` key directly on the service definition in `config/di-web.php` or `config/di.php`:

```php
<?php

declare(strict_types=1);

use App\Infrastructure\IdentityMap;
use App\Infrastructure\MemoryCache;
use Psr\Container\ContainerInterface;
use Yiisoft\Db\Connection\ConnectionInterface;

return [
    // 1. Resetting internal arrays in custom repository / identity map
    IdentityMap::class => [
        'class' => IdentityMap::class,
        'reset' => function (): void {
            // $this is bound to IdentityMap instance with private property access
            $this->entities = [];
        },
    ],

    // 2. Rolling back uncommitted database transactions left by errors
    ConnectionInterface::class => [
        'reset' => function (): void {
            /** @var ConnectionInterface $this */
            if ($this->getTransaction() !== null) {
                $this->getTransaction()->rollBack();
            }
        },
    ],

    // 3. Reset callback receiving the container instance
    MemoryCache::class => [
        'class' => MemoryCache::class,
        'reset' => function (ContainerInterface $container): void {
            /** @var MemoryCache $this */
            $this->clear();
            $this->defaultTtl = $container->get('params')['cache']['ttl'];
        },
    ],
];
```

#### Container Lazy Reset Invariant:
In `Container.php:235`, the container verifies `isset($this->instances[$serviceId])`. If a service with a `'reset'` closure was never requested during a request cycle, its resetter is not invoked, avoiding unwanted instantiation overhead during cleanup.

---

### 6.4. Ground-Truth Catalog of Built-In Package Resetters

When `StateResetter::class` is **not** overridden, all official packages automatically clean their internal state between worker requests:

| Package | Config File | Service ID | Grounded Reset Closure | State Protected from Leaking |
|:---|:---|:---|:---|:---|
| **`yiisoft/user`** | `config/di-web.php` | `Yiisoft\User\CurrentUser::class` | `$this->clear();` | Clears authenticated identity, guest status, and permission cache. |
| **`yiisoft/session`** | `config/di-web.php` | `Yiisoft\Session\SessionInterface::class` | `$this->sessionId = null; $this->close();` | Closes session and unsets session ID, preventing session hijacking. |
| **`yiisoft/router`** | `config/di.php` | `Yiisoft\Router\CurrentRoute::class` | `$this->route = null; $this->uri = null; $this->arguments = [];` | Clears matched route instance, URI, and route arguments. |
| **`yiisoft/router-fastroute`**| `config/di.php` | `Yiisoft\Router\UrlGeneratorInterface::class` | `$this->defaultArguments = [];` | Clears default route arguments injected during URL generation. |
| **`yiisoft/view`** | `config/di-web.php` | `Yiisoft\View\WebView::class` | `$this->clear(); $this->setParameters($parameters);` | Clears rendered view blocks, page title, meta tags, and registered JS/CSS. |
| **`yiisoft/request-provider`**| `config/di-web.php` | `Yiisoft\RequestProvider\RequestProviderInterface::class` | `$this->request = null;` | Wipes active PSR-7 request reference from the provider. |
| **`yiisoft/translator`** | `config/di.php` | `Yiisoft\Translator\TranslatorInterface::class` | `$this->setLocale($params['locale']);` | Restores default locale, discarding per-request locale overrides. |
| **`yiisoft/profiler`** | `config/di.php` | `Yiisoft\Profiler\Target\LogTarget::class` | `$this->enable((bool) $params['enabled']);` | Restores profiler target status to initial configuration. |
| **`yiisoft/yii-cycle`** | `config/di.php` | `Cycle\ORM\EntityManager::class` | `$this->clean();` | Clears Cycle ORM unit-of-work heap and unpersisted entity tracking. |
| **`yiisoft/yii-debug`** | `config/di-web.php` | `Yiisoft\Yii\Debug\Debugger::class` | `$this->allowStart = true;` | Re-enables debugger collector initialization for next cycle. |

---

### 6.5. Closure Scope Binding (`Closure::bindTo`)

In `Yiisoft\Di\StateResetter::setResetters()`:

```php
// File: vendor/yiisoft/di/src/StateResetter.php:87
$this->resetters[] = $callback->bindTo($instance, $instance::class);
```

#### Architectural Benefits:
1. **Private Scope Access:** Rebinding with `$instance::class` grants the reset closure **direct read/write access to `private` and `protected` properties and methods** of the service.
2. **Clean Domain Interfaces:** Domain services do not need to expose public `reset()` or `clean()` methods on their public APIs to participate in worker state safety.
3. **Container Context:** The callback receives the container instance as a parameter (`function (ContainerInterface $container): void`), allowing dynamic re-resolution of parameters if necessary.

---

## 7. Runtime Comparison Matrix

| Feature / Metric | Classic SAPI (`yii-runner-http`) | RoadRunner (`yii-runner-roadrunner`) | FrankenPHP (`yii-runner-frankenphp`) | Console (`yii-runner-console`) |
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
| **Using `autoExit = true` with `ConsoleApplicationRunner`** | Symfony Console terminates the process inside `Application::run()`, bypassing `ConsoleApplicationRunner`'s `finally` block and `ApplicationShutdown` event. | Set `'autoExit' => false` in `params-console.php`. The runner manages process exit explicitly. |

---

## 9. Related Topic Guides

- [DI & Configuration Guide](di-and-config.md) — Config groups, definitions, modifiers, and container compilation.
- [Console Commands Guide](commands.md) — CLI commands executed via `ConsoleApplicationRunner`.
- [PSR-15 Middlewares Guide](middlewares.md) — HTTP pipeline execution order and request catchers.
- [Error Handling Guide](error-handling.md) — ErrorCatcher middleware, friendly exceptions, and temporary error handlers.
- [HTTP State Guide](http-state.md) — Sessions, cookies, and CSRF token handling.
- [Authentication & RBAC Guide](auth-and-rbac.md) — `CurrentUser` lifecycle and identity management.
