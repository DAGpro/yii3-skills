# Yii3 Error Handling: Web Pipeline & Renderers

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Part of the [Error Handling Guide](infra-error-handling.md) split — the anti-pattern matrix and related guides live there.

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
| **`ErrorHandler`** | `Yiisoft\ErrorHandler\ErrorHandler` | Low-level handler for out-of-memory errors, fatals, warnings, notices and exceptions outside the PSR-15 pipeline (see [§10 of the Error Handling Ops Guide](infra-error-handling-ops.md#10-low-level-php-error-handling-errorhandler)). |
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
> - in the safety-net path, `BeforeRequest` carries only the request (it never carries a response), the failing `Application::handle()` run dispatches `AfterRequest` with a `null` response, and the runner's recovery pass (`ErrorCatcher::process()` executed outside `Application::handle()`) dispatches no event pair of its own; emitter failures (e.g. headers already sent) propagate.

The standard execution sequence (first-listed middleware = outermost = executed first):

1. **`ErrorCatcher`**: Catches everything thrown down the chain, dispatches `ApplicationError`, and renders a user-facing or debug response.
2. **`SentryMiddleware`**: Intercepts uncaught exceptions, captures them into Sentry, and immediately re-throws (`throw $e;`) so `ErrorCatcher` can format the HTTP response.
3. **`ExceptionResponder`**: Catches anticipated domain exceptions and converts them to standard HTTP status codes (e.g. 400, 404, 409) or custom responses.
4. **Application Middlewares**: Session, Authentication, CORS, etc.
5. **`Router`**: Matches route and executes action handler.

There is **no** `'middlewares'` params key: no package consumes it. The pipeline is wired through the DI definition of `Yiisoft\Yii\Http\Application`, whose `dispatcher` constructor parameter receives a `Yiisoft\Middleware\Dispatcher\MiddlewareDispatcher`.

In `config/web/di/application.php`, the error-component slice of the global pipeline:

```php
<?php

declare(strict_types=1);

use Yiisoft\Definitions\DynamicReference;
use Yiisoft\ErrorHandler\Middleware\ErrorCatcher;
use Yiisoft\ErrorHandler\Middleware\ExceptionResponder;
use Yiisoft\Middleware\Dispatcher\MiddlewareDispatcher;
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
                        // 1. First (outermost): catches every Throwable escaping the chain
                        //    below, dispatches `ApplicationError`, and renders the response.
                        ErrorCatcher::class,

                        // 2. Captures exceptions into Sentry, then re-throws so
                        //    `ErrorCatcher` can format the HTTP response
                        //    (see §8.2 of the Error Handling Ops Guide).
                        SentryMiddleware::class,

                        // 3. Maps anticipated domain exceptions to HTTP responses (see section 3).
                        ExceptionResponder::class,

                        // 4+. Application middlewares (session, auth, CORS) and the
                        //     Router complete the pipeline.
                    ],
                ],
            ]),
        ],
    ],
];
```

> [!TIP]
> **Pipeline Wiring Reference:**
> For the complete `Application::class` global-pipeline DI definition — the `fallbackHandler`, application
> middlewares (`SessionMiddleware`, auth, CORS), `Router`, and all ordering constraints — see the
> [PSR-15 Middlewares Guide, §4.1 "Global Application Pipeline"](http-middlewares.md#41-global-application-pipeline-configwebdiapplicationphp).

> [!NOTE]
> The `MiddlewareDispatcher::withMiddlewares()` deprecation (`yiisoft/middleware-dispatcher` >= 5.5.0) and the dispatcher-reversal ordering fact (first-listed definition = outermost middleware) are canonicalized in the [PSR-15 Middlewares Guide, §4.1](http-middlewares.md#41-global-application-pipeline-configwebdiapplicationphp).

**Fallback request handlers.** When no middleware produces a response, the pipeline falls back to the `fallbackHandler` configured on `Application`:

- The code-level default is `Yiisoft\Yii\Http\Handler\UnhandledRequestHandler`, which throws `RuntimeException('No response was generated.')` — it must be replaced to get a useful 404.
- `yiisoft/yii-http` ships `Yiisoft\Yii\Http\Handler\NotFoundHandler`, a bare fallback returning a 404 response with the body `We were unable to find the page "$path".` It requires a `Psr\Http\Message\ResponseFactoryInterface` and renders nothing else — it is not an error renderer.
- The canonical app template wires its own `App\Web\NotFound\NotFoundHandler`, which renders a full 404 view via the view renderer.

**Session behavior on errors.** An unhandled downstream exception means **no `Set-Cookie` on the error response** — uncommitted session state is discarded instead of committed. The full commit/discard lifecycle of `Yiisoft\Session\SessionMiddleware` is owned by the [PSR-15 Middlewares Guide, §3.1 "SessionMiddleware Behavior"](http-middlewares.md#31-sessionmiddleware-behavior).

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

> [!TIP]
> **Scope note:** this renderer slice covers uncaught `Throwable`s at the pipeline level. Converting a validation `Result` / `Yiisoft\Input\Http\InputValidationException` into a `422` `application/problem+json` response is the action-layer concern, owned by the [Actions & Controllers Guide, §3.2 "Request Parsing & DTO Hydration"](http-actions-core.md#32-request-parsing--dto-hydration-yiisofthydrator-yiisoftinput-http-yiisoftvalidator) (`ValidationProblemDetailsResponder`).

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

> **Ownership:** The complete Friendly Exceptions reference — the `FriendlyExceptionInterface` contract (`getName()` / `getSolution()`), the Markdown-only solution invariants, implementation recipes, and the automatic web (`yiisoft/error-handler`) and console (`yiisoft/yii-console`) rendering — **is owned by the** [Friendly Exceptions Guide](core-friendly-exceptions.md).
>
> One-line trap summary: solution text is parsed as Markdown **only** in verbose (debug) rendering — the production `render()` performs no solution handling — and `getSolution()` must be plain CommonMark without HTML tags.

> **For the complete reference on** Friendly Exceptions **see the** [Friendly Exceptions Guide](core-friendly-exceptions.md).

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
