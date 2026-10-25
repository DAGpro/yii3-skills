# Yii3 Error Handling & Exception Management Guide

> Practical guide and configuration recipes for error catching pipelines, custom HTML/JSON renderers, Friendly Exceptions, and Sentry monitoring using `yiisoft/error-handler`, `yiisoft/friendly-exception`, and `yiisoft/yii-sentry`.
>
> **Source of Truth & Verification Rule for AI Models:**
> In projects using this extension, always verify exact method signatures, constructor arguments, and options directly in `vendor/yiisoft/<package>/src/` for installed packages.
> When generating code, if an installed package's method signature or property is unfamiliar or in doubt, **read its source files in `vendor/yiisoft/<package>/src/`** rather than guessing or relying on Yii2 habits.

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

---

## 1. Error Handling Architecture & Core Contracts

In Yii3, HTTP errors and unhandled exceptions are caught through a PSR-15 middleware boundary rather than legacy global exception handlers or static error actions:

| Component | FQCN | Role & Responsibilities |
|---|---|---|
| **`ErrorCatcher`** | `Yiisoft\ErrorHandler\Middleware\ErrorCatcher` | Outermost PSR-15 middleware wrapping the HTTP lifecycle. Catches all `Throwable`, dispatches `ApplicationError` event, and creates fallback response via `ThrowableResponseFactoryInterface`. |
| **`ExceptionResponder`** | `Yiisoft\ErrorHandler\Middleware\ExceptionResponder` | PSR-15 middleware mapping specific exception classes to HTTP status codes (`int`) or custom callables returning `ResponseInterface`. |
| **`ApplicationError`** | `Yiisoft\ErrorHandler\Event\ApplicationError` | PSR-14 event dispatched whenever an unhandled `Throwable` is caught by `ErrorCatcher` or `ErrorHandler`. |
| **`ThrowableResponseFactoryInterface`** | `Yiisoft\ErrorHandler\ThrowableResponseFactoryInterface` | Converts any caught `Throwable` into a valid PSR-7 `ResponseInterface`. Implemented by `ThrowableResponseFactory`. |
| **`ThrowableRendererInterface`** | `Yiisoft\ErrorHandler\ThrowableRendererInterface` | Converts `Throwable` into `ErrorData` via `render()` (production) and `renderVerbose()` (development). |
| **`ErrorData`** | `Yiisoft\ErrorHandler\ErrorData` | Immutable value object implementing `\Stringable`. Holds response body string and headers array. |
| **`HeadersProvider`** | `Yiisoft\ErrorHandler\HeadersProvider` | Manages HTTP headers to append to error responses (e.g. security headers). |
| **`ContentTypeRendererProvider`** | `Yiisoft\ErrorHandler\RendererProvider\ContentTypeRendererProvider` | Resolves the best renderer (`HtmlRenderer`, `JsonRenderer`, `XmlRenderer`, `PlainTextRenderer`) based on request `Accept` header. |
| **`FriendlyExceptionInterface`** | `Yiisoft\FriendlyException\FriendlyExceptionInterface` | Exception contract providing human-readable titles (`getName()`) and markdown fix recommendations (`getSolution()`). |
| **`UserException`** | `Yiisoft\ErrorHandler\Exception\UserException` | Exception class and PHP 8 `#[Attribute]` indicating message is safe to display to end users in production. |
| **`SentryMiddleware`** | `Yiisoft\Yii\Sentry\SentryMiddleware` | PSR-15 middleware capturing exceptions into Sentry `HubInterface` and re-throwing them to continue pipeline propagation. |

---

## 2. ErrorCatcher Middleware & Pipeline Ordering

> [!IMPORTANT]
> `ErrorCatcher` **MUST** be the very first middleware in your HTTP middleware stack.
> If any middleware placed before `ErrorCatcher` throws an uncaught exception, it escapes the pipeline and terminates execution with an unformatted 500 response.

The standard execution sequence:
1. **`ErrorCatcher`**: Catches everything thrown down the chain, dispatches `ApplicationError`, and renders a user-facing or debug response.
2. **`SentryMiddleware`**: Intercepts uncaught exceptions, captures them with full breadcrumbs into Sentry Hub, and immediately re-throws (`throw $e;`) so `ErrorCatcher` can format the HTTP response.
3. **`ExceptionResponder`**: Catches anticipated domain exceptions and converts them to standard HTTP status codes (e.g. 400, 404, 409) or custom responses.
4. **Application Middlewares**: Session, Authentication, CORS, etc.
5. **`Router`**: Matches route and executes action handler.

In `config/web/params.php`:

```php
declare(strict_types=1);

use App\Infrastructure\Middleware\CustomAuthMiddleware;
use Yiisoft\ErrorHandler\Middleware\ErrorCatcher;
use Yiisoft\ErrorHandler\Middleware\ExceptionResponder;
use Yiisoft\Router\Middleware\Router;
use Yiisoft\Session\SessionMiddleware;
use Yiisoft\Yii\Sentry\SentryMiddleware;

return [
    'middlewares' => [
        ErrorCatcher::class,
        SentryMiddleware::class,
        ExceptionResponder::class,
        SessionMiddleware::class,
        CustomAuthMiddleware::class,
        Router::class,
    ],
];
```

---

## 3. Exception Mapping with ExceptionResponder

`Yiisoft\ErrorHandler\Middleware\ExceptionResponder` converts domain and application exceptions into designated HTTP responses or status codes without bloating controllers with try-catch blocks.

Constructor signature:
```php
public function __construct(
    array $exceptionMap,
    \Psr\Http\Message\ResponseFactoryInterface $responseFactory,
    \Yiisoft\Injector\Injector $injector,
    bool $checkResponseBody = false,
)
```

The `$exceptionMap` supports two formats:
1. **Integer format (`class-string<Throwable> => int`)**: Sends an empty response with the specified HTTP status code.
2. **Callable format (`class-string<Throwable> => callable`)**: Invokes a callable via `Injector` (which can receive `$exception`, `$request`, or DI dependencies) and must return `Psr\Http\Message\ResponseInterface`.

In `config/web/di/exception-responder.php`:

```php
declare(strict_types=1);

use App\Domain\Order\Exception\OrderAlreadyPaidException;
use App\Domain\User\Exception\UserNotFoundException;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\ErrorHandler\Middleware\ExceptionResponder;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;

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

`yiisoft/error-handler` provides out-of-the-box configuration in `config/di-web.php`:
- `ThrowableRendererInterface::class => HtmlRenderer::class`
- `ThrowableResponseFactoryInterface` is configured with `ThrowableResponseFactory` utilizing `CompositeRendererProvider`.

`ContentTypeRendererProvider` inspects the HTTP `Accept` header and delegates to the appropriate renderer:
- `application/json` → `JsonRenderer`
- `application/xml`, `text/xml` → `XmlRenderer`
- `text/plain` → `PlainTextRenderer`
- `text/html`, `*/*` → `HtmlRenderer`

Custom DI configuration in `config/web/di/error-handler.php`:

```php
declare(strict_types=1);

use Psr\Container\ContainerInterface;
use Yiisoft\Definitions\DynamicReference;
use Yiisoft\ErrorHandler\HeadersProvider;
use Yiisoft\ErrorHandler\Renderer\HtmlRenderer;
use Yiisoft\ErrorHandler\RendererProvider\CompositeRendererProvider;
use Yiisoft\ErrorHandler\RendererProvider\ContentTypeRendererProvider;
use Yiisoft\ErrorHandler\RendererProvider\HeadRendererProvider;
use Yiisoft\ErrorHandler\ThrowableRendererInterface;
use Yiisoft\ErrorHandler\ThrowableResponseFactory;
use Yiisoft\ErrorHandler\ThrowableResponseFactoryInterface;

return [
    ThrowableRendererInterface::class => HtmlRenderer::class,

    HeadersProvider::class => [
        'class' => HeadersProvider::class,
        '__construct()' => [
            'headers' => [
                'X-Content-Type-Options' => ['nosniff'],
            ],
        ],
    ],

    ThrowableResponseFactoryInterface::class => [
        'class' => ThrowableResponseFactory::class,
        '__construct()' => [
            'rendererProvider' => DynamicReference::to(
                static fn(ContainerInterface $container) => new CompositeRendererProvider(
                    new HeadRendererProvider(),
                    new ContentTypeRendererProvider($container),
                ),
            ),
        ],
    ],
];
```

---

## 5. Custom Error Renderers

### 5.1. HTML Error Renderer (`HtmlRenderer` Configuration & Custom Templates)

`Yiisoft\ErrorHandler\Renderer\HtmlRenderer` formats exceptions into HTML. Its constructor accepts:
- `?string $template`: Absolute path to template for production (without stack trace).
- `?string $verboseTemplate`: Absolute path to template for development (with stack trace).
- `string|Closure|null $traceLink`: Template or closure for IDE navigation links (e.g. `'phpstorm://open?file={file}&line={line}'`).
- `array $traceFileMap`: Prefix replacements for Docker / remote containers.

> [!WARNING]
> `HtmlRenderer` does NOT take an array of templates keyed by HTTP status code (such as `[404 => '...', 500 => '...']`). HTTP status mapping is handled by `ExceptionResponder` or fallback handlers like `NotFoundHandler`.

In `config/web/di/html-renderer.php`:

```php
declare(strict_types=1);

use Yiisoft\Aliases\Aliases;
use Yiisoft\Definitions\DynamicReference;
use Yiisoft\ErrorHandler\Renderer\HtmlRenderer;

return [
    HtmlRenderer::class => [
        'class' => HtmlRenderer::class,
        '__construct()' => [
            'template' => DynamicReference::to(
                static fn(Aliases $aliases): string => $aliases->get('@views/error/production.php'),
            ),
            'verboseTemplate' => DynamicReference::to(
                static fn(Aliases $aliases): string => $aliases->get('@views/error/development.php'),
            ),
            'traceLink' => 'phpstorm://open?file={file}&line={line}',
            'traceFileMap' => [
                '/app' => '/var/www/my-project',
            ],
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

---

### 5.2. JSON Error Renderer (RFC 7807 Problem Details with `ThrowableRendererInterface`)

Implement `ThrowableRendererInterface` to return compliant RFC 7807 `application/problem+json` error responses.

> [!IMPORTANT]
> `Yiisoft\ErrorHandler\ErrorData` holds string content and headers. It implements `\Stringable`.
> It does **not** have a `getData()` method. Convert it to string via `(string) $data` or `$data->__toString()`.

In `src/Infrastructure/Error/ProblemDetailsJsonRenderer.php`:

```php
declare(strict_types=1);

namespace App\Infrastructure\Error;

use Psr\Http\Message\ServerRequestInterface;
use Throwable;
use Yiisoft\ErrorHandler\ErrorData;
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
            'title' => $t instanceof FriendlyExceptionInterface ? $t->getName() : (Status::TEXTS[$status] ?? 'Error'),
            'status' => $status,
            'detail' => $t->getMessage(),
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

Register in `config/web/di/error-json.php`:

```php
declare(strict_types=1);

use App\Infrastructure\Error\ProblemDetailsJsonRenderer;
use Yiisoft\ErrorHandler\RendererProvider\ContentTypeRendererProvider;

return [
    ProblemDetailsJsonRenderer::class => [
        'class' => ProblemDetailsJsonRenderer::class,
    ],
    ContentTypeRendererProvider::class => [
        'class' => ContentTypeRendererProvider::class,
        '__construct()' => [
            'renderers' => [
                'application/json' => ProblemDetailsJsonRenderer::class,
                'application/problem+json' => ProblemDetailsJsonRenderer::class,
            ],
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

Implementation guidelines:
- `getName()`: Short, human-understandable exception title.
- `getSolution()`: Clear resolution advice. Use simple markdown (`*`, `` ` ``, `-`). Do **not** use raw HTML tags. Keep it concise.

In `src/Domain/User/Exception/UserNotFoundException.php`:

```php
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
- `HtmlRenderer` parses `$throwable->getSolution()` via `cebe/markdown` and displays a highlighted diagnostic solution block.
- Console runner (`Yiisoft\Yii\Console\Application::doRenderThrowable`) highlights the title and solution note directly in the terminal.

---

## 7. User Exceptions & Information Disclosure (`UserException` & `#[UserException]`)

In production environments, `HtmlRenderer` hides raw exception messages from arbitrary throwables (e.g. database errors, file paths) and substitutes `ThrowableRendererInterface::DEFAULT_ERROR_MESSAGE` (`'An internal server error occurred.'`) to prevent data leakage.

To declare that an exception's message is safe for end users, Yii3 provides `Yiisoft\ErrorHandler\Exception\UserException`. It can be used in two ways:

### 7.1. Extending `UserException`

```php
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

`UserException::isUserException(Throwable $throwable)` automatically detects both instances of `UserException` and classes decorated with `#[UserException]`.

---

## 8. Logging & Sentry Monitoring (`yiisoft/yii-sentry`)

### 8.1. PSR-14 Event Listener (`ApplicationError`)

When `ErrorCatcher` catches an uncaught exception, it dispatches the `Yiisoft\ErrorHandler\Event\ApplicationError` event.

> [!TIP]
> For logger DI wiring, targets (file/db/email/syslog/stream), categories, and placeholders, see `references/logging.md`.

In `src/Infrastructure/Error/Listener/LogApplicationErrorListener.php`:

```php
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

Register listener in `config/common/events.php`:

```php
declare(strict_types=1);

use App\Infrastructure\Error\Listener\LogApplicationErrorListener;
use Yiisoft\ErrorHandler\Event\ApplicationError;

return [
    ApplicationError::class => [
        [LogApplicationErrorListener::class],
    ],
];
```

---

### 8.2. Sentry Web Integration (`SentryMiddleware`)

Configure `yiisoft/yii-sentry` in `config/common/params.php`:

```php
declare(strict_types=1);

use Sentry\Event;
use Yiisoft\ErrorHandler\Exception\ErrorException;

return [
    'yiisoft/yii-sentry' => [
        'handleConsoleErrors' => true,
        'cron-monitoring' => [],
        'options' => [
            'dsn' => $_ENV['SENTRY_DSN'] ?? null,
            'environment' => $_ENV['APP_ENV'] ?? 'production',
            'release' => 'v1.0.0',
            'traces_sample_rate' => 0.2,
            'before_send' => static function (Event $event): ?Event {
                foreach ($event->getExceptions() as $exception) {
                    if ($exception->getType() === ErrorException::class) {
                        return null; // Ignore PHP non-fatal errors converted to ErrorException if desired
                    }
                }
                return $event;
            },
        ],
    ],
];
```

`SentryMiddleware` must be placed immediately after `ErrorCatcher` in `config/web/params.php`:

```php
declare(strict_types=1);

use Yiisoft\ErrorHandler\Middleware\ErrorCatcher;
use Yiisoft\ErrorHandler\Middleware\ExceptionResponder;
use Yiisoft\Router\Middleware\Router;
use Yiisoft\Yii\Sentry\SentryMiddleware;

return [
    'middlewares' => [
        ErrorCatcher::class,
        SentryMiddleware::class,
        ExceptionResponder::class,
        Router::class,
    ],
];
```

---

### 8.3. Sentry Console Integration & Cron Monitoring

When `'handleConsoleErrors' => true` is configured in params, `yiisoft/yii-sentry` automatically registers `Yiisoft\Yii\Sentry\SentryConsoleHandler` to listen for Symfony Console's `ConsoleErrorEvent`. Any exception escaping a CLI command is reported to Sentry.

For scheduled cron tasks, configure `'cron-monitoring'` with check-in monitors in `config/common/params.php`:

```php
declare(strict_types=1);

return [
    'yiisoft/yii-sentry' => [
        'cron-monitoring' => [
            'backup:run' => [
                'monitor_slug' => 'database-backup',
                'schedule' => '0 2 * * *',
                'max_runtime' => 30,
                'checkin_margin' => 5,
            ],
        ],
    ],
];
```

---

## 9. Console Error Handling Architecture

In CLI environments (`yiisoft/yii-console` and `yiisoft/yii-runner-console`), error handling operates through Symfony Console events rather than PSR-15 middlewares:

1. **`ConsoleApplicationRunner` Execution Loop**: Wraps `$application->run($input, $output)` in a try-catch block.
2. **`Yiisoft\Yii\Console\Application::renderThrowable()`**: Renders caught exceptions to terminal output. If the exception implements `FriendlyExceptionInterface`, it prints the formatted title and solution note via ANSI styles.
3. **`ConsoleErrorEvent` Logging**: Handled by `Yiisoft\Yii\Console\ErrorListener::onError(ConsoleErrorEvent $event)`.

Register console error logging in `config/console/events.php`:

```php
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

`Yiisoft\ErrorHandler\ErrorHandler` manages low-level PHP errors (fatals, warnings, notices, memory exhaustion) outside the PSR-15 HTTP pipeline.

Key responsibilities:
- **`register()`**: Registers PHP `set_error_handler`, `set_exception_handler`, and `register_shutdown_function`.
- **Memory Reserve (`memoryReserveSize(int $size)`)**: Pre-allocates memory (default: 256 KB) to ensure sufficient memory remains to format and log Out-Of-Memory (OOM) fatal errors.
- **Conversion to `ErrorException`**: Converts PHP warnings and notices into `Yiisoft\ErrorHandler\Exception\ErrorException` instances, capturing detailed Xdebug backtraces when available.

---

## 11. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| Yii2 `'errorHandler' => ['errorAction' => 'site/error']` | Yii3 does not use controller actions as error handlers. Actions require a route match and cannot reliably handle pipeline-level failures. | Use `ErrorCatcher` middleware and `ThrowableRendererInterface` (`HtmlRenderer` / `JsonRenderer`). |
| Configuring `HtmlRenderer` with `'templates' => [404 => ..., 500 => ...]` | `HtmlRenderer` does not support status code keyed template arrays. It only accepts `template` (production) and `verboseTemplate` (development). | Map exceptions to status codes via `ExceptionResponder` or customize fallback handler `NotFoundHandler`. |
| Calling `$errorData->getData()` | `ErrorData` does not have a `getData()` method. Calling it triggers a fatal runtime error. | Cast to string: `(string) $errorData` or `$errorData->__toString()`. |
| Placing `ErrorCatcher` after other middlewares | Any exception thrown by earlier middlewares (e.g. Session, CORS, Auth) escapes unhandled and crashes PHP with an unformatted 500. | Place `ErrorCatcher` as the very first entry in the HTTP middleware stack. |
| Instantiating `ErrorCatcher` without `ThrowableResponseFactoryInterface` | `ErrorCatcher` constructor strictly requires `ThrowableResponseFactoryInterface $throwableResponseFactory`. | Inject `ThrowableResponseFactoryInterface` via DI container. |
| Expecting console commands to use `ThrowableRendererInterface` | Console runner does not use PSR-7 error renderers; it uses Symfony Console output formatting. | Rely on `Yiisoft\Yii\Console\Application::renderThrowable()` and listen to `ConsoleErrorEvent`. |
| Throwing raw domain/persistence exceptions with sensitive details in production | Exposes database credentials, SQL queries, or filesystem paths to end users. | Mark safe exception messages with `#[UserException]` or extend `UserException`. Non-user exceptions display a generic message in production. |
| Catching `Throwable` inside every controller action and returning manual 500 responses | Bloats actions, bypasses `ErrorCatcher` content negotiation, suppresses Sentry error capture, and hides stack traces in dev. | Let unexpected exceptions bubble up to `ErrorCatcher` and map anticipated errors with `ExceptionResponder`. |
| Using HTML tags in `FriendlyExceptionInterface::getSolution()` | Renders raw unescaped HTML or broken layout in console terminals and markdown renderers. | Use plain text and simple markdown formatting (`*`, `` ` ``, `-`) in `getSolution()`. |
| Swallowing exceptions in custom middleware without re-throwing | Bypasses `ErrorCatcher` logging, breaks Sentry exception tracking, and leaves the client hanging without a response. | Either re-throw (`throw $e;`) or return a valid PSR-7 `ResponseInterface`. |
