# Yii3 Queue & Asynchronous Jobs Guide

> Practical guide for asynchronous task execution, background workers, failure retries, and distributed locking using `yiisoft/queue` and `yiisoft/mutex`.

---

## Table of Contents
- [1. Asynchronous Architecture & Roles](#1-asynchronous-architecture--roles)
- [2. Designing Message Payloads (Lightweight DTOs)](#2-designing-message-payloads-lightweight-dtos)
- [3. Pushing Messages to Queue](#3-pushing-messages-to-queue)
- [4. Message Handlers & DI Configuration](#4-message-handlers--di-configuration)
- [5. Middleware Subsystems, Failure Handling & Pipelines](#5-middleware-subsystems-failure-handling--pipelines)
- [6. Distributed Concurrency & Mutex Locks (yiisoft/mutex)](#6-distributed-concurrency--mutex-locks-yiisoftmutex)
- [7. Worker CLI Management & Memory Recycling](#7-worker-cli-management--memory-recycling)
- [8. Multi-Queue Configuration & Broker Adapters](#8-multi-queue-configuration--broker-adapters)
- [9. Anti-Pattern Matrix](#9-anti-pattern-matrix)

---

## 1. Asynchronous Architecture & Roles

`yiisoft/queue` strictly decouples message generation (producers), payload serialization (messages), message processing (handlers), and transport mechanisms (adapters).

```
Producer (HTTP / CLI / Domain Event)
   │  pushes MessageInterface (pure data DTO)
   ▼
QueueProducerInterface ──► Push Middleware Pipeline ──► AdapterInterface (DB / Redis / AMQP)
                              (e.g. IdMiddleware)                    │
                                                              Broker Transport
                                                                     │
                                                                     ▼
QueueConsumerInterface ◄── Consume Middleware Pipeline ◄── AdapterInterface
   │                         (e.g. MemoryGuard, Telemetry)
   ▼
WorkerInterface ──► HandlerResolver ──► HandlerInterface::handle(MessageInterface $message)
   │ (on Throwable exception)
   ▼
Failure Middleware Pipeline (ExponentialDelayMiddleware / SendAgainMiddleware)
```

### Core Interface Contracts

| Interface | FQCN | Role & Responsibilities |
|---|---|---|
| **`QueueProducerInterface`** | `Yiisoft\Queue\QueueProducerInterface` | Pushes messages via `push(MessageInterface $message): MessageInterface`, inspects status via `status(string\|int $id): MessageStatus`, and returns logical queue name via `getQueueName(): string`. |
| **`QueueConsumerInterface`** | `Yiisoft\Queue\QueueConsumerInterface` | Consumes messages from a queue via continuous daemon `listen(): void` or bounded batch `run(int $max = 0): int`. |
| **`QueueProducerProviderInterface`** | `Yiisoft\Queue\Provider\QueueProducerProviderInterface` | Obtains named producer instances via `getProducer(string\|BackedEnum $queueName): QueueProducerInterface`. Checks role via `hasProducer(string\|BackedEnum $queueName): bool` and lists names via `getProducerQueueNames(): array`. |
| **`QueueConsumerProviderInterface`** | `Yiisoft\Queue\Provider\QueueConsumerProviderInterface` | Obtains named consumer instances via `getConsumer(string\|BackedEnum $queueName): QueueConsumerInterface`. Checks role via `hasConsumer(string\|BackedEnum $queueName): bool` and lists names via `getConsumerQueueNames(): array`. |
| **`MessageInterface`** | `Yiisoft\Queue\Message\MessageInterface` | Immutable data transport contract containing message type (`getType(): string`), payload (`getPayload(): bool\|int\|float\|string\|array\|null`), metadata (`getMeta(): array`), and factory constructor `fromPayload(string $type, bool\|int\|float\|string\|array\|null $payload): static`. |
| **`HandlerInterface`** | `Yiisoft\Queue\Message\Handler\HandlerInterface` | Contract for message consumer execution logic via `handle(MessageInterface $message): void`. |
| **`AdapterInterface`** | `Yiisoft\Queue\Adapter\AdapterInterface` | Low-level transport driver bridge (`push()`, `status()`, `runExisting()`, `subscribe()`). |

> [!IMPORTANT]
> **No Monolithic `QueueInterface`:** In Yii 3, there is no monolithic `QueueInterface`. Pushing messages is handled by `QueueProducerInterface` (or `QueueProducerProviderInterface` for named channels), while worker loops use `QueueConsumerInterface` (or `QueueConsumerProviderInterface`). The default queue channel constant is strictly `Yiisoft\Queue\DefaultQueue::NAME` (`'yii-queue'`).

> [!WARNING]
> **Zero Queue Events Invariant:** Unlike Yii 2 (`Queue::EVENT_BEFORE_PUSH`, `Queue::EVENT_AFTER_EXEC`), Yii 3 queue subsystem contains **no event classes** (`BeforePush`, `AfterPush`, `BeforeConsume`, etc.) and no event dispatcher dependency. All lifecycle hooks are implemented through PSR-15 style middleware pipelines (`PushMiddlewareInterface`, `ConsumeMiddlewareInterface`, `FailureMiddlewareInterface`).

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

Custom messages should extend `Yiisoft\Queue\Message\Message`, which provides metadata storage and immutable manipulation via `getMeta()` and `withMeta()`. Direct instantiation of `Message` (`new Message(...)`) is forbidden because it is an abstract class:

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

### The Envelope Pattern (`abstract class Envelope`)

In Yii 3, metadata and transport annotations are attached using envelopes (`Yiisoft\Queue\Message\Envelope`):
- Envelopes implement `MessageInterface` and wrap an inner message.
- The constructor automatically unwraps nested envelopes while preserving and merging accumulated metadata (`$this->meta = array_merge($message->getMeta(), $meta)`).
- Envelopes **cannot** be created via `fromPayload()` (calling it throws `LogicException`). They are created using `new Envelope($message, ...)` or extracted via static helper `Envelope::fromMessage($message)`.
- Built-in envelopes include:
  - `Yiisoft\Queue\Message\IdEnvelope`: Holds the assigned message ID (`getId(): string|int|null`).
  - `Yiisoft\Queue\Message\DelayEnvelope`: Holds delivery delay in seconds (`getDelaySeconds(): float`).
  - `Yiisoft\Queue\Middleware\FailureHandling\FailureEnvelope`: Holds retry attempts and strategy metadata (`getFailureMetaValue()`).

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
> **Delay Capabilities Across Adapters:**
> All three official transport adapters natively support `DelayEnvelope`:
> 1. **`yiisoft/queue-db`**: Stores delay in the `delay` column and filters messages in SQL (`pushed_at <= time() - delay`).
> 2. **`yiisoft/queue-redis`**: Uses Redis Sorted Sets (`ZADD $channel.delayed, time() + delay, $id`). During worker consumption, expired items are moved atomically to the waiting list.
> 3. **`yiisoft/queue-amqp`**: Employs native RabbitMQ Dead-Letter Exchanges (DLX) + per-message TTL (`x-dead-letter-exchange`, `x-message-ttl`, `x-expires`). **No RabbitMQ plugins are needed!** Note: `queue-amqp` **requires** an configured AMQP Exchange (`ExchangeSettingsInterface`); if an exchange is omitted, pushing a delayed message throws `InvalidArgumentException`.

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

> [!NOTE]
> `queue-db` and `queue-redis` support `status()`. `queue-amqp` throws `Yiisoft\Queue\Amqp\Exception\NotImplementedException` because AMQP 0-9-1 does not maintain a random-access status registry.

### Transactional Dispatching & Race Condition Prevention

Pushing messages to a queue inside an uncommitted database transaction is a critical anti-pattern. If a worker receives the message before the database transaction commits, it reads uncommitted or non-existent rows. If the transaction rolls back, an orphaned job executes anyway.

Always dispatch queue messages **strictly post-commit**:

```php
declare(strict_types=1);

namespace App\Application\UseCase;

use App\Application\Queue\Message\GenerateInvoiceMessage;
use App\Domain\Order\Order;
use App\Domain\Order\OrderRepositoryInterface;
use Throwable;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Queue\QueueProducerInterface;

final readonly class PlaceOrderUseCase
{
    public function __construct(
        private ConnectionInterface $db,
        private OrderRepositoryInterface $orderRepository,
        private QueueProducerInterface $queueProducer,
    ) {}

    /**
     * @throws Throwable
     */
    public function execute(string $orderId, int $userId): void
    {
        // 1. Transaction commits before code exits the closure
        $this->db->transaction(function () use ($orderId, $userId): void {
            $order = new Order($orderId, $userId);
            $this->orderRepository->save($order);
        });

        // 2. Guaranteed safe post-commit dispatch. If the transaction fails, this line is never reached.
        $this->queueProducer->push(new GenerateInvoiceMessage(
            orderId: $orderId,
            initiatedByUserId: $userId,
            sendEmail: true,
        ));
    }
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

Handlers implement `Yiisoft\Queue\Message\Handler\HandlerInterface`. Handlers are pure business execution units resolved lazily by the worker via the PSR-11 container using `HandlerResolver`.

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
> **Zero-Config Handlers:** If your message type is an exact FQCN of a class implementing `HandlerInterface`, no explicit mapping is required. `HandlerResolver` automatically fetches the class from the DI container using fallback `$this->handlers[$messageType] ?? $messageType`.

---

## 5. Middleware Subsystems, Failure Handling & Pipelines

Yii 3 queue architecture replaces all monolithic lifecycle hooks and events with three dedicated middleware pipelines:

```
Push Pipeline:     Producer ──► [ PushMiddlewareInterface ] ──► Adapter
Consume Pipeline:  Worker   ──► [ ConsumeMiddlewareInterface ] ──► HandlerInterface::handle()
Failure Pipeline:  Worker (catch Throwable) ──► [ FailureMiddlewareInterface ] ──► Retry / DLQ
```

### 5.1. Push Middleware Pipeline (`middlewares-push`)

- **Interface:** `Yiisoft\Queue\Middleware\Push\PushMiddlewareInterface`
  ```php
  public function processPush(MessageInterface $message, PushHandlerInterface $handler): MessageInterface;
  ```
- **Built-in `IdMiddleware` (`Yiisoft\Queue\Middleware\Push\Implementation\IdMiddleware`):**
  Automatically checks whether the message has an assigned ID. If null, generates a unique ID (`uniqid('yii3-message-', true)`) and wraps the message in `IdEnvelope`.
- **Custom Push Middleware Example (Adding Correlation & Tracing ID):**

```php
declare(strict_types=1);

namespace App\Application\Queue\Middleware;

use Yiisoft\Queue\Message\MessageInterface;
use Yiisoft\Queue\Middleware\Push\PushHandlerInterface;
use Yiisoft\Queue\Middleware\Push\PushMiddlewareInterface;

final readonly class TracingPushMiddleware implements PushMiddlewareInterface
{
    public function processPush(MessageInterface $message, PushHandlerInterface $handler): MessageInterface
    {
        $meta = $message->getMeta();
        if (!isset($meta['trace_id'])) {
            $meta['trace_id'] = bin2hex(random_bytes(16));
            $meta['pushed_timestamp'] = microtime(true);
            $message = $message->withMeta($meta);
        }

        return $handler->handlePush($message);
    }
}
```

### 5.2. Consume Middleware Pipeline (`middlewares-consume`)

- **Interface:** `Yiisoft\Queue\Middleware\Consume\ConsumeMiddlewareInterface`
  ```php
  public function processConsume(ConsumeRequest $request, ConsumeHandlerInterface $handler): ConsumeRequest;
  ```
- **Request Object (`ConsumeRequest`):** Provides `$request->getMessage(): MessageInterface` and `$request->getQueueName(): string`.
- **Terminal Handler:** `ConsumeFinalHandler` calls `$handler->handle($message)`.
- **Custom Consume Middleware Example (Execution Profiling & State Resetting):**

```php
declare(strict_types=1);

namespace App\Application\Queue\Middleware;

use Psr\Log\LoggerInterface;
use Throwable;
use Yiisoft\Queue\Middleware\Consume\ConsumeHandlerInterface;
use Yiisoft\Queue\Middleware\Consume\ConsumeMiddlewareInterface;
use Yiisoft\Queue\Middleware\Consume\ConsumeRequest;

final readonly class WorkerProfilingConsumeMiddleware implements ConsumeMiddlewareInterface
{
    public function __construct(
        private LoggerInterface $logger,
    ) {}

    public function processConsume(ConsumeRequest $request, ConsumeHandlerInterface $handler): ConsumeRequest
    {
        $startTime = microtime(true);
        $messageType = $request->getMessage()->getType();

        try {
            $result = $handler->handleConsume($request);
            $duration = (microtime(true) - $startTime) * 1000;
            $this->logger->info('Processed job {type} in {duration}ms', [
                'type' => $messageType,
                'duration' => round($duration, 2),
            ]);
            return $result;
        } catch (Throwable $e) {
            $duration = (microtime(true) - $startTime) * 1000;
            $this->logger->error('Failed job {type} after {duration}ms: {error}', [
                'type' => $messageType,
                'duration' => round($duration, 2),
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}
```

### 5.3. Failure Handling Pipeline (`middlewares-fail`)

When a message handler throws a `Throwable`, `Worker::process()` catches it, constructs a `FailureHandlingRequest($message, $exception, $queueName)`, and passes it to the failure handling pipeline.

- **Interface:** `Yiisoft\Queue\Middleware\FailureHandling\FailureMiddlewareInterface`
  ```php
  public function processFailure(FailureHandlingRequest $request, FailureHandlerInterface $handler): FailureHandlingRequest;
  ```
- **Terminal Handler:** `FailureFinalHandler` re-throws the exception if no middleware recovers the message.
- **Built-in Failure Middlewares:**
  - `Yiisoft\Queue\Middleware\FailureHandling\Implementation\ExponentialDelayMiddleware`: Resends messages with exponentially increasing delays (`delayInitial * (exponent ^ attempts)`, capped at `delayMaximum`).
  - `Yiisoft\Queue\Middleware\FailureHandling\Implementation\SendAgainMiddleware`: Resends messages immediately or forwards exhausted jobs to a Dead-Letter Queue (DLQ).

### Complete Middleware Configuration (`config/params.php`)

```php
declare(strict_types=1);

use App\Application\Queue\Middleware\TracingPushMiddleware;
use App\Application\Queue\Middleware\WorkerProfilingConsumeMiddleware;
use Yiisoft\Queue\Middleware\FailureHandling\FailureMiddlewareDispatcher;
use Yiisoft\Queue\Middleware\FailureHandling\Implementation\ExponentialDelayMiddleware;
use Yiisoft\Queue\Middleware\FailureHandling\Implementation\SendAgainMiddleware;
use Yiisoft\Queue\Middleware\Push\Implementation\IdMiddleware;
use Yiisoft\Queue\Provider\QueueProducerProviderInterface;

return [
    'yiisoft/queue' => [
        // Push middleware stack (pre-processing messages before adapter push)
        'middlewares-push' => [
            IdMiddleware::class,
            TracingPushMiddleware::class,
        ],

        // Consume middleware stack (intercepting worker execution)
        'middlewares-consume' => [
            WorkerProfilingConsumeMiddleware::class,
        ],

        // Failure handling middleware stack
        'middlewares-fail' => [
            FailureMiddlewareDispatcher::DEFAULT_PIPELINE => [
                [
                    'class' => ExponentialDelayMiddleware::class,
                    '__construct()' => [
                        'id' => 'exponential-retry-strategy',
                        'maxAttempts' => 3,
                        'delayInitial' => 5.0,    // 5 seconds initial delay
                        'delayMaximum' => 60.0,   // Max 1 minute delay
                        'exponent' => 2.0,        // Delays: 5s, 10s, 20s
                        'producerProvider' => QueueProducerProviderInterface::class,
                    ],
                ],
                // If 3 exponential retries fail, forward to dead-letter queue
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

---

## 6. Distributed Concurrency & Mutex Locks (`yiisoft/mutex`)

When multiple background workers run concurrently, use `yiisoft/mutex` to prevent race conditions on shared resources (e.g. inventory allocations, subscription billing, wallet transfers).

> [!IMPORTANT]
> **`MutexInterface::acquire()` Invariant:**
> In Yii 3, `MutexInterface` represents an **individual, already-named lock instance**.
> Calling `$mutex->acquire($name, 5)` is **invalid** and throws an `ArgumentCountError`! The signature is strictly `public function acquire(int $timeout = 0): bool`.
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

### Mutex Driver Packages & DI Configuration Recipes (`config/di.php`)

None of the mutex packages provide auto-configuration. `MutexFactoryInterface` must be explicitly wired in `config/di.php`:

| Package | Factory FQCN | Mutex FQCN | Driver Backend | Recommended Use Case |
|---|---|---|---|---|
| **`yiisoft/mutex-file`** | `Yiisoft\Mutex\File\FileMutexFactory` | `Yiisoft\Mutex\File\FileMutex` | Local filesystem (`flock`) | Single-server CLI or local development. Cannot be shared across multiple Docker containers/hosts. |
| **`yiisoft/mutex-redis`** | `Yiisoft\Mutex\Redis\RedisMutexFactory` | `Yiisoft\Mutex\Redis\RedisMutex` | Redis key locking (`predis/predis`) | High-throughput distributed microservices and multi-node container clusters. |
| **`yiisoft/mutex-pdo-pgsql`** | `Yiisoft\Mutex\Pgsql\PgsqlMutexFactory` | `Yiisoft\Mutex\Pgsql\PgsqlMutex` | PostgreSQL Advisory Locks (`PDO`) | Multi-worker clusters using Postgres. Fast, session-scoped, self-releasing on disconnect. |
| **`yiisoft/mutex-pdo-mysql`** | `Yiisoft\Mutex\Mysql\MysqlMutexFactory` | `Yiisoft\Mutex\Mysql\MysqlMutex` | MySQL `GET_LOCK()` (`PDO`) | Multi-worker clusters using MySQL/MariaDB. Engine-level timeout. |
| **`yiisoft/mutex-pdo-oracle`** | `Yiisoft\Mutex\Oracle\OracleMutexFactory` | `Yiisoft\Mutex\Oracle\OracleMutex` | Oracle `DBMS_LOCK` (`PDO`) | Multi-worker clusters using Oracle Database. |

#### 1. Wiring `FileMutexFactory` (Filesystem)

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

#### 2. Wiring `RedisMutexFactory` (Predis)

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

#### 3. Wiring PDO Mutex Drivers (PostgreSQL / MySQL / Oracle)

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

---

## 7. Worker CLI Management & Memory Recycling

Workers run via console commands registered by `yiisoft/queue` under `'yiisoft/yii-console'['commands']`:

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

> [!NOTE]
> **Lazy Command Loading:** `yiisoft/yii-console` wires commands using `CommandLoader` (implementing Symfony's `CommandLoaderInterface`). Commands and their heavy dependencies (DB pools, RabbitMQ connections) are only resolved from the PSR-11 container upon actual invocation, keeping `./yii list` instant.

### Signal Handling & Worker Memory Recycling (`memorySoftLimit`)

- When the PHP `ext-pcntl` extension is loaded, `yiisoft/queue` utilizes `Yiisoft\Queue\Cli\SignalLoop`, handling POSIX signals:
  - Exit signals: `SIGTERM`, `SIGINT`, `SIGHUP`
  - Suspend/Resume: `SIGTSTP`, `SIGCONT`
- When `ext-pcntl` is missing (Windows or restricted CLI), it falls back to `Yiisoft\Queue\Cli\SimpleLoop`.
- **Soft Memory Limit Recycling:** Both `SignalLoop` and `SimpleLoop` implement `SoftLimitTrait`. Setting a memory soft limit (in bytes) allows long-running daemon workers to terminate cleanly with exit code `0` when memory exceeds the threshold, allowing process managers (Supervisor/systemd) to restart a clean process:

```php
declare(strict_types=1);

// config/di-console.php or config/di.php
use Yiisoft\Queue\Cli\SignalLoop;
use Yiisoft\Queue\Cli\SimpleLoop;

return [
    SignalLoop::class => [
        '__construct()' => [
            'memorySoftLimit' => 128 * 1024 * 1024, // 128 MB soft limit
        ],
    ],
    SimpleLoop::class => [
        '__construct()' => [
            'memorySoftLimit' => 128 * 1024 * 1024,
        ],
    ],
];
```

### Production Process Managers

#### 1. Supervisor Configuration (`/etc/supervisor/conf.d/yii-queue.conf`)

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

#### 2. Systemd Template Service (`/etc/systemd/system/yii-queue@.service`)

```ini
[Unit]
Description=Yii3 Queue Worker %i
After=network.target mysql.service redis.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/app
ExecStart=/usr/bin/php /var/www/app/yii queue:listen
Restart=always
RestartSec=3
TimeoutStopSec=3600

[Install]
WantedBy=multi-user.target
```

Enable and start 4 worker instances:
```bash
sudo systemctl enable --now yii-queue@{1..4}.service
```

---

## 8. Multi-Queue Configuration & Broker Adapters

### Configuring Named Queues in `config/params.php`

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

### DI Container Wiring for Queue Providers (`config/di.php`)

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

### Broker Adapter 1: `yiisoft/queue-db` (Relational Database)

Uses relational tables via `yiisoft/db`. Ideal for projects with zero external infrastructure.

#### 1. Schema Migration

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

#### 2. DI & Mutex Configuration (`config/di.php`)

> [!IMPORTANT]
> `Yiisoft\Queue\Db\Adapter` explicitly requires `MutexFactoryInterface` in its constructor to prevent concurrent workers from reserving the same row.

```php
declare(strict_types=1);

use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Definitions\Reference;
use Yiisoft\Mutex\MutexFactoryInterface;
use Yiisoft\Mutex\Pgsql\PgsqlMutexFactory;
use Yiisoft\Queue\Db\Adapter as DbQueueAdapter;

return [
    // Wire MutexFactory (FileMutexFactory, PgsqlMutexFactory, MysqlMutexFactory, etc.)
    MutexFactoryInterface::class => PgsqlMutexFactory::class,

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

---

### Broker Adapter 2: `yiisoft/queue-redis` (In-Memory Redis)

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

### Broker Adapter 3: `yiisoft/queue-amqp` (RabbitMQ / AMQP 0-9-1)

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

### Synchronous Mode (`SyncQueueProducer`)

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

### Driver Adapters Comparison Matrix

| Adapter Package | Storage Engine | Delay Implementation | Message Status Inspection | Throughput Range | Infrastructure Needed |
|---|---|---|---|---|---|
| **`yiisoft/queue-db`** | RDBMS (PostgreSQL, MySQL, SQLite) | Supported (timestamp query condition) | Supported (`WAITING`, `RESERVED`, `DONE`) | ~200–800 msg/sec | Existing database; requires `MutexFactoryInterface`. |
| **`yiisoft/queue-redis`** | Redis | Supported (Redis Sorted Sets `ZADD`) | Supported (`WAITING`, `RESERVED`, `DONE`, `NOT_FOUND`) | ~15,000–50,000 msg/sec | Redis server; requires PECL `\Redis`. |
| **`yiisoft/queue-amqp`** | RabbitMQ / AMQP 0-9-1 | Supported (Native DLX + TTL; requires Exchange) | Unsupported (`NotImplementedException`) | ~20,000–100,000+ msg/sec | RabbitMQ cluster; requires `php-amqplib`. |
| **`SyncQueueProducer`** | In-Memory (No Adapter) | Unsupported (executes synchronously) | Unsupported | Inline PHP execution | None (for CI/Unit Tests). |

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
| **Pushing queue messages inside an active DB transaction** | If the worker picks up the job before the transaction commits, the record is not found. If the transaction rolls back, an orphaned job executes anyway. | Dispatch queue messages strictly post-commit after `$db->transaction(...)` succeeds. |
| **Swallowing exceptions silently inside worker handlers** | Prevents the failure middleware pipeline and dead-letter queue from activating; failing jobs are falsely marked as successful. | Log errors and re-throw `Throwable` to trigger retry policies or dead-letter routing. |
| **Omitting `fromPayload()` in custom `MessageInterface` classes** | Unserializing messages from JSON requires `fromPayload(string $type, mixed $payload): static` to reconstruct the typed message object. | Always implement `public static function fromPayload(string $type, bool\|int\|float\|string\|array\|null $payload): static`. |
| **Calling `$producer->status($id)` when using `queue-amqp`** | `Yiisoft\Queue\Amqp\Adapter::status()` throws `NotImplementedException` because AMQP/RabbitMQ does not support ad-hoc message status queries. | Only check status on adapters supporting it (`queue-db`, `queue-redis`), or track task state in application database. |
| **Instantiating abstract class `Message` directly via `new Message(...)`** | `Yiisoft\Queue\Message\Message` is an abstract class; attempting `new Message(...)` triggers PHP `Cannot instantiate abstract class` Fatal Error. | Instantiate `GenericMessage` or a custom domain class extending `Message`. |
| **Assuming `queue-redis` lacks delay support** | `queue-redis` natively supports `DelayEnvelope` via Redis Sorted Sets (`ZADD $channel.delayed`). All three official adapters (`queue-db`, `queue-redis`, `queue-amqp`) support delays. | Wrap messages in `DelayEnvelope` with confidence across all three official adapters. |
| **Assuming `queue-amqp` delays require `rabbitmq_delayed_message_exchange` plugin** | `queue-amqp` implements delayed execution natively using standard RabbitMQ Dead-Letter Exchanges (DLX) + per-message TTL. Broker plugins are not required. | Configure an `ExchangeSettingsInterface` in AMQP DI settings (mandatory for delay routing). |
| **Attempting to use Yii 2 queue events or searching for `src/Event/`** | `BeforePush`, `AfterPush`, `BeforeConsume`, `AfterConsume`, and `JobFailure` events do **not** exist in Yii 3. There is no `src/Event/` directory. | Use the three middleware pipelines: `middlewares-push` (`PushMiddlewareInterface`), `middlewares-consume` (`ConsumeMiddlewareInterface`), and `middlewares-fail` (`FailureMiddlewareInterface`). |
| **Running `queue-db` migrations via `--namespace=Yiisoft\Queue\Db\migrations` or `./yii migrate`** | Migration class `M240409200600CreateQueueTable` is in the global namespace; `./yii migrate` does not exist in `yiisoft/db-migration`. | Run `./yii migrate:up --path=vendor/yiisoft/queue-db/migrations` or register `'sourcePaths'` in `config/params.php`. |
| **Passing `predis/predis` to `queue-redis` or PECL `\Redis` to `RedisMutexFactory`** | `queue-redis` strictly requires native PECL `ext-redis` (`\Redis`); `RedisMutexFactory` strictly requires `predis/predis` (`Predis\ClientInterface`). | Use PECL `\Redis` for `queue-redis` and `predis/predis` for `mutex-redis`. |
| **Assuming single monolithic worker loop for all queues in production** | `./yii queue:listen` only listens to one queue (`DefaultQueue::NAME` by default). `./yii queue:listen-all` is strictly designed for local development. | Configure separate Supervisor or systemd worker daemon processes for each named queue channel in production. |
