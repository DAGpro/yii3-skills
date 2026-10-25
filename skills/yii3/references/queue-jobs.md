# Yii3 Queue & Asynchronous Jobs Guide

> Practical guide for asynchronous task execution, background workers, failure retries, and distributed locking using `yiisoft/queue` and `yiisoft/mutex`.
>
> **Source of Truth & Verification Rule for AI Models:**
> In projects using this extension, always verify exact method signatures, constructor arguments, and options directly in `vendor/yiisoft/<package>/src/` for installed packages.
> When generating code, if an installed package's method signature or property is unfamiliar or in doubt, **read its source files in `vendor/yiisoft/<package>/src/`** rather than guessing or relying on Yii2 habits.

---

## Table of Contents
- [1. Asynchronous Architecture & Roles](#1-asynchronous-architecture--roles)
- [2. Designing Message Payloads (Lightweight DTOs)](#2-designing-message-payloads-lightweight-dtos)
- [3. Pushing Messages to Queue](#3-pushing-messages-to-queue)
- [4. Message Handlers & DI Configuration](#4-message-handlers--di-configuration)
- [5. Failure Handling, Retries & Dead-Letter Queues](#5-failure-handling-retries--dead-letter-queues)
- [6. Distributed Concurrency & Mutex Locks (yiisoft/mutex)](#6-distributed-concurrency--mutex-locks-yiisoftmutex)
- [7. Worker CLI Management](#7-worker-cli-management)
- [8. Multi-Queue Configuration & Broker Adapters](#8-multi-queue-configuration--broker-adapters)
- [9. Anti-Pattern Matrix](#9-anti-pattern-matrix)

---

## 1. Asynchronous Architecture & Roles

`yiisoft/queue` strictly decouples message generation (producers), payload serialization (messages), message processing (handlers), and transport mechanisms (adapters).

```
Producer (HTTP/CLI/Event)
   │  pushes MessageInterface (pure data DTO)
   ▼
QueueProducerInterface ──► Push Middleware Pipeline ──► AdapterInterface (DB / Redis / AMQP)
                                                                 │
                                                       Broker Transport
                                                                 │
                                                                 ▼
QueueConsumerInterface ◄── Consume Middleware Pipeline ◄── AdapterInterface
   │
   ▼
WorkerInterface ──► HandlerResolver ──► HandlerInterface::handle(MessageInterface $message)
   │ (on failure)
   ▼
Failure Middleware Pipeline (ExponentialDelayMiddleware / SendAgainMiddleware)
```

### Core Interface Contracts

| Interface | FQCN | Role & Responsibilities |
|---|---|---|
| **`QueueProducerInterface`** | `Yiisoft\Queue\QueueProducerInterface` | Pushes messages via `push(MessageInterface $message): MessageInterface`, inspects status via `status(string\|int $id): MessageStatus`, and returns logical queue name via `getQueueName(): string`. |
| **`QueueConsumerInterface`** | `Yiisoft\Queue\QueueConsumerInterface` | Consumes messages from a queue via continuous daemon `listen(): void` or bounded batch `run(int $max = 0): int`. |
| **`QueueProducerProviderInterface`** | `Yiisoft\Queue\Provider\QueueProducerProviderInterface` | Obtains named producer instances via `getProducer(string\|BackedEnum $queueName): QueueProducerInterface`. Checks role via `hasProducer()` and lists names via `getProducerQueueNames()`. |
| **`QueueConsumerProviderInterface`** | `Yiisoft\Queue\Provider\QueueConsumerProviderInterface` | Obtains named consumer instances via `getConsumer(string\|BackedEnum $queueName): QueueConsumerInterface`. Checks role via `hasConsumer()` and lists names via `getConsumerQueueNames()`. |
| **`MessageInterface`** | `Yiisoft\Queue\Message\MessageInterface` | Immutable data transport contract containing message type (`getType(): string`), payload (`getPayload(): bool\|int\|float\|string\|array\|null`), metadata (`getMeta(): array`), and factory constructor `fromPayload(string $type, bool\|int\|float\|string\|array\|null $payload): static`. |
| **`HandlerInterface`** | `Yiisoft\Queue\Message\Handler\HandlerInterface` | Contract for message consumer execution logic via `handle(MessageInterface $message): void`. |
| **`AdapterInterface`** | `Yiisoft\Queue\Adapter\AdapterInterface` | Low-level transport driver bridge (`push()`, `status()`, `runExisting()`, `subscribe()`). |

> [!IMPORTANT]
> In Yii3, there is **no monolithic `QueueInterface`**. Pushing messages is handled by `QueueProducerInterface` (or `QueueProducerProviderInterface` for named channels), while worker loops use `QueueConsumerInterface` (or `QueueConsumerProviderInterface`).

---

## 2. Designing Message Payloads (Lightweight DTOs)

> [!WARNING]
> **CRITICAL SERIALIZATION RULES:**
> 1. Messages are serialized to JSON by default using `Yiisoft\Queue\Message\Serializer\JsonMessageEncoder` wrapped in `Yiisoft\Queue\Message\Serializer\MessageSerializer`.
> 2. Payloads must contain **only scalars (`string`, `int`, `float`, `bool`), `null`, or arrays composed of scalars and `null`**.
> 3. **Never serialize** PDO instances, PSR-11 containers, file resources, closures, or heavy ORM entity graphs into queue messages.
> 4. Transmit only primitive identifiers (e.g. `orderId`, `userId`). The consumer handler fetches fresh database state during execution.
> 5. Custom message classes must implement `public static function fromPayload(string $type, bool|int|float|string|array|null $payload): static` so that `MessageSerializer::unserialize()` can reconstruct typed objects.

### Idiomatic Custom Message DTO

Custom messages should extend `Yiisoft\Queue\Message\Message`, which provides metadata storage and immutable manipulation via `getMeta()` and `withMeta()`:

```php
declare(strict_types=1);

namespace App\Application\Queue\Message;

use InvalidArgumentException;
use Yiisoft\Queue\Message\Message;

use function is_array;
use function is_bool;
use function is_int;
use function is_string;
use function sprintf;

/**
 * Pure data message DTO. Carries no execution logic and no dependencies.
 */
final class GenerateInvoiceMessage extends Message
{
    public const TYPE = 'order.generate-invoice';

    public function __construct(
        public readonly string $orderId,
        public readonly int $initiatedByUserId,
        public readonly bool $sendEmail = true,
    ) {}

    /**
     * Reconstructs the typed message from raw payload during unserialization.
     *
     * @param string $type The message type string.
     * @param bool|int|float|string|array|null $payload Raw scalar or array data.
     *
     * @throws InvalidArgumentException When type does not match or payload structure is invalid.
     */
    public static function fromPayload(string $type, bool|int|float|string|array|null $payload): static
    {
        if ($type !== self::TYPE) {
            throw new InvalidArgumentException(sprintf('Expected message type "%s", got "%s".', self::TYPE, $type));
        }

        if (
            !is_array($payload)
            || !isset($payload['orderId']) || !is_string($payload['orderId'])
            || !isset($payload['initiatedByUserId']) || !is_int($payload['initiatedByUserId'])
            || !isset($payload['sendEmail']) || !is_bool($payload['sendEmail'])
        ) {
            throw new InvalidArgumentException(sprintf('Invalid payload structure for "%s".', self::class));
        }

        return new self(
            orderId: $payload['orderId'],
            initiatedByUserId: $payload['initiatedByUserId'],
            sendEmail: $payload['sendEmail'],
        );
    }

    public function getType(): string
    {
        return self::TYPE;
    }

    /**
     * @return array<string, scalar|null>
     */
    public function getPayload(): array
    {
        return [
            'orderId' => $this->orderId,
            'initiatedByUserId' => $this->initiatedByUserId,
            'sendEmail' => $this->sendEmail,
        ];
    }
}
```

### Generic Ad-Hoc Messages (`GenericMessage`)

When defining a dedicated class is unnecessary or when handling arbitrary message payloads, use `Yiisoft\Queue\Message\GenericMessage`:

```php
declare(strict_types=1);

use Yiisoft\Queue\Message\GenericMessage;

$message = new GenericMessage(
    type: 'order.generate-invoice',
    payload: [
        'orderId' => '018f2e21-5f0a-7b3c-9120-d9ab5c123456',
        'initiatedByUserId' => 42,
        'sendEmail' => true,
    ],
);
```

---

## 3. Pushing Messages to Queue

### Pushing to Default Queue

Inject `Yiisoft\Queue\QueueProducerInterface` into your application service, command, or event listener:

```php
declare(strict_types=1);

namespace App\Application\Listener;

use App\Application\Queue\Message\GenerateInvoiceMessage;
use App\Domain\Event\OrderPlacedEvent;
use Psr\Log\LoggerInterface;
use Yiisoft\Queue\Message\IdEnvelope;
use Yiisoft\Queue\QueueProducerInterface;

final readonly class QueueOrderInvoiceGenerationListener
{
    public function __construct(
        private QueueProducerInterface $queueProducer,
        private LoggerInterface $logger,
    ) {}

    public function __invoke(OrderPlacedEvent $event): void
    {
        $message = new GenerateInvoiceMessage(
            orderId: $event->orderId,
            initiatedByUserId: (int) $event->userId,
            sendEmail: true,
        );

        // Push to broker. Returns possibly enriched message (e.g. wrapped in IdEnvelope)
        $pushedMessage = $this->queueProducer->push($message);

        // Retrieve the assigned message ID (if supported by adapter)
        $messageId = IdEnvelope::fromMessage($pushedMessage)->getId();

        $this->logger->info('Pushed GenerateInvoiceMessage to queue with assigned ID {id}', [
            'id' => $messageId ?? 'unassigned',
        ]);
    }
}
```

### Delayed Execution (`DelayEnvelope`)

Wrap the message in `Yiisoft\Queue\Message\DelayEnvelope` to delay processing:

```php
declare(strict_types=1);

use App\Application\Queue\Message\GenerateInvoiceMessage;
use Yiisoft\Queue\Message\DelayEnvelope;
use Yiisoft\Queue\QueueProducerInterface;

/** @var QueueProducerInterface $queueProducer */
$message = new GenerateInvoiceMessage(orderId: 'ORD-100', initiatedByUserId: 1);

// Wrap message to execute after 5 minutes (300 seconds)
$delayedMessage = new DelayEnvelope($message, delaySeconds: 300.0);

$queueProducer->push($delayedMessage);
```

> [!NOTE]
> Adapters that support delays (e.g. `queue-db`, `queue-amqp`) schedule the message according to `delaySeconds`. Adapters lacking delay support will ignore the envelope and process the message in immediate FIFO order.

### Inspecting Message Status (`MessageStatus`)

```php
declare(strict_types=1);

use Psr\Log\LoggerInterface;
use Yiisoft\Queue\Message\IdEnvelope;
use Yiisoft\Queue\Message\MessageInterface;
use Yiisoft\Queue\MessageStatus;
use Yiisoft\Queue\QueueProducerInterface;

/** @var QueueProducerInterface $queueProducer */
/** @var MessageInterface $message */
/** @var LoggerInterface $logger */
$pushed = $queueProducer->push($message);
$messageId = IdEnvelope::fromMessage($pushed)->getId();

if ($messageId !== null) {
    $status = $queueProducer->status($messageId);

    match ($status) {
        MessageStatus::WAITING => $logger->info('Message is waiting in queue'),
        MessageStatus::RESERVED => $logger->info('Message is currently being processed by worker'),
        MessageStatus::DONE => $logger->info('Message processing completed'),
        MessageStatus::NOT_FOUND => $logger->warning('Message ID expired or not found'),
    };
}
```

### Pushing to Named Channels (`QueueProducerProviderInterface`)

When routing messages to specific queue channels (e.g. `notifications`, `exports`), inject `QueueProducerProviderInterface`:

```php
declare(strict_types=1);

namespace App\Application\Service;

use Yiisoft\Queue\Message\GenericMessage;
use Yiisoft\Queue\Provider\QueueProducerProviderInterface;

final readonly class PushNotificationSender
{
    public function __construct(
        private QueueProducerProviderInterface $producerProvider,
    ) {}

    public function send(string $userId, string $title, string $body): void
    {
        // Obtain named producer capability
        $producer = $this->producerProvider->getProducer('notifications');

        $producer->push(new GenericMessage(
            type: 'notifications.push',
            payload: [
                'userId' => $userId,
                'title' => $title,
                'body' => $body,
            ],
        ));
    }
}
```

---

## 4. Message Handlers & DI Configuration

Handlers implement `Yiisoft\Queue\Message\Handler\HandlerInterface`. Handlers are pure business execution units resolved lazily by the worker via the PSR-11 container.

```php
declare(strict_types=1);

namespace App\Application\Queue\Handler;

use App\Application\Queue\Message\GenerateInvoiceMessage;
use App\Domain\Repository\OrderRepositoryInterface;
use App\Domain\Service\MailerInterface;
use App\Domain\Service\PdfInvoiceGeneratorInterface;
use Psr\Log\LoggerInterface;
use Throwable;
use Yiisoft\Queue\Message\Handler\HandlerInterface;
use Yiisoft\Queue\Message\MessageInterface;

final readonly class GenerateInvoiceHandler implements HandlerInterface
{
    public function __construct(
        private OrderRepositoryInterface $orders,
        private PdfInvoiceGeneratorInterface $pdfGenerator,
        private MailerInterface $mailer,
        private LoggerInterface $logger,
    ) {}

    public function handle(MessageInterface $message): void
    {
        // Extract data either from typed message or raw payload
        if ($message instanceof GenerateInvoiceMessage) {
            $orderId = $message->orderId;
            $sendEmail = $message->sendEmail;
        } else {
            /** @var array{orderId?: string, sendEmail?: bool} $payload */
            $payload = (array) $message->getPayload();
            $orderId = (string) ($payload['orderId'] ?? '');
            $sendEmail = (bool) ($payload['sendEmail'] ?? true);
        }

        $this->logger->info('Starting invoice generation for order {orderId}', ['orderId' => $orderId]);

        $order = $this->orders->findById($orderId);
        if ($order === null) {
            $this->logger->warning('Order {orderId} not found, discarding job.', ['orderId' => $orderId]);
            return;
        }

        try {
            $pdfPath = $this->pdfGenerator->generateForOrder($order);

            if ($sendEmail) {
                $this->mailer->sendInvoicePdf($order, $pdfPath);
            }

            $this->logger->info('Invoice successfully generated for order {orderId}', ['orderId' => $orderId]);
        } catch (Throwable $e) {
            $this->logger->error('Invoice generation failed: {error}', [
                'orderId' => $orderId,
                'error' => $e->getMessage(),
            ]);
            // Re-throw to trigger failure handling middleware pipeline or Dead-Letter Queue
            throw $e;
        }
    }
}
```

### Handler & Message Mapping (`config/params.php`)

In Yii3, queue messages and handlers are configured under the `'yiisoft/queue'` array in application parameters:

```php
declare(strict_types=1);

use App\Application\Queue\Handler\GenerateInvoiceHandler;
use App\Application\Queue\Message\GenerateInvoiceMessage;

return [
    'yiisoft/queue' => [
        /**
         * Map message types to typed MessageInterface classes.
         * Used by MessageSerializer to reconstruct typed objects instead of GenericMessage.
         */
        'messages' => [
            GenerateInvoiceMessage::TYPE => GenerateInvoiceMessage::class,
        ],

        /**
         * Map message types to handler definitions.
         * Values can be FQCN implementing HandlerInterface, callable, or injector definitions.
         */
        'handlers' => [
            GenerateInvoiceMessage::TYPE => GenerateInvoiceHandler::class,
        ],
    ],
];
```

> [!TIP]
> **Zero-Config Handlers:** If your message type is an exact FQCN of a class implementing `HandlerInterface`, no explicit mapping is required. `HandlerResolver` automatically fetches the class from the DI container.

---

## 5. Failure Handling, Retries & Dead-Letter Queues

When a message handler throws a `Throwable`, `Worker::process()` invokes the failure handling middleware pipeline (`middlewares-fail`).

Configure retry policies in `config/params.php`:

```php
declare(strict_types=1);

use Yiisoft\Queue\Middleware\FailureHandling\FailureMiddlewareDispatcher;
use Yiisoft\Queue\Middleware\FailureHandling\Implementation\ExponentialDelayMiddleware;
use Yiisoft\Queue\Middleware\FailureHandling\Implementation\SendAgainMiddleware;
use Yiisoft\Queue\Provider\QueueProducerProviderInterface;

return [
    'yiisoft/queue' => [
        'middlewares-fail' => [
            // Default failure pipeline for all queues
            FailureMiddlewareDispatcher::DEFAULT_PIPELINE => [
                [
                    'class' => ExponentialDelayMiddleware::class,
                    '__construct()' => [
                        'id' => 'invoice-exponential-retry',
                        'maxAttempts' => 3,
                        'delayInitial' => 10.0, // seconds
                        'delayMaximum' => 120.0, // seconds
                        'exponent' => 2.0,
                        'producerProvider' => QueueProducerProviderInterface::class,
                    ],
                ],
                // After 3 exponential retries fail, forward to dead-letter queue
                static fn(QueueProducerProviderInterface $queues) => new SendAgainMiddleware(
                    id: 'forward-to-dead-letter',
                    maxAttempts: 1,
                    targetQueue: $queues->getProducer('dead-letter-queue'),
                ),
            ],
        ],
    ],
];
```

| Middleware | FQCN | Constructor Parameters | Behavior |
|---|---|---|---|
| **`SendAgainMiddleware`** | `Yiisoft\Queue\Middleware\FailureHandling\Implementation\SendAgainMiddleware` | `string $id`, `int $maxAttempts`, `?QueueProducerInterface $targetQueue = null`, `?QueueProducerProviderInterface $producerProvider = null` | Immediately resends message up to `$maxAttempts` times to original queue (via `$producerProvider`) or `$targetQueue`. |
| **`ExponentialDelayMiddleware`** | `Yiisoft\Queue\Middleware\FailureHandling\Implementation\ExponentialDelayMiddleware` | `string $id`, `int $maxAttempts`, `float $delayInitial`, `float $delayMaximum`, `float $exponent`, `?QueueProducerInterface $queue = null`, `?QueueProducerProviderInterface $producerProvider = null` | Resends message up to `$maxAttempts` times with exponentially increasing delay (`delayInitial * (exponent ^ attempts)` capped at `delayMaximum`). |

---

## 6. Distributed Concurrency & Mutex Locks (`yiisoft/mutex`)

When multiple background workers run concurrently, use `yiisoft/mutex` to prevent race conditions on shared resources (e.g. inventory allocations, subscription billing, wallet transfers).

> [!IMPORTANT]
> In Yii3, `Yiisoft\Mutex\MutexInterface` represents an **individual, already-named lock instance**.
> To dynamically acquire locks by name or ID, inject **`Yiisoft\Mutex\MutexFactoryInterface`** or use **`Yiisoft\Mutex\Synchronizer`**.

### Approach A: Explicit Mutex with `MutexFactoryInterface`

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

### Approach B: Callback Execution with `Synchronizer`

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

### Mutex Driver Packages

| Package | Factory FQCN | Mutex FQCN | Driver Backend | Recommended Use Case |
|---|---|---|---|---|
| **`yiisoft/mutex-file`** | `Yiisoft\Mutex\File\FileMutexFactory` | `Yiisoft\Mutex\File\FileMutex` | Local filesystem (`flock`) | Single-server CLI or local development. Cannot be shared across multiple Docker containers/hosts. |
| **`yiisoft/mutex-redis`** | `Yiisoft\Mutex\Redis\RedisMutexFactory` | `Yiisoft\Mutex\Redis\RedisMutex` | Redis key locking (`predis/predis`) | High-throughput distributed microservices and multi-node container clusters. |
| **`yiisoft/mutex-pdo-pgsql`** | `Yiisoft\Mutex\Pgsql\PgsqlMutexFactory` | `Yiisoft\Mutex\Pgsql\PgsqlMutex` | PostgreSQL Advisory Locks (`PDO`) | Multi-worker clusters using Postgres as primary database. Fast, self-releasing on disconnect. |
| **`yiisoft/mutex-pdo-mysql`** | `Yiisoft\Mutex\Mysql\MysqlMutexFactory` | `Yiisoft\Mutex\Mysql\MysqlMutex` | MySQL `GET_LOCK()` (`PDO`) | Multi-worker clusters using MySQL/MariaDB. |
| **`yiisoft/mutex-pdo-oracle`** | `Yiisoft\Mutex\Oracle\OracleMutexFactory` | `Yiisoft\Mutex\Oracle\OracleMutex` | Oracle `DBMS_LOCK` (`PDO`) | Multi-worker clusters using Oracle Database. |

---

## 7. Worker CLI Management

Workers run via console commands registered by `yiisoft/queue` under `yiisoft/yii-console`:

```bash
# Continuous daemon worker (for Docker, systemd, or Supervisor)
./yii queue:listen

# Listen to a specific named queue channel
./yii queue:listen notifications

# Process all existing messages and exit (ideal for cron, CI, or test runners)
./yii queue:run

# Process existing messages up to a limit per queue
./yii queue:run notifications --limit 100

# Listen to all configured consumer queues simultaneously (development only)
./yii queue:listen-all --pause 1 --limit 50
```

### Supervisor Production Configuration (`/etc/supervisor/conf.d/yii-queue.conf`)

```ini
[program:yii-queue-worker]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/app/yii queue:listen
autostart=true
autorestart=true
user=www-data
numprocs=4
redirect_stderr=true
stdout_logfile=/var/log/supervisor/yii-queue.log
stopwaitsecs=3600
```

> [!NOTE]
> `yiisoft/queue` automatically utilizes `SignalLoop` (PCNTL signals) when the `pcntl` extension is loaded, enabling graceful worker termination upon receiving `SIGTERM` or `SIGINT`.

---

## 8. Multi-Queue Configuration & Broker Adapters

### Configuring Named Queues in `config/params.php`

Multiple queues are defined using strict role maps containing `producer` and/or `consumer` specifications:

```php
declare(strict_types=1);

use Yiisoft\Queue\Adapter\AdapterInterface;
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
                    '__construct()' => ['adapter' => AdapterInterface::class],
                ],
                'consumer' => [
                    'class' => QueueConsumer::class,
                    '__construct()' => ['adapter' => AdapterInterface::class],
                ],
            ],
            // Dedicated high-priority queue channel
            'notifications-high' => [
                'producer' => [
                    'class' => AsyncQueueProducer::class,
                    '__construct()' => [
                        'adapter' => AdapterInterface::class,
                        'queueName' => 'notifications-high',
                    ],
                ],
                'consumer' => [
                    'class' => QueueConsumer::class,
                    '__construct()' => [
                        'adapter' => AdapterInterface::class,
                        'queueName' => 'notifications-high',
                    ],
                ],
            ],
        ],
    ],
];
```

### DI Container Wiring for Queue Providers (`config/di.php`)

To resolve `QueueProducerProviderInterface`, `QueueConsumerProviderInterface`, and the default `QueueProducerInterface` from `$params['yiisoft/queue']['queues']`, register `QueueFactoryProvider` in `config/di.php`:

```php
declare(strict_types=1);

use Yiisoft\Queue\DefaultQueue;
use Yiisoft\Queue\Provider\QueueConsumerProviderInterface;
use Yiisoft\Queue\Provider\QueueFactoryProvider;
use Yiisoft\Queue\Provider\QueueProducerProviderInterface;
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
    QueueProducerInterface::class => static fn(QueueProducerProviderInterface $provider): QueueProducerInterface => $provider->getProducer(DefaultQueue::NAME),
];
```

### Driver Adapters Comparison

| Adapter Package | Adapter FQCN | Storage Engine | Pros | Trade-offs |
|---|---|---|---|---|
| **`yiisoft/queue-db`** | `Yiisoft\Queue\Db\Adapter` | RDBMS (PostgreSQL, MySQL, SQLite) | Zero new infrastructure; uses existing DB connection via `yiisoft/db`; supports delays and status checks. | DB table polling overhead under high throughput (>500 msg/sec). |
| **`yiisoft/queue-redis`** | `Yiisoft\Queue\Redis\Adapter` | Redis | In-memory speed, sub-millisecond latencies, negligible polling overhead. | Requires Redis instance; persistence must be configured (AOF/RDB). |
| **`yiisoft/queue-amqp`** | `Yiisoft\Queue\Amqp\Adapter` | RabbitMQ / AMQP 0-9-1 | Industry-standard message broker, complex routing, native DLQ, acknowledgements. | Requires running RabbitMQ cluster; `status()` throws `NotImplementedException`. |
| **Synchronous Mode** | `Yiisoft\Queue\SyncQueueProducer` | In-Memory (No Adapter) | Zero configuration; runs jobs inline during `push()`. Great for unit testing and CI. | Blocks caller thread; not for background or asynchronous production workloads. |

---

## 9. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| **Injecting `Yiisoft\Queue\QueueInterface`** | `QueueInterface` does not exist in Yii3. Pushing will fail with container/class not found errors. | Inject `QueueProducerInterface` for the default queue or `QueueProducerProviderInterface` for named queues. |
| **Yii2 `JobInterface::execute($queue)`** | Merges data DTO with execution logic, pulls framework dependencies into payloads, breaks cross-language and microservice queues. | Separate into pure data message extending `Message` and handler implementing `HandlerInterface::handle(MessageInterface $message)`. |
| **Calling `$message->getData()` or `$message->getHandlerName()`** | Phantom methods from legacy/unreleased drafts; will trigger Fatal Errors. | Use `$message->getPayload()` for payload data and `$message->getType()` for the message identifier. |
| **Calling `$mutex->acquire($key, 5)` on `MutexInterface`** | `MutexInterface::acquire(int $timeout = 0): bool` takes no key argument; it operates on an already-named mutex instance. | Inject `MutexFactoryInterface` and call `$mutexFactory->create($key)->acquire(timeout: 5)` or use `Synchronizer::execute($key, ...)`. |
| **Using Yii2 route syntax `./yii queue/listen` or `queue/run`** | Yii3 console commands use standard Symfony-style colons: `queue:listen`, `queue:run`, `queue:listen-all`. | Run `./yii queue:listen` or `./yii queue:run`. |
| **Serializing PDO, container, or ORM entities in messages** | Serializing closures, database connections, or large entity graphs triggers serialization exceptions, memory leaks, and stale DB state. | Transmit only primitive IDs and scalars in message payload. Re-query entities inside the handler. |
| **Configuring handlers in `di.php` instead of `params.php`** | `yiisoft/queue` reads message and handler mappings from `$params['yiisoft/queue']['handlers']` and `['messages']`. | Place queue handler mappings in `config/params.php` under `'yiisoft/queue'`. |
| **Pushing queue messages inside an active DB transaction** | If the worker picks up the job before the transaction commits, the record is not found. If the transaction rolls back, an orphaned job executes anyway. | Dispatch queue messages in post-commit event listeners or application use-case layers after `$transaction->commit()`. |
| **Swallowing exceptions silently inside worker handlers** | Prevents the failure middleware pipeline and dead-letter queue from activating; failing jobs are falsely marked as successful. | Log errors and re-throw `Throwable` to trigger retry policies or dead-letter routing. |
| **Omitting `fromPayload()` in custom `MessageInterface` classes** | Unserializing messages from JSON requires `fromPayload(string $type, mixed $payload): static` to reconstruct the typed message object. | Always implement `public static function fromPayload(string $type, bool\|int\|float\|string\|array\|null $payload): static`. |
| **Calling `$producer->status($id)` when using `queue-amqp`** | `Yiisoft\Queue\Amqp\Adapter::status()` throws `NotImplementedException` because AMQP/RabbitMQ does not support ad-hoc message status queries. | Only check status on adapters supporting it (`queue-db`, `queue-redis`), or track task state in application database. |
| **Instantiating abstract class `Message` directly via `new Message(...)`** | `Yiisoft\Queue\Message\Message` is an abstract class; attempting `new Message(...)` triggers PHP `Cannot instantiate abstract class` Fatal Error. | Instantiate `GenericMessage` or a custom domain class extending `Message`. |
| **Using `DelayEnvelope` with unsupported adapters without checking** | Adapters lacking delay support silently ignore `DelayEnvelope` and process the message in immediate FIFO order. | Verify adapter delay capability (`queue-db` and `queue-amqp` support delays) or use scheduled dispatching. |
| **Assuming single monolithic worker loop for all queues in production** | `./yii queue:listen` only listens to one queue (`DefaultQueue::NAME` by default). `./yii queue:listen-all` is strictly designed for local development. | Configure separate Supervisor or systemd worker daemon processes for each named queue channel in production. |
