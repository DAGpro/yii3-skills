# Yii3 Testing: Testo Runner (`testo/testo`)

> Complete reference for the `testo/testo` runner path in Yii3 projects: the mandatory exclusive runner rule (PHPUnit XOR Testo), installation, `testo.php` configuration, `#[Test]` classes with `Testo\Assert`, in-memory functional HTTP testing without PHPUnit, and Mockery integration via `php-testo/bridge-mockery`.

**Scope & Ownership.** This guide is the single source of truth for the Testo runner and its bridges. The general test architecture, the PHPUnit runner, PSR test doubles from `yiisoft/test-support`, and PHPUnit mocking rules are owned by the [Testing Core Guide](testing-core.md). Testo is **mutually exclusive** with `phpunit/phpunit` — resolve what is installed via the project's `composer.json` (see [package-catalog.md, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family)). Codeception (an alternative actor-driven framework) is owned by the [Codeception Testing Guide](testing-codeception.md); Infection mutation testing (an optional layer on top of the runner, not an alternative runner) by the [Mutation Testing Guide](testing-infection.md).

---

## Table of Contents
- [1. The Exclusive Runner Rule: PHPUnit XOR Testo](#1-the-exclusive-runner-rule-phpunit-xor-testo)
- [2. Testo Runner (`testo/testo`)](#2-testo-runner-testotesto)
  - [2.1. Installation](#21-installation)
  - [2.2. Initialization & Configuration (`testo.php`)](#22-initialization--configuration-testophp)
  - [2.3. Test Structure in Testo](#23-test-structure-in-testo)
  - [2.4. In-Memory Functional HTTP Testing on Testo](#24-in-memory-functional-http-testing-on-testo)
  - [2.5. Execution](#25-execution)
- [3. Mocking in Testo via Mockery (`php-testo/bridge-mockery`)](#3-mocking-in-testo-via-mockery-php-testobridge-mockery)
- [Related Topic Guides](#related-topic-guides)

---

## 1. The Exclusive Runner Rule: PHPUnit XOR Testo

> [!WARNING]
> ### ⚠️ Mandatory Exclusive Runner Rule
> A project must choose **either** `phpunit/phpunit` **or** `testo/testo`. **Never install both test runners in the same `composer.json`!**
> - **Binary & Plugin Conflicts:** Installing both leads to conflicting CLI binaries (`vendor/bin/phpunit`, `vendor/bin/testo`), competing static analysis and coverage plugins, and duplicate test discovery overhead.
> - **Framework Integration Boundary:** `yiisoft/yii-testing` (`FunctionalTestCase`) hard-extends `PHPUnit\Framework\TestCase`. If a project selects `testo/testo`, HTTP functional tests should be executed directly via `HttpApplicationRunner::runAndGetResponse()` with `Testo\Assert` and PSR-7 requests, or unit/integration tests with `yiisoft/test-support` doubles, rather than `yiisoft/yii-testing`.

---

## 2. Testo Runner (`testo/testo`)

Testo is an extensible, ultra-fast modern PHP testing framework developed by `roxblnfk` with active evaluation and adoption in the Yii community. It features a lightweight core, middleware architecture, and plugin system.

### 2.1. Installation
```bash
composer require --dev testo/testo
```
If using Mockery for mocks:
```bash
composer require --dev php-testo/bridge-mockery mockery/mockery
```

### 2.2. Initialization & Configuration (`testo.php`)
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
        new MockeryPlugin(), // Automatically invokes \Mockery::close() after every test
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

### 2.3. Test Structure in Testo
Testo test classes do **not** extend a monolithic `TestCase`. They are plain PHP classes annotated with `#[Test]` from `Testo\Test`, using `Testo\Assert` for assertions:

```php
declare(strict_types=1);

namespace App\Tests\Unit;

use Mockery;
use Mockery\MockInterface;
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

final class UserRegisteredEvent
{
    public function __construct(public readonly User $user) {}
}

#[Test]
final class RegisterUserTest
{
    public function createsUserAndDispatchesEvent(): void
    {
        // 1. Mock via Mockery (auto-closed by MockeryPlugin)
        /** @var UserRepositoryInterface&MockInterface $repository */
        $repository = Mockery::mock(UserRepositoryInterface::class);
        $repository->shouldReceive('save')->once();

        // 2. PSR test double from yiisoft/test-support
        $dispatcher = new SimpleEventDispatcher();

        // 3. Execute
        $user = new User(email: 'alex@example.com', name: 'Alex');
        $repository->save($user);
        $dispatcher->dispatch(new UserRegisteredEvent($user));

        // 4. Assert via Testo\Assert
        Assert::same('alex@example.com', $user->getEmail());
        Assert::true($user->isActive());
        Assert::true($dispatcher->isClassTriggered(UserRegisteredEvent::class));
    }
}
```

### 2.4. In-Memory Functional HTTP Testing on Testo
Because `yiisoft/yii-testing` requires PHPUnit, functional HTTP testing on the Testo path executes requests in-memory via `HttpApplicationRunner::runAndGetResponse()`: instantiate the runner with the project `rootPath` and `environment: 'test'`, create a PSR-7 `ServerRequest` (e.g. `HttpSoft\Message\ServerRequest`), call `runAndGetResponse($request)`, and assert the status code and body with `Testo\Assert`.

> [!TIP]
> **In-Memory HTTP Runner Reference:**
> For the complete PHPUnit-based canonical recipe on runner construction, PSR-7 request creation, and body rewind/assertions, see the [Functional HTTP Testing Guide, §5](testing-http.md#5-in-memory-http-testing-via-httpapplicationrunner); mirror it on the Testo path using `#[Test]` classes and `Testo\Assert` instead of PHPUnit assertions.

### 2.5. Execution
```bash
vendor/bin/testo
vendor/bin/testo run --suite=Unit
```

---

## 3. Mocking in Testo via Mockery (`php-testo/bridge-mockery`)

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

## Related Topic Guides
- [Testing Core Guide](testing-core.md) — Test architecture, PHPUnit runner (§2.1), PSR test doubles (`yiisoft/test-support`), mocking rules, and named-arguments reference.
- [Codeception Testing Guide](testing-codeception.md) — Alternative actor-driven test framework (mutually exclusive with plain PHPUnit/Testo suite setups).
- [Mutation Testing Guide](testing-infection.md) — Optional Infection quality gate layered on top of the chosen runner (`testo/bridge-infection` on the Testo path).
- [Functional HTTP Testing Guide](testing-http.md) — Functional HTTP pipelines, `FunctionalTestCase`, and the canonical in-memory `HttpApplicationRunner` recipe (§5).
