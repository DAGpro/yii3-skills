# Yii3 Testing: Functional HTTP, Middlewares & Endpoints

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Practical guide for testing Yii3 HTTP pipelines, PSR-15 middlewares, API endpoints, controllers, sessions, and cookies using `yiisoft/yii-testing`, `yiisoft/yii-runner-http`, `ResponseAccessor`, and in-memory test runners.

---

## Table of Contents
- [1. Functional HTTP Testing with `yiisoft/yii-testing`](#1-functional-http-testing-with-yiisoftyii-testing)
  - [1.1. Complete Functional Test Case (`FunctionalTestCase`)](#11-complete-functional-test-case-functionaltestcase)
  - [1.2. Service Mocking Before Bootstrap (`mockService`)](#12-service-mocking-before-bootstrap-mockservice)
  - [1.3. Request Dispatching via `FunctionalTester`](#13-request-dispatching-via-functionaltester)
- [2. `ResponseAccessor` API Reference](#2-responseaccessor-api-reference)
- [3. Testing PSR-15 Middlewares](#3-testing-psr-15-middlewares)
  - [3.1. Isolated Unit Testing of PSR-15 Middleware](#31-isolated-unit-testing-of-psr-15-middleware)
  - [3.2. Middleware Pipeline Integration Testing](#32-middleware-pipeline-integration-testing)
- [4. Testing Sessions, Cookies & Flash Messages](#4-testing-sessions-cookies--flash-messages)
  - [4.1. Stateful Session Testing & Session Mocking](#41-stateful-session-testing--session-mocking)
  - [4.2. Testing Cookies and Flash Messages](#42-testing-cookies-and-flash-messages)
- [5. In-Memory HTTP Testing via `HttpApplicationRunner`](#5-in-memory-http-testing-via-httpapplicationrunner)
- [6. PSR-7 Stream Testing with `StringStream`](#6-psr-7-stream-testing-with-stringstream)
- [7. Actor-Driven REST API Testing in Codeception](#7-actor-driven-rest-api-testing-in-codeception)
- [8. HTTP Testing Named Arguments & Signatures Reference](#8-http-testing-named-arguments--signatures-reference)
- [9. HTTP Anti-Pattern Matrix](#9-http-anti-pattern-matrix)
- [10. Related Guides](#10-related-guides)

---

## 1. Functional HTTP Testing with `yiisoft/yii-testing`

`yiisoft/yii-testing` provides `FunctionalTestCase` and `FunctionalTester`, running the entire Yii3 application stack in-memory without starting a live web server or binding to network ports.

### 1.1. Complete Functional Test Case (`FunctionalTestCase`)

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

### 1.2. Service Mocking Before Bootstrap (`mockService`)

`FunctionalTestCase` exposes `$this->mockService(string $id, mixed $definition)` to replace dependencies inside the container before the application kernel compiles:

```php
protected function setUp(): void
{
    parent::setUp();

    // Mock an external payment gateway interface
    $mockGateway = $this->createMock(PaymentGatewayInterface::class);
    $mockGateway->method('charge')->willReturn(true);

    // Register mock BEFORE bootstrapApplication()
    $this->mockService(PaymentGatewayInterface::class, $mockGateway);

    // Freeze container and boot kernel
    $this->bootstrapApplication();
}
```

### 1.3. Request Dispatching via `FunctionalTester`

While `$this->doRequest($method, $url)` exists on `FunctionalTestCase`, it strictly accepts **only 2 arguments** (`string $method, string $url`).

For rich requests (custom headers, JSON payload, form data, query parameters), always dispatch directly through the `$tester` property:

```php
/** @var ResponseAccessor $response */
$response = $this->tester->doRequest(
    method: Method::GET,
    url: '/api/v1/products',
    queryParams: ['page' => '1', 'limit' => '20'],
    postParams: [],
    body: null,
    headers: [
        'Authorization' => 'Bearer test_jwt_token',
        'Accept' => 'application/json',
    ],
);
```

---

## 2. `ResponseAccessor` API Reference

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
> - `$this->bootstrapApplication()` does **NOT** build the DI container: it only creates `TestApplicationRunner` and registers the shared `MockServiceProvider`. The container is compiled lazily — per `doRequest()` / `getContainer()` call — and rebuilt for each request, re-reading the mock provider every time. A mock therefore affects every request issued after it was registered; still call `$this->mockService(...)` before the request that must see it.

---

## 3. Testing PSR-15 Middlewares

Yii3 HTTP processing is organized as a pipeline of PSR-15 middlewares (`Psr\Http\Server\MiddlewareInterface`). Middlewares can be tested either as fast isolated unit tests or within the full HTTP pipeline.

### 3.1. Isolated Unit Testing of PSR-15 Middleware

Testing a middleware in isolation requires only a PSR-7 ServerRequest and a mock or anonymous `RequestHandlerInterface`:

```php
declare(strict_types=1);

namespace App\Tests\Unit\Middleware;

use HttpSoft\Message\ResponseFactory;
use HttpSoft\Message\ServerRequestFactory;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;

// 1. Example custom middleware that requires an API key
final class ApiKeyAuthMiddleware implements MiddlewareInterface
{
    public function __construct(private string $validKey) {}

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $providedKey = $request->getHeaderLine('X-Api-Key');
        if ($providedKey !== $this->validKey) {
            return (new ResponseFactory())
                ->createResponse(Status::UNAUTHORIZED)
                ->withHeader(Header::CONTENT_TYPE, 'application/json');
        }

        return $handler->handle($request);
    }
}

// 2. Isolated Unit Test
final class ApiKeyAuthMiddlewareTest extends TestCase
{
    public function testRejectsRequestWithoutValidKey(): void
    {
        $middleware = new ApiKeyAuthMiddleware(validKey: 'secret_123');

        $request = (new ServerRequestFactory())
            ->createServerRequest('GET', '/api/data')
            ->withHeader('X-Api-Key', 'wrong_key');

        // Handler should NEVER be called on unauthorized request
        $handler = $this->createMock(RequestHandlerInterface::class);
        $handler->expects($this->never())->method('handle');

        $response = $middleware->process($request, $handler);

        $this->assertSame(Status::UNAUTHORIZED, $response->getStatusCode());
    }

    public function testPassesRequestWithValidKeyToHandler(): void
    {
        $middleware = new ApiKeyAuthMiddleware(validKey: 'secret_123');

        $request = (new ServerRequestFactory())
            ->createServerRequest('GET', '/api/data')
            ->withHeader('X-Api-Key', 'secret_123');

        $expectedResponse = (new ResponseFactory())->createResponse(Status::OK);

        $handler = $this->createMock(RequestHandlerInterface::class);
        $handler->expects($this->once())
            ->method('handle')
            ->with($request)
            ->willReturn($expectedResponse);

        $response = $middleware->process($request, $handler);

        $this->assertSame(Status::OK, $response->getStatusCode());
    }
}
```

### 3.2. Middleware Pipeline Integration Testing

To test middleware execution order and attribute propagation within the full application, use `FunctionalTestCase`:

```php
public function testMiddlewareSetsCustomAttribute(): void
{
    $response = $this->tester->doRequest(
        method: Method::GET,
        url: '/api/v1/profile',
        headers: ['X-Api-Key' => 'secret_123'],
    );

    $this->assertSame(Status::OK, $response->getStatusCode());
    $this->assertTrue($response->hasHeader('X-Request-Id'));
}
```

---

## 4. Testing Sessions, Cookies & Flash Messages

### 4.1. Stateful Session Testing & Session Mocking

By default, `FunctionalTester` registers `Yiisoft\Session\NullSession` as the default test double for `Yiisoft\Session\SessionInterface`.

If your endpoints rely on stateful sessions (e.g. login, shopping cart, multi-step wizards), override `SessionInterface` before bootstrap with a real `Yiisoft\Session\Session` instance — it uses the native PHP session (`session_start()`) with `use_cookies` forced to `0` internally, so its state lives in `$_SESSION` rather than being in-memory:

```php
declare(strict_types=1);

namespace App\Tests\Functional;

use PHPUnit\Framework\TestCase;
use Yiisoft\Http\Method;
use Yiisoft\Http\Status;
use Yiisoft\Session\Session;
use Yiisoft\Session\SessionInterface;
use Yiisoft\Yii\Testing\FunctionalTestCase;

final class SessionAuthTest extends FunctionalTestCase
{
    private SessionInterface $session;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Create a stateful real Session instance (native session, cookies disabled; state lives in $_SESSION)
        $this->session = new Session();
        $this->session->open();

        // 2. Inject session mock before bootstrapping
        $this->mockService(SessionInterface::class, $this->session);
        $this->bootstrapApplication();
    }

    public function testLoginStoresUserIdInSession(): void
    {
        $response = $this->tester->doRequest(
            method: Method::POST,
            url: '/auth/login',
            postParams: [
                'login' => 'admin',
                'password' => 'secret123',
            ],
        );

        $this->assertSame(Status::FOUND, $response->getStatusCode());

        // Assert session state directly on injected SessionInterface
        $this->assertTrue($this->session->has('user_id'));
        $this->assertSame('usr_admin_01', $this->session->get('user_id'));
    }
}
```

### 4.2. Testing Cookies and Flash Messages

#### Sending and Inspecting Cookies
Cookies are transmitted via the standard PSR-7 `Cookie` request header and verified via `Set-Cookie` response headers:

```php
public function testEndpointSetsCookie(): void
{
    // Send request with cookie
    $response = $this->tester->doRequest(
        method: Method::GET,
        url: '/preferences/dark-mode',
        headers: [
            'Cookie' => 'theme=light; PHPSESSID=session_abc123',
        ],
    );

    $this->assertSame(Status::OK, $response->getStatusCode());

    // Inspect Set-Cookie header on response
    $setCookieHeader = $response->getHeaderLine('Set-Cookie');
    $this->assertStringContainsString('theme=dark', $setCookieHeader);
}
```

#### Inspecting Flash Messages
When testing actions that write flash messages, verify them through `FlashInterface` or `SessionInterface`:

```php
public function testActionSetsFlashMessage(): void
{
    $this->tester->doRequest(
        method: Method::POST,
        url: '/contact/submit',
        postParams: ['email' => 'user@example.com', 'message' => 'Hello!'],
    );

    $flash = $this->getContainer()->get(\Yiisoft\Session\Flash\FlashInterface::class);
    $this->assertTrue($flash->has('success'));
    $this->assertSame('Thank you for your message.', $flash->get('success'));
}
```

---

## 5. In-Memory HTTP Testing via `HttpApplicationRunner`

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
            environment: 'test',
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

## 6. PSR-7 Stream Testing with `StringStream`

`Yiisoft\Test\Support\HttpMessage\StringStream` implements `Psr\Http\Message\StreamInterface` with string content. In HTTP tests, use it to mock or supply request bodies and verify streaming behavior, including rewinding and the custom `readable`/`writable`/`seekable` constructor flags for error-path testing.

The full test-double example — stream inspection, pointer/rewind semantics, and edge-case testing with configurable flags — lives in [`testing-core.md`, §3.6](testing-core.md#36-psr-7-stream-stringstream); its constructor signature is listed in §8 below.

---

## 7. Actor-Driven REST API Testing in Codeception

> [!TIP]
> **Codeception REST Actors Reference:**
> Codeception is an alternative, actor-driven test framework — mutually exclusive with plain PHPUnit/Testo suite setups (resolve what is installed via the project's `composer.json`). For the complete reference — REST-module suite configuration (`tests/Api.suite.yml` with `composer serve`), the REST Cest example, the in-memory `FunctionalTester` actor dispatching through `HttpApplicationRunner::runAndGetResponse()`, and in-memory functional Cests — see the [Codeception Testing Guide, §2. Actor-Driven REST API Testing in Codeception](testing-codeception.md#2-actor-driven-rest-api-testing-in-codeception).

---

## 8. HTTP Testing Named Arguments & Signatures Reference

| Class / Method | Signature & Named Parameters |
|---|---|
| `Yiisoft\Yii\Testing\FunctionalTestCase::doRequest` | `doRequest(string $method, string $url): ResponseAccessor` *(2 arguments only)* |
| `Yiisoft\Yii\Testing\FunctionalTester::doRequest` | `doRequest(string $method, string $url, array $queryParams = [], array $postParams = [], mixed $body = null, array $headers = []): ResponseAccessor` |
| `Yiisoft\Yii\Testing\FunctionalTestCase::mockService` | `mockService(string $id, mixed $definition): void` |
| `Yiisoft\Yii\Testing\FunctionalTestCase::bootstrapApplication` | `bootstrapApplication(?string $projectRootPath = null): void` |
| `Yiisoft\Yii\Runner\Http\HttpApplicationRunner::__construct` | `__construct(string $rootPath, bool $debug = false, bool $checkEvents = false, ?string $environment = null, ...)` |
| `HttpApplicationRunner::runAndGetResponse` | `runAndGetResponse(?ServerRequestInterface $request = null): ResponseInterface` |
| `Yiisoft\Test\Support\HttpMessage\StringStream::__construct` | `__construct(string $content = '', int $position = 0, bool $readable = true, bool $writable = true, bool $seekable = true, Closure\|array\|null $metadata = null)` |

---

## 9. HTTP Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| **Request without bootstrap: `$this->tester->doRequest(...)`** | Throws `RuntimeException: The application was not initialized. Initialize the application before the request`. | Always call `$this->bootstrapApplication()` in `setUp()` before invoking requests. |
| **Late service mocking after `bootstrapApplication()`** | Not broken — the shared `MockServiceProvider` is re-consulted each time the container is compiled (every `doRequest()` / `getContainer()`). A mock only affects requests issued **after** it was registered; earlier responses were already served from the previous container build. | Register mocks before the request that must see them (a mock registered before `bootstrapApplication()` applies to all requests). |
| **Calling `$this->doRequest($method, $url, $headers, ...)` with extra arguments** | `FunctionalTestCase::doRequest()` declares exactly 2 parameters (`$method, $url`). Surplus **positional** arguments are silently ignored — headers/body never reach the request (a silent test blind spot); an unknown **named** argument throws `Error: Unknown named parameter`. | Call `$this->tester->doRequest(method: ..., url: ..., queryParams: ..., postParams: ..., body: ..., headers: ...)` — `FunctionalTester::doRequest()` accepts these named parameters. |
| **Phantom methods: `$this->assertResponseStatusCode(...)`** | `FunctionalTestCase` extends PHPUnit `TestCase` and has no custom assertions; throws fatal undefined method. | Use standard PHPUnit assertions: `$this->assertSame(Status::OK, $response->getStatusCode())`. |
| **Phantom method: `$response->getResponseJson()`** | `ResponseAccessor` method is `getContentAsJson()`; calling `getResponseJson()` throws undefined method error. | Call `$data = $response->getContentAsJson();`. |
| **Real network HTTP calls in functional tests** | Flaky tests, slow CI, port collisions, requires running external HTTP daemon. | Use in-memory `FunctionalTestCase` or `HttpApplicationRunner::runAndGetResponse()`. |
| **Unrewound PSR-7 streams: reading `$body->getContents()` repeatedly** | Streams advance pointer to EOF. Subsequent reads return empty string `""`. | Check `$stream->isSeekable()` and call `$stream->rewind()` before reading, or use `ResponseAccessor::getContent()`. |
| **Polluting superglobals (`$_POST`, `$_GET`, `$_SERVER`)** | Yii3 is purely PSR-7; superglobals are ignored by request handlers and leak into worker runners. | Pass query/post params via PSR-7 request or `$this->tester->doRequest(...)`. |
| **Asserting JSON as formatted raw strings** | Whitespace, key order, or encoding differences cause fragile, false-positive test failures. | Use `$response->getContentAsJson()` and assert structured PHP arrays, or use `assertJsonStringEqualsJsonString()`. |
| **Omitting `parent::setUp()` in `FunctionalTestCase`** | Skips `$this->tester` initialization; any later access to the uninitialized typed property `protected ?FunctionalTester $tester` throws `Error: Typed property ... $tester must not be accessed before initialization` (the nullsafe `$this->tester?->...` in `mockService()` does not save you — uninitialized is not `null`). | Always call `parent::setUp()` at the start of overridden `setUp(): void`. |
| **Extending `FunctionalTestCase` inside Codeception Cest classes** | `FunctionalTestCase` is a PHPUnit `TestCase`. Codeception Cest classes do not extend `TestCase`; violates test runner lifecycles. | In Codeception Cests, inject actors (e.g. `FunctionalTester $I`); use `FunctionalTestCase` only under PHPUnit. |

---

## 10. Related Guides
- [`testing-core.md`](testing-core.md) — Test architecture, PHPUnit runner, PSR test doubles, mocking rules, and unit testing.
- [`testing-testo.md`](testing-testo.md) — Alternative Testo runner and the exclusive runner rule (PHPUnit XOR Testo).
- [`testing-codeception.md`](testing-codeception.md) — Alternative Codeception 5 framework: actors, Cests, and REST-module API testing (owner of §7's moved material).
- [`testing-infection.md`](testing-infection.md) — Optional Infection mutation-testing quality gate layered on top of the runner.
- [`testing-console.md`](testing-console.md) — Console command testing with `CommandTester`, exit codes, prompts, and autocompletion.
- [`testing-database.md`](testing-database.md) — Ephemeral in-memory SQLite, migrations, transactions, and repository testing.
- [`http-middlewares.md`](http-middlewares.md) — PSR-15 middleware pipeline and official middleware catalog.
- [`http-state.md`](http-state.md) — Sessions, cookies, CSRF protection, and flash messages.
- [`http-actions-and-controllers.md`](http-actions-and-controllers.md) — Action design, request DTO hydration, and response formatting.
- [`http-routes.md`](http-routes.md) — FastRoute routing syntax, route groups, and route middleware dispatching.
