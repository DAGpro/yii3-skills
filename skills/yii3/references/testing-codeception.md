# Yii3 Testing: Codeception (`codeception/codeception` ^5)

> Complete reference for Codeception 5 testing in Yii3 projects: installation, root and suite configuration, actor roles (`ConsoleTester`, `ApiTester`, `UnitTester`, `FunctionalTester`), Cest implementation, and REST API testing with the REST module.

**Scope & Ownership.** This guide is the single source of truth for Codeception in Yii3. Codeception is an alternative, actor-driven test framework that is **mutually exclusive** with plain PHPUnit/Testo suite setups — resolve what is installed via the project's `composer.json` (see [package-catalog.md, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family)). The PHPUnit and Testo runners, PSR test doubles, and mocking rules are owned by the [Testing Core Guide](testing-core.md); the canonical in-memory `HttpApplicationRunner` recipe reused by the in-memory actor below is owned by the [Functional HTTP Testing Guide, §5](testing-http.md#5-in-memory-http-testing-via-httpapplicationrunner).

---

## Table of Contents
- [1. Codeception (`codeception/codeception` ^5)](#1-codeception-codeceptioncodeception-5)
  - [1.1. Installation](#11-installation)
  - [1.2. Root Configuration (`codeception.yml`)](#12-root-configuration-codeceptionyml)
  - [1.3. Suite Configuration (`tests/Functional.suite.yml`)](#13-suite-configuration-testsfunctionalsuiteyml)
  - [1.4. Actor Roles and Cest Implementation](#14-actor-roles-and-cest-implementation)
    - [1.4.1. `ConsoleTester` (`tests/Support/ConsoleTester.php`)](#141-consolotester-testssupportconsolotesterphp)
    - [1.4.2. `ApiTester` (`tests/Support/ApiTester.php`)](#142-apitester-testssupportapitesterphp)
    - [1.4.3. `UnitTester` with `Codeception\Test\Unit`](#143-unittester-with-codeceptiontestunit)
  - [1.5. Execution](#15-execution)
- [2. Actor-Driven REST API Testing in Codeception](#2-actor-driven-rest-api-testing-in-codeception)
  - [2.1. Suite Configuration (`tests/Api.suite.yml`)](#21-suite-configuration-testsapisuiteyml)
  - [2.2. REST Cest Example (`tests/Api/UserApiCest.php`)](#22-rest-cest-example-testsapiuserapicestphp)
  - [2.3. In-Memory Functional Actor (`tests/Support/FunctionalTester.php`)](#23-in-memory-functional-actor-testssupportfunctionaltesterphp)
  - [2.4. In-Memory Functional Cest Example (`tests/Functional/HomePageCest.php`)](#24-in-memory-functional-cest-example-testsfunctionalhomepagecestphp)
- [Related Topic Guides](#related-topic-guides)

---

## 1. Codeception (`codeception/codeception` ^5)

Codeception 5 is supported in official Yii3 application templates (`yiisoft/app`, `yiisoft/app-api`) for projects requiring actor-driven test suites (`Console`, `Functional`, `Unit`, `Api`, `Web`).

### 1.1. Installation
```bash
composer require --dev codeception/codeception:^5.3.5 codeception/module-asserts codeception/module-cli codeception/module-rest codeception/module-phpbrowser codeception/lib-innerbrowser
```

The REST module used by the `ApiTester` examples (`sendGET()`, `seeResponseCodeIs()`, `seeResponseIsJson()`) additionally requires `codeception/module-phpbrowser` and `codeception/lib-innerbrowser` (the same dev requirements provisioned by `yiisoft/app-api`).

### 1.2. Root Configuration (`codeception.yml`)
```yaml
namespace: App\Tests
support_namespace: Support
bootstrap: bootstrap.php

settings:
  shuffle: true
  colors: true

paths:
  tests: tests
  output: tests/_output
  data: tests/Support/Data
  support: tests/Support

coverage:
  enabled: true
  show_uncovered: true
  show_only_summary: true
  include:
    - src/*
    - public/index.php
    - yii

extensions:
  enabled:
    - Codeception\Extension\RunFailed
```

### 1.3. Suite Configuration (`tests/Functional.suite.yml`)
```yaml
actor: FunctionalTester
modules:
  enabled:
    - Asserts
```

### 1.4. Actor Roles and Cest Implementation

> [!TIP]
> **Codeception HTTP Actor Reference:**
> The `FunctionalTester` actor definition — `sendRequest()` dispatching in-memory PSR-7 requests via `HttpApplicationRunner::runAndGetResponse()` — and its functional Cest usage are covered in [§2.3 In-Memory Functional Actor](#23-in-memory-functional-actor-testssupportfunctionaltesterphp) below.

#### 1.4.1. `ConsoleTester` (`tests/Support/ConsoleTester.php`)
Runs `./yii` CLI commands via shell invocation:

```php
declare(strict_types=1);

namespace App\Tests\Support;

use Codeception\Actor;

class ConsoleTester extends Actor
{
    use _generated\ConsoleTesterActions;

    public function runApp(?string $parameters = null): void
    {
        $this->runShellCommand(
            dirname(__DIR__, 2) . '/yii' . ($parameters === null ? '' : (' ' . $parameters)),
        );
    }
}
```

*Console Cest Usage (`tests/Console/EchoCest.php`):*
```php
declare(strict_types=1);

namespace App\Tests\Console;

use App\Tests\Support\ConsoleTester;

final class EchoCest
{
    public function testEchoCommand(ConsoleTester $I): void
    {
        $I->runApp('echo "Testing Yii3"');
        $I->canSeeResultCodeIs(0);
        $I->seeInShellOutput('Testing Yii3');
    }
}
```

#### 1.4.2. `ApiTester` (`tests/Support/ApiTester.php`)
In `yiisoft/app-api`, REST endpoints are tested via `ApiTester` paired with `Codeception\Util\HttpCode`:

```php
declare(strict_types=1);

namespace App\Tests\Api;

use App\Tests\Support\ApiTester;
use Codeception\Util\HttpCode;

final class UserApiCest
{
    public function testGetUsers(ApiTester $I): void
    {
        $I->sendGET('/api/users');
        $I->seeResponseCodeIs(HttpCode::OK);
        $I->seeResponseIsJson();
        $I->seeResponseContainsJson([
            'status' => 'success',
        ]);
    }
}
```

#### 1.4.3. `UnitTester` with `Codeception\Test\Unit`
```php
declare(strict_types=1);

namespace App\Tests\Unit;

use Codeception\Test\Unit;
use function PHPUnit\Framework\assertSame;

final class ConfigTest extends Unit
{
    protected function _before(): void
    {
        // Setup state before each test
    }

    protected function _after(): void
    {
        // Teardown state after each test
    }

    public function testEnvironment(): void
    {
        assertSame('test', getenv('APP_ENV') ?: 'test');
    }
}
```

### 1.5. Execution
```bash
vendor/bin/codecept run
vendor/bin/codecept run Functional
```

---

## 2. Actor-Driven REST API Testing in Codeception

Codeception integration follows the official `yiisoft/app-api` template. JSON API assertion testing uses the `Api` suite with the REST module; since no Yii3 framework module exists for Codeception, the REST module depends on `PhpBrowser` and drives a live served application instead of in-memory dispatch (for pure in-memory requests without the REST module, use the `FunctionalTester` actor from [§2.3](#23-in-memory-functional-actor-testssupportfunctionaltesterphp)).

### 2.1. Suite Configuration (`tests/Api.suite.yml`)

```yaml
actor: ApiTester
extensions:
  enabled:
    - Codeception\Extension\RunProcess:
        0: composer serve
        sleep: 5
modules:
  enabled:
    - REST:
        url: http://127.0.0.1:8080
        depends: PhpBrowser
```

The `composer serve` script (`@php ./yii serve`) from the template's `composer.json` starts the application server on `127.0.0.1:8080` before the suite runs.

### 2.2. REST Cest Example (`tests/Api/UserApiCest.php`)

```php
declare(strict_types=1);

namespace App\Tests\Api;

use App\Tests\Support\ApiTester;

final readonly class UserApiCest
{
    public function tryToCreateUser(ApiTester $I): void
    {
        $I->haveHttpHeader('Content-Type', 'application/json');
        $I->haveHttpHeader('Accept', 'application/json');
        $I->sendPost('/api/v1/users', [
            'email' => 'codecept@example.com',
            'name' => 'Codecept User',
        ]);

        $I->seeResponseCodeIs(201);
        $I->seeResponseIsJson();
        $I->seeResponseContainsJson([
            'status' => 'success',
            'data' => [
                'email' => 'codecept@example.com',
            ],
        ]);
    }
}
```

### 2.3. In-Memory Functional Actor (`tests/Support/FunctionalTester.php`)

For in-memory functional smoke tests without the REST module, define a `FunctionalTester` actor that executes in-memory HTTP requests using `HttpApplicationRunner::runAndGetResponse()` without launching an external web server:

```php
declare(strict_types=1);

namespace App\Tests\Support;

use Codeception\Actor;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Yii\Runner\Http\HttpApplicationRunner;

class FunctionalTester extends Actor
{
    use _generated\FunctionalTesterActions;

    public function sendRequest(ServerRequestInterface $request): ResponseInterface
    {
        $runner = new HttpApplicationRunner(
            rootPath: dirname(__DIR__, 2),
            environment: 'test',
        );

        $response = $runner->runAndGetResponse($request);

        $body = $response->getBody();
        if ($body->isSeekable()) {
            $body->rewind();
        }

        return $response;
    }
}
```

### 2.4. In-Memory Functional Cest Example (`tests/Functional/HomePageCest.php`)

```php
declare(strict_types=1);

namespace App\Tests\Functional;

use App\Tests\Support\FunctionalTester;
use HttpSoft\Message\ServerRequest;
use function PHPUnit\Framework\assertSame;
use function PHPUnit\Framework\assertStringContainsString;

final class HomePageCest
{
    public function testHomePageRenders(FunctionalTester $tester): void
    {
        $request = new ServerRequest(method: 'GET', uri: '/');
        $response = $tester->sendRequest($request);

        assertSame(200, $response->getStatusCode());
        assertStringContainsString('Yii3', (string) $response->getBody());
    }
}
```

> [!NOTE]
> For in-memory functional smoke tests (status code and body assertions without REST-module actions), do not enable the REST module: reuse the `FunctionalTester::sendRequest()` actor action defined in [§2.3](#23-in-memory-functional-actor-testssupportfunctionaltesterphp), which dispatches through `HttpApplicationRunner::runAndGetResponse()`.

> [!CAUTION]
> In Codeception Cests, inject actors (e.g. `FunctionalTester $I`); never extend `FunctionalTestCase` inside a Cest class. `FunctionalTestCase` is strictly a PHPUnit `TestCase`.

---

## Related Topic Guides
- [Testing Core Guide](testing-core.md) — Test architecture, PHPUnit runner, PSR test doubles (`yiisoft/test-support`), mocking rules, and named-arguments reference.
- [Testo Runner Guide](testing-testo.md) — Alternative lightweight runner (mutually exclusive with PHPUnit; a separate path from Codeception suites).
- [Mutation Testing Guide](testing-infection.md) — Optional Infection quality gate layered on top of the chosen runner.
- [Functional HTTP Testing Guide](testing-http.md) — Functional HTTP pipelines, `FunctionalTestCase`, middleware testing, sessions/cookies, and `ResponseAccessor`.
- [Console Commands Guide](infra-commands.md) — Console command definition, arguments/options, and execution lifecycle (`./yii` CLI used by `ConsoleTester`).
