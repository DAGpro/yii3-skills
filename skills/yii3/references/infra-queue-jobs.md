# Yii3 Queue & Asynchronous Jobs Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Practical guide for asynchronous task execution, background workers, and failure retries using `yiisoft/queue`. Multi-queue configuration & broker adapters (§8) and distributed mutex locking (§6) are owned by dedicated child guides: the [Queue Broker Adapters Guide](infra-queue-brokers.md) and the [Queue Mutex & Distributed Concurrency Guide](infra-queue-mutex.md).

---

## Table of Contents
- [1. Asynchronous Architecture & Roles](#1-asynchronous-architecture--roles)
- [2. Designing Message Payloads (Lightweight DTOs)](#2-designing-message-payloads-lightweight-dtos)
- [3. Pushing Messages to Queue](#3-pushing-messages-to-queue)
- [4. Message Handlers & DI Configuration](#4-message-handlers--di-configuration)
- [5. Middleware Subsystems, Failure Handling & Pipelines](#5-middleware-subsystems-failure-handling--pipelines)
- [6. Distributed Concurrency & Mutex Locks (yiisoft/mutex)](#6-distributed-concurrency--mutex-locks-yiisoftmutex) — full reference in the [Queue Mutex & Distributed Concurrency Guide](infra-queue-mutex.md)
- [7. Worker CLI Management & Memory Recycling](#7-worker-cli-management--memory-recycling)
- [8. Multi-Queue Configuration & Broker Adapters](#8-multi-queue-configuration--broker-adapters) — full reference in the [Queue Broker Adapters Guide](infra-queue-brokers.md)
- [9. Anti-Pattern Matrix](persistence-migrations-operations.md#9-anti-pattern-matrix)

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
> `MessageStatus` is an integer-backed enum (`vendor/yiisoft/queue/src/MessageStatus.php`): `NOT_FOUND = 0`, `WAITING = 1`, `RESERVED = 2`, `DONE = 3`.
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

> [!NOTE]
> **Vendor exception to the primitives-only params rule:** the `middlewares-push` / `middlewares-consume` / `middlewares-fail` keys ship as `[]` in `vendor/yiisoft/queue/config/params.php`, and the package's own `config/di.php` feeds them into the `MiddlewareDispatcher` / `FailureMiddlewareDispatcher` constructors, whose factories create middleware from *definitions* — arrays, class strings, or **closures** (the constructor docblock type is `array[][]|callable[][]|...[][]`). Closures inside these specific keys are therefore the documented vendor pattern, not a violation of the DI & Configuration Guide's params rules (see [core-di-and-config.md](core-di-and-config.md), section 3.1). Do not copy the pattern into custom, non-`middlewares-*` params keys.

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

> The distributed locking subsystem (`yiisoft/mutex`) is owned by the [Queue Mutex & Distributed Concurrency Guide](infra-queue-mutex.md), which is the single source of truth for the topic. `yiisoft/mutex` is an independent package, also usable outside the queue subsystem (cron overlapping runs, critical sections on shared resources); the queue guide uses it for concurrent consumer safety. One-line trap kept locally: `MutexInterface::acquire(int $timeout = 0): bool` takes **no lock name** — a named instance is created first via `MutexFactoryInterface::create(string $name)`.
>
> **For the complete reference on distributed mutex locks** — the `MutexInterface::acquire()` invariant, Approach A (explicit `MutexFactoryInterface`), Approach B (callback execution with `Synchronizer`), and the mutex driver packages (`mutex-file`, `mutex-redis`, `mutex-pdo-pgsql`, `mutex-pdo-mysql`, `mutex-pdo-oracle`) with their `config/di.php` wiring recipes — **see the** [Queue Mutex & Distributed Concurrency Guide](infra-queue-mutex.md).

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

> **Broker selection note:** Exactly **ONE** broker driver package is installed per project — `yiisoft/queue-db` XOR `yiisoft/queue-redis` XOR `yiisoft/queue-amqp` (the in-memory `SyncQueueProducer` ships with `yiisoft/queue` itself and serves tests/CI). Resolve which driver is installed via the project's `composer.json` or the [Package Catalog, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family), then read only the matching adapter section in the child guide.
>
> **For the complete reference on multi-queue configuration and broker adapters** — named queues in `config/params.php`, `QueueFactoryProvider` DI wiring, the `queue-db` / `queue-redis` / `queue-amqp` adapter recipes (schema migration, mutex wiring, Redis and AMQP clients), `SyncQueueProducer`, and the driver comparison matrix — **see the** [Queue Broker Adapters Guide](infra-queue-brokers.md).

---

## 9. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| **Injecting `Yiisoft\Queue\QueueInterface`** | `QueueInterface` does not exist in Yii3. Pushing will fail with container/class not found errors. | Inject `QueueProducerInterface` for the default queue or `QueueProducerProviderInterface` for named queues. |
| **Yii2 `JobInterface::execute($queue)`** | Merges data DTO with execution logic, pulls framework dependencies into payloads, breaks cross-language and microservice queues. | Separate into pure data message extending `Message` and handler implementing `HandlerInterface::handle(MessageInterface $message)`. |
| **Calling `$message->getData()` or `$message->getHandlerName()`** | Phantom methods from legacy/unreleased drafts; will trigger Fatal Errors. | Use `$message->getPayload()` for payload data and `$message->getType()` for the message identifier. |
| **Using Yii2 route syntax `./yii queue/listen` or `queue/run`** | Yii3 console commands use standard Symfony-style colons: `queue:listen`, `queue:run`, `queue:listen-all`. | Run `./yii queue:listen` or `./yii queue:run`. |
| **Serializing PDO, container, or ORM entities in messages** | Serializing closures, database connections, or large entity graphs triggers serialization exceptions, memory leaks, and stale DB state. | Transmit only primitive IDs and scalars in message payload. Re-query entities inside the handler. |
| **Configuring handlers in `di.php` instead of `params.php`** | `yiisoft/queue` reads message and handler mappings from `$params['yiisoft/queue']['handlers']` and `['messages']`. | Place queue handler mappings in `config/params.php` under `'yiisoft/queue'`. |
| **Pushing queue messages inside an active DB transaction** | If the worker picks up the job before the transaction commits, the record is not found. If the transaction rolls back, an orphaned job executes anyway. | Dispatch queue messages strictly post-commit after `$db->transaction(...)` succeeds. |
| **Swallowing exceptions silently inside worker handlers** | Prevents the failure middleware pipeline and dead-letter queue from activating; failing jobs are falsely marked as successful. | Log errors and re-throw `Throwable` to trigger retry policies or dead-letter routing. |
| **Omitting `fromPayload()` in custom `MessageInterface` classes** | Unserializing messages from JSON requires `fromPayload(string $type, mixed $payload): static` to reconstruct the typed message object. | Always implement `public static function fromPayload(string $type, bool\|int\|float\|string\|array\|null $payload): static`. |
| **Instantiating abstract class `Message` directly via `new Message(...)`** | `Yiisoft\Queue\Message\Message` is an abstract class; attempting `new Message(...)` triggers PHP `Cannot instantiate abstract class` Fatal Error. | Instantiate `GenericMessage` or a custom domain class extending `Message`. |
| **Attempting to use Yii 2 queue events or searching for `src/Event/`** | `BeforePush`, `AfterPush`, `BeforeConsume`, `AfterConsume`, and `JobFailure` events do **not** exist in Yii 3. There is no `src/Event/` directory. | Use the three middleware pipelines: `middlewares-push` (`PushMiddlewareInterface`), `middlewares-consume` (`ConsumeMiddlewareInterface`), and `middlewares-fail` (`FailureMiddlewareInterface`). |
| **Assuming single monolithic worker loop for all queues in production** | `./yii queue:listen` only listens to one queue (`DefaultQueue::NAME` by default). `./yii queue:listen-all` is strictly designed for local development. | Configure separate Supervisor or systemd worker daemon processes for each named queue channel in production. |

---

## Related Topic Guides

- [Queue Broker Adapters Guide](infra-queue-brokers.md) — Named multi-queue wiring, the `queue-db` / `queue-redis` / `queue-amqp` adapters, `SyncQueueProducer`, and the driver comparison matrix.
- [Queue Mutex & Distributed Concurrency Guide](infra-queue-mutex.md) — `MutexFactoryInterface`, `Synchronizer`, and mutex driver DI recipes.
- [Console Commands Guide](infra-commands.md) — Console command registration, arguments, and testing (`queue:listen` workers are console commands).
- [Runners & Runtimes Guide](infra-runners-and-runtimes.md) — Application entry points, runner lifecycle, and persistent worker runtimes.
- [Long-Running Worker Safety & StateResetter Guide](infra-state-resetter.md) — Per-iteration state reset for long-running `queue:listen` daemons.
- [DI & Configuration Guide](core-di-and-config.md) — Config groups, definitions, modifiers, and container compilation.
