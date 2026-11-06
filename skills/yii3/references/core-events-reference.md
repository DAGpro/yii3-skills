# Yii3 Events Reference: Framework Events, Signatures & Testing

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Part of the [Events & Listeners Guide](core-events-and-listeners.md) split — design rules, configuration, the post-commit rule, and the anti-pattern matrix live in the parent and [core-events-design.md](core-events-design.md).

## 6. Official Yii3 Framework Events Reference

Official packages emit standard PSR-14 events. Listeners can be attached in the event configuration groups described in [Section 4.1](core-events-design.md#41-configuration-architecture--scopes).

> [!IMPORTANT]
> **Optional dispatcher pitfall:** several official emitters accept `?EventDispatcherInterface $eventDispatcher = null` and dispatch null-safe — when no dispatcher is wired, their events are **silently skipped** (no error, no log). Examples: `yiisoft/yii-http`'s `Application` lifecycle events and `yiisoft/mailer`'s `BaseMailer`. Not all emitters are optional, though: `yiisoft/user`'s `CurrentUser` requires the dispatcher (constructor-promoted, no default), Active Record's `EventsTrait` resolves its dispatcher via `EventDispatcherProvider::get()` (never null), and `yiisoft/yii-console`'s `Application` receives its dispatcher through `setDispatcher()`. Verify the dispatcher is actually injected (via the `yiisoft/yii-event` wiring from [Section 1](core-events-design.md#1-psr-14-event-architecture-in-yii3)) before debugging "missing" events.

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
- **Mutation trap:** the `BeforeSend` payload and the message `send()` transmits are the **same instance** — there is no local-copy shadowing. The "no effect" comes from message immutability instead: `with*()` methods on `MessageInterface` return new detached copies, so calling `$event->message->with...()` inside a listener leaves the original (sent) message unchanged (and `$event->message` itself is `readonly`). To change what goes out, send a new message yourself; to suppress sending, use the veto flag above.

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

Inject the `SimpleEventDispatcher` instance wherever an `EventDispatcherInterface` is expected (constructor argument of the use case under test) to assert what was dispatched and in which order — e.g. that domain events were released strictly after the transaction committed (see [Section 5](core-events-design.md#5-mandatory-post-commit-event-dispatching-rule)).

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
