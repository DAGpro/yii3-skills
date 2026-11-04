# Yii3 Mailer Async Sending & Lifecycle Events Guide

> Optional background email delivery through `yiisoft/queue` (domain event → PSR-14 listener → queue message → consumer handler) and the `BeforeSend`/`AfterSend` mailer lifecycle events dispatched by `BaseMailer`.

**Scope & Ownership.** This guide is the single source of truth for asynchronous email delivery and mailer lifecycle events; it was extracted from the [Mailer & Email Notifications Guide](infra-mailer.md), §6 and §7. Asynchronous sending is **optional** and mutually exclusive with the default synchronous send path: a plain `$mailer->send()` composed per the [Mailer Guide, §3](infra-mailer.md#3-composing--sending-messages) stays the normal route — the queue path exists to offload slow SMTP roundtrips off the HTTP request. The queue path additionally requires `yiisoft/queue` plus exactly one transport adapter and `yiisoft/yii-event`; resolve what is actually installed via the project's `composer.json` / [package-catalog.md, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family). Queue subsystem mechanics (adapters, middlewares, worker lifecycle) are owned by the [Queue Jobs Guide](infra-queue-jobs.md); the production transport and `messageSettings` defaults by the [Mailer Transports & DSN Guide](infra-mailer-transports.md).

---

## Table of Contents
- [1. When Async Sending Applies (Performance Rule)](#1-when-async-sending-applies-performance-rule)
- [2. Domain Event DTO](#2-domain-event-dto)
- [3. Queue Message DTO](#3-queue-message-dto)
- [4. PSR-14 Listener Enqueuing Job](#4-psr-14-listener-enqueuing-job)
- [5. Queue Consumer Handler](#5-queue-consumer-handler)
- [6. Queue & Event Configuration](#6-queue--event-configuration)
  - [6.1. Queue Message & Handler Registration](#61-queue-message--handler-registration)
  - [6.2. Producer DI Wiring (Application Decision)](#62-producer-di-wiring-application-decision)
  - [6.3. Running the Worker](#63-running-the-worker)
  - [6.4. Failure Handling, Retries & Delayed Execution](#64-failure-handling-retries--delayed-execution)
  - [6.5. PSR-14 Listener Registration](#65-psr-14-listener-registration)
- [7. Mailer Lifecycle Events (BeforeSend & AfterSend)](#7-mailer-lifecycle-events-beforesend--aftersend)
  - [7.1. Suppressing Delivery via BeforeSend](#71-suppressing-delivery-via-beforesend)
  - [7.2. Audit Logging via AfterSend](#72-audit-logging-via-aftersend)
- [8. Anti-Pattern Matrix](#8-anti-pattern-matrix)
- [Related Topic Guides](#related-topic-guides)

---

## 1. When Async Sending Applies (Performance Rule)

> [!IMPORTANT]
> **Performance Rule:** Never send emails synchronously inside an HTTP request action. The SMTP handshake, TLS negotiation, and network roundtrips block the request process for the entire transport duration, and any network interruption stalls or times out the HTTP request while the transport waits.
> Always offload email delivery to a background queue.

Install `composer require yiisoft/queue` plus exactly **one** transport adapter package: `yiisoft/queue-redis`, `yiisoft/queue-db`, or `yiisoft/queue-amqp`.

Without this setup, keep using the synchronous path — message composition and `send()`/`sendMultiple()` semantics are owned by the [Mailer Guide, §3](infra-mailer.md#3-composing--sending-messages).

## 2. Domain Event DTO

```php
<?php

declare(strict_types=1);

namespace App\Domain\User\Event;

final readonly class UserRegisteredEvent
{
    public function __construct(
        public string $userId,
        public string $email,
        public string $name,
    ) {}
}
```

## 3. Queue Message DTO

In `yiisoft/queue`, message classes must implement `Yiisoft\Queue\Message\MessageInterface`. Extending `Yiisoft\Queue\Message\Message` gives you `final getMeta()` / `final withMeta()` for free but still requires implementing **`fromPayload()`, `getType()`, AND `getPayload()`** — the abstract base implements none of them, and omitting any one is a PHP fatal error.

The payload contract is strict: only `null`, scalars (`bool`, `int`, `float`, `string`), or arrays of the same types recursively. `fromPayload()` must declare the canonical union signature `fromPayload(string $type, bool|int|float|string|array|null $payload): static`. The interface declares `getPayload(): bool|int|float|string|array|null`; concrete classes may narrow the return type to `array` (as in the example below):

```php
<?php

declare(strict_types=1);

namespace App\Application\Queue\Message;

use InvalidArgumentException;
use Yiisoft\Queue\Message\Message;

final class SendWelcomeEmailMessage extends Message
{
    public const NAME = 'email.welcome';

    public function __construct(
        private readonly string $email,
        private readonly string $name,
    ) {}

    public static function fromPayload(string $type, bool|int|float|string|array|null $payload): static
    {
        if (!is_array($payload) || !isset($payload['email'], $payload['name'])) {
            throw new InvalidArgumentException('Invalid payload for SendWelcomeEmailMessage.');
        }

        return new self(
            email: (string) $payload['email'],
            name: (string) $payload['name'],
        );
    }

    public function getType(): string
    {
        return self::NAME;
    }

    public function getPayload(): array
    {
        return [
            'email' => $this->email,
            'name' => $this->name,
        ];
    }

    public function getEmail(): string
    {
        return $this->email;
    }

    public function getName(): string
    {
        return $this->name;
    }
}
```

## 4. PSR-14 Listener Enqueuing Job

```php
<?php

declare(strict_types=1);

namespace App\Application\User\Listener;

use App\Application\Queue\Message\SendWelcomeEmailMessage;
use App\Domain\User\Event\UserRegisteredEvent;
use Yiisoft\Queue\QueueProducerInterface;

final readonly class EnqueueWelcomeEmailListener
{
    public function __construct(
        private QueueProducerInterface $queueProducer,
    ) {}

    public function __invoke(UserRegisteredEvent $event): void
    {
        $this->queueProducer->push(
            new SendWelcomeEmailMessage(
                email: $event->email,
                name: $event->name,
            ),
        );
    }
}
```

`QueueProducerInterface::push(MessageInterface $message): MessageInterface` takes a typed message and returns the (possibly enriched) message representation — it is **not** `void`. The interface also offers `status(string|int $id): MessageStatus` and `getQueueName(): string`.

## 5. Queue Consumer Handler

```php
<?php

declare(strict_types=1);

namespace App\Application\Queue\Handler;

use App\Application\Notification\Service\EmailNotificationService;
use Yiisoft\Queue\Message\Handler\HandlerInterface;
use Yiisoft\Queue\Message\MessageInterface;

final readonly class SendWelcomeEmailHandler implements HandlerInterface
{
    public function __construct(
        private EmailNotificationService $notificationService,
    ) {}

    public function handle(MessageInterface $message): void
    {
        $payload = (array) $message->getPayload();

        $this->notificationService->sendWelcomeNotification(
            recipientEmail: (string) ($payload['email'] ?? ''),
            recipientName: (string) ($payload['name'] ?? ''),
        );
    }
}
```

The handler delegates to the same synchronous message service used in normal request flow — its composition recipes are owned by the [Mailer Guide, §3](infra-mailer.md#3-composing--sending-messages).

## 6. Queue & Event Configuration

### 6.1. Queue Message & Handler Registration

Register both the message type and the handler under the `'yiisoft/queue'` params key — **both maps are keyed by the message TYPE string** (the `getType()` value), not the class name:

```php
<?php

declare(strict_types=1);

use App\Application\Queue\Handler\SendWelcomeEmailHandler;
use App\Application\Queue\Message\SendWelcomeEmailMessage;

return [
    'yiisoft/queue' => [
        'messages' => [
            SendWelcomeEmailMessage::NAME => SendWelcomeEmailMessage::class,
        ],
        'handlers' => [
            SendWelcomeEmailMessage::NAME => SendWelcomeEmailHandler::class,
        ],
        'middlewares-push' => [],
        'middlewares-consume' => [],
        'middlewares-fail' => [],
    ],
];
```

Handler values may be a class name implementing `HandlerInterface`, a callable, or any DI definition (`[Class::class, 'method']`). Zero-config shortcut: if the message type equals a `HandlerInterface` FQCN, no `'messages'`/`'handlers'` entries are needed — the resolver falls back to the container. Registering only `'handlers'` still works (handlers fire independently), but the serializer then reconstructs a `GenericMessage` instead of your typed DTO.

### 6.2. Producer DI Wiring (Application Decision)

The core `yiisoft/queue` package does **not** bind `QueueProducerInterface` — a constructor-injected producer resolves only after the application wires it. The documented pattern is the `'queues'` role map (only the `producer` and `consumer` keys are valid):

```php
<?php

declare(strict_types=1);

use Yiisoft\Queue\Adapter\AdapterInterface;
use Yiisoft\Queue\AsyncQueueProducer;
use Yiisoft\Queue\QueueConsumer;

return [
    'yiisoft/queue' => [
        'queues' => [
            'yii-queue' => [ // default queue name
                'producer' => [
                    AsyncQueueProducer::class,
                    '__construct()' => ['adapter' => AdapterInterface::class],
                ],
                'consumer' => [
                    QueueConsumer::class,
                    '__construct()' => ['adapter' => AdapterInterface::class],
                ],
            ],
        ],
    ],
];
```

For synchronous in-process processing (development/tests), `Yiisoft\Queue\SyncQueueProducer` executes handlers immediately; its `status()` always reports `MessageStatus::NOT_FOUND`.

### 6.3. Running the Worker

The queue package registers three console commands (invoke via the application's `./yii` entry script):

- `yii queue:run [queueName] --limit|-m N` — drains existing messages and exits when done.
- `yii queue:listen [queueName]` — long-running subscribe loop (default queue when the name is omitted).
- `yii queue:listen-all --pause|-p --limit|-m` — subscribes to all queues; development only.

The loop implementation is chosen at DI setup time: `SignalLoop` when `ext-pcntl` is loaded, otherwise `SimpleLoop`.

### 6.4. Failure Handling, Retries & Delayed Execution

Without `'middlewares-fail'`, a throwing handler is logged and rethrown as `Yiisoft\Queue\Exception\MessageFailureException` — there are **no automatic retries**. Built-in retry middlewares are configured under the same `'yiisoft/queue'` params key:

```php
<?php

declare(strict_types=1);

use Yiisoft\Queue\Middleware\FailureHandling\FailureMiddlewareDispatcher;
use Yiisoft\Queue\Middleware\FailureHandling\Implementation\ExponentialDelayMiddleware;
use Yiisoft\Queue\Middleware\FailureHandling\Implementation\SendAgainMiddleware;

return [
    'yiisoft/queue' => [
        'middlewares-fail' => [
            FailureMiddlewareDispatcher::DEFAULT_PIPELINE => [
                SendAgainMiddleware::class,
                ExponentialDelayMiddleware::class,
            ],
        ],
    ],
];
```

The `'middlewares-fail'` value feeds `FailureMiddlewareDispatcher::__construct()` directly (`vendor/yiisoft/queue/config/di.php`), so it is a **map of pipeline name → definitions** — a flat class-string list is silently ignored. Per-queue failure pipelines are keyed by queue name (see the [Queue Jobs Guide](infra-queue-jobs.md)).

Handlers must be **idempotent** — for example, the Redis adapter deletes a message only after successful handling.

For delayed execution, wrap the message before pushing: `Yiisoft\Queue\Message\IdEnvelope` adds a `yii-id` meta entry with `getId(): string|int|null`, and `Yiisoft\Queue\Message\DelayEnvelope` (constructor `(MessageInterface $message, float $delaySeconds)`) adds a `yii-delay` meta entry for deferred handling. Message status is the `MessageStatus` int enum: `NOT_FOUND = 0`, `WAITING = 1`, `RESERVED = 2`, `DONE = 3`.

### 6.5. PSR-14 Listener Registration

Register the domain event listener in an events file, e.g. `config/common/events.php` — the listener map is **single-nested**:

```php
<?php

declare(strict_types=1);

use App\Application\User\Listener\EnqueueWelcomeEmailListener;
use App\Domain\User\Event\UserRegisteredEvent;

return [
    UserRegisteredEvent::class => [
        EnqueueWelcomeEmailListener::class, // one flat list of listeners per event
    ],
];
```

> [!WARNING]
> Do **not** double-nest the map (`Event::class => [[Listener::class]]`). The inner array is not a valid listener definition; it throws `InvalidListenerConfigurationException` at the first dispatch of that event.

Valid listener definitions per event key: the full six-form table is owned by the [Events & Listeners Guide](core-events-and-listeners.md), section 4.2. The event object is passed as the first argument; additional parameters are DI-resolved at call time; return values are discarded (`: void` is convention). Map keys must reference existing classes.

Wiring steps (the app template ships `'events' => []` and no events file; the full group-declaration and merge-plan recipe is owned by the [Events & Listeners Guide](core-events-and-listeners.md), section 4.1):

1. Create `config/common/events.php` with the single-nested map.
2. Register it in `config/configuration.php`: `'events' => 'common/events.php'`.
3. Run `composer yii-config-rebuild`.
4. Install the dispatcher: `composer require yiisoft/yii-event` — see §7 for what it binds and why mailer events are silently skipped without it.

## 7. Mailer Lifecycle Events (`BeforeSend` & `AfterSend`)

`Yiisoft\Mailer\BaseMailer` dispatches two events through its optional constructor dependency `Psr\EventDispatcher\EventDispatcherInterface`:
1. `Yiisoft\Mailer\Event\BeforeSend`: dispatched prior to transport delivery. Setting `$event->preventSendingMessage = true;` cancels transmission immediately.
2. `Yiisoft\Mailer\Event\AfterSend`: dispatched right after successful delivery (never when `sendMessage()` throws).

The `BaseMailer::send()` pipeline: apply `MessageSettings` defaults → dispatch `BeforeSend` → check `$event->preventSendingMessage` → `sendMessage()` → dispatch `AfterSend`. Cancellation is an explicit `BaseMailer` check after dispatch — `BeforeSend` is a plain final class, not a `StoppableEventInterface`.

> [!IMPORTANT]
> **The dispatcher dependency is nullable.** `yiisoft/mailer-symfony` binds `TransportInterface` and `MailerInterface` but **not** `EventDispatcherInterface`. Without a bound dispatcher the events are silently skipped and mail still sends — your suppression and audit listeners never run, with no error. Install the wiring package: `composer require yiisoft/yii-event` — what it binds and why is owned by the [Events & Listeners Guide](core-events-and-listeners.md), section 1.

### 7.1. Suppressing Delivery via `BeforeSend`

```php
<?php

declare(strict_types=1);

namespace App\Application\Notification\Listener;

use Psr\Log\LoggerInterface;
use Yiisoft\Mailer\Event\BeforeSend;

final readonly class SuppressBlacklistedRecipientsListener
{
    public function __construct(
        private LoggerInterface $logger,
    ) {}

    public function __invoke(BeforeSend $event): void
    {
        $to = (array) $event->message->getTo();

        foreach ($to as $address => $name) {
            $email = is_string($address) ? $address : (string) $name;

            if (str_ends_with(strtolower($email), '@dispostable.com')) {
                // Cancel sending for disposable/blacklisted domains
                $event->preventSendingMessage = true;

                $this->logger->warning('Suppressed email delivery to blacklisted domain: {email}', [
                    'email' => $email,
                ]);
                return;
            }
        }
    }
}
```

### 7.2. Audit Logging via `AfterSend`

```php
<?php

declare(strict_types=1);

namespace App\Application\Notification\Listener;

use Psr\Log\LoggerInterface;
use Yiisoft\Mailer\Event\AfterSend;

final readonly class EmailAuditLogListener
{
    public function __construct(
        private LoggerInterface $logger,
    ) {}

    public function __invoke(AfterSend $event): void
    {
        $this->logger->info('Email dispatched successfully: "{subject}" to {to}', [
            'subject' => $event->message->getSubject(),
            'to' => json_encode($event->message->getTo()),
        ]);
    }
}
```

Wiring in `config/common/events.php`:

```php
<?php

declare(strict_types=1);

use App\Application\Notification\Listener\EmailAuditLogListener;
use App\Application\Notification\Listener\SuppressBlacklistedRecipientsListener;
use Yiisoft\Mailer\Event\AfterSend;
use Yiisoft\Mailer\Event\BeforeSend;

return [
    BeforeSend::class => [
        SuppressBlacklistedRecipientsListener::class,
    ],
    AfterSend::class => [
        EmailAuditLogListener::class,
    ],
];
```

Register the file as described in §6.5 and in the [Events & Listeners Guide](core-events-and-listeners.md), section 4.1. Map keys must reference existing classes — `BeforeSend` and `AfterSend` are final classes with no marker interfaces to register against.

Development validation: run `Yiisoft\Yii\Event\ListenerConfigurationChecker::check($config->get('events-web'))` — it eagerly resolves every listener definition and catches bad format, non-existent event classes, and non-callable listeners (dev/test only; mechanics in the [Events & Listeners Guide](core-events-and-listeners.md), section 4.3).

To deliver application log records by email through the same `MailerInterface`, `yiisoft/log-target-email` provides `EmailTarget` (constructor `(MailerInterface $mailer, array|string $emailTo, string $subjectEmail = '', array $levels = [])`; default subject `'Application Log'`; it sends a `Message` with a word-wrapped plain-text body).

## 8. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| Synchronous SMTP delivery inside HTTP action controllers | The SMTP handshake, TLS negotiation, and network roundtrips block the request process for the entire transport duration; network interruptions stall the HTTP request until it times out. | Dispatch a PSR-14 domain event and offload transmission to a background job in `yiisoft/queue`. |
| Implementing a queue message without `fromPayload()` / `getType()` / `getPayload()`, or declaring `fromPayload(string $type, mixed $payload)` | Extending `Yiisoft\Queue\Message\Message` covers only `getMeta()`/`withMeta()` (both final); the abstract base implements none of `fromPayload()`, `getType()`, `getPayload()` — omitting any one is a PHP fatal error. The canonical `fromPayload()` signature is the union form; `mixed` widening is legal but non-canonical. | Extend `Yiisoft\Queue\Message\Message` and implement `fromPayload(string $type, bool|int|float|string|array|null $payload): static`, `getType(): string`, and `getPayload(): bool|int|float|string|array|null` (narrowing to `array` is allowed). |
| Storing objects in queue message payloads | The `MessageInterface` payload contract allows only `null`, scalars, and arrays of the same types recursively; the default `JsonMessageEncoder` fails at push time with `MessageSerializerException` (`json_encode` with `JSON_THROW_ON_ERROR`). | Store only scalar identifiers (`string`, `int`) in message payloads and re-query required entities in the queue handler. |
| Defining a double-nested listener map (`Event::class => [[Listener::class]]`) | Each inner element of the map must be ONE listener definition; a nested array is not callable and throws `InvalidListenerConfigurationException` at the first dispatch of that event. | Use single nesting: `Event::class => [Listener::class, ...]`. |
| Relying on lifecycle events without binding `EventDispatcherInterface` | `BaseMailer`'s dispatcher dependency is nullable; without a binding the events are silently skipped — suppression and audit listeners never run, with no error. | Install `yiisoft/yii-event` (auto-binds the PSR-14 interfaces) and register listeners in the events config group (see §6.5 / §7). |
| Omitting message type mapping in `'yiisoft/queue'['messages']` | If only `'handlers'` is registered without `'messages'`, `MessageSerializer` reconstructs `GenericMessage` instead of your typed DTO. | Register both `'messages' => [MyMessage::NAME => MyMessage::class]` and `'handlers' => [MyMessage::NAME => MyHandler::class]`. |

---

## Related Topic Guides

- [Mailer & Email Notifications Guide](infra-mailer.md) — The default synchronous composition and sending path (§3), HTML templating, file attachments, dev/test mailers, and StubMailer testing recipes.
- [Mailer Transports & DSN Guide](infra-mailer-transports.md) — Production SMTP transport (`useSendmail` / `esmtpTransport` DSN assembly) and the full `messageSettings` defaults map.
- [Queue & Asynchronous Jobs Guide](infra-queue-jobs.md) — The full queue subsystem reference (adapters, middlewares, message contracts, worker lifecycle) this guide builds on.
- [Events & Listeners Guide](core-events-and-listeners.md) — PSR-14 event/listener config groups, `yiisoft/yii-event` bindings, and listener definition forms.
- [Console Commands Guide](infra-commands.md) — Console command anatomy for the `yii queue:*` entry points.
- [Long-Running Worker Safety & StateResetter Guide](infra-state-resetter.md) — State reset discipline for long-running `queue:listen` daemon workers.
