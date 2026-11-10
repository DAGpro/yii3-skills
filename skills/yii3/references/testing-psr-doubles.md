# Yii3 Testing: Ready-Made PSR Test Doubles (`yiisoft/test-support`)

> **Package:** `yiisoft/test-support` (PHP 8.2+)  
> **Complements:** [`testing-core.md`](testing-core.md) (Architecture, PHPUnit 10/11, Mocking), [`testing-http.md`](testing-http.md), [`core-events-reference.md`](core-events-reference.md)

---

## Table of Contents

- [1. Overview & Verification Philosophy](#1-overview--verification-philosophy)
- [2. PSR-14 Event Dispatcher (`SimpleEventDispatcher`)](#2-psr-14-event-dispatcher-simpleeventdispatcher)
- [3. PSR-3 Logger (`SimpleLogger`)](#3-psr-3-logger-simplelogger)
- [4. PSR-16 Simple Cache (`MemorySimpleCache` & `SimpleCacheActionLogger`)](#4-psr-16-simple-cache-memorysimplecache--simplecacheactionlogger)
- [5. PSR-20 Clock (`StaticClock`)](#5-psr-20-clock-staticclock)
- [6. PSR-11 Container (`SimpleContainer`)](#6-psr-11-container-simplecontainer)
- [7. PSR-7 Stream (`StringStream`)](#7-psr-7-stream-stringstream)
- [8. Test Doubles Signatures Reference](#8-test-doubles-signatures-reference)
- [9. Anti-Pattern Matrix: Test Doubles](#9-anti-pattern-matrix-test-doubles)
- [10. Related Guides](#10-related-guides)

---

## 1. Overview & Verification Philosophy

Rather than writing complex mock configurations or fragile anonymous classes for standard PSR interfaces, use the official, verified test doubles from `yiisoft/test-support`.

These doubles are fully typed, in-memory, deterministic implementations designed specifically for unit and integration testing without external dependencies (no Redis, no filesystem, no database, no real system clock).

---

## 2. PSR-14 Event Dispatcher (`SimpleEventDispatcher`)

`Yiisoft\Test\Support\EventDispatcher\SimpleEventDispatcher` implements `Psr\EventDispatcher\EventDispatcherInterface`:

```php
declare(strict_types=1);

namespace App\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Psr\EventDispatcher\StoppableEventInterface;
use Yiisoft\Test\Support\EventDispatcher\SimpleEventDispatcher;

final class UserRegisteredEvent implements StoppableEventInterface
{
    public function __construct(
        public readonly string $userId,
        private bool $stopped = false,
    ) {}

    public function isPropagationStopped(): bool
    {
        return $this->stopped;
    }
}

final class SimpleEventDispatcherTest extends TestCase
{
    public function testRecordsAndVerifiesDispatchedEvents(): void
    {
        // 1. Instantiate (accepts optional Closure listeners: Closure ...$listeners)
        $eventDispatcher = new SimpleEventDispatcher();

        // 2. Dispatch event during test execution
        $event = new UserRegisteredEvent(userId: '0192e210-4567-7890-a123-456789abcdef');
        $eventDispatcher->dispatch($event);

        // 3. Inspect dispatched events
        $events = $eventDispatcher->getEvents(); // list<object>
        $eventClasses = $eventDispatcher->getEventClasses(); // list<class-string>

        $this->assertCount(1, $events);
        $this->assertSame([UserRegisteredEvent::class], $eventClasses);

        // 4. Verification helpers:
        // isClassTriggered uses strict exact class equality ($event::class === $class)
        $this->assertTrue($eventDispatcher->isClassTriggered(UserRegisteredEvent::class));
        $this->assertTrue($eventDispatcher->isClassTriggered(class: UserRegisteredEvent::class, times: 1));

        // isInstanceOfTriggered supports interfaces and parent classes ($event instanceof $class)
        $this->assertTrue($eventDispatcher->isInstanceOfTriggered(class: StoppableEventInterface::class));

        // isObjectTriggered uses strict instance identity ($event === $e)
        $this->assertTrue($eventDispatcher->isObjectTriggered(event: $event, times: 1));

        // 5. Reset between steps if needed
        $eventDispatcher->clearEvents();
        $this->assertCount(0, $eventDispatcher->getEvents());
    }
}
```

> [!NOTE]
> Even if an event implements `StoppableEventInterface` and returns `isPropagationStopped() === true`, `SimpleEventDispatcher` **still records the event** in `$eventDispatcher->getEvents()`. Stoppability only suppresses listener invocation.

For the events-specific testing strategy — PSR-14 architecture context, Active Record event testing via `EventDispatcherProvider::set()`, and asserting that domain events were released strictly after a transaction commit — see the [Events Reference Guide](core-events-reference.md), [section 8](core-events-reference.md#8-testing-events--listeners).

---

## 3. PSR-3 Logger (`SimpleLogger`)

`Yiisoft\Test\Support\Log\SimpleLogger` implements `Psr\Log\LoggerInterface`:

```php
declare(strict_types=1);

namespace App\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Psr\Log\LogLevel;
use Yiisoft\Test\Support\Log\SimpleLogger;

final class SimpleLoggerTest extends TestCase
{
    public function testLogsAndInterpolatesMessages(): void
    {
        $logger = new SimpleLogger();

        // Execute business logic that logs messages
        $logger->info('User {userId} signed in successfully.', ['userId' => 'usr_123']);
        $logger->error('Database connection failed.');

        // Inspect recorded messages
        // getMessages() returns list<array{level: string, message: string, context: array}>
        $messages = $logger->getMessages();

        $this->assertCount(2, $messages);
        $this->assertSame(LogLevel::INFO, $messages[0]['level']);
        // Placeholders matching /{([\w.]+)}/ are interpolated from top-level context keys only:
        // dotted-path placeholders match the pattern but never traverse nested context arrays.
        $this->assertSame('User usr_123 signed in successfully.', $messages[0]['message']);
        $this->assertSame(['userId' => 'usr_123'], $messages[0]['context']);

        $this->assertSame(LogLevel::ERROR, $messages[1]['level']);
        $this->assertSame('Database connection failed.', $messages[1]['message']);
    }
}
```

> [!CAUTION]
> **Trap:** `SimpleLogger` has **NO** `hasMessage()` method and **NO** `clear()` / `clearMessages()` method.
> - Calling `$logger->hasMessage(...)` throws a fatal `Error: Call to undefined method`. Always inspect `$logger->getMessages()`.
> - If you need a clean logger state between test steps, instantiate a fresh `$logger = new SimpleLogger()`.

---

## 4. PSR-16 Simple Cache (`MemorySimpleCache` & `SimpleCacheActionLogger`)

`Yiisoft\Test\Support\SimpleCache\MemorySimpleCache` provides an in-memory array-backed cache:

```php
declare(strict_types=1);

namespace App\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Yiisoft\Test\Support\SimpleCache\Action;
use Yiisoft\Test\Support\SimpleCache\MemorySimpleCache;
use Yiisoft\Test\Support\SimpleCache\SimpleCacheActionLogger;

final class MemorySimpleCacheTest extends TestCase
{
    public function testCacheOperationsAndActionLogging(): void
    {
        // 1. In-memory cache pre-seeded with test data
        $cache = new MemorySimpleCache(['cached_rate' => 1.25]);

        $this->assertTrue($cache->has('cached_rate'));
        $this->assertSame(1.25, $cache->get('cached_rate'));

        $cache->set(key: 'new_key', value: 'secret', ttl: 3600);
        $this->assertSame('secret', $cache->get('new_key'));

        // getValues() returns full dictionary of stored values
        $this->assertSame(['cached_rate' => 1.25, 'new_key' => 'secret'], $cache->getValues());

        // 2. Action Logger decorator (records calls to get, set, delete, clear, has)
        $actionLogger = new SimpleCacheActionLogger($cache);
        $actionLogger->get('new_key');
        $actionLogger->delete('cached_rate');

        $actions = $actionLogger->getActions(); // list<Action>
        $this->assertCount(2, $actions);

        // ALWAYS use Action constants rather than magic strings!
        $this->assertSame(Action::GET, $actions[0]->getAction());
        $this->assertSame('new_key', $actions[0]->getKey());
        $this->assertSame(Action::DELETE, $actions[1]->getAction());
        $this->assertSame('cached_rate', $actions[1]->getKey());

        // Compact inspection via getActionKeyList() -> list<array{0: string, 1: mixed}>
        $this->assertSame(
            [[Action::GET, 'new_key'], [Action::DELETE, 'cached_rate']],
            $actionLogger->getActionKeyList(),
        );
    }

    public function testSimulatesBackendCacheFailures(): void
    {
        $cache = new MemorySimpleCache();

        // Simulate write, delete, or clear failures using public resilience properties
        $cache->returnOnSet = false;
        $this->assertFalse($cache->set('key', 'value'));

        $cache->returnOnDelete = false;
        $this->assertFalse($cache->delete('key'));

        $cache->returnOnClear = false;
        $this->assertFalse($cache->clear());
    }
}
```

> [!CAUTION]
> **Traps:**
> - `SimpleCacheActionLogger` has **NO** `clearActions()` method. To record fresh actions, instantiate a new `SimpleCacheActionLogger` wrapper.
> - `Action` tracks `$action`, `$key`, `$value`, and `$ttl`. It does **NOT** track `$default` and has **NO** `getDefault()` method.

---

## 5. PSR-20 Clock (`StaticClock`)

`Yiisoft\Test\Support\Clock\StaticClock` implements `Psr\Clock\ClockInterface` for deterministic time testing:

```php
declare(strict_types=1);

namespace App\Tests\Unit;

use DateTimeImmutable;
use PHPUnit\Framework\TestCase;
use Yiisoft\Test\Support\Clock\StaticClock;

final class StaticClockTest extends TestCase
{
    public function testReturnsFrozenTime(): void
    {
        $frozenNow = new DateTimeImmutable('2026-10-22 12:00:00');
        $clock = new StaticClock($frozenNow);

        $this->assertSame('2026-10-22 12:00:00', $clock->now()->format('Y-m-d H:i:s'));
    }

    public function testSimulatesAdvancingTime(): void
    {
        $startTime = new DateTimeImmutable('2026-10-22 12:00:00');
        $clock = new StaticClock($startTime);

        // StaticClock is strictly immutable! It has NO modify() or set() method.
        // To advance time, instantiate a new StaticClock with the modified DateTimeImmutable:
        $futureClock = new StaticClock($startTime->modify('+15 minutes'));

        $this->assertSame('2026-10-22 12:15:00', $futureClock->now()->format('Y-m-d H:i:s'));
    }
}
```

---

## 6. PSR-11 Container (`SimpleContainer`)

`Yiisoft\Test\Support\Container\SimpleContainer` provides a lightweight PSR-11 container without loading full configuration files:

```php
declare(strict_types=1);

namespace App\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Yiisoft\Test\Support\Container\Exception\NotFoundException;
use Yiisoft\Test\Support\Container\SimpleContainer;

interface DummyServiceInterface
{
    public function getName(): string;
}

final class DummyService implements DummyServiceInterface
{
    public function getName(): string
    {
        return 'synthesized';
    }
}

final class SimpleContainerTest extends TestCase
{
    public function testContainerResolutionAndDynamicFactory(): void
    {
        // 1. Static pre-registered definitions
        $mockService = $this->createMock(DummyServiceInterface::class);
        $mockService->method('getName')->willReturn('mocked');

        $container = new SimpleContainer([
            DummyServiceInterface::class => $mockService,
        ]);

        $this->assertTrue($container->has(DummyServiceInterface::class));
        $this->assertSame($mockService, $container->get(DummyServiceInterface::class));

        // 2. Dynamic synthesis with fallback $factory and $hasCallback closures
        $dynamicContainer = new SimpleContainer(
            definitions: [],
            factory: static function (string $id): object {
                if ($id === DummyServiceInterface::class) {
                    return new DummyService();
                }
                throw new NotFoundException($id);
            },
            hasCallback: static fn(string $id): bool => $id === DummyServiceInterface::class,
        );

        $this->assertTrue($dynamicContainer->has(DummyServiceInterface::class));
        $service = $dynamicContainer->get(DummyServiceInterface::class);
        $this->assertSame('synthesized', $service->getName());

        // Dynamic results are memoized in definitions
        $this->assertSame($service, $dynamicContainer->get(DummyServiceInterface::class));

        // Unregistered service throws NotFoundException with getId()
        $this->expectException(NotFoundException::class);
        $dynamicContainer->get('non_existent');
    }
}
```

---

## 7. PSR-7 Stream (`StringStream`)

`Yiisoft\Test\Support\HttpMessage\StringStream` implements `Psr\Http\Message\StreamInterface` with string content:

```php
declare(strict_types=1);

namespace App\Tests\Unit;

use PHPUnit\Framework\TestCase;
use RuntimeException;
use Yiisoft\Test\Support\HttpMessage\StringStream;

final class StringStreamTest extends TestCase
{
    public function testStreamInspectionAndRewind(): void
    {
        $stream = new StringStream('{"status":"active"}');

        $this->assertSame(19, $stream->getSize());
        $this->assertSame('{"status":"active"}', $stream->getContents());
        $this->assertTrue($stream->isSeekable());
        $this->assertFalse($stream->isClosed());
        $this->assertFalse($stream->isDetached());
        $this->assertSame(19, $stream->getPosition());

        // Stream reading advances pointer; rewinding resets it
        $this->assertSame('', $stream->getContents());
        $stream->rewind();
        $this->assertSame(0, $stream->getPosition());
        $this->assertSame('{"status":"active"}', $stream->getContents());

        $stream->close();
        $this->assertTrue($stream->isClosed());
    }

    public function testEdgeCaseTestingWithConfigurableFlags(): void
    {
        // Test error handling in middlewares by configuring unreadable, unseekable, or unwritable streams
        $unreadableStream = new StringStream(
            content: 'data',
            readable: false,
            writable: false,
            seekable: false,
        );

        $this->assertFalse($unreadableStream->isReadable());
        $this->assertFalse($unreadableStream->isWritable());
        $this->assertFalse($unreadableStream->isSeekable());

        $this->expectException(RuntimeException::class);
        $unreadableStream->read(4);
    }
}
```

---

## 8. Test Doubles Signatures Reference

```php
// SimpleEventDispatcher
public function __construct(\Closure ...$listeners);
public function dispatch(object $event): object;
public function getEvents(): array;
public function getEventClasses(): array;
public function isClassTriggered(string $class, ?int $times = null): bool;
public function isInstanceOfTriggered(string $class, ?int $times = null): bool;
public function isObjectTriggered(object $event, ?int $times = null): bool;
public function clearEvents(): void;

// SimpleLogger
public function getMessages(): array;

// MemorySimpleCache
public function __construct(array $cacheData = []);
public function getValues(): array;

// StaticClock
public function __construct(\DateTimeImmutable $now);
public function now(): \DateTimeImmutable;

// SimpleContainer
public function __construct(array $definitions = [], ?\Closure $factory = null, ?\Closure $hasCallback = null);

// StringStream
public function __construct(string $content = '', int $position = 0, bool $readable = true, bool $writable = true, bool $seekable = true, \Closure|array|null $metadata = null);
```

---

## 9. Anti-Pattern Matrix: Test Doubles

| Anti-Pattern | Why It Fails | Idiomatic Yii3 Replacement |
|---|---|---|
| **Mocking PSR interfaces with complex PHPUnit `createMock()`** | Fragile mock setups that break on minor interface changes and don't record invocations reliably. | Use dedicated doubles from `yiisoft/test-support` (`SimpleEventDispatcher`, `SimpleLogger`, `MemorySimpleCache`, `StaticClock`). |
| **Calling `$logger->hasMessage(...)` on `SimpleLogger`** | Method does not exist; throws fatal `Error: Call to undefined method`. | Inspect `$logger->getMessages()` directly or assert on `$messages[0]['message']`. |
| **Attempting to modify `StaticClock` with `$clock->modify()`** | `StaticClock` is strictly immutable and has no mutation methods. | Create a new `StaticClock` instance: `new StaticClock($startTime->modify('+15 minutes'))`. |
| **Calling `$actionLogger->clearActions()` on `SimpleCacheActionLogger`** | Method does not exist; throws fatal `Error`. | Instantiate a new `SimpleCacheActionLogger($cache)` wrapper for a fresh action record. |
| **Assuming `SimpleEventDispatcher` ignores stopped events** | `SimpleEventDispatcher` records ALL dispatched events, even if `isPropagationStopped() === true`. | Check event recording via `$eventDispatcher->isClassTriggered(...)`; stoppable only suppresses listener callbacks. |

---

## 10. Related Guides

- [Testing Architecture & Quality Gates](testing-core.md) — Pyramids, PHPUnit 10/11 rules, use case and domain tests
- [Functional HTTP Testing](testing-http.md) — Testing PSR-15 middlewares, controllers, and endpoints
- [Database Testing](testing-database.md) — Testing migrations, repositories, and fixtures with in-memory SQLite / real DB
- [Events Design & Dispatch](core-events-design.md) — PSR-14 event architecture and transaction boundaries
- [Events Reference](core-events-reference.md) — Event listening, event hierarchy, testing event listeners
