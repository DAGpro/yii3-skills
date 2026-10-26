# Yii3 Events & Listeners Guide

> Practical recommendations and configuration recipes for PSR-14 event dispatching in Yii3 using `psr/event-dispatcher`, `yiisoft/event-dispatcher`, and `yiisoft/yii-event`.

---

## Table of Contents
- [1. PSR-14 Event Architecture in Yii3](#1-psr-14-event-architecture-in-yii3)
- [2. Designing Domain & Application Events](#2-designing-domain--application-events)
  - [2.1. Idiomatic Immutable Domain Event](#21-idiomatic-immutable-domain-event)
  - [2.2. Stoppable Guard Event (StoppableEventInterface)](#22-stoppable-guard-event-stoppableeventinterface)
  - [2.3. Context-Enriching Event (Mutable State Pattern)](#23-context-enriching-event-mutable-state-pattern)
  - [2.4. What Belongs in Events vs What is Forbidden](#24-what-belongs-in-events-vs-what-is-forbidden)
- [3. Designing Event Listeners](#3-designing-event-listeners)
  - [3.1. Invokable Class Listener](#31-invokable-class-listener)
  - [3.2. Listener Dependency Injection Rules](#32-listener-dependency-injection-rules)
- [4. Event Configuration (yiisoft/config & yiisoft/yii-event)](#4-event-configuration-yiisoftconfig--yiisoftyii-event)
  - [4.1. Configuration Architecture & Scopes](#41-configuration-architecture--scopes)
  - [4.2. Declarative Event Mapping (config/common/events.php)](#42-declarative-event-mapping-configcommoneventsphp)
  - [4.3. Verifying Event Configurations Ahead-of-Time](#43-verifying-event-configurations-ahead-of-time)
- [5. Mandatory Post-Commit Event Dispatching Rule](#5-mandatory-post-commit-event-dispatching-rule)
- [6. Official Yii3 Framework Events Reference](#6-official-yii3-framework-events-reference)
  - [6.1. HTTP Application Lifecycle (yiisoft/yii-http)](#61-http-application-lifecycle-yiisoftyii-http)
  - [6.2. Console Application Lifecycle (yiisoft/yii-console)](#62-console-application-lifecycle-yiisoftyii-console)
  - [6.3. User Authentication Lifecycle (yiisoft/user)](#63-user-authentication-lifecycle-yiisoftuser)
  - [6.4. Middleware Dispatcher Lifecycle (yiisoft/middleware-dispatcher)](#64-middleware-dispatcher-lifecycle-yiisoftmiddleware-dispatcher)
  - [6.5. Mailer Lifecycle (yiisoft/mailer)](#65-mailer-lifecycle-yiisoftmailer)
  - [6.6. Active Record Lifecycle (yiisoft/active-record)](#66-active-record-lifecycle-yiisoftactive-record)
  - [6.7. View Template Lifecycle (yiisoft/view)](#67-view-template-lifecycle-yiisoftview)
- [7. PHP 8 Named Arguments & Signatures Reference](#7-php-8-named-arguments--signatures-reference)
- [8. Anti-Pattern Matrix: Events & Listeners](#8-anti-pattern-matrix-events--listeners)

---

## 1. PSR-14 Event Architecture in Yii3

Yii3 completely replaces the legacy Yii2 `Component::trigger()` mechanism with the standard **PSR-14 Event Dispatcher**:

1. **Pure PHP Objects (DTOs):**
   - Events are plain PHP classes (typically `final readonly class`).
   - Events do NOT extend any framework base class.
2. **Three Core PSR-14 Contracts:**
   - **`Psr\EventDispatcher\EventDispatcherInterface`**: Primary service injected into use cases and services to dispatch events (`dispatch(object $event): object`).
   - **`Psr\EventDispatcher\ListenerProviderInterface`**: Resolves which callables should execute for a given event object (`getListenersForEvent(object $event): iterable`).
   - **`Psr\EventDispatcher\StoppableEventInterface`** *(optional)*: Allows an event to halt further propagation via `isPropagationStopped(): bool`.
3. **Official Implementation Packages:**
   - **`yiisoft/event-dispatcher`**: Implements `Dispatcher` (`EventDispatcherInterface`) and `Provider` (`ListenerProviderInterface`), plus `ListenerCollection`, `CompositeDispatcher`, and `CompositeProvider`.
   - **`yiisoft/yii-event`**: Bridge package connecting event configuration files (`config/**/events*.php`) to the DI container via `ListenerCollectionFactory`, `CallableFactory`, and `ListenerConfigurationChecker`.

---

## 2. Designing Domain & Application Events

Domain events represent something meaningful that has occurred in the system. They must be immutable, self-contained, and decoupled from framework infrastructure.

### 2.1. Idiomatic Immutable Domain Event

```php
declare(strict_types=1);

namespace App\Domain\Order\Event;

use DateTimeImmutable;

final readonly class OrderPlacedEvent
{
    public function __construct(
        public string $orderId,
        public string $userId,
        public int $totalAmountCents,
        public DateTimeImmutable $occurredAt = new DateTimeImmutable(),
    ) {}
}
```

### 2.2. Stoppable Guard Event (`StoppableEventInterface`)

Used when subsequent listeners or workflow stages must be halted (e.g. rate-limiting, security validation, or pipeline guards):

```php
declare(strict_types=1);

namespace App\Application\User\Event;

use Psr\EventDispatcher\StoppableEventInterface;

final class BeforeUserRegistrationEvent implements StoppableEventInterface
{
    private bool $propagationStopped = false;
    private ?string $rejectionReason = null;

    public function __construct(
        public readonly string $email,
        public readonly string $ipAddress,
    ) {}

    public function reject(string $reason): void
    {
        $this->rejectionReason = $reason;
        $this->propagationStopped = true;
    }

    public function isPropagationStopped(): bool
    {
        return $this->propagationStopped;
    }

    public function getRejectionReason(): ?string
    {
        return $this->rejectionReason;
    }
}
```

### 2.3. Context-Enriching Event (Mutable State Pattern)

Used when listeners are explicitly intended to modify or enrich an in-flight context before proceeding:

```php
declare(strict_types=1);

namespace App\Application\Auth\Event;

final class BeforeLoginEvent
{
    private bool $isValid = true;
    private ?string $invalidReason = null;

    public function __construct(
        public readonly string $userId,
        public readonly string $authMethod,
    ) {}

    public function invalidate(string $reason): void
    {
        $this->isValid = false;
        $this->invalidReason = $reason;
    }

    public function isValid(): bool
    {
        return $this->isValid;
    }

    public function getInvalidReason(): ?string
    {
        return $this->invalidReason;
    }
}
```

### 2.4. What Belongs in Events vs What is Forbidden

| Allowed in Event DTO | Forbidden in Event DTO |
|---|---|
| Primitive scalars (`string`, `int`, `float`, `bool`) | Active PDO or Database connections (`ConnectionInterface`) |
| UUIDs or Aggregate Identifiers (`$orderId`, `$userId`) | Circular entity trees or mutable stateful models |
| Value Objects (`DateTimeImmutable`, `EmailAddress`) | Open file pointers, streams, or network sockets |
| Immutable domain snapshots | Heavy DI container or application instances (`ContainerInterface`) |

---

## 3. Designing Event Listeners

A listener is a single-purpose class focused on one specific side-effect (e.g., sending an email, recording an audit log, or dispatching a job to a queue).

### 3.1. Invokable Class Listener

Listeners should implement `__invoke(EventClass $event): void`. The event argument type-hint is automatically inspected by `ListenerCollection` and `ListenerCollectionFactory`:

```php
declare(strict_types=1);

namespace App\Application\Order\Listener;

use App\Domain\Order\Event\OrderPlacedEvent;
use Psr\Log\LoggerInterface;
use Throwable;
use Yiisoft\Mailer\MailerInterface;
use Yiisoft\Mailer\Message;

final readonly class SendOrderConfirmationEmailListener
{
    public function __construct(
        private MailerInterface $mailer,
        private LoggerInterface $logger,
    ) {}

    public function __invoke(OrderPlacedEvent $event): void
    {
        try {
            $message = (new Message())
                ->withTo($event->userId . '@example.com')
                ->withSubject('Order #' . $event->orderId . ' Confirmation')
                ->withTextBody('Thank you for your order. Total: ' . ($event->totalAmountCents / 100) . ' USD.');

            $this->mailer->send($message);

            $this->logger->info('Order confirmation email sent for order {orderId}', [
                'orderId' => $event->orderId,
                'userId' => $event->userId,
            ]);
        } catch (Throwable $e) {
            $this->logger->error('Failed to send order confirmation email: {error}', [
                'orderId' => $event->orderId,
                'error' => $e->getMessage(),
                'exception' => $e,
            ]);
            // Do not crash the entire request; catch recoverable errors or dispatch to a retry queue
        }
    }
}
```

```php
declare(strict_types=1);

namespace App\Application\Order\Listener;

use App\Domain\Order\Event\OrderPlacedEvent;
use Psr\Log\LoggerInterface;

final readonly class LogOrderPlacementListener
{
    public function __construct(
        private LoggerInterface $logger,
    ) {}

    public function __invoke(OrderPlacedEvent $event): void
    {
        $this->logger->info('Audit: Order {orderId} placed by user {userId} for {amount} cents', [
            'orderId' => $event->orderId,
            'userId' => $event->userId,
            'amount' => $event->totalAmountCents,
        ]);
    }
}
```

### 3.2. Listener Dependency Injection Rules

`yiisoft/yii-event` coordinates `CallableFactory` and `Yiisoft\Injector\Injector` to resolve listener dependencies:
1. **Constructor Injection (Recommended):** Inject services, mailers, and repositories via `__construct()`. Listeners are resolved from the PSR-11 container.
2. **Method Invocation:** In `ListenerCollectionFactory`, listeners are executed via `$injector->invoke($callable, [$event])`. The event instance is passed as positional argument `0`.
3. **Statelessness Invariant:** In worker-based runtimes (RoadRunner, FrankenPHP, Swoole), listener instances may persist across multiple requests. Listeners must remain strictly stateless and never store request-specific state in class properties.

---

## 4. Event Configuration (`yiisoft/config` & `yiisoft/yii-event`)

Yii3 wires events declaratively using PHP configuration arrays compiled into `Yiisoft\EventDispatcher\Provider\ListenerCollection`.

### 4.1. Configuration Architecture & Scopes

Event configurations are organized by environment scope:
- **`config/common/events.php`**: Shared domain and application events (order placed, user registered).
- **`config/web/events.php`**: Web-specific events (`BeforeRequest`, `AfterEmit`).
- **`config/console/events.php`**: Console-specific events (`ApplicationStartup`).

In `config/params-web.php` and `config/params-console.php`, `yiisoft/yii-event` reads which group to load:
```php
// config/params-web.php
return [
    'yiisoft/yii-event' => [
        'eventsConfigGroup' => 'events-web',
    ],
];
```

In `config/params-console.php`:
```php
// config/params-console.php
return [
    'yiisoft/yii-event' => [
        'eventsConfigGroup' => 'events-console',
    ],
];
```

### 4.2. Declarative Event Mapping (`config/common/events.php`)

The array format maps an event class name to an iterable list of listener definitions:

```php
declare(strict_types=1);

use App\Domain\Order\Event\OrderPlacedEvent;
use App\Application\Order\Listener\SendOrderConfirmationEmailListener;
use App\Application\Order\Listener\LogOrderPlacementListener;

return [
    OrderPlacedEvent::class => [
        // 1. Invokable class string (resolved and autowired via DI container - RECOMMENDED)
        SendOrderConfirmationEmailListener::class,
        LogOrderPlacementListener::class,

        // 2. Specific method call on service resolved from DI container
        // [InvoiceNotificationService::class, 'handleOrderPlaced'],

        // 3. Inline anonymous closure (primarily for debugging or lightweight tasks)
        // static function (OrderPlacedEvent $event, Psr\Log\LoggerInterface $logger): void {
        //     $logger->debug('Order placed event triggered for {id}', ['id' => $event->orderId]);
        // },
    ],
];
```

### 4.3. Verifying Event Configurations Ahead-of-Time

`Yiisoft\Yii\Event\ListenerConfigurationChecker` validates that all configured listeners are valid callables and their target classes exist:

```php
declare(strict_types=1);

use Psr\Container\ContainerInterface;
use Yiisoft\Config\ConfigInterface;
use Yiisoft\Yii\Event\ListenerConfigurationChecker;

/** @var ContainerInterface $container */
/** @var ConfigInterface $config */
$checker = $container->get(ListenerConfigurationChecker::class);

// Throws InvalidEventConfigurationFormatException or InvalidListenerConfigurationException
// if an event class or listener callable is invalid:
$checker->check($config->get('events-web'));
$checker->check($config->get('events-console'));
```

---

## 5. Mandatory Post-Commit Event Dispatching Rule

> ⚠️ **CRITICAL ARCHITECTURAL RULE:**
> Never dispatch external side-effects (emails, SMS, webhooks, queue messages) **inside** an active database transaction.
> If the transaction rolls back due to a subsequent query error or lock timeout, the email or queue job has already been sent!

### Recommended Aggregate Event-Recording Pattern

1. **Place Order Command (DTO):**
```php
declare(strict_types=1);

namespace App\Application\Order\Command;

final readonly class PlaceOrderCommand
{
    public function __construct(
        public string $orderId,
        public string $userId,
        public int $amountCents,
    ) {}
}
```

2. **Entity or Aggregate Root records events internally:**
```php
declare(strict_types=1);

namespace App\Domain\Order\Model;

use App\Domain\Order\Event\OrderPlacedEvent;

class Order
{
    /** @var object[] */
    private array $recordedEvents = [];

    public function __construct(
        public readonly string $id,
        public readonly string $userId,
        public readonly int $amountCents,
    ) {}

    public static function place(string $id, string $userId, int $amountCents): self
    {
        $order = new self($id, $userId, $amountCents);
        $order->recordEvent(new OrderPlacedEvent(
            orderId: $id,
            userId: $userId,
            totalAmountCents: $amountCents,
        ));
        return $order;
    }

    protected function recordEvent(object $event): void
    {
        $this->recordedEvents[] = $event;
    }

    /**
     * @return object[]
     */
    public function releaseEvents(): array
    {
        $events = $this->recordedEvents;
        $this->recordedEvents = [];
        return $events;
    }
}
```

3. **Order Repository Interface:**
```php
declare(strict_types=1);

namespace App\Domain\Order\Repository;

use App\Domain\Order\Model\Order;

interface OrderRepositoryInterface
{
    public function save(Order $order): void;
}
```

4. **Use Case dispatches strictly AFTER transaction commit:**
```php
declare(strict_types=1);

namespace App\Application\Order\UseCase;

use App\Application\Order\Command\PlaceOrderCommand;
use App\Domain\Order\Model\Order;
use App\Domain\Order\Repository\OrderRepositoryInterface;
use Psr\EventDispatcher\EventDispatcherInterface;
use Yiisoft\Db\Connection\ConnectionInterface;

final readonly class PlaceOrderUseCase
{
    public function __construct(
        private ConnectionInterface $db,
        private OrderRepositoryInterface $orders,
        private EventDispatcherInterface $eventDispatcher,
    ) {}

    public function execute(PlaceOrderCommand $command): Order
    {
        // 1. Database operations inside atomic transaction
        $order = $this->db->transaction(function () use ($command): Order {
            $order = Order::place($command->orderId, $command->userId, $command->amountCents);
            $this->orders->save($order);
            return $order;
        });

        // 2. Dispatch events STRICTLY after transaction has successfully committed
        foreach ($order->releaseEvents() as $event) {
            $this->eventDispatcher->dispatch($event);
        }

        return $order;
    }
}
```

---

## 6. Official Yii3 Framework Events Reference

Official packages emit standard PSR-14 events. Listeners can be attached in `config/common/events.php`, `config/web/events.php`, or `config/console/events.php`:

### 6.1. HTTP Application Lifecycle (`yiisoft/yii-http`)
| Event Class | Namespace | When Triggered | Public Properties & Accessors |
|---|---|---|---|
| `ApplicationStartup` | `Yiisoft\Yii\Http\Event\ApplicationStartup` | Application starts before handling any requests | Empty marker class |
| `BeforeRequest` | `Yiisoft\Yii\Http\Event\BeforeRequest` | Before processing an incoming PSR-7 request | `public readonly ServerRequestInterface $request` |
| `AfterRequest` | `Yiisoft\Yii\Http\Event\AfterRequest` | After request has been handled by middleware stack | `public readonly ?ResponseInterface $response` |
| `AfterEmit` | `Yiisoft\Yii\Http\Event\AfterEmit` | After the PSR-7 response is emitted to the client | `public readonly ?ResponseInterface $response` |
| `ApplicationShutdown` | `Yiisoft\Yii\Http\Event\ApplicationShutdown` | When the application runtime terminates | Empty marker class |

> [!NOTE]
> In `BeforeRequest`, `AfterRequest`, and `AfterEmit`, direct property access (`$event->request`, `$event->response`) is preferred. The legacy getters `getRequest()` and `getResponse()` are deprecated.

### 6.2. Console Application Lifecycle (`yiisoft/yii-console`)
| Event Class | Namespace | When Triggered | Public Properties & Accessors |
|---|---|---|---|
| `ApplicationStartup` | `Yiisoft\Yii\Console\Event\ApplicationStartup` | Before console command execution starts | `public ?string $commandName = null` |
| `ApplicationShutdown` | `Yiisoft\Yii\Console\Event\ApplicationShutdown` | After console command execution finishes | `$event->getExitCode(): int` |

### 6.3. User Authentication Lifecycle (`yiisoft/user`)
| Event Class | Namespace | When Triggered | Public Properties & Accessors |
|---|---|---|---|
| `BeforeLogin` | `Yiisoft\User\Event\BeforeLogin` | Before identity login is completed | `$event->getIdentity(): IdentityInterface`<br>`$event->invalidate(): void`<br>`$event->isValid(): bool` |
| `AfterLogin` | `Yiisoft\User\Event\AfterLogin` | After identity login is completed | `$event->getIdentity(): IdentityInterface` |
| `BeforeLogout` | `Yiisoft\User\Event\BeforeLogout` | Before identity logout is completed | `$event->getIdentity(): IdentityInterface`<br>`$event->invalidate(): void`<br>`$event->isValid(): bool` |
| `AfterLogout` | `Yiisoft\User\Event\AfterLogout` | After identity logout is completed | `$event->getIdentity(): IdentityInterface` |

### 6.4. Middleware Dispatcher Lifecycle (`yiisoft/middleware-dispatcher`)
| Event Class | Namespace | When Triggered | Public Properties & Accessors |
|---|---|---|---|
| `BeforeMiddleware` | `Yiisoft\Middleware\Dispatcher\Event\BeforeMiddleware` | Before executing an individual PSR-15 middleware | `$event->getMiddleware(): MiddlewareInterface`<br>`$event->getRequest(): ServerRequestInterface` |
| `AfterMiddleware` | `Yiisoft\Middleware\Dispatcher\Event\AfterMiddleware` | After executing an individual PSR-15 middleware | `$event->getMiddleware(): MiddlewareInterface`<br>`$event->getResponse(): ?ResponseInterface` |

### 6.5. Mailer Lifecycle (`yiisoft/mailer`)
| Event Class | Namespace | When Triggered | Public Properties & Accessors |
|---|---|---|---|
| `BeforeSend` | `Yiisoft\Mailer\Event\BeforeSend` | Before message is dispatched by mailer | `public readonly MessageInterface $message`<br>`public bool $preventSendingMessage = false` |
| `AfterSend` | `Yiisoft\Mailer\Event\AfterSend` | After message has been dispatched | `public readonly MessageInterface $message` |

### 6.6. Active Record Lifecycle (`yiisoft/active-record`)
| Event Class | Namespace | When Triggered | Public Properties & Accessors |
|---|---|---|---|
| `BeforeSave` | `Yiisoft\ActiveRecord\Event\BeforeSave` | Before record is saved (inserted or updated) | `public readonly ActiveRecordInterface $model`<br>`public ?array &$properties`<br>`$event->preventDefault(): void`<br>`$event->stopPropagation(): void`<br>`$event->isPropagationStopped(): bool`<br>`$event->isDefaultPrevented(): bool` |
| `AfterSave` | `Yiisoft\ActiveRecord\Event\AfterSave` | After record has been saved | `public readonly ActiveRecordInterface $model` |
| `BeforeInsert` | `Yiisoft\ActiveRecord\Event\BeforeInsert` | Before record is inserted | `public readonly ActiveRecordInterface $model`<br>`public ?array &$properties`<br>`$event->preventDefault(): void` |
| `AfterInsert` | `Yiisoft\ActiveRecord\Event\AfterInsert` | After record has been inserted | `public readonly ActiveRecordInterface $model` |
| `BeforeUpdate` | `Yiisoft\ActiveRecord\Event\BeforeUpdate` | Before record is updated | `public readonly ActiveRecordInterface $model`<br>`public ?array &$properties`<br>`$event->preventDefault(): void` |
| `AfterUpdate` | `Yiisoft\ActiveRecord\Event\AfterUpdate` | After record has been updated | `public readonly ActiveRecordInterface $model`<br>`public int &$count` |
| `BeforeDelete` | `Yiisoft\ActiveRecord\Event\BeforeDelete` | Before record is deleted | `public readonly ActiveRecordInterface $model`<br>`$event->preventDefault(): void` |
| `AfterDelete` | `Yiisoft\ActiveRecord\Event\AfterDelete` | After record has been deleted | `public readonly ActiveRecordInterface $model` |
| `AfterPopulate` | `Yiisoft\ActiveRecord\Event\AfterPopulate` | After record attributes are populated | `public readonly ActiveRecordInterface $model` |

### 6.7. View Template Lifecycle (`yiisoft/view`)
| Event Class | Namespace | When Triggered | Public Properties & Accessors |
|---|---|---|---|
| `BeforeRender` | `Yiisoft\View\Event\View\BeforeRender` | Before rendering a view file | `$event->getView(): View`<br>`$event->getFile(): string`<br>`$event->getParameters(): array`<br>`$event->stopPropagation(): void`<br>`$event->isPropagationStopped(): bool` |
| `AfterRender` | `Yiisoft\View\Event\View\AfterRender` | After rendering a view file | `$event->getView(): View`<br>`$event->getFile(): string`<br>`$event->getParameters(): array`<br>`$event->getResult(): string` |
| `PageBegin` | `Yiisoft\View\Event\View\PageBegin` | At beginning of page layout rendering | Empty marker class |
| `PageEnd` | `Yiisoft\View\Event\View\PageEnd` | At end of page layout rendering | Empty marker class |

---

## 7. PHP 8 Named Arguments & Signatures Reference

To eliminate Fatal Errors when invoking methods with PHP 8 named arguments, strictly follow the parameter names defined in `vendor/yiisoft/*/src/`:

```php
declare(strict_types=1);

use App\Domain\Order\Event\OrderPlacedEvent;
use Psr\EventDispatcher\EventDispatcherInterface;
use Psr\EventDispatcher\ListenerProviderInterface;
use Yiisoft\EventDispatcher\Dispatcher\CompositeDispatcher;
use Yiisoft\EventDispatcher\Dispatcher\Dispatcher;
use Yiisoft\EventDispatcher\Provider\CompositeProvider;
use Yiisoft\EventDispatcher\Provider\ListenerCollection;
use Yiisoft\EventDispatcher\Provider\Provider;
use Yiisoft\Yii\Event\CallableFactory;
use Yiisoft\Yii\Event\ListenerCollectionFactory;
use Yiisoft\Yii\Event\ListenerConfigurationChecker;

/** @var EventDispatcherInterface $dispatcher */
/** @var ListenerProviderInterface $provider */
/** @var CompositeDispatcher $compositeDispatcher */
/** @var CompositeProvider $compositeProvider */
/** @var ListenerCollection $collection */
/** @var ListenerCollectionFactory $factory */
/** @var CallableFactory $callableFactory */
/** @var ListenerConfigurationChecker $checker */
/** @var callable $myListener */
/** @var object $myEvent */
/** @var array $eventsArray */

// 1. Psr\EventDispatcher\EventDispatcherInterface::dispatch
$dispatcher->dispatch(
    event: $myEvent,
);

// 2. Psr\EventDispatcher\ListenerProviderInterface::getListenersForEvent
$provider->getListenersForEvent(
    event: $myEvent,
);

// 3. Yiisoft\EventDispatcher\Provider\ListenerCollection::add
// Signature: add(callable $listener, string ...$eventClassNames): self
// Note: $eventClassNames is variadic; pass event classes positionally, or omit to auto-infer from listener type-hint
$collection = $collection->add(
    $myListener,
    OrderPlacedEvent::class,
);

// Or auto-infer event class from listener __invoke parameter type:
$collection = $collection->add(
    listener: $myListener,
);

// 4. Yiisoft\EventDispatcher\Dispatcher\Dispatcher::__construct
$dispatcher = new Dispatcher(
    listenerProvider: $provider,
);

// 5. Yiisoft\EventDispatcher\Provider\Provider::__construct
$provider = new Provider(
    listeners: $collection,
);

// 6. Yiisoft\EventDispatcher\Dispatcher\CompositeDispatcher::attach
$compositeDispatcher->attach(
    dispatcher: $dispatcher,
);

// 7. Yiisoft\EventDispatcher\Provider\CompositeProvider::attach
$compositeProvider->attach(
    provider: $provider,
);

// 8. Yiisoft\Yii\Event\CallableFactory::create
$callable = $callableFactory->create(
    definition: $myListener,
);

// 9. Yiisoft\Yii\Event\ListenerCollectionFactory::create
$collection = $factory->create(
    eventListeners: $eventsArray,
);

// 10. Yiisoft\Yii\Event\ListenerConfigurationChecker::check
$checker->check(
    configuration: $eventsArray,
);
```

---

## 8. Anti-Pattern Matrix: Events & Listeners

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| ❌ **Calling `$this->trigger('eventName')`** | Legacy Yii2 Component mechanism. Yii3 domain models, controllers, and services do not extend `Component` and have no `trigger()` method. | ✅ Inject `Psr\EventDispatcher\EventDispatcherInterface` into constructor and call `$this->dispatcher->dispatch(new EventClass(...))`. |
| ❌ **Calling legacy static facade `Yii::$app->trigger(...)`** | Global static service locators (`Yii::$app`) do not exist in Yii3. | ✅ Inject `EventDispatcherInterface` explicitly via constructor autowiring. |
| ❌ **Using untyped string event names (`const EVENT_AFTER_LOGIN = 'afterLogin'`)** | Yii2 legacy string constants; impossible to refactor safely or type-check statically. | ✅ Define typed event classes: `new UserLoggedInEvent($user)`. |
| ❌ **Extending legacy `yii\base\Event`** | In Yii3, events are pure PHP DTOs and do NOT extend any framework base class. | ✅ Define a pure PHP class: `final readonly class OrderPlacedEvent { ... }`. |
| ❌ **Dispatching external side-effects inside an open DB transaction (`$db->transaction()`)** | Causes irreversible side effects (emails sent, SMS sent, jobs queued) if the transaction subsequently fails or rolls back. | ✅ Collect events inside the Aggregate Root (`recordEvent()`) and dispatch post-commit via `releaseEvents()`. |
| ❌ **Fat Listeners containing direct DB transactions and complex mutations** | Violates Single Responsibility Principle and couples event listeners to storage internals. | ✅ Listeners should invoke dedicated Application Use Cases or dispatch async Queue jobs. |
| ❌ **Passing Active DB Connections, open sockets, or ContainerInterface inside Event DTOs** | Bloats memory, breaks serialization (e.g. queue workers, audit logs), and creates tight coupling. | ✅ Include only primitive scalars, UUIDs/IDs, and immutable Value Objects in Event DTOs. |
| ❌ **Throwing unhandled recoverable exceptions in normal event listeners** | Halts the PSR-14 dispatch loop and prevents subsequent listeners for the event from executing. | ✅ Catch and log recoverable errors inside the listener, or dispatch a retry job to a queue. |
| ❌ **Calling non-existent `ListenerProvider::attach()`** | Hallucinated method. `ListenerCollection` is immutable (`add()` returns a clone); only `CompositeProvider` has `attach()`. | ✅ Register listeners declaratively in `config/common/events.php` or call `$collection->add()`. |
| ❌ **Putting event listener configurations directly in `config/di.php`** | Pollutes DI container definitions; `yiisoft/yii-event` resolves listeners via `'eventsConfigGroup'` (`events`, `events-web`, `events-console`). | ✅ Put listener configurations in `config/common/events.php` or `config/web/events.php`. |
| ❌ **Using stateful listeners across requests in RoadRunner or FrankenPHP workers** | In persistent worker runtimes, listener instances remain in memory across requests, causing cross-request data leaks. | ✅ Keep listeners strictly stateless; inject shared services via `__construct()` and process only the passed `$event`. |
| ❌ **Mutating events to pass arbitrary data between unrelated listeners** | Creates fragile coupling and unmaintainable dependencies on listener execution order. | ✅ Events represent immutable facts; use an explicit pipeline or workflow pattern if sequential data transformation is needed. |
| ❌ **In-place mutation assumption: calling `$collection->add($listener)` without assignment** | `ListenerCollection` is immutable. `add()` creates and returns a cloned instance, leaving `$collection` unchanged. | ✅ Always reassign the result: `$collection = $collection->add($listener);`. |
| ❌ **Overriding legacy `ActiveRecord::beforeSave()` or `behaviors()` in models** | Yii3 Active Record models do not use `beforeSave()` or `behaviors()`. | ✅ Subscribe to PSR-14 `Yiisoft\ActiveRecord\Event\BeforeSave` or use domain events released post-commit. |
