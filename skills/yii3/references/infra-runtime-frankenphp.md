# Yii3 FrankenPHP Worker Runtime Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Reference guide for the FrankenPHP worker runtime (`yiisoft/yii-runner-frankenphp`): the Caddy CGO threading model and operating modes, `worker.php` implementation with `ignore_user_abort`, worker recycling via `MAX_REQUESTS`, production and development `Caddyfile` configurations, in-memory functional testing, and scoped request access with `yiisoft/request-provider`.

**Scope & Ownership:** This guide is the single source of truth for the FrankenPHP worker runtime; it was extracted from the [Runners & Runtimes Guide, §5](infra-runners-and-runtimes.md#5-frankenphp-worker-runtime-yiisoftyii-runner-frankenphp). The standard HTTP runner (`yiisoft/yii-runner-http`) and console runner (`yiisoft/yii-runner-console`) are the default choices — worker runtimes are opt-in for high-throughput daemons. FrankenPHP and RoadRunner are **mutually exclusive** worker runtimes: resolve which one is installed via the project's `composer.json` (`yiisoft/yii-runner-frankenphp` vs `yiisoft/yii-runner-roadrunner`) or the [Package Catalog, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family). The sibling guide for RoadRunner is the [RoadRunner Worker Runtime Guide](infra-runtime-roadrunner.md).

---

## Table of Contents
- [1. Caddy CGO Threading Model & Operating Modes](#1-caddy-cgo-threading-model--operating-modes)
- [2. `worker.php` Implementation & `ignore_user_abort`](#2-workerphp-implementation--ignore_user_abort)
- [3. Worker Recycling with `MAX_REQUESTS`](#3-worker-recycling-with-max_requests)
- [4. `Caddyfile` Production & Development Configurations](#4-caddyfile-production--development-configurations)
- [5. In-Memory Functional Testing](#5-in-memory-functional-testing)
- [6. Scoped Request Access (`yiisoft/request-provider`)](#6-scoped-request-access-yiisoftrequest-provider)
- [Related Topic Guides](#related-topic-guides)

---

[FrankenPHP](https://frankenphp.dev/) embeds the PHP interpreter directly into Go threads within the Caddy web server using CGO.

```shell
composer require yiisoft/yii-runner-frankenphp
```

## 1. Caddy CGO Threading Model & Operating Modes

FrankenPHP supports dual operating modes inside a single runner class:
1. **Worker Mode:** `function_exists('frankenphp_handle_request')` is `true`. The application pre-boots once, and requests are dispatched inside a persistent Caddy thread loop.
2. **Classic SAPI Fallback:** `function_exists('frankenphp_handle_request')` is `false`. The runner executes a single request and shuts down. This allows the same codebase to run in unit tests or standard CLI scripts without Caddy.

---

## 2. `worker.php` Implementation & `ignore_user_abort`

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
            new StreamTarget('php://stderr', levels: [
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

> **For the complete reference on** why the `StateResetter::reset()` call must complete before the worker thread is interrupted, **see the** [Long-Running Worker Safety & StateResetter Guide](infra-state-resetter.md). For the RoadRunner counterpart `worker.php` (which does not accept `temporaryErrorHandler` in its constructor), see the [RoadRunner Worker Runtime Guide, §3](infra-runtime-roadrunner.md#3-workerphp-implementation--stderr-redirection).

---

## 3. Worker Recycling with `MAX_REQUESTS`

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

## 4. `Caddyfile` Production & Development Configurations

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

## 5. In-Memory Functional Testing

`FrankenPHPApplicationRunner` provides `runAndGetResponse()`:

```php
$response = (new FrankenPHPApplicationRunner($root, debug: true, environment: 'test'))
    ->runAndGetResponse($request);

$this->assertSame(200, $response->getStatusCode());
```

It replaces the emitter with `FakeEmitter`, evaluates the request, runs state cleanup, and returns `ResponseInterface` without sending output to Caddy.

---

## 6. Scoped Request Access (`yiisoft/request-provider`)

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

## Related Topic Guides

- [Runners & Runtimes Guide](infra-runners-and-runtimes.md) — Runner architecture and lifecycle, standard HTTP and console runners, and the runtime selection matrix (§7).
- [RoadRunner Worker Runtime Guide](infra-runtime-roadrunner.md) — The alternative, mutually exclusive worker runtime (Go process manager with resident PHP workers).
- [Long-Running Worker Safety & StateResetter Guide](infra-state-resetter.md) — Per-request state reset mechanics for all persistent worker runtimes.
- [PSR-15 Middlewares Guide](http-middlewares.md) — HTTP pipeline execution order and request catchers.
- [HTTP Testing Guide](testing-http.md) — Functional HTTP testing dispatched in-memory through runners.
