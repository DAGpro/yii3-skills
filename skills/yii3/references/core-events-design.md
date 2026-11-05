# Yii3 Events & Listeners: Design, Configuration & Post-Commit Rule

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Part of the [Events & Listeners Guide](core-events-and-listeners.md) split — the anti-pattern matrix lives there.

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

- When registering **programmatically** via `ListenerCollection::add()`, the event argument type-hint is auto-inferred from the listener's first parameter when no event class names are passed (see [Section 7](persistence-db-readers-and-drivers.md#7-php-8-named-arguments--signatures-reference)).
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
> For the complete `transaction()` reference — the closure contract (zero-argument closures are accepted), the isolation-level second argument forwarded to `beginTransaction()`, and the `TransactionInterface` isolation-constant catalog — see the [Database Guide, §4.1](persistence-db-connection-and-queries.md#41-idiomatic-closure-transactions-transaction) and [§4.3](persistence-db-connection-and-queries.md#43-isolation-levels--post-commit-event-rule).

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
