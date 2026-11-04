# Yii3 RoadRunner Worker Runtime Guide

> [!IMPORTANT]
> **Grounding rule:** this guide carries the implementation instructions for its topic — follow it when implementing project code; project code itself is integration context, never a source of truth. The source of truth for every class name, method signature, constructor argument, and configuration key is the installed package source under `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`). Verify there before writing code; never assume Yii 2 APIs.

> Reference guide for the RoadRunner worker runtime (`yiisoft/yii-runner-roadrunner`): process architecture and Spiral companion packages, the persistent worker request loop, `worker.php` implementation and stderr redirection, `FileTarget` temporary error handling, `.rr.yaml` server configuration, and gRPC/Temporal workflow support.

**Scope & Ownership:** This guide is the single source of truth for the RoadRunner worker runtime; it was extracted from the [Runners & Runtimes Guide, §4](infra-runners-and-runtimes.md#4-roadrunner-worker-runtime-yiisoftyii-runner-roadrunner). The standard HTTP runner (`yiisoft/yii-runner-http`) and console runner (`yiisoft/yii-runner-console`) are the default choices — worker runtimes are opt-in for high-throughput daemons. RoadRunner and FrankenPHP are **mutually exclusive** worker runtimes: resolve which one is installed via the project's `composer.json` (`yiisoft/yii-runner-roadrunner` vs `yiisoft/yii-runner-frankenphp`) or the [Package Catalog, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family). The sibling guide for FrankenPHP is the [FrankenPHP Worker Runtime Guide](infra-runtime-frankenphp.md).

---

## Table of Contents
- [1. Process Architecture & Spiral Companions](#1-process-architecture--spiral-companions)
- [2. Persistent Worker Request Loop](#2-persistent-worker-request-loop)
- [3. `worker.php` Implementation & Stderr Redirection](#3-workerphp-implementation--stderr-redirection)
- [4. Temporary Error Handling with `FileTarget`](#4-temporary-error-handling-with-filetarget)
- [5. RoadRunner Server Configuration (`.rr.yaml`)](#5-roadrunner-server-configuration-rryaml)
- [6. gRPC & Temporal Workflow Support](#6-grpc--temporal-workflow-support)
- [Related Topic Guides](#related-topic-guides)

---

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

## 1. Process Architecture & Spiral Companions

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

## 2. Persistent Worker Request Loop

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

> **For the complete reference on** why the `StateResetter::reset()` call in `afterRespond()` is mandatory and how per-service `'reset'` closures work, **see the** [Long-Running Worker Safety & StateResetter Guide](infra-state-resetter.md).

---

## 3. `worker.php` Implementation & Stderr Redirection

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

> [!WARNING]
> **Named-argument portability:** `RoadRunnerHttpApplicationRunner` does not accept `temporaryErrorHandler` in its constructor — use the `withTemporaryErrorHandler()` setter. `FrankenPHPApplicationRunner` accepts it, and additionally exposes `configModifiers`, `configDirectory`, `vendorDirectory`, and `configMergePlanFile` (see the [FrankenPHP Worker Runtime Guide, §2](infra-runtime-frankenphp.md#2-workerphp-implementation--ignore_user_abort)). The `MAX_REQUESTS` environment variable bounds the FrankenPHP worker loop.

---

## 4. Temporary Error Handling with `FileTarget`

In `RoadRunnerHttpApplicationRunner`, the temporary error handler must **never** write to `stdout`:
- Standard `HttpApplicationRunner`, out of the box, builds its temporary error handler with a `Psr\Log\NullLogger` — startup logs are discarded. Log targets such as `Yiisoft\Log\StreamTarget` (writing to `php://stdout`) are wired in the application template's DI configuration (`config/common/di/logger.php`), not by the runner itself.
- In RoadRunner, `stdout` is the binary communication pipe between Go and PHP. Writing unformatted text to `stdout` breaks payload framing and crashes the worker.
- For this reason, `RoadRunnerHttpApplicationRunner::createTemporaryErrorHandler()` defaults to `Yiisoft\Log\Target\File\FileTarget("$this->rootPath/runtime/logs/app.log")` and `HtmlRenderer`, writing startup errors safely to disk.

---

## 5. RoadRunner Server Configuration (`.rr.yaml`)

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

## 6. gRPC & Temporal Workflow Support

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

## Related Topic Guides

- [Runners & Runtimes Guide](infra-runners-and-runtimes.md) — Runner architecture and lifecycle, standard HTTP and console runners, and the runtime selection matrix (§7).
- [FrankenPHP Worker Runtime Guide](infra-runtime-frankenphp.md) — The alternative, mutually exclusive worker runtime (Caddy-embedded PHP).
- [Long-Running Worker Safety & StateResetter Guide](infra-state-resetter.md) — Per-request state reset mechanics for all persistent worker runtimes.
- [Logging Guide](infra-logging.md) — Log targets and the stdout-is-a-binary-pipe constraint under RoadRunner.
- [Error Handling Guide](infra-error-handling.md) — ErrorCatcher middleware, friendly exceptions, and temporary error handlers.
- [Console Commands Guide](infra-commands.md) — CLI commands executed via `ConsoleApplicationRunner`.
