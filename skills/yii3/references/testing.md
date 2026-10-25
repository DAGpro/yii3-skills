# Yii3 Testing Guide

> Practical guide for testing Yii3 applications across Unit, Functional, Integration, and Console boundaries using `phpunit/phpunit`, `yiisoft/test-support`, `yiisoft/yii-testing`, `yiisoft/yii-runner-http`, `codeception/codeception`, and `yiisoft/db-sqlite`.
>
> **Source of Truth & Verification Rule for AI Models:**
> In projects using this extension, always verify exact method signatures, constructor arguments, and options directly in `vendor/yiisoft/<package>/src/` for installed packages.
> When generating code, if an installed package's method signature or property is unfamiliar or in doubt, **read its source files in `vendor/yiisoft/<package>/src/`** rather than guessing or relying on Yii2 habits.

---

## Table of Contents
- [1. Testing Pyramid & Layer Boundaries](#1-testing-pyramid--layer-boundaries)
- [2. Test Runner Ecosystem & The Exclusive Runner Rule](#2-test-runner-ecosystem--the-exclusive-runner-rule)
  - [2.1. PHPUnit (`phpunit/phpunit` ^10 || ^11)](#21-phpunit-phpunit-10--11)
  - [2.2. Testo (`testo/testo`)](#22-testo-testotesto)
  - [2.3. Codeception (`codeception/codeception` ^5)](#23-codeception-codeceptioncodeception-5)
- [3. Ready-Made PSR Test Doubles (yiisoft/test-support)](#3-ready-made-psr-test-doubles-yiisofttest-support)
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
- [6. Functional HTTP Testing with yiisoft/yii-testing](#6-functional-http-testing-with-yiisoftyii-testing)
  - [6.1. Complete Functional Test Case](#61-complete-functional-test-case)
  - [6.2. ResponseAccessor API Reference](#62-responseaccessor-api-reference)
- [7. In-Memory HTTP Testing via HttpApplicationRunner](#7-in-memory-http-testing-via-httpapplicationrunner)
- [8. Testing Console Commands (yiisoft/yii-console)](#8-testing-console-commands-yiisoftyii-console)
- [9. Ephemeral SQLite Database for Integration Tests (yiisoft/db-sqlite)](#9-ephemeral-sqlite-database-for-integration-tests-yiisoftdb-sqlite)
  - [9.1. In-Memory Database Configuration (`config/environments/tests/di.php`)](#91-in-memory-database-configuration-configenvironmentstestsdiphpx)
  - [9.2. Running Migrations in Test Fixtures](#92-running-migrations-in-test-fixtures)
- [10. PHP 8 Named Arguments & Signatures Reference](#10-php-8-named-arguments--signatures-reference)
- [11. Anti-Pattern Matrix](#11-anti-pattern-matrix)

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

| Test Layer | Target Components | Tools & Dependencies | Speed |
|---|---|---|---|
| **Unit** | Domain entities, Value Objects, Application Use Cases, Validators, Formatters | `phpunit/phpunit`, `yiisoft/test-support` | Sub-millisecond |
| **Integration** | Repositories, Migrations, Database queries, Cache stores, Console commands | `yiisoft/db-sqlite`, `yiisoft/db-migration`, `Symfony\Component\Console\Tester\CommandTester` | Fast (in-memory SQLite) |
| **Functional** | End-to-end HTTP pipeline, routing, middleware stacks, request handlers | `yiisoft/yii-testing`, `yiisoft/yii-runner-http`, `codeception/codeception` | Moderate (in-memory HTTP runner) |

---

## 2. Test Runner Ecosystem & The Exclusive Runner Rule

Yii3 projects support modern PHP test runners: `phpunit/phpunit` serves as the ecosystem standard, while `testo/testo` is an ultra-fast, modern alternative.

> [!WARNING]
> ### ⚠️ Mandatory Exclusive Runner Rule
> A project must choose **either** `phpunit/phpunit` **or** `testo/testo`. **Never install both test runners in the same `composer.json`!**
> - **Binary & Plugin Conflicts:** Installing both leads to conflicting CLI binaries (`vendor/bin/phpunit`, `vendor/bin/testo`), competing static analysis and coverage plugins, and duplicate test discovery overhead.
> - **Framework Integration Boundary:** `yiisoft/yii-testing` (`FunctionalTestCase`) hard-extends `PHPUnit\Framework\TestCase`. If a project selects `testo/testo`, HTTP functional tests should be executed directly via `HttpApplicationRunner::runAndGetResponse()` with `Testo\Assert` and PSR-7 requests, or unit/integration tests with `yiisoft/test-support` doubles, rather than `yiisoft/yii-testing`.

### 2.1. PHPUnit (`phpunit/phpunit` ^10 || ^11)

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
- In functional suites, requests are routed in-memory through `HttpApplicationRunner::runAndGetResponse()`.

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

## 6. Functional HTTP Testing with `yiisoft/yii-testing`

`yiisoft/yii-testing` provides `FunctionalTestCase` and `FunctionalTester`, running the entire Yii3 application stack in-memory without starting a live web server or binding to network ports.

### 6.1. Complete Functional Test Case

```php
declare(strict_types=1);

namespace App\Tests\Functional\Api;

use PHPUnit\Framework\MockObject\MockObject;
use Yiisoft\Http\Method;
use Yiisoft\Http\Status;
use Yiisoft\Yii\Testing\FunctionalTestCase;
use Yiisoft\Yii\Testing\ResponseAccessor;

use const JSON_THROW_ON_ERROR;
use function json_encode;

interface MailerInterface
{
    public function send(string $to, string $subject, string $body): void;
}

final class UserApiTest extends FunctionalTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // 1. Mock external services BEFORE application bootstrap
        /** @var MailerInterface&MockObject $mockMailer */
        $mockMailer = $this->createMock(MailerInterface::class);
        $mockMailer->expects($this->any())->method('send');
        $this->mockService(MailerInterface::class, $mockMailer);

        // 2. MANDATORY: Bootstrap the application in-memory
        $this->bootstrapApplication();
    }

    public function testCreateUserEndpointReturnsCreated(): void
    {
        // 3. Issue in-memory HTTP request via protected $tester
        $payload = [
            'email' => 'jane.doe@example.com',
            'name' => 'Jane Doe',
        ];

        /** @var ResponseAccessor $response */
        $response = $this->tester->doRequest(
            method: Method::POST,
            url: '/api/v1/users',
            queryParams: [],
            postParams: [],
            body: json_encode($payload, JSON_THROW_ON_ERROR),
            headers: [
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
            ],
        );

        // 4. Assert HTTP Status Code using standard PHPUnit assertion
        $this->assertSame(Status::CREATED, $response->getStatusCode());
        $this->assertSame('application/json', $response->getHeaderLine('Content-Type'));

        // 5. Inspect JSON Body via ResponseAccessor
        $data = $response->getContentAsJson();
        $this->assertIsArray($data);
        $this->assertSame('success', $data['status']);
        $this->assertSame('Jane Doe', $data['data']['name']);
        $this->assertSame('jane.doe@example.com', $data['data']['email']);
    }

    public function testReturnsValidationErrorsOnInvalidInput(): void
    {
        /** @var ResponseAccessor $response */
        $response = $this->tester->doRequest(
            method: Method::POST,
            url: '/api/v1/users',
            queryParams: [],
            postParams: [],
            body: json_encode(['email' => 'invalid-email'], JSON_THROW_ON_ERROR),
            headers: [
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
            ],
        );

        $this->assertSame(Status::UNPROCESSABLE_ENTITY, $response->getStatusCode());

        $data = $response->getContentAsJson();
        $this->assertIsArray($data);
        $this->assertArrayHasKey('errors', $data);
    }
}
```

### 6.2. `ResponseAccessor` API Reference

`Yiisoft\Yii\Testing\ResponseAccessor` wraps the PSR-7 `ResponseInterface` and provides convenient test methods:

| Method | Return Type | Description |
|---|---|---|
| `$response->getStatusCode()` | `int` | Standard PSR-7 HTTP status code (e.g. `200`, `201`, `404`). |
| `$response->getContent()` | `string` | Rewinds the response body stream and returns raw string content. |
| `$response->getContentAsJson($flags)` | `mixed` | Decodes body as JSON (`JSON_OBJECT_AS_ARRAY \| JSON_THROW_ON_ERROR \| JSON_UNESCAPED_UNICODE` by default). |
| `$response->getHeaderLine(string $name)` | `string` | Standard PSR-7 header string (e.g. `'application/json'`). |
| `$response->hasHeader(string $name)` | `bool` | Checks if header exists. |
| `$response->getBody()` | `StreamInterface` | Raw PSR-7 body stream. |
| `$response->getResponse()` | `ResponseInterface` | Unwraps the underlying PSR-7 response instance. |

> [!CAUTION]
> **Common Hallucinations:**
> - `FunctionalTestCase` does **NOT** provide `$this->assertResponseStatusCode()` or `$this->getResponseJson()`. It extends standard `PHPUnit\Framework\TestCase`. Use `$this->assertSame(Status::OK, $response->getStatusCode())` and `$response->getContentAsJson()`.
> - `FunctionalTestCase::doRequest(string $method, string $url)` only takes two arguments. To send custom headers, JSON body, or query parameters, call `$this->tester->doRequest(method: ..., url: ..., queryParams: ..., postParams: ..., body: ..., headers: ...)`.
> - Always call `$this->mockService(...)` **BEFORE** `$this->bootstrapApplication()`. The DI container is built and frozen during bootstrap.

---

## 7. In-Memory HTTP Testing via `HttpApplicationRunner`

For projects using `codeception/codeception` or custom test runners, you can execute requests directly through `Yiisoft\Yii\Runner\Http\HttpApplicationRunner::runAndGetResponse()`:

```php
declare(strict_types=1);

namespace App\Tests\Functional;

use HttpSoft\Message\ServerRequestFactory;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\Http\Method;
use Yiisoft\Http\Status;
use Yiisoft\Yii\Runner\Http\HttpApplicationRunner;

use const JSON_THROW_ON_ERROR;
use function dirname;
use function json_decode;

final class DirectRunnerHttpTest extends TestCase
{
    private HttpApplicationRunner $runner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->runner = new HttpApplicationRunner(
            rootPath: dirname(__DIR__, 2),
            debug: false,
            checkEvents: false,
            environment: 'tests',
        );
    }

    public function testGetHealthCheck(): void
    {
        // Standard PSR-17 ServerRequest creation
        $request = (new ServerRequestFactory())
            ->createServerRequest(Method::GET, '/api/health')
            ->withHeader('Accept', 'application/json');

        // Runs application pipeline in-memory without socket/HTTP server
        $response = $this->runner->runAndGetResponse($request);

        $this->assertSame(Status::OK, $response->getStatusCode());

        $body = $response->getBody();
        if ($body->isSeekable()) {
            $body->rewind();
        }
        $rawContent = $body->getContents();

        $data = json_decode($rawContent, associative: true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame('healthy', $data['status']);
    }
}
```

---

## 8. Testing Console Commands (`yiisoft/yii-console`)

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

## 9. Ephemeral SQLite Database for Integration Tests (`yiisoft/db-sqlite`)

For fast integration tests of repositories and migrations without database network overhead, use an in-memory SQLite database (`sqlite::memory:`).

### 9.1. In-Memory Database Configuration (`config/environments/tests/di.php`)

```php
declare(strict_types=1);

use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Sqlite\Connection;
use Yiisoft\Db\Sqlite\Driver;

return [
    ConnectionInterface::class => [
        'class' => Connection::class,
        '__construct()' => [
            'driver' => new Driver('sqlite::memory:'),
        ],
    ],
];
```

### 9.2. Running Migrations in Test Fixtures

When running migrations manually inside a test setup, instantiate `MigrationBuilder` with `Yiisoft\Db\Migration\Informer\NullMigrationInformer` to suppress console output:

```php
declare(strict_types=1);

namespace App\Tests\Integration\Repository;

use PHPUnit\Framework\TestCase;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Migration\Informer\NullMigrationInformer;
use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\MigrationInterface;
use Yiisoft\Db\Schema\Column\ColumnBuilder;
use Yiisoft\Db\Sqlite\Connection;
use Yiisoft\Db\Sqlite\Driver;

// Concrete migration defining database schema
final class M261022120000CreateUserTable implements MigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $b->createTable('user', [
            'id' => ColumnBuilder::primaryKey(),
            'name' => ColumnBuilder::string(128)->notNull(),
            'email' => ColumnBuilder::string(255)->notNull(),
        ]);
    }
}

abstract class DatabaseTestCase extends TestCase
{
    protected ConnectionInterface $db;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Establish SQLite in-memory connection
        $this->db = new Connection(new Driver('sqlite::memory:'));

        // 2. Instantiate MigrationBuilder with NullMigrationInformer
        $informer = new NullMigrationInformer();
        $builder = new MigrationBuilder(db: $this->db, informer: $informer);

        // 3. Execute migration DDL schema (12 contiguous digits in class name)
        (new M261022120000CreateUserTable())->up($builder);

        // 4. Begin transaction for test isolation
        $this->db->beginTransaction();
    }

    protected function tearDown(): void
    {
        // Rollback test data to keep SQLite pristine
        if ($this->db->getTransaction() !== null) {
            $this->db->getTransaction()->rollBack();
        }

        $this->db->close();
        parent::tearDown();
    }
}
```

> [!CAUTION]
> **Critical SQLite In-Memory Rules:**
> 1. `sqlite::memory:` databases belong strictly to a single PDO connection. If the connection is closed or garbage-collected, the in-memory database and all schemas are destroyed instantly.
> 2. `MigrationBuilder::__construct()` strictly requires 2 mandatory arguments: `ConnectionInterface $db` and `MigrationInformerInterface $informer`. Passing only `$db` throws a fatal `ArgumentCountError`.
> 3. In Yii3 migrations, column definitions must use `ColumnBuilder::primaryKey()`, `ColumnBuilder::string(...)` from `Yiisoft\Db\Schema\Column\ColumnBuilder` or abstract type strings (`'pk'`, `'string not null'`). `$b->primaryKey()` and `$b->string()` are legacy Yii2 methods and do not exist on `MigrationBuilder`.
> 4. Migration class names must follow the strict 12-digit format `M<YYMMDDHHMMSS><Name>` without underscores (e.g. `M261022120000CreateUserTable`).

---

## 10. PHP 8 Named Arguments & Signatures Reference

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
| `Yiisoft\Yii\Testing\FunctionalTestCase::doRequest` | `doRequest(string $method, string $url): ResponseAccessor` *(2 arguments only)* |
| `Yiisoft\Yii\Testing\FunctionalTester::doRequest` | `doRequest(string $method, string $url, array $queryParams = [], array $postParams = [], mixed $body = null, array $headers = []): ResponseAccessor` |
| `Yiisoft\Yii\Testing\FunctionalTestCase::mockService` | `mockService(string $id, mixed $definition): void` |
| `Yiisoft\Yii\Testing\FunctionalTestCase::bootstrapApplication` | `bootstrapApplication(?string $projectRootPath = null): void` |
| `Yiisoft\Yii\Runner\Http\HttpApplicationRunner::__construct` | `__construct(string $rootPath, bool $debug = false, bool $checkEvents = false, ?string $environment = null, ...)` |
| `HttpApplicationRunner::runAndGetResponse` | `runAndGetResponse(?ServerRequestInterface $request = null): ResponseInterface` |
| `Yiisoft\Db\Migration\MigrationBuilder::__construct` | `__construct(ConnectionInterface $db, MigrationInformerInterface $informer, ?int $maxSqlOutputLength = null)` |
| `Yiisoft\Db\Sqlite\Driver::__construct` | `__construct(string\|Stringable $dsn, string $username = '', string $password = '', array $attributes = [])` |
| `Yiisoft\Db\Sqlite\Connection::__construct` | `__construct(PdoDriverInterface $driver, SchemaCache $schemaCache = new SchemaCache(), ?ColumnFactoryInterface $columnFactory = null)` |

---

## 11. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| **Global state: `Yii::$app` or static locator** | Yii3 has no global state or `Yii::$app`. Calling it throws `Error: Class "Yii" not found`. | Inject dependencies via constructor or use `$this->getContainer()->get(...)`. |
| **Mutating container: `$this->getContainer()->set(...)`** | PSR-11 `ContainerInterface` only has `get()` and `has()`. Calling `set()` throws a Fatal Error. | Use `$this->mockService($id, $mock)` before bootstrap, or pass mocks to constructor in unit tests. |
| **Request without bootstrap: `$this->tester->doRequest(...)`** | Throws `RuntimeException: The application was not initialized. Initialize the application before the request`. | Always call `$this->bootstrapApplication()` in `setUp()` before invoking requests. |
| **Late service mocking after `bootstrapApplication()`** | DI container is built and frozen during bootstrap; mock registrations after bootstrap are ignored. | Always call `$this->mockService(...)` **before** calling `$this->bootstrapApplication()`. |
| **Calling `$this->doRequest($method, $url, $headers, ...)` with extra arguments** | `FunctionalTestCase::doRequest()` accepts strictly only 2 arguments (`$method, $url`). Passing extra arguments throws `ArgumentCountError`. | Call `$this->tester->doRequest(method: ..., url: ..., queryParams: ..., postParams: ..., body: ..., headers: ...)`. |
| **Phantom methods: `$this->assertResponseStatusCode(...)`** | `FunctionalTestCase` extends PHPUnit `TestCase` and has no custom assertions; throws fatal undefined method. | Use standard PHPUnit assertions: `$this->assertSame(Status::OK, $response->getStatusCode())`. |
| **Phantom method: `$response->getResponseJson()`** | `ResponseAccessor` method is `getContentAsJson()`; calling `getResponseJson()` throws undefined method error. | Call `$data = $response->getContentAsJson();`. |
| **Phantom method: `$logger->hasMessage(...)`** | `Yiisoft\Test\Support\Log\SimpleLogger` does not have `hasMessage()`; throws fatal error. | Inspect `$logger->getMessages()` array: `[['level' => ..., 'message' => ..., 'context' => ...]]`. |
| **Calling legacy Yii2 methods on `MigrationBuilder`: `$b->primaryKey()`, `$b->string()`** | `MigrationBuilder` in Yii3 does not have `$b->primaryKey()`, `$b->string()`, etc.; throws fatal `Error: Call to undefined method`. | Use `ColumnBuilder::primaryKey()`, `ColumnBuilder::string(...)` from `Yiisoft\Db\Schema\Column\ColumnBuilder` or abstract strings (`'pk'`, `'string not null'`). |
| **Incomplete `MigrationBuilder` constructor: `new MigrationBuilder($db)`** | `MigrationBuilder` constructor requires `MigrationInformerInterface $informer` as 2nd parameter; throws `ArgumentCountError`. | Instantiate with `new MigrationBuilder(db: $db, informer: new NullMigrationInformer())`. |
| **Yii2 migration naming with underscore: `M261021_120000_Create...`** | Yii3 migration scanner regex strictly requires 12 contiguous digits (`/^(M(\d{12}).*)\.php$/s`). | Use 12 contiguous digits: `M261021120000CreateUserTable`. |
| **Unrewound PSR-7 streams: reading `$body->getContents()` repeatedly** | Streams advance pointer to EOF. Subsequent reads return empty string `""`. | Check `$stream->isSeekable()` and call `$stream->rewind()` before reading, or use `ResponseAccessor::getContent()`. |
| **Real network HTTP calls in functional tests** | Flaky tests, slow CI, port collisions, requires running external HTTP daemon. | Use in-memory `FunctionalTestCase` or `HttpApplicationRunner::runAndGetResponse()`. |
| **Assuming `sqlite::memory:` persists across separate connections** | Each new PDO connection to `sqlite::memory:` gets an isolated, empty database. | Keep the connection instance alive across the fixture lifecycle, or use a SQLite file path (`runtime/test.sq3`). |
| **Mocking final or readonly classes in PHPUnit** | PHPUnit throws `InvalidArgumentException: Class is declared "final" and cannot be mocked`. | Mock the interface that the class implements (e.g. `UserRepositoryInterface`), or use real instances for DTOs/Entities. |
| **Using dead PHPUnit methods: `withConsecutive()`, `setMethods()`, `at()`** | Removed in PHPUnit 10; triggers fatal `Error: Call to undefined method`. | Use `willReturnCallback()` with invocation counter, `onlyMethods()`, and `$this->exactly($n)`. |
| **Over-mocking PSR interfaces with `$this->createMock()`** | Creates brittle, verbose interaction expectations that break upon internal logging/event changes. | Use ready-made in-memory doubles from `yiisoft/test-support` (`SimpleLogger`, `SimpleEventDispatcher`, `StaticClock`, etc.). |
| **Mocking Domain Entities or Value Objects** | Entities and VOs hold pure state with zero I/O; mocking them creates unrealistic fake states. | Instantiate real domain objects directly; assert against returned object state. |
| **Non-boolean return in `$this->callback(...)`** | Closure returning `void` or truthy non-bool breaks PHPUnit constraint evaluator. | Ensure callback has strict `: bool` return type: `fn (User $u): bool => $u->getId() === 1`. |
| **Inverted assertion arguments: `assertSame($actual, $expected)`** | PHPUnit signature is `assertSame($expected, $actual)`. Inverted arguments produce confusing, backwards failure diffs in CI. | Always pass expected first: `$this->assertSame('Alex', $user->getName())`. |
| **Non-static Data Providers in PHPUnit 10/11** | Non-static data providers are deprecated in PHPUnit 10 and fail in PHPUnit 11. | Declare providers as `public static function provider(): array`. |
| **Flaky time tests with `time()` or `sleep()`** | Tests fail randomly during second rollovers or CI latency spikes. | Inject PSR-20 `ClockInterface` and use `new StaticClock(new DateTimeImmutable('...'))`. |
| **Polluting superglobals (`$_POST`, `$_GET`, `$_SERVER`)** | Yii3 is purely PSR-7; superglobals are ignored by request handlers and leak into worker runners. | Pass query/post params via PSR-7 request or `$this->tester->doRequest(...)`. |
| **Asserting JSON as formatted raw strings** | Whitespace, key order, or encoding differences cause fragile, false-positive test failures. | Use `$response->getContentAsJson()` and assert structured PHP arrays, or use `assertJsonStringEqualsJsonString()`. |
| **Placing `expectException()` after throwing call** | PHPUnit must register the expectation **before** the exception is thrown; post-call throws uncaught exception. | Always place `$this->expectException(...)` before the triggering method invocation. |
| **Omitting `parent::setUp()` in `FunctionalTestCase`** | Skips `$this->tester` initialization, causing null pointer exceptions on `doRequest()` or `mockService()`. | Always call `parent::setUp()` at the start of overridden `setUp(): void`. |
| **Installing both PHPUnit and Testo together** | Conflicting runner binaries (`vendor/bin/phpunit`, `vendor/bin/testo`), competing coverage/mutation plugins, and duplicate test discovery in CI. | Pick one runner per project: standard `phpunit/phpunit` (mandatory if using `yiisoft/yii-testing`) or modern `testo/testo`. |
| **Using `FunctionalTestCase` with Testo runner** | `FunctionalTestCase` hard-extends `PHPUnit\Framework\TestCase`. Testo executes standalone classes and doesn't run PHPUnit test suites. | If using Testo, run functional HTTP tests via `HttpApplicationRunner::runAndGetResponse()` with `Testo\Assert`. |
| **Extending `FunctionalTestCase` inside Codeception Cest classes** | `FunctionalTestCase` is a PHPUnit `TestCase`. Codeception Cest classes do not extend `TestCase`; violates test runner lifecycles. | In Codeception Cests, inject actors (e.g. `FunctionalTester $I`); use `FunctionalTestCase` only under PHPUnit. |
