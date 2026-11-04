# Yii3 Long-Running Worker Safety & StateResetter Guide

> Reference guide for state safety in long-running PHP worker processes: the state bleeding and memory accumulation problem, the catastrophic `StateResetter::class` definition trap, idiomatic per-service `'reset'` declarations, the ground-truth catalog of built-in package resetters, and closure scope binding via `Closure::bindTo`.

**Scope & Ownership:** This guide is the single source of truth for worker-mode state safety and `Yiisoft\Di\StateResetter` mechanics; it was extracted from the [Runners & Runtimes Guide, §6](infra-runners-and-runtimes.md#6-long-running-worker-safety--stateresetter). The reset discipline is **not tied to one runtime**: it applies to every long-running worker context — [RoadRunner workers](infra-runtime-roadrunner.md), [FrankenPHP worker threads](infra-runtime-frankenphp.md), and long-running `yiisoft/yii-queue` daemon workers (`./yii queue:listen`, recycled via `memorySoftLimit`) alike. Any process that keeps the DI container compiled in memory across multiple requests or messages must reset per-request state between iterations.

---

## Table of Contents
- [1. The State Bleeding & Memory Accumulation Problem](#1-the-state-bleeding--memory-accumulation-problem)
- [2. The `StateResetter::class` Definition Trap](#2-the-stateresetterclass-definition-trap)
- [3. Idiomatic Service Resetter Declaration](#3-idiomatic-service-resetter-declaration)
- [4. Ground-Truth Catalog of Built-In Package Resetters](#4-ground-truth-catalog-of-built-in-package-resetters)
- [5. Closure Scope Binding (`Closure::bindTo`)](#5-closure-scope-binding-closurebindto)
- [Related Topic Guides](#related-topic-guides)

---

## 1. The State Bleeding & Memory Accumulation Problem

In persistent worker runtimes (RoadRunner, FrankenPHP):
- **Singletons survive across requests.** DI container instances are compiled once and retained in memory.
- If a service stores request-scoped data (current authenticated user, active session ID, matched route parameters, or rendered HTML blocks), that data **will bleed into subsequent requests** made by other users if not explicitly reset!
- Static arrays accumulate unbounded entries, causing gradual memory exhaustion.
- Uncommitted database transactions left open by unhandled exceptions remain active, locking tables indefinitely.

---

## 2. The `StateResetter::class` Definition Trap

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

## 3. Idiomatic Service Resetter Declaration

To register state cleanup for custom stateful application services, declare the `'reset'` key directly on the service definition in `config/di-web.php` or `config/di.php`:

```php
<?php

declare(strict_types=1);

use App\Infrastructure\CacheParams;
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
            // Restore the configured TTL from a constructor-injected params DTO.
            // 'params' is a configuration group name, NOT a container service:
            // $container->get('params') would throw NotFoundException.
            $this->defaultTtl = $container->get(CacheParams::class)->defaultTtl;
        },
    ],
];
```

The `CacheParams` DTO above is a constructor-injected service registered in the DI container — its constructor arguments are mapped from the `'params'` configuration group:

```php
// src/Infrastructure/CacheParams.php
declare(strict_types=1);

namespace App\Infrastructure;

final readonly class CacheParams
{
    public function __construct(
        public readonly int $defaultTtl = 3600,
    ) {}
}
```

> [!NOTE]
> `'params'` (and `params-web`, `params-console`, ...) is a configuration **group** name, not a container service. Calling `$container->get('params')` throws `Yiisoft\Di\NotFoundException`. Access parameters through typed, constructor-injected params DTOs instead.

#### Container Lazy Reset Invariant:
In `Container.php:235`, the container verifies `isset($this->instances[$serviceId])`. If a service with a `'reset'` closure was never requested during a request cycle, its resetter is not invoked, avoiding unwanted instantiation overhead during cleanup.

---

## 4. Ground-Truth Catalog of Built-In Package Resetters

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

## 5. Closure Scope Binding (`Closure::bindTo`)

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

## Related Topic Guides

- [Runners & Runtimes Guide](infra-runners-and-runtimes.md) — Runner architecture and lifecycle, standard runners, and the runtime selection matrix (§7).
- [RoadRunner Worker Runtime Guide](infra-runtime-roadrunner.md) — Worker loop with the mandatory `afterRespond()` reset step (`StateResetter::reset()` + `gc_collect_cycles()`).
- [FrankenPHP Worker Runtime Guide](infra-runtime-frankenphp.md) — Caddy-embedded worker threads and `ignore_user_abort` protection for safe reset completion.
- [Queue & Asynchronous Jobs Guide](infra-queue-jobs.md) — Long-running `queue:listen` daemon workers and `memorySoftLimit` recycling.
- [DI & Configuration Guide](core-di-and-config.md) — Config groups, definitions, modifiers, and container compilation.
- [Authentication & RBAC Guide](infra-auth-and-rbac.md) — `CurrentUser` lifecycle and identity management (a key protected-by-reset service).
- [HTTP State Guide](http-state.md) — Sessions, cookies, and CSRF token handling.
