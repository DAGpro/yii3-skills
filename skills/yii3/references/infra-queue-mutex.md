# Yii3 Distributed Mutex & Concurrency Guide

> [!IMPORTANT]
> **Grounding rule:** this guide is authoring synthesis for navigation and patterns. The source of truth for every class name, method signature, constructor argument, and configuration key is the installed package source under `vendor/yiisoft/<pkg>/src/`. Verify there before writing code; never substitute this guide for vendor sources, and never write Yii 2 APIs.

> Reference guide for distributed locking with `yiisoft/mutex`: the `MutexInterface::acquire()` invariant, explicit named locks via `MutexFactoryInterface` (Approach A), callback execution with guaranteed release via `Synchronizer` (Approach B), and the mutex driver packages (`mutex-file`, `mutex-redis`, `mutex-pdo-pgsql`, `mutex-pdo-mysql`, `mutex-pdo-oracle`) with their `config/di.php` wiring recipes.

**Scope & Ownership:** This guide is the single source of truth for distributed mutex locking and mutex DI configuration; it was extracted from the [Queue & Asynchronous Jobs Guide, §6](infra-queue-jobs.md#6-distributed-concurrency--mutex-locks-yiisoftmutex). `yiisoft/mutex` is an **independent package** that is usable outside the queue subsystem as well — cron overlapping-run guards, one-off migration scripts, or any critical section on a shared resource. The queue guide relies on it for concurrent consumer safety (e.g. the `yiisoft/queue-db` adapter requires a `MutexFactoryInterface` to stop concurrent workers from reserving the same row — see the [Queue Broker Adapters Guide, §3](infra-queue-brokers.md#3-broker-adapter-1-yiisoftqueue-db-relational-database)). The mutex driver package is a pick-exactly-one family: resolve which `mutex-*` driver is installed via the project's `composer.json` or the [Package Catalog, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family).

---

## Table of Contents
- [1. The `MutexInterface::acquire()` Invariant](#1-the-mutexinterfaceacquire-invariant)
- [2. Approach A: Explicit Mutex with `MutexFactoryInterface`](#2-approach-a-explicit-mutex-with-mutexfactoryinterface)
- [3. Approach B: Callback Execution with `Synchronizer`](#3-approach-b-callback-execution-with-synchronizer)
- [4. Mutex Driver Packages & DI Configuration Recipes (`config/di.php`)](#4-mutex-driver-packages--di-configuration-recipes-configdiphp)
- [5. Mutex Anti-Patterns](#5-mutex-anti-patterns)
- [Related Topic Guides](#related-topic-guides)

---

When multiple background workers run concurrently, use `yiisoft/mutex` to prevent race conditions on shared resources (e.g. inventory allocations, subscription billing, wallet transfers).

## 1. The `MutexInterface::acquire()` Invariant

> [!IMPORTANT]
> **`MutexInterface::acquire()` Invariant:**
> In Yii 3, `MutexInterface` represents an **individual, already-named lock instance**.
> Calling `$mutex->acquire($name, 5)` is **invalid** and throws an `ArgumentCountError`! The signature is strictly `public function acquire(int $timeout = 0): bool`.
> To dynamically acquire locks by name or ID, inject **`Yiisoft\Mutex\MutexFactoryInterface`** or use **`Yiisoft\Mutex\Synchronizer`**.

## 2. Approach A: Explicit Mutex with `MutexFactoryInterface`

```php
declare(strict_types=1);

namespace App\Application\Queue\Handler;

use App\Domain\Service\BillingServiceInterface;
use Psr\Log\LoggerInterface;
use Yiisoft\Mutex\MutexFactoryInterface;
use Yiisoft\Queue\Message\Handler\HandlerInterface;
use Yiisoft\Queue\Message\MessageInterface;

final readonly class ProcessSubscriptionRenewalHandler implements HandlerInterface
{
    public function __construct(
        private MutexFactoryInterface $mutexFactory,
        private BillingServiceInterface $billingService,
        private LoggerInterface $logger,
    ) {}

    public function handle(MessageInterface $message): void
    {
        /** @var array{subscriptionId?: string} $payload */
        $payload = (array) $message->getPayload();
        $subscriptionId = (string) ($payload['subscriptionId'] ?? '');

        if ($subscriptionId === '') {
            $this->logger->error('Empty subscription ID in queue message.');
            return;
        }

        $lockKey = 'subscription_renewal_' . $subscriptionId;

        // 1. Create a named mutex instance
        $mutex = $this->mutexFactory->create($lockKey);

        // 2. Attempt to acquire the lock (wait up to 5 seconds)
        if (!$mutex->acquire(timeout: 5)) {
            $this->logger->warning('Another worker holds lock for subscription {id}, skipping.', [
                'id' => $subscriptionId,
            ]);
            return;
        }

        try {
            // 3. Execute critical section under exclusive lock
            $this->billingService->renewSubscription($subscriptionId);
        } finally {
            // 4. Always release the lock in a finally block
            $mutex->release();
        }
    }
}
```

## 3. Approach B: Callback Execution with `Synchronizer`

`Yiisoft\Mutex\Synchronizer` handles acquiring, callback execution, and guaranteed release automatically:

```php
declare(strict_types=1);

namespace App\Application\Queue\Handler;

use App\Domain\Service\BillingServiceInterface;
use Psr\Log\LoggerInterface;
use Yiisoft\Mutex\Exception\MutexLockedException;
use Yiisoft\Mutex\Synchronizer;
use Yiisoft\Queue\Message\Handler\HandlerInterface;
use Yiisoft\Queue\Message\MessageInterface;

final readonly class ProcessSubscriptionRenewalHandler implements HandlerInterface
{
    public function __construct(
        private Synchronizer $synchronizer,
        private BillingServiceInterface $billingService,
        private LoggerInterface $logger,
    ) {}

    public function handle(MessageInterface $message): void
    {
        /** @var array{subscriptionId?: string} $payload */
        $payload = (array) $message->getPayload();
        $subscriptionId = (string) ($payload['subscriptionId'] ?? '');

        $lockKey = 'subscription_renewal_' . $subscriptionId;

        try {
            $this->synchronizer->execute(
                name: $lockKey,
                callback: fn() => $this->billingService->renewSubscription($subscriptionId),
                timeout: 5,
            );
        } catch (MutexLockedException) {
            $this->logger->warning('Subscription renewal locked by another worker: {id}', [
                'id' => $subscriptionId,
            ]);
        }
    }
}
```

## 4. Mutex Driver Packages & DI Configuration Recipes (`config/di.php`)

None of the mutex packages provide auto-configuration. `MutexFactoryInterface` must be explicitly wired in `config/di.php`:

| Package | Factory FQCN | Mutex FQCN | Driver Backend | Recommended Use Case |
|---|---|---|---|---|
| **`yiisoft/mutex-file`** | `Yiisoft\Mutex\File\FileMutexFactory` | `Yiisoft\Mutex\File\FileMutex` | Local filesystem (`flock`) | Single-server CLI or local development. Cannot be shared across multiple Docker containers/hosts. |
| **`yiisoft/mutex-redis`** | `Yiisoft\Mutex\Redis\RedisMutexFactory` | `Yiisoft\Mutex\Redis\RedisMutex` | Redis key locking (`predis/predis`) | High-throughput distributed microservices and multi-node container clusters. |
| **`yiisoft/mutex-pdo-pgsql`** | `Yiisoft\Mutex\Pgsql\PgsqlMutexFactory` | `Yiisoft\Mutex\Pgsql\PgsqlMutex` | PostgreSQL Advisory Locks (`PDO`) | Multi-worker clusters using Postgres. Fast, session-scoped, self-releasing on disconnect. |
| **`yiisoft/mutex-pdo-mysql`** | `Yiisoft\Mutex\Mysql\MysqlMutexFactory` | `Yiisoft\Mutex\Mysql\MysqlMutex` | MySQL `GET_LOCK()` (`PDO`) | Multi-worker clusters using MySQL/MariaDB. Engine-level timeout. |
| **`yiisoft/mutex-pdo-oracle`** | `Yiisoft\Mutex\Oracle\OracleMutexFactory` | `Yiisoft\Mutex\Oracle\OracleMutex` | Oracle `DBMS_LOCK` (`PDO`) | Multi-worker clusters using Oracle Database. |

### 1. Wiring `FileMutexFactory` (Filesystem)

```php
declare(strict_types=1);

use Yiisoft\Aliases\Aliases;
use Yiisoft\Mutex\File\FileMutexFactory;
use Yiisoft\Mutex\MutexFactoryInterface;
use Yiisoft\Mutex\Synchronizer;

return [
    MutexFactoryInterface::class => [
        'class' => FileMutexFactory::class,
        '__construct()' => [
            // Parameter is strictly named 'mutexPath' (not 'dirPath')
            'mutexPath' => static fn (Aliases $aliases) => $aliases->get('@runtime/mutex'),
            'directoryMode' => 0775,
            'fileMode' => null,
        ],
    ],
    Synchronizer::class => Synchronizer::class,
];
```

### 2. Wiring `RedisMutexFactory` (Predis)

> [!IMPORTANT]
> `RedisMutexFactory` strictly requires `predis/predis` (`Predis\ClientInterface`). It does **not** accept the PHP PECL extension `\Redis`. Furthermore, there is no `$autoRelease` parameter (auto-release is governed by Redis key expiration `EX $ttl`).

```php
declare(strict_types=1);

use Predis\Client;
use Predis\ClientInterface;
use Yiisoft\Definitions\Reference;
use Yiisoft\Mutex\MutexFactoryInterface;
use Yiisoft\Mutex\Redis\RedisMutexFactory;
use Yiisoft\Mutex\Synchronizer;

/** @var array $params */

return [
    ClientInterface::class => [
        'class' => Client::class,
        '__construct()' => [
            'parameters' => $params['redis']['connection'] ?? 'tcp://127.0.0.1:6379',
        ],
    ],
    MutexFactoryInterface::class => [
        'class' => RedisMutexFactory::class,
        '__construct()' => [
            'client' => Reference::to(ClientInterface::class),
            'ttl' => 30, // Lock auto-release expiration in seconds
        ],
    ],
    Synchronizer::class => Synchronizer::class,
];
```

### 3. Wiring PDO Mutex Drivers (PostgreSQL / MySQL / Oracle)

PDO mutex factories require an active native PHP `\PDO` connection. In Yii 3, database connections implement `Yiisoft\Db\Driver\Pdo\PdoConnectionInterface`, allowing clean retrieval via `getActivePdo()`:

```php
declare(strict_types=1);

use RuntimeException;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Driver\Pdo\PdoConnectionInterface;
use Yiisoft\Mutex\MutexFactoryInterface;
use Yiisoft\Mutex\Pgsql\PgsqlMutexFactory;
use Yiisoft\Mutex\Synchronizer;

return [
    MutexFactoryInterface::class => static function (ConnectionInterface $db): MutexFactoryInterface {
        if (!$db instanceof PdoConnectionInterface) {
            throw new RuntimeException('Database connection must implement PdoConnectionInterface.');
        }

        // For PostgreSQL:
        return new PgsqlMutexFactory($db->getActivePdo());

        // For MySQL, use:
        // return new \Yiisoft\Mutex\Mysql\MysqlMutexFactory($db->getActivePdo());

        // For Oracle, use:
        // return new \Yiisoft\Mutex\Oracle\OracleMutexFactory($db->getActivePdo());
    },
    Synchronizer::class => Synchronizer::class,
];
```

## 5. Mutex Anti-Patterns

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| **Calling `$mutex->acquire($key, 5)` on `MutexInterface`** | `MutexInterface::acquire(int $timeout = 0): bool` takes no key argument; it operates on an already-named mutex instance. | Inject `MutexFactoryInterface` and call `$mutexFactory->create($key)->acquire(timeout: 5)` or use `Synchronizer::execute($key, ...)`. |
| **Passing PECL `\Redis` to `RedisMutexFactory`** | `RedisMutexFactory` strictly requires `predis/predis` (`Predis\ClientInterface`); the PHP PECL extension client is not accepted. | Wire `Predis\ClientInterface` into `RedisMutexFactory`. (PECL `\Redis` belongs to `yiisoft/queue-redis` — see the [Queue Broker Adapters Guide, §8](infra-queue-brokers.md#8-broker-anti-patterns).) |

## Related Topic Guides

- [Queue & Asynchronous Jobs Guide](infra-queue-jobs.md) — Message payloads, producer push patterns, handler mapping, middleware pipelines, and worker CLI management.
- [Queue Broker Adapters Guide](infra-queue-brokers.md) — Named multi-queue wiring and the `queue-db` / `queue-redis` / `queue-amqp` adapters (`queue-db` requires a `MutexFactoryInterface`).
- [DI & Configuration Guide](core-di-and-config.md) — Config groups, definitions, modifiers, and container compilation.
- [Console Commands Guide](infra-commands.md) — Console commands where overlapping-run mutex guards (cron, batch scripts) apply.
