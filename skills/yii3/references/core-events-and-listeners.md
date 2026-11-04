# Yii3 Events & Listeners Guide

> [!IMPORTANT]
> **Grounding rule:** this guide is authoring synthesis for navigation and patterns. The source of truth for every class name, method signature, constructor argument, and configuration key is the installed package source under `vendor/yiisoft/<pkg>/src/`. Verify there before writing code; never substitute this guide for vendor sources, and never write Yii 2 APIs.

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
  - [3.3. Listener Ordering (No Priority Mechanism)](#33-listener-ordering-no-priority-mechanism)
- [4. Event Configuration (yiisoft/config & yiisoft/yii-event)](#4-event-configuration-yiisoftconfig--yiisoftyii-event)
  - [4.1. Configuration Architecture & Scopes](#41-configuration-architecture--scopes)
  - [4.2. Declarative Event Mapping & Supported Listener Formats](#42-declarative-event-mapping--supported-listener-formats)
  - [4.3. Verifying Event Configurations Ahead-of-Time](#43-verifying-event-configurations-ahead-of-time)
- [5. Mandatory Post-Commit Event Dispatching Rule](#5-mandatory-post-commit-event-dispatching-rule)
- [6. Official Yii3 Framework Events Reference](#6-official-yii3-framework-events-reference)
  - [6.1. HTTP Application Lifecycle (yiisoft/yii-http)](#61-http-application-lifecycle-yiisoftyii-http)
  - [6.2. Console Application Lifecycle (yiisoft/yii-console)](#62-console-application-lifecycle-yiisoftyii-console)
  - [6.3. User Authentication Lifecycle (yiisoft/user)](#63-user-authentication-lifecycle-yiisoftuser)
  - [6.4. Middleware Dispatcher Lifecycle (yiisoft/middleware-dispatcher)](#64-middleware-dispatcher-lifecycle-yiisoftmiddleware-dispatcher)
  - [6.5. Mailer Lifecycle (yiisoft/mailer)](#65-mailer-lifecycle-yiisoftmailer)
  - [6.6. Active Record Lifecycle (yiisoft/active-record)](#66-active-record-lifecycle-yiisoftactive-record)
  - [6.7. View Template Lifecycle (yiisoft/view, View)](#67-view-template-lifecycle-yiisoftview-view)
  - [6.8. Web View Lifecycle (yiisoft/view, WebView)](#68-web-view-lifecycle-yiisoftview-webview)
- [7. PHP 8 Named Arguments & Signatures Reference](#7-php-8-named-arguments--signatures-reference)
- [8. Testing Events & Listeners](#8-testing-events--listeners)
- [9. Anti-Pattern Matrix: Events & Listeners](#9-anti-pattern-matrix-events--listeners)

---

## 1. PSR-14 Event Architecture in Yii3

Yii3 completely replaces the legacy Yii2 `Component::trigger()` mechanism with the standard **PSR-14 Event Dispatcher**:

1. **Pure PHP Objects (DTOs):**
   - Application-defined domain events are plain PHP classes; `final readonly class` is the recommended shape for these DTOs.
   - Official framework events are `final class` (never `final readonly class`) with package-dependent property visibility: public readonly properties in `yiisoft/yii-http` and `yiisoft/mailer`, private readonly properties with getters in `yiisoft/middleware-dispatcher`, private properties with accessors and mutation methods in `yiisoft/user`.
   - Some framework event groups extend package-local base classes: Active Record events extend `Yiisoft\ActiveRecord\Event\AbstractEvent`, view events extend `Yiisoft\View\Event\View\ViewEvent` / `Yiisoft\View\Event\WebView\WebViewEvent`. There is no shared Yii2-style global `Event` base class.
2. **Three Core PSR-14 Contracts:**
   - **`Psr\EventDispatcher\EventDispatcherInterface`**: Primary service injected into use cases and services to dispatch events. The PSR interface declares `dispatch(object $event)` with no native return type; yiisoft's `Dispatcher` implementation guarantees the `: object` return.
   - **`Psr\EventDispatcher\ListenerProviderInterface`**: Resolves which callables should execute for a given event object (`getListenersForEvent(object $event): iterable`).
   - **`Psr\EventDispatcher\StoppableEventInterface`** *(optional)*: Allows an event to halt further propagation via `isPropagationStopped(): bool`.
3. **Official Implementation Packages:**
   - **`yiisoft/event-dispatcher`**: Implements `Dispatcher` (`EventDispatcherInterface`) and `Provider` (`ListenerProviderInterface`), plus `ListenerCollection`, `CompositeDispatcher`, and `CompositeProvider` — exactly five classes (`vendor/yiisoft/event-dispatcher/src/`). The package ships no `config/` — zero DI definitions of its own.
   - **`yiisoft/yii-event`**: Bridge package connecting event configuration files (`config/**/events*.php`) to the DI container via `ListenerCollectionFactory`, `CallableFactory`, and `ListenerConfigurationChecker`.
4. **Default DI Wiring (shipped by `yiisoft/yii-event`):**
   - `Psr\EventDispatcher\EventDispatcherInterface::class => Dispatcher::class`
   - `Psr\EventDispatcher\ListenerProviderInterface::class => Provider::class`

   Source: `vendor/yiisoft/yii-event/config/di.php`. The `ListenerCollection` service is built per environment from the config group named by the `eventsConfigGroup` parameter (`vendor/yiisoft/yii-event/config/di-web.php`, `config/di-console.php`; see [Section 4.1](#41-configuration-architecture--scopes)).
5. **Listener Lookup Order:** for each event, the default `Provider` looks up listeners registered for the exact event class name first, then for its parent classes, then for its interfaces (`vendor/yiisoft/event-dispatcher/src/Provider/Provider.php`). A listener registered for a parent class or an interface therefore fires for every subclass or implementation.

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

> [!NOTE]
> The dispatcher checks `isPropagationStopped()` **before** invoking each listener (`vendor/yiisoft/event-dispatcher/src/Dispatcher/Dispatcher.php`). A listener that stops propagation still completes its own execution — only the remaining listeners are skipped.
> `dispatch()` returns the same event object that was passed in. Listeners communicate by mutating the event's properties, not by replacing the object — a listener taking `$event` by reference cannot swap the instance.

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

> [!IMPORTANT]
> **Disambiguation from the framework event:** `yiisoft/user` ships its own `Yiisoft\User\Event\BeforeLogin` (`vendor/yiisoft/user/src/Event/BeforeLogin.php`) whose `invalidate(): void` takes **no arguments** and whose payload is private (`getIdentity(): IdentityInterface`, `isValid(): bool`). The example above is an *application-level* event with a reason argument — it is not interchangeable with the framework class. To avoid near-collisions, keep the `Event` suffix on application-defined events: the framework drops the suffix (`BeforeLogin`, `BeforeRequest`, `BeforeSend`), so `BeforeLoginEvent` (app) and `Yiisoft\User\Event\BeforeLogin` (framework) never clash.

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

Listeners should implement `__invoke(EventClass $event): void`.

- When registering **programmatically** via `ListenerCollection::add()`, the event argument type-hint is auto-inferred from the listener's first parameter when no event class names are passed (see [Section 7](#7-php-8-named-arguments--signatures-reference)).
- When registering **declaratively** in config arrays, `ListenerCollectionFactory::create()` always registers each listener under the **explicit event class name used as the config array key** — no inference happens in the factory (`vendor/yiisoft/yii-event/src/ListenerCollectionFactory.php`).

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

> [!NOTE]
> Injecting `Yiisoft\Mailer\MailerInterface` requires a production interface-to-implementation binding. `yiisoft/mailer` itself ships only a `FileMailer` definition (`vendor/yiisoft/mailer/config/di.php`); the standard web-app binding `MailerInterface::class => Mailer::class` comes from `yiisoft/mailer-symfony` (`vendor/yiisoft/mailer-symfony/config/di.php`).

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
2. **Method Invocation:** In `ListenerCollectionFactory`, each configured listener is wrapped as `fn(object $event): mixed => $this->injector->invoke($this->callableFactory->create($callable), [$event])` (`vendor/yiisoft/yii-event/src/ListenerCollectionFactory.php`). The event instance is passed in the **positional arguments array**, and the `Injector` binds it to a parameter **by type** (`instanceof` check), **not by positional index** (`vendor/yiisoft/injector/src/ResolvingState.php`). The full argument-resolution order and exception map (`MissingRequiredArgumentException`, positional-objects rule, nullable handling) are owned by the [DI & Configuration Guide](core-di-and-config.md), sections 6.1 and 7.9 — listeners follow them unchanged; `Injector::invoke()` returns `mixed` (docblock only; no native return type is declared).
3. **Statelessness Invariant:** In worker-based runtimes (RoadRunner, FrankenPHP, Swoole), listener instances may persist across multiple requests. Listeners must remain strictly stateless and never store request-specific state in class properties.

### 3.3. Listener Ordering (No Priority Mechanism)

- Listeners execute in **registration order**. `ListenerCollection::add()` appends the listener to the collection, and iteration yields listeners in insertion order (`vendor/yiisoft/event-dispatcher/src/Provider/ListenerCollection.php`).
- Config-driven listeners execute in **config-array order**: `ListenerCollectionFactory::create()` registers definitions in the order they appear in the group array (`vendor/yiisoft/yii-event/src/ListenerCollectionFactory.php`).
- **There is no priority mechanism** — none of `Dispatcher`, `Provider`, `ListenerCollection`, `CompositeDispatcher`, or `CompositeProvider` supports priorities, weights, or sorted execution.
- When ordering matters, encode it explicitly: list listeners in the required sequence inside the config array (see [Section 4.2](#42-declarative-event-mapping--supported-listener-formats)), or split an event into ordered sub-events. Never rely on undocumented priority behavior.

---

## 4. Event Configuration (`yiisoft/config` & `yiisoft/yii-event`)

Yii3 wires events declaratively using PHP configuration arrays compiled into `Yiisoft\EventDispatcher\Provider\ListenerCollection`.

### 4.1. Configuration Architecture & Scopes

**Parameter defaults.** `yiisoft/yii-event` ships the following defaults and reads which config group to load from them:

```php
// vendor/yiisoft/yii-event/config/params-web.php
return [
    'yiisoft/yii-event' => [
        'eventsConfigGroup' => 'events-web',
    ],
];
```

```php
// vendor/yiisoft/yii-event/config/params-console.php
return [
    'yiisoft/yii-event' => [
        'eventsConfigGroup' => 'events-console',
    ],
];
```

**App template group declaration.** The Yii app template declares the event groups in `config/configuration.php`:

```php
// config/configuration.php (app template fragment)
'events' => [],
'events-web' => ['$events'],
'events-console' => ['$events'],
```

The group names `events`, `events-web`, and `events-console` are official, **but the template does not pre-create `config/common/events.php`**. To use the shared group, create the file and map it into the merge plan:

```php
// config/configuration.php — after adding config/common/events.php
'events' => 'common/events.php',
'events-web' => ['$events'],
'events-console' => ['$events'],
```

After editing `config/configuration.php`, rebuild the merge plan with `composer yii-config-rebuild`. The shared file's content then reaches **both** environment groups via the `$events` reference.

**Merge modifiers (official recipe for events).** Merge semantics and the modifier APIs (`ReverseMerge::groups(...)`, `RecursiveMerge::groups(...)`, `RecursiveMerge::groupsWithDepth(...)`) are owned by the [DI & Configuration Guide](core-di-and-config.md), section 2.5. For events you normally write no modifier code at all: the HTTP and console runners already apply `RecursiveMerge` + `ReverseMerge` to the `params*` and `events*` groups out of the box via `createDefaultConfig()`. Only a hand-constructed `Yiisoft\Config\Config` instance (custom entrypoint, test bootstrap) needs the explicit `RecursiveMerge::groups('params', 'events', 'events-web', 'events-console')` + `ReverseMerge::groups('events', 'events-web', 'events-console')` modifiers. Reverse merge gives module-level event configs higher priority than the base config.

**Custom group.** To isolate a module's events, redefine the parameter:

```php
// config/params.php
return [
    'yiisoft/yii-event' => [
        'eventsConfigGroup' => 'events-api',
    ],
];
```

**Availability guarantees.** `yiisoft/event-dispatcher` ships no config at all. `yiisoft/yii-event` declares `events-web` and `events-console` as empty groups, so `$config->get('events-web')` and `$config->get('events-console')` always work once the package is installed (`vendor/yiisoft/yii-event/composer.json`, `config-plugin` section).

### 4.2. Declarative Event Mapping & Supported Listener Formats

The array format maps an event class name to an iterable list of listener definitions:

```php
declare(strict_types=1);

use App\Application\Order\Listener\LogOrderPlacementListener;
use App\Application\Order\Listener\SendOrderConfirmationEmailListener;
use App\Domain\Order\Event\OrderPlacedEvent;

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

`CallableFactory` (`vendor/yiisoft/yii-event/src/CallableFactory.php`, marked `@internal`) accepts all of the following definition forms:

| # | Definition Form | Resolution Behavior |
|---|---|---|
| 1 | `InvokableListener::class` (class-string with `__invoke`) | Instantiated and autowired via the DI container |
| 2 | `[ServiceClass::class, 'methodName']` | Instance resolved from the PSR-11 container, method invoked |
| 3 | `[ServiceClass::class, 'staticMethodName']` | Static method call |
| 4 | Inline closure | Invoked directly |
| 5 | Closure with extra type-hinted parameters (e.g. `Psr\Log\LoggerInterface $logger`) | Extra parameters resolved per-call by the `Injector` from the container |
| 6 | Pre-built invokable object | Used as-is |
| 7 | Any other container id/alias (string) | Resolved from the PSR-11 container and invoked |

Each listener is registered under the **explicit event class name used as the config key** — the config pipeline never infers event names from listener signatures.

### 4.3. Verifying Event Configurations Ahead-of-Time

> [!WARNING]
> **Lazy resolution pitfall:** listener definitions are resolved at **dispatch time**, not at wiring time. An invalid definition (missing class, non-callable) fails only when the event actually fires — `CallableFactory::create()` is invoked inside the per-dispatch closure (`vendor/yiisoft/yii-event/src/ListenerCollectionFactory.php`). Only the map **format** (string event key, iterable listener list) is validated eagerly, when `ListenerCollectionFactory::create()` builds the collection — i.e. when the DI container first resolves `ListenerCollection::class`. Run the configuration checker in development environments and tests to catch broken definitions before production.

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

Details:

- Validation rules: every event key must be a string naming an existing class, every value must be iterable, and every listener definition must resolve to a callable (`vendor/yiisoft/yii-event/src/ListenerConfigurationChecker.php`).
- Exceptions: `Yiisoft\Yii\Event\InvalidEventConfigurationFormatException` and `Yiisoft\Yii\Event\InvalidListenerConfigurationException` (both implement `FriendlyExceptionInterface`).
- Container retrieval of the checker works via DI autowiring of unregistered class names (yiisoft/di's default **non-strict mode**). Under `useStrictMode(true)` the lookup would fail — register the checker explicitly if you enable strict mode.
- The checker is documented as resource-greedy and is intended for development environments and test runs, not production request handling.

---

## 5. Mandatory Post-Commit Event Dispatching Rule

> ⚠️ **CRITICAL ARCHITECTURAL RULE:**
> Never dispatch external side-effects (emails, SMS, webhooks, queue messages) **inside** an active database transaction.
> If the transaction rolls back due to a subsequent query error or lock timeout, the email or queue job has already been sent!

### Why the Rule Holds: the `transaction()` API

`ConnectionInterface::transaction()` commits **before** it returns and, on any `Throwable`, rolls back and re-throws — so any code executed after `transaction()` returns is guaranteed to run strictly after a successful commit: the post-commit dispatch rule is enforced by the API itself.

Note: `dispatch()` returns the same (possibly mutated) event object that was passed in.

> [!TIP]
> **Database Guide Reference:**
> For the complete `transaction()` reference — the closure contract (zero-argument closures are accepted), the isolation-level second argument forwarded to `beginTransaction()`, and the `TransactionInterface` isolation-constant catalog — see the [Database Guide, §4.1](persistence-db.md#41-idiomatic-closure-transactions-transaction) and [§4.3](persistence-db.md#43-isolation-levels--post-commit-event-rule).

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

Official packages emit standard PSR-14 events. Listeners can be attached in the event configuration groups described in [Section 4.1](#41-configuration-architecture--scopes).

> [!IMPORTANT]
> **Optional dispatcher pitfall:** every official emitter accepts `?EventDispatcherInterface $eventDispatcher = null` and dispatches null-safe — when no dispatcher is wired, events are **silently skipped** (no error, no log). Verify the dispatcher is actually injected (via the `yiisoft/yii-event` wiring from [Section 1](#1-psr-14-event-architecture-in-yii3)) before debugging "missing" events.

### 6.1. HTTP Application Lifecycle (`yiisoft/yii-http`)
| Event Class | Namespace | When Triggered | Public Properties & Accessors |
|---|---|---|---|
| `ApplicationStartup` | `Yiisoft\Yii\Http\Event\ApplicationStartup` | Application starts before handling any requests (dispatched by `Application::start()`) | Empty marker class |
| `BeforeRequest` | `Yiisoft\Yii\Http\Event\BeforeRequest` | Before processing an incoming PSR-7 request (dispatched at the top of `Application::handle()`) | `public readonly ServerRequestInterface $request` |
| `AfterRequest` | `Yiisoft\Yii\Http\Event\AfterRequest` | After request has been handled by middleware stack (dispatched in a `finally` block — fires even when middleware throws; `$response` is `null` if response generation failed) | `public readonly ?ResponseInterface $response` |
| `AfterEmit` | `Yiisoft\Yii\Http\Event\AfterEmit` | After the PSR-7 response is emitted to the client (dispatched by `Application::afterEmit()`) | `public readonly ?ResponseInterface $response` |
| `ApplicationShutdown` | `Yiisoft\Yii\Http\Event\ApplicationShutdown` | When the application runtime terminates (dispatched by `Application::shutdown()`) | Empty marker class |

> [!NOTE]
> In `BeforeRequest`, `AfterRequest`, and `AfterEmit`, direct property access (`$event->request`, `$event->response`) is preferred. The legacy getters `getRequest()` and `getResponse()` are deprecated.

Lifecycle order in the HTTP runner: `Application::start()` → `Application::handle()` → response emit → `finally { afterEmit(); shutdown(); }` (`vendor/yii-runner-http/src/HttpApplicationRunner.php`, `vendor/yiisoft/yii-http/src/Application.php`).

### 6.2. Console Application Lifecycle (`yiisoft/yii-console`)
| Event Class | Namespace | When Triggered | Public Properties & Accessors |
|---|---|---|---|
| `ApplicationStartup` | `Yiisoft\Yii\Console\Event\ApplicationStartup` | Before console command execution starts (dispatched by `Application::start()` with the first CLI argument) | `public ?string $commandName = null` |
| `ApplicationShutdown` | `Yiisoft\Yii\Console\Event\ApplicationShutdown` | After console command execution finishes (dispatched by `Application::shutdown(int $exitCode)`) | `$event->getExitCode(): int` |

> [!NOTE]
> Property visibility is asymmetric between the two events: `ApplicationStartup` exposes a **public** `$commandName`, while `ApplicationShutdown` keeps `$exitCode` **private** and exposes it only through the `getExitCode(): int` accessor. The exit code is a mandatory constructor argument.

**Symfony Console bridge.** `Yiisoft\Yii\Console\Application` extends `\Symfony\Component\Console\Application` (`vendor/yiisoft/yii-console/src/Application.php`), so Symfony Console events flow through the same pipeline:

- `Yiisoft\Yii\Console\SymfonyEventDispatcher` adapts Symfony's event dispatcher contract to PSR-14 (`vendor/yiisoft/yii-console/src/SymfonyEventDispatcher.php`). It **ignores the legacy string `$eventName`** argument — Symfony listeners must be subscribed **by event class name**.
- The bridge is wired by default: the console DI configuration sets the application's dispatcher to `SymfonyEventDispatcher` (`vendor/yiisoft/yii-console/config/di-console.php`).
- The package ships an `events-console` group subscribing `Symfony\Component\Console\Event\ConsoleErrorEvent` to `[ErrorListener::class, 'onError']` (`vendor/yiisoft/yii-console/config/events-console.php`).
- `ConsoleErrorEvent` is the only Symfony event class wired by default in the package sources. Before subscribing to other Symfony Console event classes, verify them against the installed `symfony/console` version in `vendor/symfony/console/`.

### 6.3. User Authentication Lifecycle (`yiisoft/user`)
| Event Class | Namespace | When Triggered | Public Properties & Accessors |
|---|---|---|---|
| `BeforeLogin` | `Yiisoft\User\Event\BeforeLogin` | Before identity login is completed | `$event->getIdentity(): IdentityInterface`<br>`$event->invalidate(): void`<br>`$event->isValid(): bool` |
| `AfterLogin` | `Yiisoft\User\Event\AfterLogin` | After identity login is completed | `$event->getIdentity(): IdentityInterface` |
| `BeforeLogout` | `Yiisoft\User\Event\BeforeLogout` | Before identity logout is completed | `$event->getIdentity(): IdentityInterface`<br>`$event->invalidate(): void`<br>`$event->isValid(): bool` |
| `AfterLogout` | `Yiisoft\User\Event\AfterLogout` | After identity logout is completed | `$event->getIdentity(): IdentityInterface` |

Notes:

- All four events are dispatched by `Yiisoft\User\CurrentUser::login()` / `logout()` (`vendor/yiisoft/user/src/CurrentUser.php`).
- `invalidate()` takes **no arguments**. The veto is read off the event returned by `dispatch()` — the emitter re-checks `isValid()` after dispatch, so listeners must mutate the dispatched instance.
- `IdentityInterface` is `Yiisoft\Auth\IdentityInterface` (`vendor/yiisoft/auth/src/IdentityInterface.php`) — import it from `Yiisoft\Auth`, not `Yiisoft\User`.

### 6.4. Middleware Dispatcher Lifecycle (`yiisoft/middleware-dispatcher`)
| Event Class | Namespace | When Triggered | Public Properties & Accessors |
|---|---|---|---|
| `BeforeMiddleware` | `Yiisoft\Middleware\Dispatcher\Event\BeforeMiddleware` | Before executing an individual PSR-15 middleware | `$event->getMiddleware(): MiddlewareInterface`<br>`$event->getRequest(): ServerRequestInterface` |
| `AfterMiddleware` | `Yiisoft\Middleware\Dispatcher\Event\AfterMiddleware` | After executing an individual PSR-15 middleware (dispatched inside a `finally` block — fires with a `null` response when the middleware throws) | `$event->getMiddleware(): MiddlewareInterface`<br>`$event->getResponse(): ?ResponseInterface` |

Notes:

- Event payloads are **private readonly** properties exposed through getters.
- Events fire only when a dispatcher was injected into `MiddlewareDispatcher` (constructor parameter `?EventDispatcherInterface $eventDispatcher = null`; dispatches are null-safe in `MiddlewareStack`) — otherwise they are silently skipped.
- Nested middleware pipelines emit onion-ordered event streams: `BeforeMiddleware` fires on ingress, `AfterMiddleware` on egress, in reverse order.

### 6.5. Mailer Lifecycle (`yiisoft/mailer`)
| Event Class | Namespace | When Triggered | Public Properties & Accessors |
|---|---|---|---|
| `BeforeSend` | `Yiisoft\Mailer\Event\BeforeSend` | Before message is dispatched by mailer | `public readonly MessageInterface $message`<br>`public bool $preventSendingMessage = false` |
| `AfterSend` | `Yiisoft\Mailer\Event\AfterSend` | After message has been dispatched | `public readonly MessageInterface $message` |

Notes:

- Events fire only from `BaseMailer::send()` (`vendor/yiisoft/mailer/src/BaseMailer.php`) — only `BaseMailer` descendants emit them. `NullMailer` and `StubMailer` bypass events entirely.
- Events fire only when a dispatcher was injected into the mailer's constructor (optional `?EventDispatcherInterface` parameter) — otherwise they are silently skipped.
- **Veto pattern:** set the public mutable flag `$event->preventSendingMessage = true` in a `BeforeSend` listener; the mailer checks it after dispatch and skips sending.
- **Mutation trap:** mutating the `$message` object inside `BeforeSend` has **no effect** on what is sent — `send()` transmits its local `$message` variable, not the event payload.

### 6.6. Active Record Lifecycle (`yiisoft/active-record`)

`yiisoft/active-record` defines **14 events** in `Yiisoft\ActiveRecord\Event`. All extend `AbstractEvent implements StoppableEventInterface` (`vendor/yiisoft/active-record/src/Event/AbstractEvent.php`), and every event carries `public readonly ActiveRecordInterface $model`.

**Inherited API on every event** (`vendor/yiisoft/active-record/src/Event/AbstractEvent.php`):

| Method | Semantics |
|---|---|
| `preventDefault(): void` | Marks the operation as cancelled |
| `isDefaultPrevented(): bool` | Whether the operation was cancelled |
| `stopPropagation(): void` | Halts remaining listeners for this event (does **not** cancel the operation) |
| `isPropagationStopped(): bool` | Whether propagation was stopped |
| `returnValue(mixed $returnValue): void` | Supplies a custom return value for the cancelled operation |
| `getReturnValue(): mixed` | The custom return value, if set |

**Event reference** (`vendor/yiisoft/active-record/src/Event/`):

| Event Class | When Triggered | Constructor Payload |
|---|---|---|
| `BeforeSave` | Before record is saved (inserted or updated) | `public ?array &$properties` (by reference) |
| `AfterSave` | After record has been saved | `$model` only |
| `BeforeInsert` | Before record is inserted | `public ?array &$properties` (by reference) |
| `AfterInsert` | After record has been inserted | `$model` only |
| `BeforeUpdate` | Before record is updated | `public ?array &$properties` (by reference) |
| `AfterUpdate` | After record has been updated | `public int &$count` (by reference; number of updated rows) |
| `BeforeDelete` | Before record is deleted | `$model` only |
| `AfterDelete` | After record has been deleted | `public int &$count` (by reference; number of deleted rows) |
| `BeforePopulate` | Before the model is populated with data | `public array &$data` (by reference) |
| `AfterPopulate` | After record attributes are populated | `public readonly array $data` |
| `BeforeUpsert` | Before record is upserted (inserted or updated) | `public ?array &$insertProperties`, `public array\|bool &$updateProperties` (by reference) |
| `AfterUpsert` | After record has been upserted | `$model` only |
| `BeforeCreateQuery` | Before the query for the model is created | `$model` only |
| `AfterCreateQuery` | After the query for the model has been created | `public readonly ActiveQueryInterface $query` |

> [!NOTE]
> The `&$properties`, `&$count`, `&$data`, `&$insertProperties`, `&$updateProperties` arguments are **by-reference** — listener mutations write back to the Active Record method's local variables and change the actual operation. `AfterDelete` also carries `&$count`, and `AfterPopulate` also carries `readonly $data` — these are not `$model`-only events.

**Emission mechanics** (`vendor/yiisoft/active-record/src/Trait/EventsTrait.php`):

- `EventsTrait` overrides `delete()`, `insert()`, `populateRecord()`, `query()`, `save()`, `update()`, and `upsert()`, and for each executes: dispatch **Before** → if `isDefaultPrevented()`, early-return (**After is NOT dispatched**) → run the actual operation → dispatch **After**.
- `save()` internally cascades into `insert()` / `update()`, so one `save()` call emits a **4-event sequence**: `BeforeSave` → `BeforeInsert`/`BeforeUpdate` → `AfterInsert`/`AfterUpdate` → `AfterSave`.
- `preventDefault()` skips the operation and suppresses the corresponding After event. A cancelled `delete()` or `update()` returns `getReturnValue() ?? 0`; a cancelled `insert()`/`save()`/`upsert()` returns nothing.
- `stopPropagation()` never cancels the AR operation — the trait never checks `isPropagationStopped()`; it only affects remaining listeners via the dispatcher.
- **Bulk operations `deleteAll()` / `updateAll()` bypass events entirely** (no trait overrides).

**Registration is opt-in.** The base `ActiveRecord` / `AbstractActiveRecord` classes do **not** include `EventsTrait` — a model must opt in explicitly:

```php
declare(strict_types=1);

namespace App\Model;

use Yiisoft\ActiveRecord\ActiveRecord;
use Yiisoft\ActiveRecord\Trait\EventsTrait;

final class Post extends ActiveRecord
{
    use EventsTrait;

    // ...properties and rules
}
```

Two wiring paths exist (`vendor/yiisoft/active-record/src/Event/EventDispatcherProvider.php`):

1. **Per-model attribute handlers.** `EventDispatcherProvider::get(static::class)` builds a dispatcher from PHP attributes on the model class and its properties (classes extending `Yiisoft\ActiveRecord\Event\Handler\AttributeHandlerProvider`). Built-in handlers: `SoftDelete`, `DefaultValue`, `DefaultValueOnInsert`, `DefaultDateTimeOnInsert`, `SetDateTimeOnUpdate`, `SetValueOnUpdate`.
2. **External dispatcher.** Attach any PSR-14 dispatcher for a target model class:

```php
declare(strict_types=1);

use App\Model\Post;
use Yiisoft\ActiveRecord\Event\AfterSave;
use Yiisoft\ActiveRecord\Event\BeforeSave;
use Yiisoft\ActiveRecord\Event\EventDispatcherProvider;
use Yiisoft\EventDispatcher\Dispatcher\Dispatcher;
use Yiisoft\EventDispatcher\Provider\ListenerCollection;
use Yiisoft\EventDispatcher\Provider\Provider;

$collection = (new ListenerCollection())
    ->add(
        static function (BeforeSave $event): void {
            // inspect / mutate $event->properties
        },
        BeforeSave::class,
    )
    ->add(
        static function (AfterSave $event): void {
            // post-persist side effects
        },
        AfterSave::class,
    );

EventDispatcherProvider::set(Post::class, new Dispatcher(new Provider($collection)));
// EventDispatcherProvider::reset(); removes all registered dispatchers
```

### 6.7. View Template Lifecycle (`yiisoft/view`, `View`)
| Event Class | Namespace | When Triggered | Public Properties & Accessors |
|---|---|---|---|
| `BeforeRender` | `Yiisoft\View\Event\View\BeforeRender` | Before rendering a view file | `$event->getView(): View`<br>`$event->getFile(): string`<br>`$event->getParameters(): array`<br>`$event->stopPropagation(): void`<br>`$event->isPropagationStopped(): bool` |
| `AfterRender` | `Yiisoft\View\Event\View\AfterRender` | After rendering a view file | `$event->getView(): View`<br>`$event->getFile(): string`<br>`$event->getParameters(): array`<br>`$event->getResult(): string` |
| `PageBegin` | `Yiisoft\View\Event\View\PageBegin` | At beginning of page layout rendering | Empty body; extends `ViewEvent`, inherits `getView(): View` |
| `PageEnd` | `Yiisoft\View\Event\View\PageEnd` | At end of page layout rendering | Empty body; extends `ViewEvent`, inherits `getView(): View` |

Notes:

- `BeforeRender` implements `StoppableEventInterface`; payload properties are private readonly and exposed through getters. Calling `stopPropagation()` **cancels rendering**: the view returns `false` from its pre-render check and `render()` then returns an empty string (`vendor/yiisoft/view/src/ViewTrait.php`).
- `AfterRender` implements `AfterRenderEventInterface` and is **not stoppable** — it has no propagation methods. Never describe or use it as a guard point.
- Events fire only when a dispatcher was injected into the view constructor (`new View(?string $basePath = null, ?EventDispatcherInterface $eventDispatcher = null)`; null-safe dispatch in `vendor/yiisoft/view/src/View.php`) — otherwise they are silently skipped.

### 6.8. Web View Lifecycle (`yiisoft/view`, `WebView`)

`Yiisoft\View\WebView` — the common web-application view class — emits a **separate, parallel event group** `Yiisoft\View\Event\WebView\*`. A listener registered for the `Yiisoft\View\Event\View\*` group **never fires** for `WebView` rendering, and vice versa: subscribing to the wrong group silently misses events.

Source: `vendor/yiisoft/view/src/Event/WebView/`, dispatch sites in `vendor/yiisoft/view/src/WebView.php`.

| Event Class | Namespace | When Triggered | Public Properties & Accessors |
|---|---|---|---|
| `BeforeRender` | `Yiisoft\View\Event\WebView\BeforeRender` | Before `WebView::render()` renders a view file | `$event->getView(): WebView`<br>`$event->getFile(): string`<br>`$event->getParameters(): array`<br>`$event->stopPropagation(): void`<br>`$event->isPropagationStopped(): bool` |
| `AfterRender` | `Yiisoft\View\Event\WebView\AfterRender` | After `WebView::render()` renders a view file | `$event->getView(): WebView`<br>`$event->getFile(): string`<br>`$event->getParameters(): array`<br>`$event->getResult(): string` |
| `PageBegin` | `Yiisoft\View\Event\WebView\PageBegin` | Emitted by `WebView::beginPage()` | Empty body; extends `WebViewEvent`, inherits `getView(): WebView` |
| `PageEnd` | `Yiisoft\View\Event\WebView\PageEnd` | Emitted by `WebView::endPage()` | Empty body; extends `WebViewEvent`, inherits `getView(): WebView` |
| `Head` | `Yiisoft\View\Event\WebView\Head` | Emitted by `WebView::head()` | Empty body; extends `WebViewEvent`, inherits `getView(): WebView` |
| `BodyBegin` | `Yiisoft\View\Event\WebView\BodyBegin` | Emitted by `WebView::beginBody()` | Empty body; extends `WebViewEvent`, inherits `getView(): WebView` |
| `BodyEnd` | `Yiisoft\View\Event\WebView\BodyEnd` | Emitted by `WebView::endBody()` | Empty body; extends `WebViewEvent`, inherits `getView(): WebView` |

Notes:

- `WebView\BeforeRender` implements `StoppableEventInterface` (payload private readonly, getters exposed); `WebView\AfterRender` implements `AfterRenderEventInterface` and is not stoppable — mirroring the `View` group semantics from [Section 6.7](#67-view-template-lifecycle-yiisoftview-view).
- `WebViewEvent` is an `@internal` abstract base class — do not extend it in application code; subscribe to the concrete event classes instead.

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
// Note: $eventClassNames is variadic; pass event classes positionally, or omit to
// auto-infer from the listener's first parameter type-hint
$collection = $collection->add(
    $myListener,
    OrderPlacedEvent::class,
);

// Or auto-infer event class(es) from the listener's first parameter:
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
// Signature: attach(EventDispatcherInterface $dispatcher): void
$compositeDispatcher->attach(
    dispatcher: $dispatcher,
);

// 7. Yiisoft\EventDispatcher\Provider\CompositeProvider::attach
// Signature: attach(ListenerProviderInterface $provider): void
$compositeProvider->attach(
    provider: $provider,
);

// 8. Yiisoft\Yii\Event\CallableFactory::create
// Signature: create(mixed $definition): callable (class is @internal)
$callable = $callableFactory->create(
    definition: $myListener,
);

// 9. Yiisoft\Yii\Event\ListenerCollectionFactory::create
// Signature: create(array $eventListeners): ListenerCollection
$collection = $factory->create(
    eventListeners: $eventsArray,
);

// 10. Yiisoft\Yii\Event\ListenerConfigurationChecker::check
// Signature: check(array $configuration): void
$checker->check(
    configuration: $eventsArray,
);
```

**Auto-inference rules for `ListenerCollection::add(listener: ...)`:**

- Inference triggers only when the variadic `$eventClassNames` is empty; the **first parameter of the callable** (any callable type, not strictly `__invoke`) is reflected and used as the event name (`vendor/yiisoft/event-dispatcher/src/Provider/ListenerCollection.php`).
- Union type-hints register the listener under **all** member class names.
- Callables with no parameters or an untyped first parameter throw `InvalidArgumentException`.
- Inference is a `ListenerCollection::add()` feature **only** — `ListenerCollectionFactory::create()` (the config pipeline) always uses the explicit config key.

> [!WARNING]
> **Official documentation drift:** some published `yiisoft/event-dispatcher` README examples call a nonexistent `$compositeProvider->add(...)`. The real API on `CompositeProvider` / `CompositeDispatcher` is `attach()`. There is no `ListenerProvider` class (the interface implementation is named `Provider`), and neither `Provider` nor `ListenerCollection` has `attach()`. Always trust `vendor/yiisoft/*/src/` over documentation snippets.

---

## 8. Testing Events & Listeners

`yiisoft/test-support` provides ready-made PSR-14 test doubles (`vendor/yiisoft/test-support/src/`):

### 8.1. SimpleEventDispatcher

`Yiisoft\Test\Support\EventDispatcher\SimpleEventDispatcher` implements `EventDispatcherInterface`, records every dispatched event, and honors `StoppableEventInterface` (a stopped event is still recorded — stoppability only suppresses listener invocation). It is the same double used by the official packages' own test suites (`yiisoft/yii-event`, `yiisoft/mailer`, `yiisoft/active-record`).

The full API reference — constructor, `getEvents()`, `getEventClasses()`, `clearEvents()`, and the `isClassTriggered()` / `isObjectTriggered()` / `isInstanceOfTriggered()` assertion family — is owned by the [Testing Guide](testing-core.md), section 3.1 (exact signatures: its section 7).

For events testing, the two most-used members:

- `getEventClasses(): string[]` — dispatched event class names in order; ideal for order assertions: `assertSame([OrderPlacedEvent::class], $dispatcher->getEventClasses())`.
- `isClassTriggered(string $class, ?int $times = null): bool` — exact-class assertion with an optional exact-count check: `isClassTriggered(OrderPlacedEvent::class, 1)`.

Inject the `SimpleEventDispatcher` instance wherever an `EventDispatcherInterface` is expected (constructor argument of the use case under test) to assert what was dispatched and in which order — e.g. that domain events were released strictly after the transaction committed (see [Section 5](#5-mandatory-post-commit-event-dispatching-rule)).

### 8.2. Testing Active Record Event Semantics

AR event behavior (veto, custom return values) is testable by wiring a `SimpleEventDispatcher` into `EventDispatcherProvider::set()` — the same technique used by `yiisoft/active-record`'s own test suite:

```php
// Category must use Yiisoft\ActiveRecord\Trait\EventsTrait (see Section 6.6)
EventDispatcherProvider::set(Category::class, new SimpleEventDispatcher(
    static function (object $event): void {
        if ($event instanceof BeforeInsert) {
            $event->preventDefault(); // veto the insert
        }
    },
));
$category = new Category();
$category->name = 'Prevented Category';

$category->insert();
$this->assertNull($category->id); // nothing was inserted
```

- **`tearDown()` must call `EventDispatcherProvider::reset()`:** the provider holds **static** per-model dispatchers — without the reset, the wiring leaks between tests and pollutes unrelated tests touching the same model class.
- **Prevent-`BeforeInsert` wiring:** the test double is registered per model class via `EventDispatcherProvider::set(Model::class, $dispatcher)`; its listener calls `$event->preventDefault()` on `BeforeInsert`, after which the model's `insert()` performs no insert and suppresses the corresponding `AfterInsert` event (see [Section 6.6](#66-active-record-lifecycle-yiisoftactive-record)).

### 8.3. SimpleContainer for Listener Resolution

`Yiisoft\Test\Support\Container\SimpleContainer` resolves listeners and their dependencies without the full application container: hand it a `definitions` array mapping container ids (e.g. `LoggerInterface::class`) to pre-built services, then resolve the listener class from it. Constructor options (`factory`/`hasCallback` closures), memoization behavior, and exception semantics are owned by the [Testing Guide](testing-core.md), section 3.5.

---

## 9. Anti-Pattern Matrix: Events & Listeners

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| ❌ **Calling `$this->trigger('eventName')`** | Legacy Yii2 Component mechanism. Yii3 domain models, controllers, and services do not extend `Component` and have no `trigger()` method. | ✅ Inject `Psr\EventDispatcher\EventDispatcherInterface` into constructor and call `$this->dispatcher->dispatch(new EventClass(...))`. |
| ❌ **Calling legacy static facade `Yii::$app->trigger(...)`** | Global static service locators (`Yii::$app`) do not exist in Yii3. | ✅ Inject `EventDispatcherInterface` explicitly via constructor autowiring. |
| ❌ **Using untyped string event names (`const EVENT_AFTER_LOGIN = 'afterLogin'`)** | Yii2 legacy string constants; impossible to refactor safely or type-check statically. | ✅ Define typed event classes: `new UserLoggedInEvent($user)`. |
| ❌ **Extending legacy `yii\base\Event`** | In Yii3, application events are pure PHP DTOs and do not extend any framework base class. (Package-local bases such as `AbstractEvent` or `ViewEvent` are framework internals — do not build app events on them.) | ✅ Define a pure PHP class: `final readonly class OrderPlacedEvent { ... }`. |
| ❌ **Dispatching external side-effects inside an open DB transaction (`$db->transaction()`)** | Causes irreversible side effects (emails sent, SMS sent, jobs queued) if the transaction subsequently fails or rolls back. | ✅ Collect events inside the Aggregate Root (`recordEvent()`) and dispatch post-commit via `releaseEvents()`. |
| ❌ **Fat Listeners containing direct DB transactions and complex mutations** | Violates Single Responsibility Principle and couples event listeners to storage internals. | ✅ Listeners should invoke dedicated Application Use Cases or dispatch async Queue jobs. |
| ❌ **Passing Active DB Connections, open sockets, or ContainerInterface inside Event DTOs** | Bloats memory, breaks serialization (e.g. queue workers, audit logs), and creates tight coupling. | ✅ Include only primitive scalars, UUIDs/IDs, and immutable Value Objects in Event DTOs. |
| ❌ **Throwing unhandled recoverable exceptions in normal event listeners** | Halts the PSR-14 dispatch loop and prevents subsequent listeners for the event from executing. | ✅ Catch and log recoverable errors inside the listener, or dispatch a retry job to a queue. |
| ❌ **Calling non-existent `ListenerProvider::attach()`** | Hallucinated method. `ListenerCollection` is immutable (`add()` returns a clone); only `CompositeProvider` has `attach()`. Beware: some official README examples contain this drift (`$compositeProvider->add(...)`). | ✅ Register listeners declaratively in the event config group or call `$collection->add()`. |
| ❌ **Putting event listener configurations directly in `config/di.php`** | Pollutes DI container definitions; `yiisoft/yii-event` resolves listeners via the group named by the `eventsConfigGroup` parameter. Shipped defaults are `events-web` / `events-console`; bare `events` is the app template's common upstream group merged into both via the `$events` reference — it is never an `eventsConfigGroup` value. | ✅ Put listener configurations in `config/common/events.php` or `config/web/events.php` (see Section 4.1). |
| ❌ **Using stateful listeners across requests in RoadRunner or FrankenPHP workers** | In persistent worker runtimes, listener instances remain in memory across requests, causing cross-request data leaks. | ✅ Keep listeners strictly stateless; inject shared services via `__construct()` and process only the passed `$event`. |
| ❌ **Mutating events to pass arbitrary data between unrelated listeners** | Creates fragile coupling and unmaintainable dependencies on listener execution order. | ✅ Events represent immutable facts; use an explicit pipeline or workflow pattern if sequential data transformation is needed. |
| ❌ **In-place mutation assumption: calling `$collection->add($listener)` without assignment** | `ListenerCollection` is immutable. `add()` creates and returns a cloned instance, leaving `$collection` unchanged. | ✅ Always reassign the result: `$collection = $collection->add($listener);`. |
| ❌ **Overriding legacy `ActiveRecord::beforeSave()` or `behaviors()` in models** | Yii3 Active Record models do not use `beforeSave()` or `behaviors()`. Moreover, AR events are **opt-in**: the base classes do not dispatch anything until the model uses `EventsTrait` (or a dispatcher is attached via `EventDispatcherProvider::set()`), and bulk `deleteAll()` / `updateAll()` bypass events entirely. | ✅ Add `use Yiisoft\ActiveRecord\Trait\EventsTrait;` to the model, then subscribe to PSR-14 `Yiisoft\ActiveRecord\Event\BeforeSave` (see Section 6.6) or use domain events released post-commit. |
