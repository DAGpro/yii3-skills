# Yii3 Testing: Architecture, Runners, PSR Doubles & Quality Gates

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Practical guide for Yii3 test architecture, the PHPUnit test runner, PSR test doubles from `yiisoft/test-support`, modern mocking rules, domain validation testing, fixture generation, and unit test suites. Alternative runners (Testo, Codeception), Infection mutation testing, and console command testing are owned by dedicated companion guides — see the runner-selection note in [§2](#2-test-runner-ecosystem--quality-gates).

---

> **TL;DR:** Layer boundaries & runner selection (§1–§2); ready-made PSR test doubles from `yiisoft/test-support` (§3); mocking rules & AI pitfalls (§4); unit-testing use cases, validation, fixtures & state isolation (§5).
> **Read in full when:** designing the project's test architecture, choosing a runner, or writing domain/use-case unit tests with mocks.

## Table of Contents
- [1. Testing Pyramid & Layer Boundaries](#1-testing-pyramid--layer-boundaries)
- [2. Test Runner Ecosystem & Quality Gates](#2-test-runner-ecosystem--quality-gates)
  - [2.1. PHPUnit (PHPUnit 10 and 11)](#21-phpunit-phpunit-10-and-11)
- [3. Ready-Made PSR Test Doubles (`yiisoft/test-support`)](#3-ready-made-psr-test-doubles-yiisofttest-support)
  - [3.1. PSR-14 Event Dispatcher (`SimpleEventDispatcher`)](#31-psr-14-event-dispatcher-simpleeventdispatcher)
  - [3.2. PSR-3 Logger (`SimpleLogger`)](#32-psr-3-logger-simplelogger)
  - [3.3. PSR-16 Simple Cache (`MemorySimpleCache` & `SimpleCacheActionLogger`)](#33-psr-16-simple-cache-memorysimplecache--simplecacheactionlogger)
  - [3.4. PSR-20 Clock (`StaticClock`)](#34-psr-20-clock-staticclock)
  - [3.5. PSR-11 Container (`SimpleContainer`)](#35-psr-11-container-simplecontainer)
  - [3.6. PSR-7 Stream (`StringStream`)](#36-psr-7-stream-stringstream)
- [4. Mocking Strategies, PHPUnit 10/11 Rules & AI Pitfalls](#4-mocking-strategies-phpunit-1011-rules--ai-pitfalls)
  - [4.1. Core Philosophy: What to Mock vs. What NOT to Mock](#41-core-philosophy-what-to-mock-vs-what-not-to-mock)
  - [4.2. Common AI Model Hallucinations in PHPUnit 10/11 (Dead APIs)](#42-common-ai-model-hallucinations-in-phpunit-1011-dead-apis)
  - [4.3. Idiomatic PHPUnit 10/11 Mocking Patterns](#43-idiomatic-phpunit-1011-mocking-patterns)
  - [4.4. Mocking in Testo via Mockery (`php-testo/bridge-mockery`)](#44-mocking-in-testo-via-mockery-php-testobridge-mockery)
- [5. Unit Testing Use Cases, Validation, Fixtures & State Isolation](#5-unit-testing-use-cases-validation-fixtures--state-isolation)
  - [5.1. Unit Testing Application Use Cases (Zero-Shot Compilable)](#51-unit-testing-application-use-cases-zero-shot-compilable)
  - [5.2. Unit Testing Domain Validation (`yiisoft/validator`)](#52-unit-testing-domain-validation-yiisoftvalidator)
  - [5.3. Test Fixture Assembly via `yiisoft/factory`](#53-test-fixture-assembly-via-yiisoftfactory)
  - [5.4. Container State Isolation via `yiisoft/di` (`StateResetter`)](#54-container-state-isolation-via-yiisoftdi-stateresetter)
- [6. Testing Console Commands (`yiisoft/yii-console`)](#6-testing-console-commands-yiisoftyii-console)
- [7. Master PHP 8 Named Arguments & Signatures Reference](#7-master-php-8-named-arguments--signatures-reference)
- [8. Comprehensive Anti-Pattern Matrix](#8-comprehensive-anti-pattern-matrix)
- [9. Related Guides](#9-related-guides)

---

## 1. Testing Pyramid & Layer Boundaries

Yii3 applications are structured around clean boundaries, explicit dependency injection, and PSR contracts. Testing follows a strict pyramid:

```text
       /\
      /  \     Functional HTTP Tests (`yiisoft/yii-testing` / `HttpApplicationRunner`)
     /----\    Verify HTTP routing, middlewares, request parsing, status codes, JSON/HTML responses
    /      \   
   /--------\  Integration Tests (`yiisoft/db-sqlite`, `yiisoft/db-migration`, Console Commands)
  /          \ Verify SQL queries, transactions, migrations, cache adapters, and CLI commands
 /------------\
/  Unit Tests  \ Pure Domain Entities, Value Objects, Use Cases, Handlers, Validators
---------------- Zero framework overhead; mock dependencies or use `yiisoft/test-support` doubles
```

### Layer Responsibilities

| Test Layer | Target Components | Tools & Dependencies | Speed | Guide Reference |
|---|---|---|---|---|
| **Unit** | Domain entities, Value Objects, Application Use Cases, Validators, Formatters | `phpunit/phpunit`, `yiisoft/test-support`, `yiisoft/validator`, `yiisoft/factory` | Sub-millisecond | This guide (`testing-core.md`) |
| **Console Integration** | Console commands, CLI input/output, ExitCode constants, interactive prompts | `Symfony\Component\Console\Tester\CommandTester`, `yiisoft/yii-console` | Fast | [`testing-console.md`](testing-console.md) |
| **Database Integration** | Repositories, Migrations, Database queries, Cache stores | `yiisoft/db-sqlite`, `yiisoft/db-migration` | Fast (in-memory SQLite) | [`testing-database.md`](testing-database.md) |
| **Functional HTTP** | End-to-end HTTP pipeline, routing, middleware stacks, request handlers | `yiisoft/yii-testing`, `yiisoft/yii-runner-http`, `codeception/codeception` | Moderate (in-memory HTTP runner) | [`testing-http.md`](testing-http.md) |

---

## 2. Test Runner Ecosystem & Quality Gates

Yii3 projects support modern PHP test runners: `phpunit/phpunit` serves as the ecosystem standard, while `testo/testo` is an ultra-fast, modern alternative.

**Runner selection — resolve what is installed via the project's `composer.json` (see [package-catalog.md, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family)):**

- **PHPUnit vs. Testo = mutually exclusive.** A project uses `phpunit/phpunit` XOR `testo/testo` — never both (binary/plugin conflicts; `yiisoft/yii-testing` requires PHPUnit). The full exclusive-runner rule is owned by the [Testo Runner Guide, §1](testing-testo.md#1-the-exclusive-runner-rule-phpunit-xor-testo); PHPUnit is covered in [§2.1](#21-phpunit-phpunit-10-and-11) below.
- **Codeception = alternative actor-driven test framework**, mutually exclusive with plain PHPUnit/Testo suite setups — owned by the [Codeception Testing Guide](testing-codeception.md).
- **Infection = optional mutation-testing quality gate** layered on top of the chosen runner (not an alternative runner) — owned by the [Mutation Testing Guide](testing-infection.md).

### 2.1. PHPUnit (PHPUnit 10 and 11)

PHPUnit is the primary test runner across all official `yiisoft/*` packages, `yiisoft/yii-testing`, and standard Yii3 skeletons.

#### Installation
```bash
composer require --dev phpunit/phpunit
```

#### Configuration (`phpunit.xml.dist`)
Modern Yii3 configurations use the PHPUnit 10/11 XML schema:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="vendor/autoload.php"
         cacheDirectory=".phpunit.cache"
         colors="true"
         executionOrder="depends,defects"
         beStrictAboutOutputDuringTests="true"
         failOnRisky="true"
         failOnWarning="true"
         displayDetailsOnPhpunitDeprecations="true"
         displayDetailsOnTestsThatTriggerWarnings="true">
    <testsuites>
        <testsuite name="Unit">
            <directory>tests/Unit</directory>
        </testsuite>
        <testsuite name="Integration">
            <directory>tests/Integration</directory>
        </testsuite>
        <testsuite name="Functional">
            <directory>tests/Functional</directory>
        </testsuite>
    </testsuites>
    <source>
        <include>
            <directory suffix=".php">src</directory>
        </include>
        <exclude>
            <directory>src/Debug</directory>
        </exclude>
    </source>
    <coverage>
        <report>
            <clover outputFile="coverage.xml"/>
            <html outputDirectory=".phpunit.cache/html"/>
        </report>
    </coverage>
</phpunit>
```

#### Test Structure in PHPUnit
Tests extend `PHPUnit\Framework\TestCase` and use PHP 8 attributes (`#[Test]`, `#[DataProvider]`, `#[TestWith]`):

```php
declare(strict_types=1);

namespace App\Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\Attributes\TestWith;
use PHPUnit\Framework\TestCase;

final class PriceCalculator
{
    public function applyDiscount(float $price, float $discount): float
    {
        return $price * (1.0 - $discount);
    }
}

final class PriceCalculatorTest extends TestCase
{
    #[Test]
    #[DataProvider('priceDataProvider')]
    public function calculatesDiscountCorrectly(float $price, float $discount, float $expected): void
    {
        $calculator = new PriceCalculator();
        $actual = $calculator->applyDiscount($price, $discount);

        $this->assertSame($expected, $actual);
    }

    #[Test]
    #[TestWith([100.0, 0.05, 95.0])]
    #[TestWith([200.0, 0.50, 100.0])]
    public function calculatesInlineDiscount(float $price, float $discount, float $expected): void
    {
        $calculator = new PriceCalculator();
        $this->assertSame($expected, $calculator->applyDiscount($price, $discount));
    }

    /**
     * Data providers in PHPUnit 10/11 MUST be public static methods.
     *
     * @return array<string, array{0: float, 1: float, 2: float}>
     */
    public static function priceDataProvider(): array
    {
        return [
            'ten_percent' => [100.0, 0.10, 90.0],
            'zero_discount' => [50.0, 0.0, 50.0],
        ];
    }
}
```

#### Execution
```bash
vendor/bin/phpunit --testdox
# Via composer script:
composer test
```

---

> [!TIP]
> **Testo Runner Reference:**
> For the complete reference on the Testo runner — the mandatory exclusive runner rule (PHPUnit XOR Testo), installation, `testo.php` configuration, `#[Test]` classes with `Testo\Assert`, in-memory functional HTTP testing via `HttpApplicationRunner::runAndGetResponse()`, and execution — see the [Testo Runner Guide](testing-testo.md).

---

> [!TIP]
> **Codeception Reference:**
> For the complete reference on Codeception 5 — installation, `codeception.yml` and suite configuration, actor roles (`ConsoleTester`, `ApiTester`, `UnitTester`, `FunctionalTester`), Cest implementation, and REST-module API testing — see the [Codeception Testing Guide](testing-codeception.md).

---

> [!TIP]
> **Mutation Testing Reference:**
> For the complete reference on Infection mutation testing — role and architecture, installation, canonical `infection.json.dist`, the `testo/bridge-infection` bridge, and execution with MSI thresholds — see the [Mutation Testing Guide](testing-infection.md).

---

## 3. Ready-Made PSR Test Doubles (`yiisoft/test-support`)

Rather than writing complex mock configurations or custom doubles for standard PSR interfaces, use the official, verified test doubles from `yiisoft/test-support`.

### 3.1. PSR-14 Event Dispatcher (`SimpleEventDispatcher`)

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

Events-specific testing strategy — PSR-14 architecture context, Active Record event testing via `EventDispatcherProvider::set()`, and asserting that domain events were released strictly after a transaction commit — is owned by the [Events & Listeners Guide](core-events-and-listeners.md), section 8.

---

### 3.2. PSR-3 Logger (`SimpleLogger`)

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

### 3.3. PSR-16 Simple Cache (`MemorySimpleCache` & `SimpleCacheActionLogger`)

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

### 3.4. PSR-20 Clock (`StaticClock`)

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

### 3.5. PSR-11 Container (`SimpleContainer`)

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

### 3.6. PSR-7 Stream (`StringStream`)

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

## 4. Mocking Strategies, PHPUnit 10/11 Rules & AI Pitfalls

Mocking in modern PHP (PHP 8.2+, PHPUnit 10/11, Yii3) requires strict adherence to types and modern framework APIs. AI models frequently generate outdated PHPUnit 8/9 code or make architectural mocking errors.

### 4.1. Core Philosophy: What to Mock vs. What NOT to Mock

```text
┌───────────────────────────────────────┬────────────────────────────────────────────────────────┐
│ Target Object Type                    │ Mocking Decision & Idiomatic Approach                  │
├───────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ Domain Entities, Value Objects, DTOs  │ ❌ NEVER MOCK. Instantiate real objects. They have no   │
│ (e.g. User, Money, CreateUserCommand) │ external I/O and hold pure state. State-based testing. │
├───────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ Final or Readonly Classes             │ ❌ CANNOT BE MOCKED in PHPUnit (throws fatal error).   │
│                                       │ Mock the interface they implement (e.g. UserRepositoryInterface). │
├───────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ Standard PSR Contracts                │ ❌ DO NOT WRITE CUSTOM MOCKS. Use pre-built doubles     │
│ (PSR-3, PSR-14, PSR-16, PSR-20)       │ from `yiisoft/test-support` (SimpleLogger, etc.).      │
├───────────────────────────────────────┼────────────────────────────────────────────────────────┤
│ External Boundaries & Gateways        │ ✅ MOCK VIA INTERFACE using `$this->createMock(...)`   │
│ (MailerInterface, PaymentGateway, DB) │ or Mockery in Testo.                                   │
└───────────────────────────────────────┴────────────────────────────────────────────────────────┘
```

### 4.2. Common AI Model Hallucinations in PHPUnit 10/11 (Dead APIs)

| Removed / Dead API (PHPUnit <= 9) | Why it crashes in PHPUnit 10/11 | Modern PHPUnit 10/11 Replacement |
|---|---|---|
| `->withConsecutive([$a], [$b])` | **Removed in PHPUnit 10.** Triggers fatal `Error: Call to undefined method`. | Use `willReturnCallback()` with `$matcher->numberOfInvocations()` or array queue. |
| `->getMockBuilder()->setMethods(...)` | **Removed in PHPUnit 10.** Triggers fatal undefined method. | Use `onlyMethods(['methodName'])` for existing methods, or `addMethods()` for non-existent ones. |
| `->expects($this->at($index))` | **Removed in PHPUnit 10.** State-based index matcher dropped. | Use `$this->exactly($count)` with `willReturnOnConsecutiveCalls(...)` or callback inspection. |
| `->expectExceptionMessageRegExp(...)` | **Removed in PHPUnit 10.** | Use `$this->expectExceptionMessageMatches('/pattern/')`. |
| `$this->createMock(FinalClass::class)` | PHPUnit throws `InvalidArgumentException: Class is declared "final"`. | Mock the interface: `$this->createMock(FinalClassInterface::class)`. |

### 4.3. Idiomatic PHPUnit 10/11 Mocking Patterns

#### 1. Interface Mocking with Intersection Types
Always specify the intersection type `Interface&MockObject` in PHPDoc to ensure static analysis (Psalm, PHPStan) validates both domain calls and mock builders:

```php
declare(strict_types=1);

namespace App\Tests\Unit;

use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

interface UserRepositoryInterface
{
    public function save(object $user): bool;
}

final class User
{
    public function __construct(private string $email) {}
    public function getEmail(): string { return $this->email; }
}

final class UserServiceTest extends TestCase
{
    public function testSaveUser(): void
    {
        /** @var UserRepositoryInterface&MockObject $repository */
        $repository = $this->createMock(UserRepositoryInterface::class);

        // Strict expectation: called exactly once with typed argument matching
        $repository->expects($this->once())
            ->method('save')
            ->with($this->callback(static function (User $user): bool {
                return $user->getEmail() === 'alex@example.com';
            }))
            ->willReturn(true);

        $result = $repository->save(new User('alex@example.com'));
        $this->assertTrue($result);
    }
}
```

> [!IMPORTANT]
> **Callback Return Rule:** The closure passed to `$this->callback(...)` **must return a strict `bool`**. Returning `void`, `null`, or truthy non-booleans causes PHPUnit constraint evaluation failures. Always type-hint arguments and the `: bool` return type.

#### 2. Replacing Removed `withConsecutive()` in PHPUnit 10/11
If a mocked method is called multiple times with different arguments, do **not** use the dead `withConsecutive()`:

```php
declare(strict_types=1);

namespace App\Tests\Unit;

use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

interface PaymentGatewayInterface
{
    public function charge(float $amount): bool;
}

final class PaymentProcessorTest extends TestCase
{
    public function testMultipleChargesWithDistinctArguments(): void
    {
        /** @var PaymentGatewayInterface&MockObject $gateway */
        $gateway = $this->createMock(PaymentGatewayInterface::class);

        $matcher = $this->exactly(2);
        $gateway->expects($matcher)
            ->method('charge')
            ->willReturnCallback(function (float $amount) use ($matcher): bool {
                match ($matcher->numberOfInvocations()) {
                    1 => $this->assertSame(50.0, $amount),
                    2 => $this->assertSame(100.0, $amount),
                };
                return true;
            });

        $this->assertTrue($gateway->charge(50.0));
        $this->assertTrue($gateway->charge(100.0));
    }
}
```

#### 3. Partial Mocking of Concrete Classes
When testing a class while overriding only specific internal methods, use `getMockBuilder()` with `onlyMethods()`:

```php
declare(strict_types=1);

namespace App\Tests\Unit;

use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class ExternalInvoiceService
{
    public function processInvoice(string $id): array
    {
        return $this->requestExternalApi($id);
    }

    public function requestExternalApi(string $id): array
    {
        // Real network call
        return ['invoice_id' => $id, 'status' => 'pending'];
    }
}

final class InvoiceServiceTest extends TestCase
{
    public function testPartialMockWithOnlyMethods(): void
    {
        /** @var ExternalInvoiceService&MockObject $service */
        $service = $this->getMockBuilder(ExternalInvoiceService::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['requestExternalApi'])
            ->getMock();

        $service->expects($this->once())
            ->method('requestExternalApi')
            ->with('inv_999')
            ->willReturn(['invoice_id' => 'inv_999', 'status' => 'paid']);

        $result = $service->processInvoice('inv_999');
        $this->assertSame('paid', $result['status']);
    }
}
```

---

### 4.4. Mocking in Testo via Mockery (`php-testo/bridge-mockery`)

> [!TIP]
> **Testo Mocking Reference:**
> In Testo projects, mocking is handled via Mockery with `MockeryPlugin` registered in `testo.php` for automated teardown. For the complete reference on Testo mocking — plugin registration and the `Mockery::mock()` / `Testo\Assert` test pattern — see the [Testo Runner Guide, §3. Mocking in Testo via Mockery](testing-testo.md#3-mocking-in-testo-via-mockery-php-testobridge-mockery).

---

## 5. Unit Testing Use Cases, Validation, Fixtures & State Isolation

### 5.1. Unit Testing Application Use Cases (Zero-Shot Compilable)

Unit tests run in isolation with zero database or network overhead. Dependencies are either mocked via PHPUnit or replaced with `yiisoft/test-support` doubles:

```php
declare(strict_types=1);

namespace App\Tests\Unit\Application\UseCase\User;

use DateTimeImmutable;
use PHPUnit\Framework\TestCase;
use Psr\Clock\ClockInterface;
use Psr\EventDispatcher\EventDispatcherInterface;
use Psr\Log\LoggerInterface;
use Yiisoft\Test\Support\Clock\StaticClock;
use Yiisoft\Test\Support\EventDispatcher\SimpleEventDispatcher;
use Yiisoft\Test\Support\Log\SimpleLogger;

// 1. Pure Domain Entities and DTOs
final class User
{
    public function __construct(
        private string $email,
        private string $name,
        private DateTimeImmutable $createdAt,
    ) {}

    public function getEmail(): string { return $this->email; }
    public function getName(): string { return $this->name; }
    public function getCreatedAt(): DateTimeImmutable { return $this->createdAt; }
}

final readonly class CreateUserCommand
{
    public function __construct(
        public string $email,
        public string $name,
    ) {}
}

final class UserCreatedEvent
{
    public function __construct(public readonly User $user) {}
}

interface UserRepositoryInterface
{
    public function save(User $user): void;
}

// 2. Application Use Case
final class CreateUserUseCase
{
    public function __construct(
        private UserRepositoryInterface $repository,
        private EventDispatcherInterface $eventDispatcher,
        private LoggerInterface $logger,
        private ClockInterface $clock,
    ) {}

    public function execute(CreateUserCommand $command): User
    {
        $user = new User(
            email: $command->email,
            name: $command->name,
            createdAt: $this->clock->now(),
        );

        $this->repository->save($user);
        $this->eventDispatcher->dispatch(new UserCreatedEvent($user));
        $this->logger->info('User {email} created successfully.', ['email' => $user->getEmail()]);

        return $user;
    }
}

// 3. Complete Zero-Shot Unit Test
final class CreateUserUseCaseTest extends TestCase
{
    public function testCreatesUserSuccessfully(): void
    {
        // Mock external repository contract
        $repository = $this->createMock(UserRepositoryInterface::class);
        $repository->expects($this->once())
            ->method('save')
            ->with($this->callback(static function (User $user): bool {
                return $user->getEmail() === 'alex@example.com'
                    && $user->getName() === 'Alex Johnson';
            }));

        // Pre-built PSR test doubles from yiisoft/test-support
        $eventDispatcher = new SimpleEventDispatcher();
        $logger = new SimpleLogger();
        $clock = new StaticClock(new DateTimeImmutable('2026-10-22 10:00:00'));

        // Instantiate Use Case with explicit dependencies
        $useCase = new CreateUserUseCase(
            repository: $repository,
            eventDispatcher: $eventDispatcher,
            logger: $logger,
            clock: $clock,
        );

        // Execute command
        $user = $useCase->execute(new CreateUserCommand(
            email: 'alex@example.com',
            name: 'Alex Johnson',
        ));

        // Assert domain state
        $this->assertSame('Alex Johnson', $user->getName());
        $this->assertSame('alex@example.com', $user->getEmail());
        $this->assertSame('2026-10-22 10:00:00', $user->getCreatedAt()->format('Y-m-d H:i:s'));

        // Assert side effects
        $this->assertCount(1, $eventDispatcher->getEvents());
        $this->assertTrue($eventDispatcher->isClassTriggered(UserCreatedEvent::class));
        $this->assertCount(1, $logger->getMessages());
        $this->assertSame('User alex@example.com created successfully.', $logger->getMessages()[0]['message']);
    }
}
```

---

### 5.2. Unit Testing Domain Validation (`yiisoft/validator`)

`Yiisoft\Validator\Validator` can be instantiated without parameters (`new Validator()`). It automatically wires an in-memory `SimpleRuleHandlerContainer` for built-in rules, enabling sub-millisecond unit testing of validation rules, DTOs, and custom rule handlers.

#### 1. DTO Validation with Attributes
```php
declare(strict_types=1);

namespace App\Tests\Unit\Dto;

use PHPUnit\Framework\TestCase;
use Yiisoft\Validator\Rule\Email;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\Validator;

final class RegisterUserDto
{
    public function __construct(
        #[Required]
        #[Length(min: 3, max: 50)]
        public readonly string $username = '',

        #[Required]
        #[Email]
        public readonly string $email = '',
    ) {}
}

final class RegisterUserDtoTest extends TestCase
{
    public function testValidationPassesForValidData(): void
    {
        $validator = new Validator();
        $dto = new RegisterUserDto('alex', 'alex@example.com');

        $result = $validator->validate($dto);

        $this->assertTrue($result->isValid());
        $this->assertEmpty($result->getErrors());
    }

    public function testValidationFailsForInvalidData(): void
    {
        $validator = new Validator();
        $dto = new RegisterUserDto('a', 'invalid-email');

        $result = $validator->validate($dto);

        $this->assertFalse($result->isValid());

        // Target property assertions
        $this->assertFalse($result->isPropertyValid('username'));
        $this->assertFalse($result->isPropertyValid('email'));

        $this->assertCount(1, $result->getPropertyErrorMessages('username'));
        $this->assertCount(1, $result->getPropertyErrorMessages('email'));

        // Inspect indexed errors
        $errorsByPath = $result->getErrorMessagesIndexedByPath();
        $this->assertArrayHasKey('username', $errorsByPath);
        $this->assertArrayHasKey('email', $errorsByPath);
    }
}
```

#### 2. Custom Validation Rule & Handler Testing

Custom validation rules decouple definition (`RuleInterface`) from execution (`RuleHandlerInterface`). In tests, rule handlers with service dependencies can be tested in isolation (by instantiating the handler and calling `validate()` directly) or integrated with `Validator` via a `SimpleRuleHandlerContainer` preloaded with mocked handler dependencies.

> [!TIP]
> **Custom Validation Rule Testing Reference:**
> For the complete recipe on integration-testing custom rules through the validator engine — `SimpleRuleHandlerContainer` wiring with mocked handler dependencies, DTO attribute discovery, and `skipOnEmpty` / `when` modifier behavior — see the [Custom Validation Rules & Testing Guide, §6.2 Strategy B](http-validation-custom-rules.md#62-strategy-b-integration-testing-via-validator-with-simplerulehandlercontainer).

---

### 5.3. Test Fixture Assembly via `yiisoft/factory`

Per `package-catalog.md`, `yiisoft/factory` is the recommended tool to assemble domain fixtures and complex object graphs without hand-wiring repetitive constructors.

#### Key Invariant: Unshared Instances
Unlike a PSR-11 container, which caches instances as singletons, `Factory::create(...)` always returns a **fresh, unshared instance** (`assertNotSame($obj1, $obj2)`), preventing cross-test state pollution. Full `Factory` / `StrictFactory` semantics (constructor argument order, definition-map rules, exception behavior) are owned by the [DI & Configuration Guide](core-di-and-config.md), section 6.2.

```php
declare(strict_types=1);

namespace App\Tests\Unit\Fixture;

use PHPUnit\Framework\TestCase;
use Yiisoft\Factory\Factory;
use Yiisoft\Factory\StrictFactory;

final class Address
{
    public function __construct(
        public readonly string $street,
        public readonly string $city,
    ) {}
}

final class Customer
{
    public function __construct(
        public readonly string $name,
        public readonly Address $address,
        public readonly bool $isVip = false,
    ) {}
}

final class CustomerFixtureTest extends TestCase
{
    public function testAssemblesObjectGraphWithOverrides(): void
    {
        // 1. Configure baseline definitions
        $factory = new Factory(definitions: [
            Address::class => [
                'class' => Address::class,
                '__construct()' => [
                    'street' => '100 Main St',
                    'city' => 'Springfield',
                ],
            ],
            Customer::class => [
                'class' => Customer::class,
                '__construct()' => [
                    'name' => 'John Doe',
                    'isVip' => false,
                ],
            ],
        ]);

        // 2. Create unshared baseline instances
        $customer1 = $factory->create(Customer::class);
        $customer2 = $factory->create(Customer::class);

        $this->assertSame('John Doe', $customer1->name);
        $this->assertSame('Springfield', $customer1->address->city);
        $this->assertNotSame($customer1, $customer2); // Always unshared!

        // 3. Override properties on the fly per scenario
        /** @var Customer $vipCustomer */
        $vipCustomer = $factory->create([
            'class' => Customer::class,
            '__construct()' => [
                'name' => 'Alice Smith',
                'isVip' => true,
            ],
        ]);

        $this->assertSame('Alice Smith', $vipCustomer->name);
        $this->assertTrue($vipCustomer->isVip);
        $this->assertSame('Springfield', $vipCustomer->address->city);

        // 4. Scoped definitions using withDefinitions()
        $specialFactory = $factory->withDefinitions([
            Address::class => [
                'class' => Address::class,
                '__construct()' => [
                    'street' => '500 Tech Blvd',
                    'city' => 'Metropolis',
                ],
            ],
        ]);

        /** @var Customer $metroCustomer */
        $metroCustomer = $specialFactory->create(Customer::class);
        $this->assertSame('Metropolis', $metroCustomer->address->city);
    }

    public function testStrictFactoryRequiresRegisteredDefinitions(): void
    {
        $strictFactory = new StrictFactory([
            Address::class => [
                'class' => Address::class,
                '__construct()' => ['street' => '1st Ave', 'city' => 'Boston'],
            ],
        ]);

        $this->assertInstanceOf(Address::class, $strictFactory->create(Address::class));

        // StrictFactory throws NotFoundException if class definition is absent
        $this->expectException(\Yiisoft\Factory\NotFoundException::class);
        $strictFactory->create(Customer::class);
    }
}
```

---

### 5.4. Container State Isolation via `yiisoft/di` (`StateResetter`)

In long-running integration test suites where the PSR-11 container is booted once (`setUpBeforeClass()`) for performance, stateful services leak data into subsequent tests.

`Yiisoft\Di\StateResetter` resets stateful singletons between tests via the definition-level `'reset'` closures (binding mechanics and caveats are owned by the [DI & Configuration Guide](core-di-and-config.md), section 5.2):

```php
declare(strict_types=1);

namespace App\Tests\Integration;

use PHPUnit\Framework\TestCase;
use Yiisoft\Di\Container;
use Yiisoft\Di\ContainerConfig;
use Yiisoft\Di\StateResetter;

final class InMemoryBuffer
{
    /** @var list<string> */
    private array $buffer = [];

    public function push(string $item): void
    {
        $this->buffer[] = $item;
    }

    public function count(): int
    {
        return count($this->buffer);
    }
}

final class StateIsolationTest extends TestCase
{
    private static Container $container;

    public static function setUpBeforeClass(): void
    {
        $config = ContainerConfig::create()->withDefinitions([
            InMemoryBuffer::class => [
                'class' => InMemoryBuffer::class,
                // Reserved 'reset' key — closure bound to the instance (DI guide §5.2)
                'reset' => function () {
                    $this->buffer = [];
                },
            ],
        ]);

        self::$container = new Container($config);
    }

    protected function tearDown(): void
    {
        // Reset all stateful container services after each test
        self::$container->get(StateResetter::class)->reset();
        parent::tearDown();
    }

    public function testStepOneAddsItems(): void
    {
        $buffer = self::$container->get(InMemoryBuffer::class);
        $buffer->push('alpha');
        $buffer->push('beta');

        $this->assertSame(2, $buffer->count());
    }

    public function testStepTwoStartsCleanDueToStateResetter(): void
    {
        // Thanks to tearDown() StateResetter::reset(), the buffer is clean!
        $buffer = self::$container->get(InMemoryBuffer::class);
        $this->assertSame(0, $buffer->count());
    }
}
```

---

## 6. Testing Console Commands (`yiisoft/yii-console`)

> [!TIP]
> **Console Command Testing Reference:**
> Yii3 console commands extend `Symfony\Component\Console\Command\Command` and are integration-tested with Symfony's official `CommandTester`. For the complete reference — `#[AsCommand]` definitions, `ExitCode::*` execution codes, output assertion with `getDisplay(true)` normalization, failure scenarios, interactive prompts via `setInputs()`, autocompletion via `CommandCompletionTester`, and container-aware resolution via the `CommandHelper` pattern — see the [Console Testing Guide](testing-console.md).

---

## 7. Master PHP 8 Named Arguments & Signatures Reference

Below is a master reference of exact parameter names and signatures for key testing classes to guarantee safety against `Error: Unknown named parameter` in PHP 8:

| Class / Component | Method / Property | Exact Signature Grounding |
|---|---|---|
| `Yiisoft\Test\Support\EventDispatcher\SimpleEventDispatcher` | `__construct` | `public function __construct(\Closure ...$listeners)` |
| `SimpleEventDispatcher` | `dispatch` | `public function dispatch(object $event): object` |
| `SimpleEventDispatcher` | `isClassTriggered` | `public function isClassTriggered(string $class, ?int $times = null): bool` |
| `SimpleEventDispatcher` | `isInstanceOfTriggered` | `public function isInstanceOfTriggered(string $class, ?int $times = null): bool` |
| `SimpleEventDispatcher` | `isObjectTriggered` | `public function isObjectTriggered(object $event, ?int $times = null): bool` |
| `SimpleEventDispatcher` | `clearEvents` | `public function clearEvents(): void` |
| `Yiisoft\Test\Support\Log\SimpleLogger` | `log` | `public function log(mixed $level, string\|\Stringable $message, array $context = []): void` |
| `SimpleLogger` | `getMessages` | `public function getMessages(): array` |
| `Yiisoft\Test\Support\SimpleCache\MemorySimpleCache` | `__construct` | `public function __construct(array $cacheData = [])` |
| `MemorySimpleCache` | `set` | `public function set(string $key, mixed $value, int\|\DateInterval\|null $ttl = null): bool` |
| `MemorySimpleCache` | `get` | `public function get(string $key, mixed $default = null): mixed` |
| `MemorySimpleCache` | `has` | `public function has(string $key): bool` |
| `MemorySimpleCache` | `getValues` | `public function getValues(): array` |
| `MemorySimpleCache` | `$returnOnSet` | `public bool $returnOnSet = true;` |
| `MemorySimpleCache` | `$returnOnDelete` | `public bool $returnOnDelete = true;` |
| `MemorySimpleCache` | `$returnOnClear` | `public bool $returnOnClear = true;` |
| `Yiisoft\Test\Support\SimpleCache\SimpleCacheActionLogger` | `__construct` | `public function __construct(\Psr\SimpleCache\CacheInterface $cacheService, array $cacheData = [])` |
| `SimpleCacheActionLogger` | `getActions` | `public function getActions(): array` |
| `SimpleCacheActionLogger` | `getActionKeyList` | `public function getActionKeyList(): array` |
| `Yiisoft\Test\Support\SimpleCache\Action` | `getAction` | `public function getAction(): string` |
| `Action` | `getKey` | `public function getKey(): mixed` |
| `Action` | `getValue` | `public function getValue(): mixed` |
| `Action` | `getTtl` | `public function getTtl(): mixed` |
| `Yiisoft\Test\Support\Clock\StaticClock` | `__construct` | `public function __construct(private \DateTimeImmutable $now)` |
| `StaticClock` | `now` | `public function now(): \DateTimeImmutable` |
| `Yiisoft\Test\Support\Container\SimpleContainer` | `__construct` | `public function __construct(array $definitions = [], ?\Closure $factory = null, ?\Closure $hasCallback = null)` |
| `SimpleContainer` | `get` | `public function get(string $id): mixed` |
| `SimpleContainer` | `has` | `public function has(string $id): bool` |
| `Yiisoft\Test\Support\HttpMessage\StringStream` | `__construct` | `public function __construct(string $content = '', int $position = 0, bool $readable = true, bool $writable = true, bool $seekable = true, \Closure\|array\|null $metadata = null)` |
| `StringStream` | `isClosed` | `public function isClosed(): bool` |
| `StringStream` | `isDetached` | `public function isDetached(): bool` |
| `StringStream` | `getPosition` | `public function getPosition(): int` |
| `Yiisoft\Yii\Console\ExitCode` | `getReason` | `public static function getReason(int $exitCode): string` |
| `Symfony\Component\Console\Tester\CommandTester` | `execute` | `public function execute(array $input, array $options = []): int` |
| `CommandTester` | `setInputs` | `public function setInputs(array $inputs): static` |
| `CommandTester` | `getDisplay` | `public function getDisplay(bool $normalize = false): string` |
| `Yiisoft\Validator\Validator` | `validate` | `public function validate(mixed $data, callable\|iterable\|object\|string\|null $rules = null, ?ValidationContext $context = null): Result` |
| `Yiisoft\Validator\Result` | `isValid` | `public function isValid(): bool` |
| `Result` | `isPropertyValid` | `public function isPropertyValid(string $property): bool` |
| `Result` | `getPropertyErrorMessages` | `public function getPropertyErrorMessages(string $property): array` |
| `Result` | `getErrorMessagesIndexedByPath` | `public function getErrorMessagesIndexedByPath(string $separator = '.', ?string $escape = '.'): array` |
| `Yiisoft\Factory\Factory` | `__construct` | `public function __construct(?\Psr\Container\ContainerInterface $container = null, array $definitions = [], bool $validate = true)` |
| `Factory` | `create` | `public function create(mixed $config): mixed` |
| `Factory` | `withDefinitions` | `public function withDefinitions(array $definitions): self` |
| `Yiisoft\Factory\StrictFactory` | `__construct` | `public function __construct(array $definitions, ?\Psr\Container\ContainerInterface $container = null, bool $validate = true)` |
| `Yiisoft\Di\StateResetter` | `reset` | `public function reset(): void` |

---

## 8. Comprehensive Anti-Pattern Matrix

| # | Forbidden Anti-Pattern | Fatal Consequence / Problem | Idiomatic Solution |
|---|---|---|---|
| 1 | **Global state: `Yii::$app` or static locator** | Throws `Error: Class "Yii" not found`. Yii3 has no global state. | Pass dependencies via constructor or resolve via PSR-11 container in integration tests. |
| 2 | **Mutating container: `$this->getContainer()->set(...)`** | PSR-11 `ContainerInterface` only defines `get()` and `has()`. Throws fatal error. | Pass mocks directly to constructor in unit tests, or use `SimpleContainer`. |
| 3 | **Phantom method: `$logger->hasMessage(...)`** | `SimpleLogger` has no `hasMessage()` method; throws fatal error. | Inspect `$logger->getMessages()` array. |
| 4 | **Phantom method: `$logger->clear()`** | `SimpleLogger` has no `clear()` or `clearMessages()` method; throws fatal error. | Instantiate a fresh `new SimpleLogger()` per test step. |
| 5 | **Phantom method: `$cacheLogger->clearActions()`** | `SimpleCacheActionLogger` has no `clearActions()` method; throws fatal error. | Instantiate a fresh `new SimpleCacheActionLogger($cache)`. |
| 6 | **Phantom method: `$action->getDefault()`** | `Action` only tracks action, key, value, and ttl; throws fatal error. | Do not assert default value on `Action`; inspect `$cache->get('key', $default)` return value. |
| 7 | **Magic strings in Action asserts (`'get'`, `'set'`)** | Magic strings bypass static analysis and refactoring safety. | Use typed class constants `Action::GET`, `Action::SET`, `Action::DELETE`, `Action::CLEAR`, `Action::HAS`. |
| 8 | **Mutating `StaticClock` via `$clock->modify()`** | `StaticClock` is strictly immutable; throws undefined method error. | Instantiate a new `new StaticClock($now->modify('+1 day'))`. |
| 9 | **Declaring console command via `$defaultName`** | Deprecated in Symfony 6.1+ / 7.0; ignored by Yii3 `CommandLoader` reflection. | Use PHP 8 attribute `#[AsCommand(name: '...', description: '...')]`. |
| 10 | **Hardcoding raw exit codes (`return 0`, `return 1`)** | Loses semantic precision for cron daemons and CI orchestrators. | Return typed `Yiisoft\Yii\Console\ExitCode` constants (`ExitCode::OK`, `ExitCode::DATAERR`, etc.). |
| 11 | **Calling `$tester->getDisplay()` without normalization** | Multi-line output tests fail across OS environments due to CRLF vs LF. | Use `$tester->getDisplay(normalize: true)` to normalize line endings. |
| 12 | **Mocking final or readonly classes in PHPUnit** | PHPUnit throws `InvalidArgumentException: Class is declared "final"`. | Mock the interface that the class implements, or use real instances for DTOs/Entities. |
| 13 | **Using dead PHPUnit methods (`withConsecutive`, etc.)** | Removed in PHPUnit 10; triggers fatal `Call to undefined method`. | Use `willReturnCallback()` with invocation matcher, `onlyMethods()`, and `$this->exactly($n)`. |
| 14 | **Non-boolean return in `$this->callback(...)`** | Void or truthy non-bool return breaks PHPUnit constraint evaluator. | Ensure callback closure has strict `: bool` return type. |
| 15 | **Non-static Data Providers in PHPUnit 10/11** | Deprecated in PHPUnit 10; fatal error in PHPUnit 11. | Declare providers as `public static function provider(): array`. |
| 16 | **Installing both PHPUnit and Testo together** | Binary collisions (`vendor/bin/phpunit` vs `vendor/bin/testo`), duplicate test discovery. | Pick one runner per project: standard `phpunit/phpunit` or modern `testo/testo`. |
| 17 | **Sharing container across tests without `StateResetter`** | Stateful services leak memory and dirty state into subsequent tests. | Call `self::$container->get(StateResetter::class)->reset()` in `tearDown()`. |

---

## 9. Related Guides
- [`testing-testo.md`](testing-testo.md) — Alternative Testo runner, the exclusive runner rule (PHPUnit XOR Testo), and Mockery integration via `php-testo/bridge-mockery`.
- [`testing-codeception.md`](testing-codeception.md) — Alternative Codeception 5 framework: actors, Cests, and REST-module API testing.
- [`testing-infection.md`](testing-infection.md) — Optional Infection mutation-testing quality gate layered on top of the runner.
- [`testing-console.md`](testing-console.md) — Console command testing with `CommandTester`, exit codes, prompts, and autocompletion.
- [`http-validation-custom-rules.md`](http-validation-custom-rules.md) — Custom validation rules, RuleHandlerInterface, and isolated unit testing.
- [`testing-http.md`](testing-http.md) — Functional HTTP testing, middleware pipelines, endpoints, sessions, and `ResponseAccessor`.
- [`testing-database.md`](testing-database.md) — Ephemeral in-memory SQLite, migrations, transactions, and repository testing.
- [`infra-commands.md`](infra-commands.md) — Console command definition, input arguments/options, and execution lifecycle.
- [`core-events-and-listeners.md`](core-events-and-listeners.md) — PSR-14 event architecture and domain event testing.
