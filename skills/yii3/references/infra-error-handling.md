# Yii3 Error Handling & Exception Management Guide

> Practical guide and configuration recipes for error catching pipelines, custom HTML/JSON renderers, Friendly Exceptions, and Sentry monitoring using `yiisoft/error-handler`, `yiisoft/friendly-exception`, `yiisoft/yii-sentry`, and `yiisoft/yii-event`.

---

## Table of Contents
- [1. Error Handling Architecture & Core Contracts](#1-error-handling-architecture--core-contracts)
- [2. ErrorCatcher Middleware & Pipeline Ordering](#2-errorcatcher-middleware--pipeline-ordering)
- [3. Exception Mapping with ExceptionResponder](#3-exception-mapping-with-exceptionresponder)
- [4. DI Configuration & Renderer Providers](#4-di-configuration--renderer-providers)
- [5. Custom Error Renderers](#5-custom-error-renderers)
  - [5.1. HTML Error Renderer (`HtmlRenderer` Configuration & Custom Templates)](#51-html-error-renderer-htmlrenderer-configuration--custom-templates)
  - [5.2. JSON Error Renderer (RFC 7807 Problem Details with `ThrowableRendererInterface`)](#52-json-error-renderer-rfc-7807-problem-details-with-throwablerendererinterface)
- [6. Friendly Exceptions (`FriendlyExceptionInterface`)](#6-friendly-exceptions-friendlyexceptioninterface)
- [7. User Exceptions & Information Disclosure (`UserException` & `#[UserException]`)](#7-user-exceptions--information-disclosure-userexception--userexception)
- [8. Logging & Sentry Monitoring (`yiisoft/yii-sentry`)](#8-logging--sentry-monitoring-yiisoftyii-sentry)
  - [8.1. PSR-14 Event Listener (`ApplicationError`)](#81-psr-14-event-listener-applicationerror)
  - [8.2. Sentry Web Integration (`SentryMiddleware`)](#82-sentry-web-integration-sentrymiddleware)
  - [8.3. Sentry Console Integration & Cron Monitoring](#83-sentry-console-integration--cron-monitoring)
- [9. Console Error Handling Architecture](#9-console-error-handling-architecture)
- [10. Low-Level PHP Error Handling (`ErrorHandler`)](#10-low-level-php-error-handling-errorhandler)
- [11. Anti-Pattern Matrix](#11-anti-pattern-matrix)
- [12. Related Topic Guides](#12-related-topic-guides)

---

## 1. Error Handling Architecture & Core Contracts

In Yii3, HTTP errors and unhandled exceptions are caught through a PSR-15 middleware boundary rather than legacy global exception handlers or static error actions. There is no error-action mechanism in `yiisoft/error-handler`: HTTP exceptions are handled by the `ErrorCatcher` middleware, PHP fatals/warnings/notices outside the HTTP pipeline by the low-level `ErrorHandler`, and unmatched pipeline ends by a fallback request handler.

| Component | FQCN | Role & Responsibilities |
|---|---|---|
| **`ErrorCatcher`** | `Yiisoft\ErrorHandler\Middleware\ErrorCatcher` | Outermost PSR-15 middleware wrapping the HTTP lifecycle. Catches all `Throwable`, dispatches the `ApplicationError` event (only when a PSR-14 dispatcher was injected into its optional second constructor parameter), and creates the fallback response via `ThrowableResponseFactoryInterface`. |
| **`ExceptionResponder`** | `Yiisoft\ErrorHandler\Middleware\ExceptionResponder` | PSR-15 middleware mapping specific exception classes to HTTP status codes (`int`) or custom callables returning `ResponseInterface`. Unmapped exceptions are re-thrown. |
| **`ApplicationError`** | `Yiisoft\ErrorHandler\Event\ApplicationError` | PSR-14 event dispatched whenever an unhandled `Throwable` is caught by `ErrorCatcher` or `ErrorHandler` — but only if a PSR-14 dispatcher was injected into the respective optional constructor parameter. |
| **`ThrowableResponseFactoryInterface`** | `Yiisoft\ErrorHandler\ThrowableResponseFactoryInterface` | Converts any caught `Throwable` into a valid PSR-7 `ResponseInterface` via `create(Throwable, ServerRequestInterface): ResponseInterface`. Implemented by `Yiisoft\ErrorHandler\ThrowableResponseFactory`. |
| **`ThrowableRendererInterface`** | `Yiisoft\ErrorHandler\ThrowableRendererInterface` | Converts `Throwable` into `ErrorData` via `render()` (production) and `renderVerbose()` (development). Declares `DEFAULT_ERROR_MESSAGE = 'An internal server error occurred.'` |
| **`ErrorData`** | `Yiisoft\ErrorHandler\ErrorData` | Final immutable value object implementing `\Stringable`. Holds the response body string plus headers; public API is exactly `__construct()`, `__toString()`, `addToResponse()` — there is no `getData()` method. |
| **`HeadersProvider`** | `Yiisoft\ErrorHandler\HeadersProvider` | Manages HTTP headers appended to every error response (e.g. security headers). Consumed by `ThrowableResponseFactory`, not by `ErrorCatcher`. |
| **`ContentTypeRendererProvider`** | `Yiisoft\ErrorHandler\RendererProvider\ContentTypeRendererProvider` | Resolves the renderer (`HtmlRenderer`, `JsonRenderer`, `XmlRenderer`, `PlainTextRenderer`) based on the request `Accept` header (q-factor sorted, exact-string match). |
| **`ErrorHandler`** | `Yiisoft\ErrorHandler\ErrorHandler` | Low-level handler for out-of-memory errors, fatals, warnings, notices and exceptions outside the PSR-15 pipeline (see section 10). |
| **`ThrowableHandler`** | `Yiisoft\Yii\Http\Handler\ThrowableHandler` | PSR-15 request handler (package `yiisoft/yii-http`) that re-throws a stored `Throwable`. Used by the HTTP runner to re-enter `ErrorCatcher` from outside the pipeline. |
| **`NotFoundHandler`** | `Yiisoft\Yii\Http\Handler\NotFoundHandler` | Pipeline-end fallback request handler from `yiisoft/yii-http` (not an error renderer): returns a bare 404 with body `We were unable to find the page "$path".` when no middleware produced a response. Wired explicitly via `Application`'s `fallbackHandler`; the code-level default is `UnhandledRequestHandler`, which throws `RuntimeException('No response was generated.')`. |
| **`FriendlyExceptionInterface`** | `Yiisoft\FriendlyException\FriendlyExceptionInterface` | Exception contract providing human-readable titles (`getName()`) and markdown fix recommendations (`getSolution()`). |
| **`UserException`** | `Yiisoft\ErrorHandler\Exception\UserException` | Exception class and PHP 8 `#[Attribute]` indicating the message is safe to display to end users in production. |
| **`SentryMiddleware`** | `Yiisoft\Yii\Sentry\SentryMiddleware` | PSR-15 middleware capturing exceptions into the Sentry `HubInterface` and re-throwing them to continue pipeline propagation. |

---

## 2. ErrorCatcher Middleware & Pipeline Ordering

> [!IMPORTANT]
> `ErrorCatcher` **MUST** be the very first (outermost) middleware in your HTTP middleware stack so it sees every `Throwable` thrown inside the pipeline.
>
> Under `yiisoft/yii-runner-http`, an exception thrown by a middleware placed **before** `ErrorCatcher` does **not** produce an unformatted 500: `HttpApplicationRunner` catches it, wraps it in `Yiisoft\Yii\Http\Handler\ThrowableHandler`, and re-processes the request through the container's `ErrorCatcher`, which renders the same rendered, PSR-3-logged error response (default status 500).
>
> Ordering still matters, because:
> - exceptions thrown before `ErrorCatcher` bypass everything nested inside it — `SentryMiddleware` capture and `ExceptionResponder` mapping never run for them;
> - the safety net is a feature of `yiisoft/yii-runner-http` — a custom runner would let the throwable escape to the global PHP error handler registered by `ErrorHandler::register()`;
> - in the safety-net path the `BeforeRequest` / `AfterRequest` application events observe a `null` response, and emitter failures (e.g. headers already sent) propagate.

The standard execution sequence (first-listed middleware = outermost = executed first):

1. **`ErrorCatcher`**: Catches everything thrown down the chain, dispatches `ApplicationError`, and renders a user-facing or debug response.
2. **`SentryMiddleware`**: Intercepts uncaught exceptions, captures them into Sentry, and immediately re-throws (`throw $e;`) so `ErrorCatcher` can format the HTTP response.
3. **`ExceptionResponder`**: Catches anticipated domain exceptions and converts them to standard HTTP status codes (e.g. 400, 404, 409) or custom responses.
4. **Application Middlewares**: Session, Authentication, CORS, etc.
5. **`Router`**: Matches route and executes action handler.

There is **no** `'middlewares'` params key: no package consumes it. The pipeline is wired through the DI definition of `Yiisoft\Yii\Http\Application`, whose `dispatcher` constructor parameter receives a `Yiisoft\Middleware\Dispatcher\MiddlewareDispatcher`.

In `config/web/di/application.php`:

```php
<?php

declare(strict_types=1);

use App\Infrastructure\Middleware\CustomAuthMiddleware;
use App\Web\NotFound\NotFoundHandler;
use Yiisoft\Definitions\DynamicReference;
use Yiisoft\Definitions\Reference;
use Yiisoft\ErrorHandler\Middleware\ErrorCatcher;
use Yiisoft\ErrorHandler\Middleware\ExceptionResponder;
use Yiisoft\Middleware\Dispatcher\MiddlewareDispatcher;
use Yiisoft\Router\Middleware\Router;
use Yiisoft\Session\SessionMiddleware;
use Yiisoft\Yii\Http\Application;
use Yiisoft\Yii\Sentry\SentryMiddleware;

/** @var array $params */

return [
    Application::class => [
        '__construct()' => [
            'dispatcher' => DynamicReference::to([
                'class' => MiddlewareDispatcher::class,
                '__construct()' => [
                    'middlewareDefinitions' => [
                        // 1. Outermost: catches every Throwable escaping the chain below.
                        ErrorCatcher::class,

                        // 2. Captures exceptions into Sentry, then re-throws.
                        SentryMiddleware::class,

                        // 3. Maps anticipated domain exceptions to HTTP responses (see section 3).
                        ExceptionResponder::class,

                        // 4. Application middlewares: session, auth, CORS, etc.
                        SessionMiddleware::class,
                        CustomAuthMiddleware::class,

                        // 5. Last: matches the route and invokes the action handler.
                        Router::class,
                    ],
                ],
            ]),
            // Pipeline-end fallback when no middleware produced a response.
            // The app template wires its own view-rendering 404 handler here.
            'fallbackHandler' => Reference::to(NotFoundHandler::class),
        ],
    ],
];
```

> [!NOTE]
> `MiddlewareDispatcher::withMiddlewares()` is `@deprecated since 5.5.0` — pass middleware definitions to the `__construct()` instead, as shown above. The canonical app template still uses `withMiddlewares()` inside `DynamicReference::to()`; both forms accept the same definition list. The first-listed middleware is the outermost and executes first (`MiddlewareDispatcher` reverses the definitions internally — never rely on the outdated "last specified handler will be executed first" sentence in its docblock).

**Fallback request handlers.** When no middleware produces a response, the pipeline falls back to the `fallbackHandler` configured on `Application`:

- The code-level default is `Yiisoft\Yii\Http\Handler\UnhandledRequestHandler`, which throws `RuntimeException('No response was generated.')` — it must be replaced to get a useful 404.
- `yiisoft/yii-http` ships `Yiisoft\Yii\Http\Handler\NotFoundHandler`, a bare fallback returning a 404 response with the body `We were unable to find the page "$path".` It requires a `Psr\Http\Message\ResponseFactoryInterface` and renders nothing else — it is not an error renderer.
- The canonical app template wires its own `App\Web\NotFound\NotFoundHandler`, which renders a full 404 view via the view renderer.

**Session behavior on errors.** `Yiisoft\Session\SessionMiddleware` commits the session (sends `Set-Cookie`) only when a response passes through it successfully. On a downstream `Throwable` it calls `$this->session->discard()` and re-throws — an unhandled exception means no new session cookie is sent with the error response.

---

## 3. Exception Mapping with ExceptionResponder

`Yiisoft\ErrorHandler\Middleware\ExceptionResponder` converts domain and application exceptions into designated HTTP responses or status codes without bloating controllers with try-catch blocks. For guidelines on thin-action design and returning structured responses, see [Actions & Controllers Guide](http-actions-and-controllers.md).

Constructor signature (exact names, order, and defaults):

```php
public function __construct(
    array $exceptionMap,
    \Psr\Http\Message\ResponseFactoryInterface $responseFactory,
    \Yiisoft\Injector\Injector $injector,
    bool $checkResponseBody = false,
)
```

The `$exceptionMap` supports two formats (`class-string<Throwable> => ...`):

1. **Integer format (`=> int`)**: Sends a status-code-only response created by `$responseFactory->createResponse($status)` — no body is written.
2. **Callable format (`=> callable`)**: Invoked via `Yiisoft\Injector\Injector` and must return `Psr\Http\Message\ResponseInterface`.

> [!IMPORTANT]
> Callable parameters are matched **by parameter name first**: only a parameter named exactly `$exception` receives the thrown exception and only `$request` receives the current `ServerRequestInterface`. Every other parameter is resolved from the DI container by type (or from its default value / implicit null); a required unresolvable parameter throws `MissingRequiredArgumentException`.

The first matching map entry wins; unmapped exceptions are re-thrown (they then reach `ErrorCatcher`). With `checkResponseBody = true`, the middleware forces `$response->getBody()` evaluation inside its `try` block, so exceptions thrown during body generation are also mapped to responses.

> [!NOTE]
> The `yiisoft/error-handler` README says `ExceptionResponder` "must be placed before `ErrorCatcher`". "Before" there means *handles the exception before `ErrorCatcher` does* — i.e. `ExceptionResponder` must sit **inside** `ErrorCatcher` (after it in the middleware array order). Exceptions propagate outward through the onion, so the outermost wrapper catches first: placed literally before `ErrorCatcher`, the responder's map would be dead because `ErrorCatcher` would intercept everything downstream of it first.

In `config/web/di/exception-responder.php`:

```php
<?php

declare(strict_types=1);

use App\Domain\Order\Exception\OrderAlreadyPaidException;
use App\Domain\User\Exception\UserNotFoundException;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\ErrorHandler\Middleware\ExceptionResponder;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;

use function json_encode;

use const JSON_THROW_ON_ERROR;
use const JSON_UNESCAPED_SLASHES;

return [
    ExceptionResponder::class => [
        'class' => ExceptionResponder::class,
        '__construct()' => [
            'exceptionMap' => [
                UserNotFoundException::class => Status::NOT_FOUND,
                OrderAlreadyPaidException::class => static function (
                    OrderAlreadyPaidException $exception,
                    ResponseFactoryInterface $responseFactory,
                ): ResponseInterface {
                    $response = $responseFactory->createResponse(Status::CONFLICT);
                    $response->getBody()->write(json_encode([
                        'type' => 'about:blank',
                        'title' => 'Conflict',
                        'status' => Status::CONFLICT,
                        'detail' => $exception->getMessage(),
                    ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));

                    return $response->withHeader(Header::CONTENT_TYPE, 'application/problem+json');
                },
            ],
            'checkResponseBody' => false,
        ],
    ],
];
```

---

## 4. DI Configuration & Renderer Providers

`yiisoft/error-handler` provides out-of-the-box configuration in `config/di-web.php` (config-plugin group `di-web`):

- `ThrowableRendererInterface::class => HtmlRenderer::class`
- `ThrowableResponseFactoryInterface` is configured as `ThrowableResponseFactory` whose `rendererProvider` is a `CompositeRendererProvider(HeadRendererProvider, ContentTypeRendererProvider)` built inside a `Yiisoft\Definitions\DynamicReference::to()` closure.

`Yiisoft\Definitions\DynamicReference::to()` closures execute lazily when the container resolves the enclosing definition, with `Psr\Container\ContainerInterface` parameters injected by the container.

> [!WARNING]
> The shipped `di-web.php` definition constructs `ContentTypeRendererProvider` **directly inside** the `DynamicReference::to()` closure. A bare `ContentTypeRendererProvider::class` DI override is therefore **not consumed** unless you also override the `rendererProvider` of `ThrowableResponseFactoryInterface` (see section 5.2 for a working example).

`ContentTypeRendererProvider::__construct(ContainerInterface $container, ?array $renderers = null)`:

- The default map is exactly: `application/json` → `JsonRenderer`, `application/xml` and `text/xml` → `XmlRenderer`, `text/plain` → `PlainTextRenderer`, `text/html` and `*/*` → `HtmlRenderer`.
- A custom `$renderers` map **replaces the default map entirely** — no merging.
- Accept header values are sorted by q-factor (`Yiisoft\Http\HeaderValueHelper::getSortedAcceptTypes()`), matched against map keys as **exact strings**, and `null` is returned on an invalid q-factor or no match. Custom media types only work if the client sends them verbatim.

Related providers and the factory contract:

- `RendererProviderInterface::get(ServerRequestInterface $request): ?ThrowableRendererInterface` — returning `null` is the "no renderer for this request" signal.
- `HeadRendererProvider` — for `Method::HEAD` requests returns a `HeaderRenderer` carrying the negotiated `Content-Type`; `Yiisoft\ErrorHandler\Renderer\HeaderRenderer` emits an **empty body** with `X-Error-Message` in production and `X-Error-Type` / `X-Error-Message` / `X-Error-Code` / `X-Error-File` / `X-Error-Line` in verbose mode.
- `CompositeRendererProvider::__construct(RendererProviderInterface ...$providers)` — returns the first non-null renderer; the shipped config composes `HeadRendererProvider` **first**, then `ContentTypeRendererProvider`, so HEAD requests get header-only errors.
- `ClosureRendererProvider::__construct(Closure $closure, ContainerInterface $container)` — the closure receives the request and returns a renderer class-string, a renderer instance, or `null`.

**`HeadersProvider`** is consumed by `ThrowableResponseFactory` (its fourth constructor parameter), not by `ErrorCatcher` — quote the code, not the `HeadersProvider` docblock, which misattributes the consumer. The full factory constructor is:

```php
public function __construct(
    \Psr\Http\Message\ResponseFactoryInterface $responseFactory,
    \Yiisoft\ErrorHandler\ErrorHandler $errorHandler,
    \Yiisoft\ErrorHandler\RendererProvider\RendererProviderInterface $rendererProvider,
    ?\Yiisoft\ErrorHandler\HeadersProvider $headersProvider = null,
)
```

Because the shipped `ThrowableResponseFactoryInterface` definition leaves `headersProvider` unset, it is autowired by type — defining `HeadersProvider::class` in the container is sufficient (omitted entirely, an empty `HeadersProvider` instance is created inline).

In `config/web/di/error-headers.php`:

```php
<?php

declare(strict_types=1);

use Yiisoft\ErrorHandler\HeadersProvider;
use Yiisoft\Http\Header;

return [
    HeadersProvider::class => [
        'class' => HeadersProvider::class,
        '__construct()' => [
            'headers' => [
                Header::X_CONTENT_TYPE_OPTIONS => ['nosniff'],
            ],
        ],
    ],
];
```

---

## 5. Custom Error Renderers

### 5.1. HTML Error Renderer (`HtmlRenderer` Configuration & Custom Templates)

`Yiisoft\ErrorHandler\Renderer\HtmlRenderer` formats exceptions into HTML. Its full constructor is:

```php
public function __construct(
    array $settings = [],              // Deprecated.
    ?string $template = null,          // Production template path; default: templates/production.php.
    ?string $verboseTemplate = null,   // Development template path; default: templates/development.php.
    ?int $maxSourceLines = null,       // Source lines shown in verbose output; default: 19.
    ?int $maxTraceLines = null,        // Trace lines shown in verbose output; default: 13.
    ?string $traceHeaderLine = null,   // Deprecated: use $traceLink.
    string|Closure|null $traceLink = null,
    public readonly array $traceFileMap = [],
)
```

- `$traceLink` string form substitutes `{file}` / `{line}` placeholders (e.g. `'phpstorm://open?file={file}&line={line}'`); the closure form is `Closure(string $file, ?int $line): ?string`.
- `$traceFileMap` is a path-prefix replacement map for Docker / remote containers (e.g. container path `/app` → local path `/var/www/my-project`).
- Template variables: `render()` passes `$request` (`?ServerRequestInterface`) and `$throwable`; `renderVerbose()` additionally passes `$displayThrowable` (for `CompositeException`, the first exception), `$exceptionClass`, `$exceptionMessage`, and `$exceptionDescription`. Inside a template, `$this` is bound to the `HtmlRenderer` instance.
- A registered alias pointing to a non-existent template file triggers `RuntimeException("Template not found at $path")` from `HtmlRenderer::renderTemplate()`.

Public helper methods available on `$this` inside templates: `htmlEncode()`, `parseMarkdown()`, `renderPreviousExceptions()`, `renderCallStack()`, `argumentsToString()`, `renderRequest()`, `renderCurl()`, `createServerInformationLink()`, `getThrowableName()`, `removeAnonymous()`.

> [!WARNING]
> `HtmlRenderer` does NOT take an array of templates keyed by HTTP status code (such as `[404 => '...', 500 => '...']`). HTTP status mapping is handled by `ExceptionResponder`; unmatched pipeline ends are handled by the fallback request handler (see section 2) — `Yiisoft\Yii\Http\Handler\NotFoundHandler` returns a bare 404 and renders no error view.

In `config/web/di/html-renderer.php`:

```php
<?php

declare(strict_types=1);

use Yiisoft\Aliases\AliasReference;
use Yiisoft\ErrorHandler\Renderer\HtmlRenderer;

return [
    HtmlRenderer::class => [
        'class' => HtmlRenderer::class,
        '__construct()' => [
            'template' => AliasReference::to('@views/error/production.php'),
            'verboseTemplate' => AliasReference::to('@views/error/development.php'),
            'maxSourceLines' => 25,
            'maxTraceLines' => 20,
            'traceLink' => 'phpstorm://open?file={file}&line={line}',
            'traceFileMap' => [
                '/app' => '/var/www/my-project',
            ],
        ],
    ],
];
```

> [!IMPORTANT]
> `AliasReference::to('@views/error/production.php')` resolves the alias through the container's `Yiisoft\Aliases\Aliases` at definition-resolution time — a shorter idiom than the equivalent `DynamicReference::to(static fn (Aliases $aliases) => $aliases->get('@views/error/production.php'))` closure. The `@views` root alias must be registered first, otherwise `Aliases::get()` throws `InvalidArgumentException("Invalid path alias: @views")` when the DI definition is resolved.

In `config/common/params.php`:

```php
<?php

declare(strict_types=1);

return [
    'yiisoft/aliases' => [
        'aliases' => [
            '@views' => dirname(__DIR__) . '/views',
        ],
    ],
];
```

Custom production template `views/error/production.php`:

```php
<?php

declare(strict_types=1);

use Throwable;
use Yiisoft\ErrorHandler\Exception\UserException;
use Yiisoft\ErrorHandler\Renderer\HtmlRenderer;
use Yiisoft\ErrorHandler\ThrowableRendererInterface;

/**
 * @var Throwable $throwable
 * @var HtmlRenderer $this
 */

$isUser = UserException::isUserException($throwable);
$title = $isUser ? $this->getThrowableName($throwable) : 'Error';
$message = $isUser ? $throwable->getMessage() : ThrowableRendererInterface::DEFAULT_ERROR_MESSAGE;
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= $this->htmlEncode($title) ?></title>
    <style>
        body { font-family: system-ui, sans-serif; margin: 2rem; color: #222; }
        h1 { color: #d32f2f; }
        p { font-size: 1.1rem; line-height: 1.5; }
    </style>
</head>
<body>
    <h1><?= $this->htmlEncode($title) ?></h1>
    <p><?= nl2br($this->htmlEncode($message)) ?></p>
</body>
</html>
```

The shipped production template behaves the same way: the real name and message are shown **only** when `UserException::isUserException($throwable)` is true; otherwise the name is `'Error'` and the message is `ThrowableRendererInterface::DEFAULT_ERROR_MESSAGE`.

### 5.2. JSON Error Renderer (RFC 7807 Problem Details with `ThrowableRendererInterface`)

Yii3 ships three built-in non-HTML renderers, all consuming `ThrowableRendererInterface`:

- `Yiisoft\ErrorHandler\Renderer\JsonRenderer` (`application/json`): production `render()` returns exactly `{"message":"An internal server error occurred."}`; `renderVerbose()` adds `type` (exception class), `message`, `code`, `file`, `line`, `trace`, encoded with `JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR`.
- `Yiisoft\ErrorHandler\Renderer\XmlRenderer` (`application/xml`): production returns an `<error><message>...</message></error>` document; verbose adds `type`, `message` (CDATA-escaped), `code`, `file`, `line`, `trace`.
- `Yiisoft\ErrorHandler\Renderer\PlainTextRenderer` (constructor default `'text/plain'`): production returns exactly `ThrowableRendererInterface::DEFAULT_ERROR_MESSAGE`; verbose returns the `static PlainTextRenderer::throwableToString()` format — `"<class> with message "<message>"` followed by `in <file>:<line>` and the stack trace.

There is **no** built-in RFC 7807 support: `JsonRenderer` always emits `application/json`, never `application/problem+json`. Implement `ThrowableRendererInterface` yourself to return compliant Problem Details responses.

> [!IMPORTANT]
> `Yiisoft\ErrorHandler\ErrorData` holds string content and headers. It implements `\Stringable`.
> It does **not** have a `getData()` method. Convert it to string via `(string) $data` or `$data->__toString()`.

In `src/Infrastructure/Error/ProblemDetailsJsonRenderer.php`:

```php
<?php

declare(strict_types=1);

namespace App\Infrastructure\Error;

use Psr\Http\Message\ServerRequestInterface;
use Throwable;
use Yiisoft\ErrorHandler\ErrorData;
use Yiisoft\ErrorHandler\Exception\UserException;
use Yiisoft\ErrorHandler\ThrowableRendererInterface;
use Yiisoft\FriendlyException\FriendlyExceptionInterface;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;

use function json_decode;
use function json_encode;

use const JSON_PRETTY_PRINT;
use const JSON_THROW_ON_ERROR;
use const JSON_UNESCAPED_SLASHES;

final readonly class ProblemDetailsJsonRenderer implements ThrowableRendererInterface
{
    public function render(Throwable $t, ?ServerRequestInterface $request = null): ErrorData
    {
        $status = $this->resolveStatusCode($t);

        $payload = [
            'type' => 'about:blank',
            'title' => $t instanceof FriendlyExceptionInterface
                ? $t->getName()
                : (Status::TEXTS[$status] ?? 'Error'),
            'status' => $status,
            // Mirror the built-in renderers: hide raw messages of non-user exceptions.
            'detail' => UserException::isUserException($t)
                ? $t->getMessage()
                : ThrowableRendererInterface::DEFAULT_ERROR_MESSAGE,
        ];

        if ($t instanceof FriendlyExceptionInterface && ($solution = $t->getSolution()) !== null) {
            $payload['solution'] = $solution;
        }

        return new ErrorData(
            json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
            [Header::CONTENT_TYPE => 'application/problem+json'],
        );
    }

    public function renderVerbose(Throwable $t, ?ServerRequestInterface $request = null): ErrorData
    {
        $data = $this->render($t, $request);
        /** @var array<string, mixed> $payload */
        $payload = json_decode((string) $data, true, 512, JSON_THROW_ON_ERROR);

        $payload['trace'] = $t->getTrace();
        $payload['file'] = $t->getFile();
        $payload['line'] = $t->getLine();

        return new ErrorData(
            json_encode($payload, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
            [Header::CONTENT_TYPE => 'application/problem+json'],
        );
    }

    private function resolveStatusCode(Throwable $t): int
    {
        $code = (int) $t->getCode();
        return ($code >= 400 && $code < 600) ? $code : Status::INTERNAL_SERVER_ERROR;
    }
}
```

> [!TIP]
> `Yiisoft\Http\Status::TEXTS` covers only the HTTP status codes declared as constants on `Status`. Clamping arbitrary exception codes to a status therefore always uses the `Status::TEXTS[$status] ?? 'Error'` fallback form.

Register in `config/web/di/error-json.php`. Because the shipped `di-web.php` wiring constructs the provider inside its own `DynamicReference::to()` closure, you must override the `rendererProvider` of `ThrowableResponseFactoryInterface` (a bare `ContentTypeRendererProvider::class` override is not consumed — see section 4). Note that a custom `$renderers` map replaces the default map entirely, so re-register every format you still want to support:

```php
<?php

declare(strict_types=1);

use App\Infrastructure\Error\ProblemDetailsJsonRenderer;
use Psr\Container\ContainerInterface;
use Yiisoft\Definitions\DynamicReference;
use Yiisoft\ErrorHandler\Renderer\HtmlRenderer;
use Yiisoft\ErrorHandler\Renderer\PlainTextRenderer;
use Yiisoft\ErrorHandler\Renderer\XmlRenderer;
use Yiisoft\ErrorHandler\RendererProvider\CompositeRendererProvider;
use Yiisoft\ErrorHandler\RendererProvider\ContentTypeRendererProvider;
use Yiisoft\ErrorHandler\RendererProvider\HeadRendererProvider;
use Yiisoft\ErrorHandler\ThrowableResponseFactory;
use Yiisoft\ErrorHandler\ThrowableResponseFactoryInterface;

return [
    ProblemDetailsJsonRenderer::class => [
        'class' => ProblemDetailsJsonRenderer::class,
    ],

    ThrowableResponseFactoryInterface::class => [
        'class' => ThrowableResponseFactory::class,
        '__construct()' => [
            'rendererProvider' => DynamicReference::to(
                static fn (ContainerInterface $container) => new CompositeRendererProvider(
                    new HeadRendererProvider(),
                    new ContentTypeRendererProvider($container, [
                        'application/json' => ProblemDetailsJsonRenderer::class,
                        'application/problem+json' => ProblemDetailsJsonRenderer::class,

                        // The custom map REPLACES the defaults entirely —
                        // re-register every format you still want to support:
                        'application/xml' => XmlRenderer::class,
                        'text/xml' => XmlRenderer::class,
                        'text/plain' => PlainTextRenderer::class,
                        'text/html' => HtmlRenderer::class,
                        '*/*' => HtmlRenderer::class,
                    ]),
                ),
            ),
        ],
    ],
];
```

---

## 6. Friendly Exceptions (`FriendlyExceptionInterface`)

`Yiisoft\FriendlyException\FriendlyExceptionInterface` allows domain, infrastructure, and configuration exceptions to provide explicit, human-readable diagnoses and actionable steps to resolve the issue:

```php
declare(strict_types=1);

namespace Yiisoft\FriendlyException;

use Throwable;

interface FriendlyExceptionInterface extends Throwable
{
    public function getName(): string;
    public function getSolution(): ?string;
}
```

Implementation guidelines (from the interface docblock):
- `getName()`: Short, human-understandable exception title.
- `getSolution()`: Clear resolution advice. Make it as short as possible, do **not** use HTML tags, and use simple markdown (`*`, `` ` ``, `-`).

In `src/Domain/User/Exception/UserNotFoundException.php`:

```php
<?php

declare(strict_types=1);

namespace App\Domain\User\Exception;

use RuntimeException;
use Yiisoft\FriendlyException\FriendlyExceptionInterface;

final class UserNotFoundException extends RuntimeException implements FriendlyExceptionInterface
{
    public function getName(): string
    {
        return 'User Account Not Found';
    }

    public function getSolution(): ?string
    {
        return "Verify that the provided user ID exists in the database.\n"
            . "If testing locally, run `php yii fixture/load` to seed initial test users.";
    }
}
```

When caught:
- `HtmlRenderer::renderVerbose()` (development) parses `$throwable->getSolution()` — or, for exceptions without the interface, the exception class PHPDoc description — via `cebe/markdown` (`GithubMarkdown`) and displays it as a diagnostic solution block. Markdown parsing happens **only** in verbose rendering; the production `render()` performs no solution/description handling. `parseMarkdown()` additionally strips HTML through an allow-list of roughly 30 tags.
- The console runner (`Yiisoft\Yii\Console\Application::renderThrowable()`, public API over the protected `doRenderThrowable()`) prints the friendly title and the solution note directly in the terminal (styled via Symfony Console style helpers, or raw ANSI tags at low verbosity) and always appends the stack trace.

---

## 7. User Exceptions & Information Disclosure (`UserException` & `#[UserException]`)

In production environments, `HtmlRenderer` hides raw exception messages from arbitrary throwables (e.g. database errors, file paths) and substitutes `ThrowableRendererInterface::DEFAULT_ERROR_MESSAGE` (`'An internal server error occurred.'`) to prevent data leakage.

To declare that an exception's message is safe for end users, Yii3 provides `Yiisoft\ErrorHandler\Exception\UserException`. It can be used in two ways:

### 7.1. Extending `UserException`

```php
<?php

declare(strict_types=1);

namespace App\Domain\Auth\Exception;

use Yiisoft\ErrorHandler\Exception\UserException;

final class InvalidCredentialsException extends UserException
{
    public function __construct()
    {
        parent::__construct('The email or password you entered is incorrect.');
    }
}
```

### 7.2. Using PHP 8 `#[UserException]` Attribute

When an exception must extend an existing domain exception class (e.g. `DomainException`), apply the `#[UserException]` attribute:

```php
<?php

declare(strict_types=1);

namespace App\Domain\Product\Exception;

use DomainException;
use Yiisoft\ErrorHandler\Exception\UserException;

use function sprintf;

#[UserException]
final class ProductOutOfStockException extends DomainException
{
    public function __construct(string $sku)
    {
        parent::__construct(sprintf('The product with SKU "%s" is currently out of stock.', $sku));
    }
}
```

`UserException::isUserException(Throwable $throwable)` automatically detects both instances of `UserException` and classes decorated with `#[UserException]` (via reflection over the class attributes).

---

## 8. Logging & Sentry Monitoring (`yiisoft/yii-sentry`)

### 8.1. PSR-14 Event Listener (`ApplicationError`)

When `ErrorCatcher` catches an uncaught exception, it dispatches the `Yiisoft\ErrorHandler\Event\ApplicationError` event — **but only if a PSR-14 dispatcher was injected** into `ErrorCatcher`'s optional second constructor parameter (`?EventDispatcherInterface $eventDispatcher = null`; the same applies to `ErrorHandler`). `Yiisoft\ErrorHandler\Event\ApplicationError` is a final event exposing `getThrowable(): Throwable`; it is dispatched from two sites: `ErrorCatcher::process()` and `ErrorHandler::renderThrowableAndTerminate()`.

> [!IMPORTANT]
> Installing `yiisoft/error-handler` alone provides **no** PSR-14 dispatcher (`psr/event-dispatcher` is only a `require-dev` dependency of the package). `yiisoft/yii-event` ships the actual wiring: `EventDispatcherInterface::class => Dispatcher::class` and `ListenerProviderInterface::class => Provider::class`. Without a dispatcher reaching `ErrorCatcher` / `ErrorHandler`, no `ApplicationError` listener ever runs.

> [!TIP]
> For logger DI wiring, targets (file/db/email/syslog/stream), categories, and placeholders, see [Logging Guide](infra-logging.md). Note that `yiisoft/log` ships its own listeners that flush the logger on `Yiisoft\Yii\Http\Event\AfterEmit` (web) and `ConsoleTerminateEvent` (console).

In `src/Infrastructure/Error/Listener/LogApplicationErrorListener.php`:

```php
<?php

declare(strict_types=1);

namespace App\Infrastructure\Error\Listener;

use Psr\Log\LoggerInterface;
use Yiisoft\ErrorHandler\Event\ApplicationError;

final readonly class LogApplicationErrorListener
{
    public function __construct(
        private LoggerInterface $logger,
    ) {}

    public function __invoke(ApplicationError $event): void
    {
        $throwable = $event->getThrowable();

        $this->logger->error(
            'Uncaught application error: {message}',
            [
                'message' => $throwable->getMessage(),
                'exception' => $throwable,
                'file' => $throwable->getFile(),
                'line' => $throwable->getLine(),
            ],
        );
    }
}
```

Register the listener in `config/common/events.php`. The listener must be an **invokable class-string** (resolved from the DI container) or a two-element `[class, 'method']` array. A one-element array such as `[[LogApplicationErrorListener::class]]` throws `Yiisoft\Yii\Event\InvalidListenerConfigurationException`:

```php
<?php

declare(strict_types=1);

use App\Infrastructure\Error\Listener\LogApplicationErrorListener;
use Yiisoft\ErrorHandler\Event\ApplicationError;

return [
    ApplicationError::class => [
        LogApplicationErrorListener::class,
    ],

    // Alternative two-element form:
    // ApplicationError::class => [[LogApplicationErrorListener::class, '__invoke']],
];
```

**Where app event maps live.** `yiisoft/yii-event` reads the listener map from its params group (`'yiisoft/yii-event' => ['eventsConfigGroup' => ...]`), defaulting to the `events-web` group (web) and `events-console` group (console). Group declarations, the `$events` reference wiring, merge modifiers, and the full listener-format table are owned by the [Events & Listeners Guide](core-events-and-listeners.md), section 4 — register your `config/common/events.php` under the shared `events` group there; error-handling-specific listeners follow the exact same mechanics.

Failure timing and validation (details and the complete six-form table: [Events & Listeners Guide](core-events-and-listeners.md), section 4.2):

- Invalid listener **format** throws when the DI container first resolves `ListenerCollection::class` (i.e. when the PSR-14 dispatcher is constructed) — not at event-dispatch time.
- When a runner is constructed with `checkEvents: true`, it runs `Yiisoft\Yii\Event\ListenerConfigurationChecker::check()` over the events group, eagerly validating the whole map (dev/tests only — resource-greedy).

> [!WARNING]
> If an `ApplicationError` listener (or the dispatcher itself) throws, `ErrorCatcher` wraps the failure together with the original throwable in `Yiisoft\ErrorHandler\CompositeException` and still renders an error response (default 500) — the original throwable is not lost. Keep listeners defensive: wrap their bodies in try/catch so a logging failure cannot mask the original error.

### 8.2. Sentry Web Integration (`SentryMiddleware`)

`Yiisoft\Yii\Sentry\SentryMiddleware` is a final PSR-15 middleware whose only constructor dependency is `Sentry\State\HubInterface`. Its `process()` catches `Throwable`, calls `$this->hub->captureException($e)`, and **always re-throws** — so exceptions still reach `ErrorCatcher` for rendering. PHP fatal errors (instances of `\Error`) are handled too, since the middleware catches `Throwable`. `yiisoft/yii-sentry` performs no breadcrumb capture and provides no PSR-3-to-Sentry log bridge — the PSR-3 logger in its bootstrap is the Sentry SDK's internal client logger only.

Configure `yiisoft/yii-sentry` in `config/common/params.php`. The params group root key `'yiisoft/yii-sentry'` has exactly three keys (`handleConsoleErrors`, `cron-monitoring`, `options`) — there is no `enabled` key:

```php
<?php

declare(strict_types=1);

use Sentry\Event;
use Yiisoft\ErrorHandler\Exception\ErrorException;

return [
    'yiisoft/yii-sentry' => [
        // Registers SentryConsoleHandler for ConsoleErrorEvent (see section 8.3). Default: true.
        'handleConsoleErrors' => true,

        // Sentry cron monitoring (see section 8.3). Note the hyphenated key name.
        'cron-monitoring' => [],

        // Passed verbatim as the single constructor argument of Sentry\Options.
        'options' => [
            'dsn' => $_ENV['SENTRY_DSN'] ?? null,
            // Source-attested and test-verified to reach the SDK client options.
            'environment' => $_ENV['YII_ENV'] ?? null,
            // Shipped default (defined in the package's own params): drop Sentry events
            // for PHP warnings/notices converted to ErrorException. The exception itself
            // still propagates (SentryMiddleware re-throws). Overriding `before_send`
            // re-enables reporting of ErrorException events.
            'before_send' => static function (Event $event): ?Event {
                foreach ($event->getExceptions() as $exception) {
                    if ($exception->getType() === ErrorException::class) {
                        return null;
                    }
                }
                return $event;
            },
        ],
    ],
];
```

> [!IMPORTANT]
> yii-sentry passes the whole `'options'` map **verbatim** into `Sentry\Options` — it normalizes and validates nothing. Keys verified from yii-sentry's own sources are `dsn`, `environment`, `before_send`, `logger` (SDK client logger), and `transport`. Any other key — e.g. `release` or `traces_sample_rate` — is a **Sentry SDK option**, not a yii-sentry key: its name and value are validated by the Sentry SDK at runtime. Consult the official Sentry PHP SDK documentation (docs.sentry.io → PHP → Configuration → Options) for the full list.

DI and bootstrap, shipped by the package:

- `config/di.php` builds `Sentry\Options` from the params group, binds `HubInterface::class => Hub::class`, and wires `SentryCronMonitor` with the `cron-monitoring` params. `SentryMiddleware` and `SentryConsoleHandler` are autowire-only.
- `config/bootstrap.php` builds the client via `ClientBuilder`, sets the container's `Psr\Log\LoggerInterface` as the SDK client logger when no SDK logger is configured, binds the client to the container `HubInterface`, and registers the hub as the current hub (`SentrySdk::setCurrentHub()`).

Placement: `SentryMiddleware` must be added **right after `ErrorCatcher`** in the middleware pipeline — expressed through the canonical `Application` / `MiddlewareDispatcher` wiring shown in section 2 (there is no `'middlewares'` params key):

```php
// config/web/di/application.php (excerpt) — full example in section 2.
'middlewareDefinitions' => [
    ErrorCatcher::class,
    SentryMiddleware::class,   // <-- right after ErrorCatcher
    // ... ExceptionResponder, application middlewares, Router
],
```

### 8.3. Sentry Console Integration & Cron Monitoring

When the DSN is set, `yiisoft/yii-sentry`'s shipped `config/events-console.php` registers its console listeners. The whole file returns `[]` when `$params['yiisoft/yii-sentry']['options']['dsn']` is empty — **without a DSN, all console integration (including cron monitoring) is inactive**.

**Error capture.** With `'handleConsoleErrors' => true` (default), the package registers `Yiisoft\Yii\Sentry\SentryConsoleHandler` under Symfony Console's `ConsoleErrorEvent`. Its `handle(ConsoleErrorEvent $event)` calls `$this->hub->captureException($event->getError())` without stopping or modifying the event. Any exception escaping a CLI command is thus reported to Sentry (see section 9 for the surrounding console error architecture).

**Cron monitoring.** The `'cron-monitoring'` params map keys are **console command names** (matched against `$command->getName()`); unmapped and unnamed commands are silently ignored. Each value is either a plain slug string or an array:

- **Plain string** — check-ins only; no monitor configuration is upserted.
- **Array** — additionally upserts the monitor configuration on each check-in. Keys are **camelCase**:

| Key | Type | Meaning |
|---|---|---|
| `slug` | string, required, non-empty | Sentry monitor slug (throws `InvalidArgumentException` when missing/empty) |
| `schedule` | string, optional | Crontab expression; **required for the monitor-config upsert** (absent → check-in sent without upsert) |
| `timezone` | string, optional | Defaults to `date_default_timezone_get()` |
| `checkinMargin` | int | Margin in minutes |
| `maxRuntime` | int | Maximum runtime in minutes |
| `failureIssueThreshold` | int | Forwarded only when the installed `sentry/sentry` version supports it (added in 4.4) |
| `recoveryThreshold` | int | Forwarded only when the installed `sentry/sentry` version supports it (added in 4.4) |

In `config/common/params.php`:

```php
<?php

declare(strict_types=1);

return [
    'yiisoft/yii-sentry' => [
        'cron-monitoring' => [
            // Plain-string form: check-ins only, no monitor configuration upsert.
            'backup:run' => 'database-backup',

            // Array form: upserts the monitor configuration on each check-in.
            'reports:generate' => [
                'slug' => 'daily-reports',
                'schedule' => '0 2 * * *',
                'timezone' => 'UTC',
                'checkinMargin' => 5,
                'maxRuntime' => 30,
                'failureIssueThreshold' => 3,
                'recoveryThreshold' => 1,
            ],
        ],
    ],
];
```

Check-in lifecycle: on `ConsoleCommandEvent`, `SentryCronMonitor::handleCommand()` sends an `in_progress` check-in (`monitorConfig` is passed only for the array form). On `ConsoleTerminateEvent`, `handleTerminate()` derives the final status from the exit code — `ok` when `$event->getExitCode() === 0`, `error` otherwise — and sends the final check-in with the measured duration. Cron monitoring requires the DSN to be set and works for commands run via `yiisoft/yii-console`. Per the package docblock: since the final status is sent on `ConsoleTerminateEvent` only, an error listener that resets the exit code to `0` results in an `ok` check-in.

---

## 9. Console Error Handling Architecture

In CLI environments (`yiisoft/yii-console` and `yiisoft/yii-runner-console`), error handling operates through Symfony Console events rather than PSR-15 middlewares. `yiisoft/yii-console` does **not** dispatch `ApplicationError`; the delivery chain is: Symfony Console event surface → `Yiisoft\Yii\Console\SymfonyEventDispatcher` (implements the Symfony dispatcher contract, delegates to the PSR-14 dispatcher) → PSR-14 listener maps.

Execution flow of `Yiisoft\Yii\Runner\Console\ConsoleApplicationRunner::run()`:

1. **`$application->start($input)`** then **`$application->run($input, $output)`** inside a `try` block.
2. On a `Throwable` escaping the application: **`Yiisoft\Yii\Console\Application::renderThrowable()`** renders the exception to terminal output. If it implements `FriendlyExceptionInterface`, the friendly title and solution note are printed via Symfony Console styles (or raw ANSI tags); the stack trace is always appended.
3. In the `finally` block: `$application->shutdown($exitCode)` and `exit($exitCode)`. An escaping throwable leaves the exit code at its initial value `1` (`Yiisoft\Yii\Console\ExitCode::UNSPECIFIED_ERROR`).
4. **`ConsoleErrorEvent` logging**: handled by `Yiisoft\Yii\Console\ErrorListener::onError(ConsoleErrorEvent $event)` — one PSR-3 `error()` entry with message `'%s: %s in %s:%s while running console command "%s".'` and context `['exception' => $exception]`. The listener's constructor takes `?LoggerInterface $logger = null` and returns early without a logger.

Console error logging works **out of the box**: `yiisoft/yii-console` ships its own events map as the composer config-plugin group `events-console` — `return [ConsoleErrorEvent::class => [[ErrorListener::class, 'onError']]];` — which `yiisoft/config` auto-merges. The app template ships no events file of its own. Register an app-level file only to customize behavior (e.g. a different listener), and register it under the shared `events` group in `config/configuration.php` (see section 8.1):

```php
<?php

declare(strict_types=1);

use Symfony\Component\Console\Event\ConsoleErrorEvent;
use Yiisoft\Yii\Console\ErrorListener;

return [
    ConsoleErrorEvent::class => [
        [ErrorListener::class, 'onError'],
    ],
];
```

---

## 10. Low-Level PHP Error Handling (`ErrorHandler`)

`Yiisoft\ErrorHandler\ErrorHandler` handles out-of-memory errors, fatals, warnings, notices and exceptions outside the PSR-15 HTTP pipeline (e.g. in console or long-running scripts; the HTTP runner also uses it as a temporary error handler before the DI container exists).

Constructor (exact names, order, and defaults):

```php
public function __construct(
    \Psr\Log\LoggerInterface $logger,
    \Yiisoft\ErrorHandler\ThrowableRendererInterface $defaultRenderer,
    ?\Psr\EventDispatcher\EventDispatcherInterface $eventDispatcher = null,
    int $exitShutdownHandlerDepth = 2,
)
```

Key API and behavior:

- **`debug`** defaults to `false` (production mode). `debug(bool $enable = true): void` toggles it; `handle()` renders via `renderVerbose()` when debug is enabled and via `render()` otherwise.
- **`handle(Throwable $t, ?ThrowableRendererInterface $renderer = null, ?ServerRequestInterface $request = null): ErrorData`** always logs first: `$this->logger->error($t->getMessage(), ['throwable' => $t])` (PSR-3 level `error`, context key `throwable`). If rendering itself throws, it falls back to `new ErrorData((string) $t)`. Pass `Psr\Log\NullLogger` to disable logging.
- **`register()`** is idempotent (guarded by an internal flag): it pre-allocates the memory reserve, registers `set_exception_handler` (renders and terminates), and registers `set_error_handler` converting warnings and notices honoring the `error_reporting()` mask into `Yiisoft\ErrorHandler\Exception\ErrorException` (capturing detailed Xdebug backtraces when `xdebug_get_function_stack` exists and, on Xdebug 3+, `xdebug.mode` contains `develop`).
- **`unregister()`** clears the memory reserve and disables handling.
- **Memory reserve (`memoryReserveSize(int $size)`)**: pre-allocates memory (default: `262_144` = 256 KB, `0` disables) so OOM fatals can still be formatted and logged.
- Initialization sets `ini_set('display_errors', '0')` and registers a shutdown function that, on `error_get_last()` + `ErrorException::isFatalError()` (covering `E_ERROR`, `E_PARSE`, `E_CORE_ERROR`, `E_CORE_WARNING`, `E_COMPILE_ERROR`, `E_COMPILE_WARNING`), builds an `ErrorException` and renders + terminates.
- **`renderThrowableAndTerminate()`** (used by the exception handler): restores the working directory, calls `unregister()`, preventively sets `http_response_code(500)`, echoes `handle($t)`, dispatches `ApplicationError` (only when a dispatcher was injected), and terminates with exit code `1`.

Minimal console-script usage (from the package README):

```php
<?php

declare(strict_types=1);

use Psr\Log\LoggerInterface;
use Yiisoft\ErrorHandler\ErrorHandler;
use Yiisoft\ErrorHandler\Renderer\HtmlRenderer;

/** @var LoggerInterface $logger Resolved from the DI container. */
$errorHandler = new ErrorHandler($logger, new HtmlRenderer());
$errorHandler->memoryReserveSize(524_288); // Optional; default is 262_144 (256 KB).
$errorHandler->register(); // Idempotent; once per process.
```

**Runner integration.** Before the DI container exists, `yiisoft/yii-runner-http` creates a temporary error handler — `new ErrorHandler($logger ?? new NullLogger(), new HtmlRenderer())` — so early failures are still rendered and logged. After the container is built, the container-configured `ErrorHandler::class` replaces it: the runner unregisters the temporary instance and enables `debug()` when the runner runs in debug mode.

---

## 11. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| Yii2 `'errorHandler' => ['errorAction' => 'site/error']` | Yii3 does not use controller actions as error handlers. Actions require a route match and cannot reliably handle pipeline-level failures. `yiisoft/error-handler` has no error-action mechanism. | Use `ErrorCatcher` middleware and `ThrowableRendererInterface` (`HtmlRenderer` / `JsonRenderer`). |
| Configuring `HtmlRenderer` with `'templates' => [404 => ..., 500 => ...]` | `HtmlRenderer` does not support status code keyed template arrays. It only accepts `template` (production) and `verboseTemplate` (development). | Map exceptions to status codes via `ExceptionResponder`; pipeline-end 404s belong to the fallback request handler (e.g. the app template's `App\Web\NotFound\NotFoundHandler`). |
| Calling `$errorData->getData()` | `ErrorData` does not have a `getData()` method. Calling it triggers a fatal runtime error. | Cast to string: `(string) $errorData` or `$errorData->__toString()`. |
| Placing `ErrorCatcher` after other middlewares | Exceptions thrown before `ErrorCatcher` bypass `SentryMiddleware` capture and `ExceptionResponder` mapping, are handled only by the `yiisoft/yii-runner-http` safety net (re-processed through the container's `ErrorCatcher`), and under a custom runner escape to the global PHP error handler. `BeforeRequest` / `AfterRequest` observers see a `null` response in that path. | Place `ErrorCatcher` as the very first entry in the HTTP middleware stack. |
| Registering listeners as one-element arrays (`ApplicationError::class => [[Listener::class]]`) | `yiisoft/yii-event`'s `CallableFactory` accepts only invokable class-strings, `[class, 'method']` two-element arrays, closures, and invokable objects; anything else throws `Yiisoft\Yii\Event\InvalidListenerConfigurationException`. | Use `ApplicationError::class => [Listener::class]` (invokable class-string) or `[[Listener::class, '__invoke']]`. |
| Configuring Sentry cron monitoring with snake_case keys (`monitor_slug`, `max_runtime`, `checkin_margin`) | Only `schedule` coincidentally matches; `monitor_slug` does not exist. Unknown array keys are ignored and a missing `slug` throws `InvalidArgumentException`. | Use the camelCase schema: `slug`, `schedule`, `timezone`, `checkinMargin`, `maxRuntime`, `failureIssueThreshold`, `recoveryThreshold` (see section 8.3). |
| Overriding `ContentTypeRendererProvider::class` in DI to swap renderers | The shipped `di-web.php` constructs the provider directly inside its `DynamicReference::to()` closure, so a bare class override is never consumed. | Override the `rendererProvider` of `ThrowableResponseFactoryInterface` (see section 5.2); remember a custom `$renderers` map replaces the default map entirely. |
| Referencing `Yiisoft\ErrorHandler\Factory\ThrowableResponseFactory` | Removed in `yiisoft/error-handler` 5.x. | Use `Yiisoft\ErrorHandler\ThrowableResponseFactory`. |
| Instantiating `ErrorCatcher` without `ThrowableResponseFactoryInterface` | `ErrorCatcher` constructor strictly requires `ThrowableResponseFactoryInterface $throwableResponseFactory` (only the dispatcher is optional). | Inject `ThrowableResponseFactoryInterface` via DI container. |
| Expecting console commands to use `ThrowableRendererInterface` | Console runner does not use PSR-7 error renderers; it uses Symfony Console output formatting via `Application::renderThrowable()`. | Rely on `Yiisoft\Yii\Console\Application::renderThrowable()` and the `ConsoleErrorEvent` / `ErrorListener` logging shipped by `yiisoft/yii-console`. |
| Throwing raw domain/persistence exceptions with sensitive details in production | Exposes database credentials, SQL queries, or filesystem paths to end users. | Mark safe exception messages with `#[UserException]` or extend `UserException`. Non-user exceptions display a generic message in production. |
| Catching `Throwable` inside every controller action and returning manual 500 responses | Bloats actions, bypasses `ErrorCatcher` content negotiation, suppresses Sentry error capture, and hides stack traces in dev. | Let unexpected exceptions bubble up to `ErrorCatcher` and map anticipated errors with `ExceptionResponder`. |
| Using HTML tags in `FriendlyExceptionInterface::getSolution()` | Renders raw unescaped HTML or broken layout in console terminals and markdown renderers (`parseMarkdown()` allow-lists roughly 30 tags only). | Use plain text and simple markdown formatting (`*`, `` ` ``, `-`) in `getSolution()`. |
| Swallowing exceptions in custom middleware without re-throwing | Bypasses `ErrorCatcher` logging, breaks Sentry exception tracking, skips `SessionMiddleware` commit/discard semantics, and leaves the client without a proper response unless a valid PSR-7 response is returned. | Either re-throw (`throw $e;`) or return a valid PSR-7 `ResponseInterface`. |

---

## 12. Related Topic Guides

- [Actions & Controllers Guide](http-actions-and-controllers.md) — Action handlers, PSR-7 response factories, and thin-action error delegation.
- [PSR-15 Middlewares Guide](http-middlewares.md) — Pipeline flow, ErrorCatcher positioning, and custom error middleware.
- [Logging Guide](infra-logging.md) — PSR-3 logger configuration, log targets, and context logging.
- [Events & Listeners Guide](core-events-and-listeners.md) — PSR-14 dispatcher wiring, listener definition formats, and event configuration groups.
