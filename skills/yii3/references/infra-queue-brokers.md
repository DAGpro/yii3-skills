# Yii3 Queue Broker Adapters Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Reference guide for multi-queue configuration and the transport adapter packages of `yiisoft/queue`: named queues in `config/params.php`, `QueueFactoryProvider` DI wiring, the `yiisoft/queue-db`, `yiisoft/queue-redis`, and `yiisoft/queue-amqp` broker adapters, the synchronous `SyncQueueProducer`, and the driver comparison matrix.

**Scope & Ownership:** This guide is the single source of truth for multi-queue configuration and broker adapter wiring; it was extracted from the [Queue & Asynchronous Jobs Guide, §8](infra-queue-jobs.md#8-multi-queue-configuration--broker-adapters). Exactly **ONE** broker driver package is installed per project — `yiisoft/queue-db` XOR `yiisoft/queue-redis` XOR `yiisoft/queue-amqp`; the in-memory `SyncQueueProducer` ships with `yiisoft/queue` itself and serves tests/CI/local dev instead of a real broker. Resolve which driver is installed via the project's `composer.json` or the [Package Catalog, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family), then read only the matching adapter section below. Message payloads, handler mapping, and middleware pipelines are owned by the parent [Queue & Asynchronous Jobs Guide](infra-queue-jobs.md).

---

## Table of Contents
- [1. Configuring Named Queues in `config/params.php`](#1-configuring-named-queues-in-configparamsphp)
- [2. DI Container Wiring for Queue Providers (`config/common/di/*.php`)](#2-di-container-wiring-for-queue-providers-configcommondiphp)
- [3. Broker Adapter 1: `yiisoft/queue-db` (Relational Database)](#3-broker-adapter-1-yiisoftqueue-db-relational-database)
- [4. Broker Adapter 2: `yiisoft/queue-redis` (In-Memory Redis)](#4-broker-adapter-2-yiisoftqueue-redis-in-memory-redis)
- [5. Broker Adapter 3: `yiisoft/queue-amqp` (RabbitMQ / AMQP 0-9-1)](#5-broker-adapter-3-yiisoftqueue-amqp-rabbitmq--amqp-0-9-1)
- [6. Synchronous Mode (`SyncQueueProducer`)](#6-synchronous-mode-syncqueueproducer)
- [7. Adapter Version Pin & Driver Adapters Comparison Matrix](#7-adapter-version-pin--driver-adapters-comparison-matrix)
- [8. Broker Anti-Patterns](#8-broker-anti-patterns)
- [Related Topic Guides](#related-topic-guides)

---

## 1. Configuring Named Queues in `config/params.php`

Multiple queues are defined using strict role maps containing `producer` and/or `consumer` specifications:

```php
declare(strict_types=1);

use Yiisoft\Definitions\Reference;
use Yiisoft\Queue\AsyncQueueProducer;
use Yiisoft\Queue\DefaultQueue;
use Yiisoft\Queue\QueueConsumer;

return [
    'yiisoft/queue' => [
        'queues' => [
            // Default application queue
            DefaultQueue::NAME => [
                'producer' => [
                    'class' => AsyncQueueProducer::class,
                    '__construct()' => [
                        'adapter' => Reference::to('queue-adapter-default'),
                    ],
                ],
                'consumer' => [
                    'class' => QueueConsumer::class,
                    '__construct()' => [
                        'adapter' => Reference::to('queue-adapter-default'),
                    ],
                ],
            ],
            // Dedicated high-priority queue channel
            'notifications-high' => [
                'producer' => [
                    'class' => AsyncQueueProducer::class,
                    '__construct()' => [
                        'adapter' => Reference::to('queue-adapter-notifications'),
                        'queueName' => 'notifications-high',
                    ],
                ],
                'consumer' => [
                    'class' => QueueConsumer::class,
                    '__construct()' => [
                        'adapter' => Reference::to('queue-adapter-notifications'),
                        'queueName' => 'notifications-high',
                    ],
                ],
            ],
        ],
    ],
];
```

## 2. DI Container Wiring for Queue Providers (`config/common/di/*.php`)

```php
declare(strict_types=1);

use Yiisoft\Queue\DefaultQueue;
use Yiisoft\Queue\Provider\QueueConsumerProviderInterface;
use Yiisoft\Queue\Provider\QueueFactoryProvider;
use Yiisoft\Queue\Provider\QueueProducerProviderInterface;
use Yiisoft\Queue\QueueConsumerInterface;
use Yiisoft\Queue\QueueProducerInterface;

/** @var array $params */

return [
    QueueProducerProviderInterface::class => QueueFactoryProvider::class,
    QueueConsumerProviderInterface::class => QueueFactoryProvider::class,
    QueueFactoryProvider::class => [
        '__construct()' => [
            'definitions' => $params['yiisoft/queue']['queues'] ?? [],
        ],
    ],
    QueueProducerInterface::class => static fn (QueueProducerProviderInterface $provider): QueueProducerInterface
        => $provider->getProducer(DefaultQueue::NAME),
    QueueConsumerInterface::class => static fn (QueueConsumerProviderInterface $provider): QueueConsumerInterface
        => $provider->getConsumer(DefaultQueue::NAME),
];
```

---

## 3. Broker Adapter 1: `yiisoft/queue-db` (Relational Database)

Uses relational tables via `yiisoft/db`. Ideal for projects with zero external infrastructure.

### 1. Schema Migration

> [!WARNING]
> The migration class `M240409200600CreateQueueTable` is declared in the **global namespace** (it has no namespace). Attempting to run via `--namespace=Yiisoft\Queue\Db\migrations` will fail with `LogicException`!
> Execute the migration using directory path:
> ```bash
> ./yii migrate:up --path=vendor/yiisoft/queue-db/migrations
> ```
> Or register the path in `config/params.php`:
> ```php
> 'yiisoft/db-migration' => [
>     'sourcePaths' => [
>         dirname(__DIR__, 2) . '/vendor/yiisoft/queue-db/migrations',
>     ],
> ],
> ```

### 2. DI & Mutex Configuration (`config/common/di/*.php`)

> [!IMPORTANT]
> `Yiisoft\Queue\Db\Adapter` explicitly requires `MutexFactoryInterface` in its constructor to prevent concurrent workers from reserving the same row.

```php
declare(strict_types=1);

use RuntimeException;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Driver\Pdo\PdoConnectionInterface;
use Yiisoft\Definitions\Reference;
use Yiisoft\Mutex\MutexFactoryInterface;
use Yiisoft\Mutex\Pgsql\PgsqlMutexFactory;
use Yiisoft\Queue\Db\Adapter as DbQueueAdapter;

return [
    // PDO mutex factories (PgsqlMutexFactory, MysqlMutexFactory, etc.) require a native \PDO,
    // resolved from the active DB connection — see the Queue Mutex & Distributed Concurrency
    // Guide, §4.3 "Wiring PDO Mutex Drivers".
    MutexFactoryInterface::class => [
        'class' => PgsqlMutexFactory::class,
        '__construct()' => [
            'connection' => static function (ConnectionInterface $db): \PDO {
                // getActivePdo() is declared on PdoConnectionInterface, not on ConnectionInterface.
                if (!$db instanceof PdoConnectionInterface) {
                    throw new RuntimeException('Database connection must implement PdoConnectionInterface.');
                }

                return $db->getActivePdo();
            },
        ],
    ],

    DbQueueAdapter::class => [
        'class' => DbQueueAdapter::class,
        '__construct()' => [
            'db' => Reference::to(ConnectionInterface::class),
            'channel' => 'yii-queue',
        ],
        'tableName' => '{{%queue}}',
        'mutexTimeout' => 3,
        'deleteReleased' => true,
    ],
];
```

> **For the complete reference on** wiring PDO mutex factories (`PgsqlMutexFactory`, `MysqlMutexFactory`, `OracleMutexFactory` via `PdoConnectionInterface::getActivePdo()`), **see the** [Queue Mutex & Distributed Concurrency Guide, §4.3](infra-queue-mutex.md#3-wiring-pdo-mutex-drivers-postgresql--mysql--oracle).

---

## 4. Broker Adapter 2: `yiisoft/queue-redis` (In-Memory Redis)

High-throughput, sub-millisecond latencies.

> [!IMPORTANT]
> `yiisoft/queue-redis` strictly requires the PHP PECL C-extension `ext-redis` (`\Redis`). It does **not** accept `Predis\ClientInterface`.
> Supports `DelayEnvelope` natively via Redis Sorted Sets.

```php
declare(strict_types=1);

use Redis;
use RuntimeException;
use Yiisoft\Definitions\Reference;
use Yiisoft\Queue\Redis\Adapter as RedisQueueAdapter;
use Yiisoft\Queue\Redis\QueueProvider;
use Yiisoft\Queue\Redis\QueueProviderInterface;

return [
    Redis::class => static function (): Redis {
        $redis = new Redis();
        if (!$redis->connect('127.0.0.1', 6379, 2.5)) {
            throw new RuntimeException('Cannot connect to Redis server.');
        }
        return $redis;
    },

    QueueProviderInterface::class => QueueProvider::class,
    QueueProvider::class => [
        'class' => QueueProvider::class,
        '__construct()' => [
            'redis' => Reference::to(Redis::class),
            'channelName' => 'yii-queue',
        ],
    ],

    RedisQueueAdapter::class => [
        'class' => RedisQueueAdapter::class,
        '__construct()' => [
            'provider' => Reference::to(QueueProviderInterface::class),
            'timeout' => 3,
        ],
    ],
];
```

---

## 5. Broker Adapter 3: `yiisoft/queue-amqp` (RabbitMQ / AMQP 0-9-1)

Enterprise message broker with advanced routing, acknowledgements, and dead-letter topology.

> [!NOTE]
> **Native Delays without Plugins:**
> `yiisoft/queue-amqp` implements delayed execution natively using Dead-Letter Exchanges (DLX) and per-message TTL (`x-dead-letter-exchange`, `x-message-ttl`, `x-expires`). **No RabbitMQ plugins are needed!**
> However, an Exchange (`ExchangeSettingsInterface`) **must** be defined in DI; otherwise, pushing delayed messages throws `InvalidArgumentException`.

```php
declare(strict_types=1);

use PhpAmqpLib\Connection\AbstractConnection;
use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Exchange\AMQPExchangeType;
use PhpAmqpLib\Message\AMQPMessage;
use Yiisoft\Definitions\Reference;
use Yiisoft\Queue\Amqp\Adapter as AmqpQueueAdapter;
use Yiisoft\Queue\Amqp\QueueProvider;
use Yiisoft\Queue\Amqp\QueueProviderInterface;
use Yiisoft\Queue\Amqp\Settings\Exchange as ExchangeSettings;
use Yiisoft\Queue\Amqp\Settings\ExchangeSettingsInterface;
use Yiisoft\Queue\Amqp\Settings\QosSettings;
use Yiisoft\Queue\Amqp\Settings\Queue as QueueSettings;
use Yiisoft\Queue\Amqp\Settings\QueueSettingsInterface;

return [
    AbstractConnection::class => static fn (): AbstractConnection => new AMQPStreamConnection(
        host: '127.0.0.1',
        port: 5672,
        user: 'guest',
        password: 'guest',
        vhost: '/',
    ),

    QosSettings::class => [
        'class' => QosSettings::class,
        '__construct()' => [
            'prefetchCount' => 10,
            'global' => false,
        ],
    ],

    QueueSettingsInterface::class => [
        'class' => QueueSettings::class,
        '__construct()' => [
            'queueName' => 'yii-queue',
            'durable' => true,
            'autoDelete' => false,
            'qosSettings' => Reference::to(QosSettings::class),
        ],
    ],

    // Exchange declaration settings (MANDATORY for DelayEnvelope support)
    ExchangeSettingsInterface::class => [
        'class' => ExchangeSettings::class,
        '__construct()' => [
            'exchangeName' => 'yii-queue',
            'type' => AMQPExchangeType::DIRECT,
            'durable' => true,
            'autoDelete' => false,
        ],
    ],

    QueueProviderInterface::class => [
        'class' => QueueProvider::class,
        '__construct()' => [
            'connection' => Reference::to(AbstractConnection::class),
            'queueSettings' => Reference::to(QueueSettingsInterface::class),
            'exchangeSettings' => Reference::to(ExchangeSettingsInterface::class),
            'messageProperties' => [
                'delivery_mode' => AMQPMessage::DELIVERY_MODE_PERSISTENT,
            ],
        ],
    ],

    AmqpQueueAdapter::class => [
        'class' => AmqpQueueAdapter::class,
        '__construct()' => [
            'queueProvider' => Reference::to(QueueProviderInterface::class),
        ],
    ],
];
```

---

## 6. Synchronous Mode (`SyncQueueProducer`)

Executes messages inline immediately upon `push()` in the current execution thread. Ideal for automated testing, CI, and local dev without background workers:

```php
declare(strict_types=1);

use Yiisoft\Queue\SyncQueueProducer;

// In test environment or config/environments/test/di.php:
return [
    \Yiisoft\Queue\QueueProducerInterface::class => SyncQueueProducer::class,
];
```

---

## 7. Adapter Version Pin & Driver Adapters Comparison Matrix

> [!WARNING]
> **Adapter Version Pin (`dev-master`):** All three transport adapters (`yiisoft/queue-db`, `yiisoft/queue-redis`, `yiisoft/queue-amqp`) pin `"yiisoft/queue": "dev-master"` in their `composer.json`. Anchor queue API usage and wiring to the sources actually installed under `vendor/yiisoft/queue/src/`, not to assumptions about released tags.

| Adapter Package | Storage Engine | Delay Implementation | Message Status Inspection | Throughput Range | Infrastructure Needed |
|---|---|---|---|---|---|
| **`yiisoft/queue-db`** | RDBMS (PostgreSQL, MySQL, SQLite) | Supported (timestamp query condition) | Supported (`WAITING`, `RESERVED`, `DONE`) | ~200–800 msg/sec | Existing database; requires `MutexFactoryInterface`. |
| **`yiisoft/queue-redis`** | Redis | Supported (Redis Sorted Sets `ZADD`) | Supported (`WAITING`, `RESERVED`, `DONE`, `NOT_FOUND`) | ~15,000–50,000 msg/sec | Redis server; requires PECL `\Redis`. |
| **`yiisoft/queue-amqp`** | RabbitMQ / AMQP 0-9-1 | Supported (Native DLX + TTL; requires Exchange) | Unsupported (`NotImplementedException`) | ~20,000–100,000+ msg/sec | RabbitMQ cluster; requires `php-amqplib`. |
| **`SyncQueueProducer`** | In-Memory (No Adapter) | Unsupported (executes synchronously) | Unsupported | Inline PHP execution | None (for CI/Unit Tests). |

---

## 8. Broker Anti-Patterns

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| **Calling `$producer->status($id)` when using `queue-amqp`** | `Yiisoft\Queue\Amqp\Adapter::status()` throws `NotImplementedException` because AMQP/RabbitMQ does not support ad-hoc message status queries. | Only check status on adapters supporting it (`queue-db`, `queue-redis`), or track task state in application database. |
| **Assuming `queue-redis` lacks delay support** | `queue-redis` natively supports `DelayEnvelope` via Redis Sorted Sets (`ZADD $channel.delayed`). All three official adapters (`queue-db`, `queue-redis`, `queue-amqp`) support delays. | Wrap messages in `DelayEnvelope` with confidence across all three official adapters. |
| **Assuming `queue-amqp` delays require `rabbitmq_delayed_message_exchange` plugin** | `queue-amqp` implements delayed execution natively using standard RabbitMQ Dead-Letter Exchanges (DLX) + per-message TTL. Broker plugins are not required. | Configure an `ExchangeSettingsInterface` in AMQP DI settings (mandatory for delay routing). |
| **Running `queue-db` migrations via `--namespace=Yiisoft\Queue\Db\migrations` or `./yii migrate`** | Migration class `M240409200600CreateQueueTable` is in the global namespace; `./yii migrate` does not exist in `yiisoft/db-migration`. | Run `./yii migrate:up --path=vendor/yiisoft/queue-db/migrations` or register `'sourcePaths'` in `config/params.php`. |
| **Passing `predis/predis` to `queue-redis`** | `queue-redis` strictly requires native PECL `ext-redis` (`\Redis`), not `Predis\ClientInterface`. | Use PECL `\Redis` for `queue-redis`; `predis/predis` belongs to `RedisMutexFactory` (see the [Queue Mutex & Distributed Concurrency Guide, §5](infra-queue-mutex.md#5-mutex-anti-patterns)). |

## Related Topic Guides

- [Queue & Asynchronous Jobs Guide](infra-queue-jobs.md) — Message payloads, producer push patterns, handler mapping, middleware pipelines, and worker CLI management.
- [Queue Mutex & Distributed Concurrency Guide](infra-queue-mutex.md) — `MutexFactoryInterface`, `Synchronizer`, and mutex driver DI recipes (the `queue-db` adapter requires a mutex factory).
- [Console Commands Guide](infra-commands.md) — `queue:listen` / `queue:run` worker commands and console command registration.
- [Long-Running Worker Safety & StateResetter Guide](infra-state-resetter.md) — Per-iteration state reset for long-running queue worker daemons.
- [DI & Configuration Guide](core-di-and-config.md) — Config groups, definitions, modifiers, and container compilation.
