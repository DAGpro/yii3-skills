# Yii3 Application Runners & Runtimes Architecture Guide

> Comprehensive architecture guide for Yii3 entry points, application runners (`yii-runner-http`, `yii-runner-console`), and high-performance persistent worker daemons (RoadRunner and FrankenPHP) with container state safety.

---

## Table of Contents
- [1. Application Runner Architecture & Life Cycle](#1-application-runner-architecture--life-cycle)
- [2. Standard HTTP Runner (`yiisoft/yii-runner-http`)](#2-standard-http-runner-yiisoftyii-runner-http)
  - [2.1. `public/index.php` Entry Point](#21-publicindexphp-entry-point)
  - [2.2. Temporary Error Handling](#22-temporary-error-handling)
  - [2.3. SAPI Response Emitting](#23-sapi-response-emitting)
  - [2.4. PHP CLI Server Local Routing](#24-php-cli-server-local-routing)
- [3. Console Application Runner (`yiisoft/yii-runner-console`)](#3-console-application-runner-yiisoftyii-runner-console)
  - [3.1. `yii` Script Entry Point](#31-yii-script-entry-point)
  - [3.2. Console Lifecycle & Bootstrap](#32-console-lifecycle--bootstrap)
- [4. RoadRunner Worker Runtime (`yiisoft/yii-runner-roadrunner`)](#4-roadrunner-worker-runtime-yiisoftyii-runner-roadrunner)
  - [4.1. Process Architecture & Worker Loop](#41-process-architecture--worker-loop)
  - [4.2. `worker.php` Implementation](#42-workerphp-implementation)
  - [4.3. RoadRunner Server Configuration (`.rr.yaml`)](#43-roadrunner-server-configuration-rryaml)
  - [4.4. gRPC and Temporal Support](#44-grpc-and-temporal-support)
- [5. FrankenPHP Worker Runtime (`yiisoft/yii-runner-frankenphp`)](#5-frankenphp-worker-runtime-yiisoftyii-runner-frankenphp)
  - [5.1. Process Architecture & Threading Model](#51-process-architecture--threading-model)
  - [5.2. `worker.php` Implementation](#52-workerphp-implementation)
  - [5.3. `Caddyfile` Production and Dev Configuration](#53-caddyfile-production-and-dev-configuration)
  - [5.4. Worker Recycling with `MAX_REQUESTS`](#54-worker-recycling-with-max_requests)
- [6. Long-Running Worker Safety & StateResetter](#6-long-running-worker-safety--stateresetter)
  - [6.1. The Persistence Problem (State Bleeding & Memory Leaks)](#61-the-persistence-problem-state-bleeding--memory-leaks)
  - [6.2. Configuring `StateResetter` in DI Container](#62-configuring-stateresetter-in-di-container)
  - [6.3. Essential Services to Reset](#63-essential-services-to-reset)
- [7. Runtime Comparison Matrix](#7-runtime-comparison-matrix)
- [8. Anti-Patterns & Common Traps](#8-anti-patterns--common-traps)
- [9. Related Topic Guides](#9-related-topic-guides)

---

## 1. Application Runner Architecture & Life Cycle

In Yii3, application bootstapping is decoupled from a monolithic application class. There is no global `Yii::$app->run()`. Instead, specialized runner classes implementing `Yiisoft\Yii\Runner\RunnerInterface` manage the entire lifecycle:

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
│    Runs bootstrap groups; validates event configurations│
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 4. Application Dispatch & Execution                    │
│    Resolves Application instance, runs request pipeline│
└────────────────────────────────────────────────────────┘
```

### The `ApplicationRunner` Contract

All runners extend `Yiisoft\Yii\Runner\ApplicationRunner` and accept environment parameters, configuration groups, and paths:

| Parameter | Default (HTTP) | Default (Console) | Purpose |
|---|---|---|---|
| `$rootPath` | Required | Required | Absolute path to project root. |
| `$debug` | `false` | `false` | Enables debug mode and stack traces. |
| `$checkEvents` | `false` | `false` | Statically checks listener signatures against event types. |
| `$environment` | `null` | `null` | Environment name for config overrides (e.g. `dev`, `prod`, `test`). |
| `$bootstrapGroup`| `'bootstrap-web'` | `'bootstrap-console'`| Config group of closures executed before handling requests. |
| `$eventsGroup` | `'events-web'` | `'events-console'` | Event mapping configuration group. |
| `$diGroup` | `'di-web'` | `'di-console'` | Container definitions configuration group. |
| `$paramsGroup` | `'params-web'` | `'params-console'` | Application parameters configuration group. |

---

## 2. Standard HTTP Runner (`yiisoft/yii-runner-http`)

The standard HTTP runner operates in classic PHP request-response environments (PHP-FPM, Apache `mod_php`, Nginx FastCGI). The process boots for each request, handles it, emits output, and terminates.

### 2.1. `public/index.php` Entry Point

```php
declare(strict_types=1);

use App\Environment;
use Psr\Log\LogLevel;
use Yiisoft\ErrorHandler\ErrorHandler;
use Yiisoft\ErrorHandler\Renderer\HtmlRenderer;
use Yiisoft\Log\Logger;
use Yiisoft\Log\StreamTarget;
use Yiisoft\Yii\Runner\Http\HttpApplicationRunner;

$root = dirname(__DIR__);

// 1. Require Composer autoload and application bootstrap
require_once $root . '/src/bootstrap.php';

// 2. Initialize and execute the HTTP Application Runner
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

### 2.2. Temporary Error Handling

Because container compilation and configuration loading can encounter fatal errors before the application error handler is built, `HttpApplicationRunner` uses a **temporary error handler**:
- Handles fatal errors and exceptions during configuration and DI container initialization.
- Once the container is successfully created, the real `Yiisoft\ErrorHandler\ErrorHandler` configured in `config/web/di/error-handler.php` replaces the temporary handler.

### 2.3. SAPI Response Emitting

By default, `HttpApplicationRunner` transmits PSR-7 responses via `Yiisoft\PsrEmitter\SapiEmitter`, sending HTTP status codes, headers via `header()`, and streaming the response body to PHP's standard output buffer (`echo`).

### 2.4. PHP CLI Server Local Routing

For local rapid development with PHP's built-in web server (`php -S 127.0.0.1:8080 -t public`), add static file bypassing before invoking the runner in `public/index.php`:

```php
if (PHP_SAPI === 'cli-server') {
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    if (is_file(__DIR__ . $path)) {
        return false; // Serve static file as-is
    }
    $_SERVER['SCRIPT_NAME'] = '/index.php';
}
```

---

## 3. Console Application Runner (`yiisoft/yii-runner-console`)

The console runner powers CLI commands and background worker processes built on Symfony Console.

### 3.1. `yii` Script Entry Point

Create an executable script `yii` in the project root:

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

Make the script executable: `chmod +x yii`.

### 3.2. Console Lifecycle & Bootstrap

When `./yii <command>` runs:
1. `ConsoleApplicationRunner` loads the `params-console` and `di-console` configuration groups.
2. Runs all bootstrap callables in `bootstrap-console`.
3. Validates event bindings in `events-console`.
4. Resolves `Yiisoft\Yii\Console\Application` from the container.
5. Passes `Symfony\Component\Console\Input\ArgvInput` and `ConsoleBufferedOutput` to `Application::run()`.
6. Exits with status code (`ExitCode::OK`, `ExitCode::UNSPECIFIED_ERROR`, etc.).

---

## 4. RoadRunner Worker Runtime (`yiisoft/yii-runner-roadrunner`)

[RoadRunner](https://roadrunner.dev/) is a high-performance application server and process manager written in Go. Instead of terminating after each request, PHP worker processes stay alive in memory, eliminating PHP boot overhead.

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

### 4.1. Process Architecture & Worker Loop

In `RoadRunnerHttpApplicationRunner`:
- `Yiisoft\Config\Config` and `Yiisoft\Di\Container` compile **once** when the worker process boots.
- A persistent loop processes requests via `Spiral\RoadRunner\Http\PSR7Worker`:
  ```php
  while (true) {
      $request = $worker->waitRequest();
      $response = $application->handle($request);
      $worker->respond($response);
      
      // Cleanup after emit:
      $application->afterEmit($response);
      $container->get(StateResetter::class)->reset();
      gc_collect_cycles();
  }
  ```

### 4.2. `worker.php` Implementation

Create `worker.php` in the application root directory:

```php
<?php

declare(strict_types=1);

use App\Environment;
use Yiisoft\Yii\Runner\RoadRunner\RoadRunnerHttpApplicationRunner;

// Direct error output to stderr so RoadRunner can log worker errors
ini_set('display_errors', 'stderr');

$root = __DIR__;
require_once $root . '/src/bootstrap.php';

(new RoadRunnerHttpApplicationRunner(
    rootPath: $root,
    debug: Environment::appDebug(),
    checkEvents: Environment::appDebug(),
    environment: Environment::appEnv(),
))->run();
```

### 4.3. RoadRunner Server Configuration (`.rr.yaml`)

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
    max_jobs: 1000 # Recycle worker after 1000 requests to avoid memory leaks
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

### 4.4. gRPC and Temporal Support

`yiisoft/yii-runner-roadrunner` also provides:
- **`RoadRunnerGrpcApplicationRunner`**: For hosting high-performance gRPC microservices defined via Protocol Buffers.
- **Temporal Workflow Support**: Enabled via `$runner->withTemporalEnabled(true)` for resilient distributed workflow orchestration (`temporal/sdk`).

---

## 5. FrankenPHP Worker Runtime (`yiisoft/yii-runner-frankenphp`)

[FrankenPHP](https://frankenphp.dev/) is a modern application server for PHP built on the Caddy web server. It embeds the PHP interpreter directly into Go threads using CGO, providing exceptional throughput.

### 5.1. Process Architecture & Threading Model

FrankenPHP can run in two modes:
1. **Classic mode:** Similar to PHP-FPM, boots on every request.
2. **Worker mode:** Pre-boots the application once and uses `frankenphp_handle_request()` inside an event loop.

### 5.2. `worker.php` Implementation

Create `worker.php` in the application root:

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
            (new StreamTarget())->setLevels([
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

### 5.3. `Caddyfile` Production and Dev Configuration

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
            # Watch PHP files and restart workers automatically on code edits
            watch /app/**/*.php
        }
    }
}
```

### 5.4. Worker Recycling with `MAX_REQUESTS`

FrankenPHP automatically checks the `MAX_REQUESTS` environment variable. To prevent memory creeping over time, configure worker recycling:

```bash
MAX_REQUESTS=500
```

---

## 6. Long-Running Worker Safety & StateResetter

### 6.1. The Persistence Problem (State Bleeding & Memory Leaks)

In persistent worker runtimes (RoadRunner, FrankenPHP, Swoole):
- **Singletons and container services survive across requests.**
- If a service stores user-specific data (e.g. current user, session, or tenant ID), that data **will bleed into subsequent requests** made by other users if not explicitly reset!
- Static variables (`self::$cache = []`) accumulate unbounded data and leak memory.
- Uncommitted database transactions remain open and lock tables.

### 6.2. Configuring `StateResetter` in DI Container

Yii3 provides `Yiisoft\Di\StateResetter` to restore initial state after each request. Configure service resetters in `config/web/di/application.php` or `config/common/di/state-resetter.php`:

```php
declare(strict_types=1);

use Yiisoft\Di\StateResetter;
use Yiisoft\User\CurrentUser;
use Yiisoft\Session\SessionInterface;
use Yiisoft\Db\Connection\ConnectionInterface;

return [
    StateResetter::class => [
        'setResetters()' => [
            [
                // 1. Reset current authenticated user identity
                CurrentUser::class => function () {
                    /** @var CurrentUser $this */
                    $this->clear();
                },

                // 2. Discard open session state
                SessionInterface::class => function () {
                    /** @var SessionInterface $this */
                    if ($this->isActive()) {
                        $this->discard();
                    }
                },

                // 3. Rollback any dangling uncommitted DB transactions
                ConnectionInterface::class => function () {
                    /** @var ConnectionInterface $this */
                    if ($this->getTransaction() !== null) {
                        $this->getTransaction()->rollBack();
                    }
                },
            ],
        ],
    ],
];
```

> [!TIP]
> `StateResetter::setResetters()` binds closures directly to the instantiated service scope (`Closure::bindTo($instance, $instance::class)`). Closures have access to private and protected properties of the service.

### 6.3. Essential Services to Reset

1. **`CurrentUser`:** Must call `$this->clear()` to wipe cached `$identity` and `$identityOverride`.
2. **`SessionInterface`:** Must close or discard session buffers.
3. **`ConnectionInterface`:** Must roll back any orphaned transactions.
4. **Custom In-Memory Caches / Identity Maps:** Must clear internal arrays after every request cycle.

---

## 7. Runtime Comparison Matrix

| Metric | Classic PHP-FPM (`yii-runner-http`) | RoadRunner (`yii-runner-roadrunner`) | FrankenPHP (`yii-runner-frankenphp`) |
|---|---|---|---|
| **Process Model** | Forked worker per request | Go process daemon + persistent PHP workers | Caddy web server + embedded PHP threads |
| **Boot Overhead** | Full framework boot on every request (~15–30 ms) | Zero boot overhead (~0.5–2 ms latency) | Zero boot overhead (~0.3–1.5 ms latency) |
| **Throughput (req/sec)**| Baseline (1x) | 5x – 10x higher | 6x – 12x higher |
| **State Reset Requirement** | None (OS reclaims memory on exit) | **Mandatory** (`StateResetter`) | **Mandatory** (`StateResetter`) |
| **Memory Leak Risk** | Low (isolated per request) | Medium (mitigated via `max_jobs`) | Medium (mitigated via `MAX_REQUESTS`) |
| **Asset Serving** | Handled by Nginx/Apache | Handled by RoadRunner Go server | Handled by Caddy HTTP server |
| **Deployment Simplicity** | Traditional hosting, shared hosting | Single binary `./rr` + container | Single Docker image with Caddy |
| **Developer Experience** | Automatic reload on save | Fast, but needs `debug: true` or `./rr reset` | Hot reloading via `watch` directive in Caddyfile |

---

## 8. Anti-Patterns & Common Traps

| Anti-Pattern | Why It Breaks | Idiomatic Yii3 Solution |
|---|---|---|
| **Calling `exit()` or `die()` in actions under workers** | Kills the entire persistent worker process unexpectedly. | Return a proper PSR-7 `ResponseInterface` instead. |
| **Storing state in static class properties** | State bleeds across requests and leaks memory in worker mode. | Use request attributes or services managed by `StateResetter`. |
| **Omitting `StateResetter` in RoadRunner or FrankenPHP** | Critical security flaw: User A's identity or session may be served to User B! | Always configure `StateResetter` with `CurrentUser::clear()`. |
| **Direct output buffering (`echo`, `print_r`)** | Corrupts binary protocol (RPC/pipes) between Go and PHP. | Write output exclusively to PSR-7 `StreamInterface` or log to `stderr`. |
| **Forgetting `ini_set('display_errors', 'stderr')` in RoadRunner** | PHP notices printed to stdout corrupt the RoadRunner protocol stream. | Direct all uncaught errors to `stderr`. |

---

## 9. Related Topic Guides

- [DI & Configuration Guide](di-and-config.md) — Config groups, definitions, and container compilation.
- [Console Commands Guide](commands.md) — CLI commands executed via `ConsoleApplicationRunner`.
- [PSR-15 Middlewares Guide](middlewares.md) — HTTP pipeline execution order and request catchers.
- [Error Handling Guide](error-handling.md) — ErrorCatcher middleware and temporary error handlers.
- [HTTP State Guide](http-state.md) — Sessions, cookies, and CSRF token handling.
- [Authentication & RBAC Guide](auth-and-rbac.md) — `CurrentUser` lifecycle and identity management.
