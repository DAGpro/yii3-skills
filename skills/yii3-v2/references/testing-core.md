# Yii3 Testing: Architecture, Runners & PSR Doubles

> Practical guide for Yii3 test architecture, test runners (`phpunit/phpunit`, `testo/testo`, `codeception/codeception`), PSR test doubles from `yiisoft/test-support`, modern mocking rules, and unit test suites.

---

## Table of Contents
- [1. Testing Pyramid & Layer Boundaries](#1-testing-pyramid--layer-boundaries)
- [2. Test Runner Ecosystem & The Exclusive Runner Rule](#2-test-runner-ecosystem--the-exclusive-runner-rule)
  - [2.1. PHPUnit (PHPUnit 10 and 11)](#21-phpunit-phpunit-10-and-11)
  - [2.2. Testo (`testo/testo`)](#22-testo-testotesto)
  - [2.3. Codeception (`codeception/codeception` ^5)](#23-codeception-codeceptioncodeception-5)
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
- [5. Unit Testing Use Cases (Zero-Shot Compilable)](#5-unit-testing-use-cases-zero-shot-compilable)
- [6. Testing Console Commands (`yiisoft/yii-console`)](#6-testing-console-commands-yiisoftyii-console)
- [7. Core PHP 8 Named Arguments & Signatures Reference](#7-core-php-8-named-arguments--signatures-reference)
- [8. Core Anti-Pattern Matrix](#8-core-anti-pattern-matrix)
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
| **Unit** | Domain entities, Value Objects, Application Use Cases, Validators, Formatters | `phpunit/phpunit`, `yiisoft/test-support` | Sub-millisecond | This guide (`testing-core.md`) |
| **Console Integration** | Console commands, CLI input/output, ExitCode constants | `Symfony\Component\Console\Tester\CommandTester`, `yiisoft/yii-console` | Fast | This guide (`testing-core.md`) |
| **Database Integration** | Repositories, Migrations, Database queries, Cache stores | `yiisoft/db-sqlite`, `yiisoft/db-migration` | Fast (in-memory SQLite) | [`testing-database.md`](testing-database.md) |
| **Functional HTTP** | End-to-end HTTP pipeline, routing, middleware stacks, request handlers | `yiisoft/yii-testing`, `yiisoft/yii-runner-http`, `codeception/codeception` | Moderate (in-memory HTTP runner) | [`testing-http.md`](testing-http.md) |

---

## 2. Test Runner Ecosystem & The Exclusive Runner Rule

Yii3 projects support modern PHP test runners: `phpunit/phpunit` serves as the ecosystem standard, while `testo/testo` is an ultra-fast, modern alternative.

> [!WARNING]
> ### ⚠️ Mandatory Exclusive Runner Rule
> A project must choose **either** `phpunit/phpunit` **or** `testo/testo`. **Never install both test runners in the same `composer.json`!**
> - **Binary & Plugin Conflicts:** Installing both leads to conflicting CLI binaries (`vendor/bin/phpunit`, `vendor/bin/testo`), competing static analysis and coverage plugins, and duplicate test discovery overhead.
> - **Framework Integration Boundary:** `yiisoft/yii-testing` (`FunctionalTestCase`) hard-extends `PHPUnit\Framework\TestCase`. If a project selects `testo/testo`, HTTP functional tests should be executed directly via `HttpApplicationRunner::runAndGetResponse()` with `Testo\Assert` and PSR-7 requests, or unit/integration tests with `yiisoft/test-support` doubles, rather than `yiisoft/yii-testing`.

### 2.1. PHPUnit (PHPUnit 10 and 11)

PHPUnit is the primary test runner across all official `yiisoft/*` packages, `yiisoft/yii-testing`, and standard Yii3 skeletons.

#### Installation
```bash
composer require --dev phpunit/phpunit
```

#### Configuration (`phpunit.xml.dist`)
Modern Yii3 configurations use PHPUnit 10/11 XML schema:

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
         failOnWarning="true">
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
    </source>
</phpunit>
```

#### Test Structure in PHPUnit
Tests extend `PHPUnit\Framework\TestCase` and use PHP 8 attributes:

```php
declare(strict_types=1);

namespace App\Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
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

    /**
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

### 2.2. Testo (`testo/testo`)

Testo is an extensible, ultra-fast modern PHP testing framework developed by `roxblnfk` with active evaluation and adoption in the Yii community. It features a lightweight core, middleware architecture, and plugin system.

#### Installation
```bash
composer require --dev testo/testo
```
If using Mockery for mocks:
```bash
composer require --dev php-testo/bridge-mockery
```

#### Initialization & Configuration (`testo.php`)
Initialize configuration with `vendor/bin/testo init` or create `testo.php` in the project root:

```php
<?php

declare(strict_types=1);

use Testo\Application\Config\ApplicationConfig;
use Testo\Application\Config\SuiteConfig;
use Testo\Bridge\Mockery\MockeryPlugin;

return new ApplicationConfig(
    src: ['src'],
    plugins: [
        new MockeryPlugin(), // Automatically closes \Mockery::close() after tests
    ],
    suites: [
        new SuiteConfig(
            name: 'Unit',
            location: ['tests/Unit'],
        ),
        new SuiteConfig(
            name: 'Integration',
            location: ['tests/Integration'],
        ),
    ],
);
```

#### Test Structure in Testo
Testo test classes do **not** extend a monolithic `TestCase`. They are plain PHP classes annotated with `#[Test]` from `Testo\Test`, using `Testo\Assert` for assertions:

```php
declare(strict_types=1);

namespace App\Tests\Unit;

use Mockery;
use Testo\Assert;
use Testo\Test;
use Yiisoft\Test\Support\EventDispatcher\SimpleEventDispatcher;

interface UserRepositoryInterface
{
    public function save(object $user): void;
}

final class User
{
    public function __construct(
        private string $email,
        private string $name,
    ) {}

    public function getEmail(): string
    {
        return $this->email;
    }

    public function isActive(): bool
    {
        return true;
    }
}

#[Test]
final class RegisterUserTest
{
    public function createsUserAndDispatchesEvent(): void
    {
        // 1. Mock via Mockery (auto-closed by MockeryPlugin)
        $repository = Mockery::mock(UserRepositoryInterface::class);
        $repository->shouldReceive('save')->once();

        // 2. PSR test double from yiisoft/test-support
        $dispatcher = new SimpleEventDispatcher();

        // 3. Execute
        $user = new User(email: 'alex@example.com', name: 'Alex');
        $repository->save($user);

        // 4. Assert via Testo\Assert
        Assert::same('alex@example.com', $user->getEmail());
        Assert::true($user->isActive());
    }
}
```

#### Execution
```bash
vendor/bin/testo
vendor/bin/testo run --suite=Unit
```

---

### 2.3. Codeception (`codeception/codeception` ^5)

Supported in Yii3 application templates (`yiisoft/app`, `yiisoft/app-api`) for projects requiring actor-driven test suites (`Api`, `Functional`, `Unit`, `Console`):

- Configured via `codeception.yml` and `<Suite>.suite.yml`.
- Invoked via `vendor/bin/codecept run`.
- In functional suites, requests are routed in-memory through `HttpApplicationRunner::runAndGetResponse()` (see [`testing-http.md`](testing-http.md)).

---

## 3. Ready-Made PSR Test Doubles (`yiisoft/test-support`)

Rather than writing complex mock configurations or custom doubles for standard PSR interfaces, use the official, verified test doubles from `yiisoft/test-support`.

### 3.1. PSR-14 Event Dispatcher (`SimpleEventDispatcher`)

`Yiisoft\Test\Support\EventDispatcher\SimpleEventDispatcher` implements `Psr\EventDispatcher\EventDispatcherInterface`:

```php
declare(strict_types=1);

namespace App\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Yiisoft\Test\Support\EventDispatcher\SimpleEventDispatcher;

final class UserRegisteredEvent
{
    public function __construct(
        public readonly string $userId,
    ) {}
}

final class SimpleEventDispatcherTest extends TestCase
{
    public function testRecordsAndVerifiesDispatchedEvents(): void
    {
        // 1. Instantiate (accepts optional Closure listeners in constructor: Closure ...$listeners)
        $eventDispatcher = new SimpleEventDispatcher();

        // 2. Dispatch event during test execution
        $event = new UserRegisteredEvent(userId: '0192e210-4567-7890-a123-456789abcdef');
        $eventDispatcher->dispatch($event);

        // 3. Inspect dispatched events
        $events = $eventDispatcher->getEvents(); // list<object>
        $eventClasses = $eventDispatcher->getEventClasses(); // list<class-string>

        $this->assertCount(1, $events);
        $this->assertSame([UserRegisteredEvent::class], $eventClasses);

        // 4. Assert with built-in verification methods (supports named arguments)
        $this->assertTrue($eventDispatcher->isClassTriggered(UserRegisteredEvent::class));
        $this->assertTrue($eventDispatcher->isClassTriggered(class: UserRegisteredEvent::class, times: 1));
        $this->assertTrue($eventDispatcher->isInstanceOfTriggered(class: UserRegisteredEvent::class));
        $this->assertTrue($eventDispatcher->isObjectTriggered(event: $event, times: 1));

        // 5. Reset between steps if needed
        $eventDispatcher->clearEvents();
        $this->assertCount(0, $eventDispatcher->getEvents());
    }
}
```

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
        // Placeholders are automatically interpolated from context!
        $this->assertSame('User usr_123 signed in successfully.', $messages[0]['message']);
        $this->assertSame(['userId' => 'usr_123'], $messages[0]['context']);

        $this->assertSame(LogLevel::ERROR, $messages[1]['level']);
        $this->assertSame('Database connection failed.', $messages[1]['message']);
    }
}
```

> [!CAUTION]
> **Trap:** `SimpleLogger` does **NOT** have a `hasMessage()` method. Calling `$logger->hasMessage(...)` throws a `Fatal Error: Call to undefined method`. Always inspect `$logger->getMessages()`.

### 3.3. PSR-16 Simple Cache (`MemorySimpleCache` & `SimpleCacheActionLogger`)

`Yiisoft\Test\Support\SimpleCache\MemorySimpleCache` provides an in-memory array-backed cache:

```php
declare(strict_types=1);

namespace App\Tests\Unit;

use PHPUnit\Framework\TestCase;
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

        // 2. Action Logger wrapper (records calls to get, set, delete, clear, etc.)
        $actionLogger = new SimpleCacheActionLogger($cache);
        $actionLogger->get('new_key');
        $actionLogger->delete('cached_rate');

        $actions = $actionLogger->getActions(); // list<Action>
        $this->assertCount(2, $actions);
        $this->assertSame('get', $actions[0]->getAction());
        $this->assertSame('new_key', $actions[0]->getKey());
        $this->assertSame('delete', $actions[1]->getAction());
        $this->assertSame('cached_rate', $actions[1]->getKey());
    }
}
```

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
}
```

### 3.5. PSR-11 Container (`SimpleContainer`)

`Yiisoft\Test\Support\Container\SimpleContainer` provides a lightweight PSR-11 container without loading full configuration files:

```php
declare(strict_types=1);

namespace App\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Yiisoft\Test\Support\Container\SimpleContainer;

interface DummyServiceInterface
{
    public function getName(): string;
}

final class SimpleContainerTest extends TestCase
{
    public function testLightweightContainerResolution(): void
    {
        $mockService = $this->createMock(DummyServiceInterface::class);
        $mockService->method('getName')->willReturn('mocked');

        $container = new SimpleContainer([
            DummyServiceInterface::class => $mockService,
        ]);

        $this->assertTrue($container->has(DummyServiceInterface::class));
        $this->assertSame($mockService, $container->get(DummyServiceInterface::class));
        $this->assertSame('mocked', $container->get(DummyServiceInterface::class)->getName());
    }
}
```

### 3.6. PSR-7 Stream (`StringStream`)

`Yiisoft\Test\Support\HttpMessage\StringStream` implements `Psr\Http\Message\StreamInterface` with string content:

```php
declare(strict_types=1);

namespace App\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Yiisoft\Test\Support\HttpMessage\StringStream;

final class StringStreamTest extends TestCase
{
    public function testStreamInspectionAndRewind(): void
    {
        $stream = new StringStream('{"status":"active"}');

        $this->assertSame(19, $stream->getSize());
        $this->assertSame('{"status":"active"}', $stream->getContents());
        $this->assertTrue($stream->isSeekable());

        // Stream reading advances pointer; rewinding resets it
        $this->assertSame('', $stream->getContents());
        $stream->rewind();
        $this->assertSame('{"status":"active"}', $stream->getContents());
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
| `->withConsecutive([$a], [$b])` | **Removed in PHPUnit 10.** Triggers fatal `Error: Call to undefined method`. | Use `willReturnCallback()` with invocation counter or matching array queue. |
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

In Testo projects, mocking is handled via Mockery. Register `MockeryPlugin` in `testo.php` to automate teardown:

```php
declare(strict_types=1);

namespace App\Tests\Unit;

use Mockery;
use Mockery\MockInterface;
use Testo\Assert;
use Testo\Test;

interface UserRepositoryInterface
{
    public function findById(string $id): ?object;
}

#[Test]
final class UserRegistrationTest
{
    public function savesUser(): void
    {
        /** @var UserRepositoryInterface&MockInterface $repository */
        $repository = Mockery::mock(UserRepositoryInterface::class);
        $repository->shouldReceive('findById')
            ->once()
            ->with('usr_123')
            ->andReturn(null);

        // Assertions via Testo\Assert
        Assert::null($repository->findById('usr_123'));
    }
}
```

---

## 5. Unit Testing Use Cases (Zero-Shot Compilable)

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
        $this->assertCount(1, $logger->getMessages());
        $this->assertSame('User alex@example.com created successfully.', $logger->getMessages()[0]['message']);
    }
}
```

---

## 6. Testing Console Commands (`yiisoft/yii-console`)

Yii3 console commands extend `Symfony\Component\Console\Command\Command`. Use Symfony's official `Symfony\Component\Console\Tester\CommandTester`:

```php
declare(strict_types=1);

namespace App\Tests\Integration\Console;

use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Tester\CommandTester;
use Yiisoft\Yii\Console\ExitCode;

interface NewsletterSenderInterface
{
    public function sendAll(string $campaignId, bool $dryRun): int;
}

final class SendNewsletterCommand extends Command
{
    protected static $defaultName = 'newsletter:send';

    public function __construct(
        private NewsletterSenderInterface $sender,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->setDescription('Sends newsletters for a given campaign')
            ->addArgument('campaign-id', InputArgument::REQUIRED, 'The campaign ID')
            ->addOption('dry-run', null, InputOption::VALUE_NONE, 'Simulate sending without sending');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $campaignId = (string) $input->getArgument('campaign-id');
        $dryRun = (bool) $input->getOption('dry-run');

        $count = $this->sender->sendAll($campaignId, $dryRun);
        $output->writeln("Successfully processed $count subscribers");

        return ExitCode::OK;
    }
}

final class SendNewsletterCommandTest extends TestCase
{
    public function testCommandExecutesSuccessfully(): void
    {
        // 1. Mock dependencies
        $sender = $this->createMock(NewsletterSenderInterface::class);
        $sender->expects($this->once())
            ->method('sendAll')
            ->with('camp_2026_q4', true)
            ->willReturn(42);

        // 2. Instantiate command
        $command = new SendNewsletterCommand($sender);

        // 3. Test execution using Symfony CommandTester
        $tester = new CommandTester($command);
        $exitCode = $tester->execute([
            'campaign-id' => 'camp_2026_q4',
            '--dry-run' => true,
        ]);

        // 4. Assert exit code and display output
        $this->assertSame(ExitCode::OK, $exitCode);
        $this->assertSame(Command::SUCCESS, $exitCode);
        $output = $tester->getDisplay();
        $this->assertStringContainsString('Successfully processed 42 subscribers', $output);
    }
}
```

---

## 7. Core PHP 8 Named Arguments & Signatures Reference

Below is a reference of exact parameter names for key testing classes and methods to prevent `Error: Unknown named parameter` in PHP 8:

| Class / Method | Signature & Named Parameters |
|---|---|
| `Yiisoft\Test\Support\EventDispatcher\SimpleEventDispatcher::__construct` | `__construct(Closure ...$listeners)` |
| `SimpleEventDispatcher::isClassTriggered` | `isClassTriggered(string $class, ?int $times = null): bool` |
| `SimpleEventDispatcher::isInstanceOfTriggered` | `isInstanceOfTriggered(string $class, ?int $times = null): bool` |
| `SimpleEventDispatcher::isObjectTriggered` | `isObjectTriggered(object $event, ?int $times = null): bool` |
| `Yiisoft\Test\Support\Log\SimpleLogger::log` | `log(mixed $level, string\|Stringable $message, array $context = []): void` |
| `Yiisoft\Test\Support\SimpleCache\MemorySimpleCache::__construct` | `__construct(array $cacheData = [])` |
| `MemorySimpleCache::set` | `set(string $key, mixed $value, int\|DateInterval\|null $ttl = null): bool` |
| `Yiisoft\Test\Support\SimpleCache\SimpleCacheActionLogger::__construct` | `__construct(CacheInterface $cacheService, array $cacheData = [])` |
| `Yiisoft\Test\Support\Clock\StaticClock::__construct` | `__construct(DateTimeImmutable $now)` |
| `Yiisoft\Test\Support\Container\SimpleContainer::__construct` | `__construct(array $definitions = [], ?Closure $factory = null, ?Closure $hasCallback = null)` |
| `Yiisoft\Test\Support\HttpMessage\StringStream::__construct` | `__construct(string $content = '', int $position = 0, bool $readable = true, bool $writable = true, bool $seekable = true, Closure\|array\|null $metadata = null)` |

---

## 8. Core Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| **Global state: `Yii::$app` or static locator** | Yii3 has no global state or `Yii::$app`. Calling it throws `Error: Class "Yii" not found`. | Inject dependencies via constructor or use PSR-11 container in fixtures. |
| **Mutating container: `$this->getContainer()->set(...)`** | PSR-11 `ContainerInterface` only has `get()` and `has()`. Calling `set()` throws a Fatal Error. | Pass mocks directly to constructor in unit tests, or use `SimpleContainer`. |
| **Phantom method: `$logger->hasMessage(...)`** | `Yiisoft\Test\Support\Log\SimpleLogger` does not have `hasMessage()`; throws fatal error. | Inspect `$logger->getMessages()` array: `[['level' => ..., 'message' => ..., 'context' => ...]]`. |
| **Mocking final or readonly classes in PHPUnit** | PHPUnit throws `InvalidArgumentException: Class is declared "final" and cannot be mocked`. | Mock the interface that the class implements (e.g. `UserRepositoryInterface`), or use real instances for DTOs/Entities. |
| **Using dead PHPUnit methods: `withConsecutive()`, `setMethods()`, `at()`** | Removed in PHPUnit 10; triggers fatal `Error: Call to undefined method`. | Use `willReturnCallback()` with invocation counter, `onlyMethods()`, and `$this->exactly($n)`. |
| **Over-mocking PSR interfaces with `$this->createMock()`** | Creates brittle, verbose interaction expectations that break upon internal logging/event changes. | Use ready-made in-memory doubles from `yiisoft/test-support` (`SimpleLogger`, `SimpleEventDispatcher`, `StaticClock`, etc.). |
| **Mocking Domain Entities or Value Objects** | Entities and VOs hold pure state with zero I/O; mocking them creates unrealistic fake states. | Instantiate real domain objects directly; assert against returned object state. |
| **Non-boolean return in `$this->callback(...)`** | Closure returning `void` or truthy non-bool breaks PHPUnit constraint evaluator. | Ensure callback has strict `: bool` return type: `fn (User $u): bool => $u->getId() === 1`. |
| **Inverted assertion arguments: `assertSame($actual, $expected)`** | PHPUnit signature is `assertSame($expected, $actual)`. Inverted arguments produce confusing, backwards failure diffs in CI. | Always pass expected first: `$this->assertSame('Alex', $user->getName())`. |
| **Non-static Data Providers in PHPUnit 10/11** | Non-static data providers are deprecated in PHPUnit 10 and fail in PHPUnit 11. | Declare providers as `public static function provider(): array`. |
| **Flaky time tests with `time()` or `sleep()`** | Tests fail randomly during second rollovers or CI latency spikes. | Inject PSR-20 `ClockInterface` and use `new StaticClock(new DateTimeImmutable('...'))`. |
| **Placing `expectException()` after throwing call** | PHPUnit must register the expectation **before** the exception is thrown; post-call throws uncaught exception. | Always place `$this->expectException(...)` before the triggering method invocation. |
| **Installing both PHPUnit and Testo together** | Conflicting runner binaries (`vendor/bin/phpunit`, `vendor/bin/testo`), competing coverage/mutation plugins, and duplicate test discovery in CI. | Pick one runner per project: standard `phpunit/phpunit` (mandatory if using `yiisoft/yii-testing`) or modern `testo/testo`. |
| **Using `FunctionalTestCase` with Testo runner** | `FunctionalTestCase` hard-extends `PHPUnit\Framework\TestCase`. Testo executes standalone classes and doesn't run PHPUnit test suites. | If using Testo, run functional HTTP tests via `HttpApplicationRunner::runAndGetResponse()` with `Testo\Assert`. |

---

## 9. Related Guides
- [`testing-http.md`](testing-http.md) — Functional HTTP testing, middleware pipelines, endpoints, sessions, and `ResponseAccessor`.
- [`testing-database.md`](testing-database.md) — Ephemeral in-memory SQLite, migrations, transactions, and repository testing.
- [`commands.md`](commands.md) — Console command definition, input arguments/options, and execution lifecycle.
- [`events-and-listeners.md`](events-and-listeners.md) — PSR-14 event architecture and domain event testing.
