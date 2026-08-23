---
name: yii3-errors
description: >-
  Errors and logging for Yii3 applications. Error side: yiisoft/error-handler — ErrorCatcher
  middleware, custom HTML/JSON renderers per Accept header, ExceptionResponder mapping,
  friendly exceptions. Logging side: yiisoft/log (PSR-3) — LoggerInterface usage levels,
  targets (File/Email/Db/Syslog/PsrTarget-Monolog), filtering by level/category, flush/export
  intervals. Use when user says "custom error page", "JSON errors", "exception mapping",
  "logging setup", "log target", "monolog", "where do logs go".
argument-hint: "[web|api|logging task]"
allowed-tools: Read Glob Grep Write Edit Bash(php -l *; composer *) AskUserQuestion Questions
disable-model-invocation: false
metadata:
  author: DAGpro (https://github.com/DAGpro)
  version: "0.1"
  category: framework-yii3
---

# Yii3 Error Handling & Logging Workflow

Two connected parts: **A** — turning exceptions into responses (`yiisoft/error-handler`);
**B** — recording what happened (`yiisoft/log`, PSR-3). Message style rules live in the master
skill ("Logging Conventions"); this skill covers configuration and wiring.

## Part A: Error Handling

### Architecture

- `Yiisoft\ErrorHandler\Middleware\ErrorCatcher` — PSR-15 middleware catching exceptions inside
  the stack; outermost app middleware (only `ExceptionResponder` may sit before it).
- `Yiisoft\ErrorHandler\ErrorHandler` — catches fatals/out-of-stack errors; configured via DI.
- Non-fatal warnings/notices become catchable `ErrorException`. Renderers are chosen by the
  request's `Accept` header (HTML, JSON, XML, text); debug mode controls verbosity — never enable in production.

### Step A0: Analyze

Stack order in `config/web/di/application.php`: `ErrorCatcher::class` first, then session/CSRF/
body parsing, then `Router::class`. Ask: custom templates needed? Structured API errors? Log channel?

### Step A1: Custom Templates & Renderer Settings

```php
use Yiisoft\ErrorHandler\ErrorHandler;
use Yiisoft\ErrorHandler\Renderer\HtmlRenderer;
use Yiisoft\ErrorHandler\ThrowableRendererInterface;

return [
    ThrowableRendererInterface::class => static fn (): HtmlRenderer => new HtmlRenderer([
        'template' => '/full/path/to/templates/error-production.php',
        'verboseTemplate' => '/full/path/to/templates/error-development.php',
        'maxSourceLines' => 20,
        'maxTraceLines' => 5,
    ]),
];
```

### Step A2: Structured API Errors

Default `JsonRenderer` outputs `{"message":"..."}` in production. For a custom format
(e.g. RFC 7807 problem+json) implement `ThrowableRendererInterface` returning `ErrorData`
with the right `Content-Type`, then register a provider map:

```php
new ContentTypeRendererProvider($container, [
    'application/problem+json' => MyRenderer::class,
    'application/json' => JsonRenderer::class,
    'text/html' => HtmlRenderer::class,
    '*/*' => HtmlRenderer::class,
]),
```

Providing the map replaces defaults — re-add renderer classes you still need.

### Step A3: Map Exceptions to Responses

`ExceptionResponder` converts specific exceptions to responses; placed **before** `ErrorCatcher`:

```php
ExceptionResponder::class => static function (ResponseFactoryInterface $responseFactory, Injector $injector) {
    return new ExceptionResponder([
        MyNotFoundException::class => 404,
        MyHttpException::class => static fn (MyHttpException $e) => new MyResponse($e),
    ], $responseFactory, $injector);
},
```

### Step A4: Friendly Exceptions (dev)

Implement `Yiisoft\FriendlyException\FriendlyExceptionInterface` (`getName()` + `getSolution()`)
to show name + fix hint in debug mode.

## Part B: Logging

### Writing Messages

Application code depends only on `Psr\Log\LoggerInterface`; constructor injection always.
Levels per PSR-3: `emergency alert critical error warning notice info debug`.
Usage: `debug` entry traces, `info` milestones, `warning` recoverable failures,
`error` unexpected exceptions.

```php
$this->logger->warning('Payment failed: {reason}', ['reason' => $e->getMessage()]);
```

Context array carries structured data; exceptions under the `exception` key;
category (`__METHOD__`) enables target filtering. Never log secrets or full PII.

### Targets

Only `PsrTarget` / `StreamTarget` ship with `yiisoft/log`; the rest are separate packages:

| Target | Medium | Package |
|---|---|---|
| `PsrTarget` | any PSR-3 logger (e.g. Monolog bridge) | yiisoft/log |
| `StreamTarget` | output stream (stderr/console) | yiisoft/log |
| `FileTarget` | log file | yiisoft/log-target-file |
| `DbTarget` | DB table | yiisoft/log-target-db |
| `EmailTarget` | email addresses | yiisoft/log-target-email |
| `SyslogTarget` | syslog | yiisoft/log-target-syslog |

Configure via **constructor parameters** (setters are deprecated):

```php
$fileTarget = new FileTarget('/path/to/app.log', levels: [LogLevel::ERROR, LogLevel::WARNING]);
$logger = new Logger([$fileTarget]);
```

Bind `LoggerInterface::class` in `config/common/di/logger.php`. Filtering:
`levels: [...]` whitelist, `categories: ['App\Service\*']` include patterns,
`except: ['...:404']` deny-list. Format/prefix/commonContext also constructor params.

### Intervals

- Flush interval (default 1000) and target export interval (default 1000): for long-running
  console commands set both to **1** so messages appear immediately (avoid in web prod).
- Trace level adds call stacks — development only.

### Monolog Bridge

Wrap any PSR-3 logger as the single Yii target:

```php
$logger = new \Yiisoft\Log\Logger([new \Yiisoft\Log\PsrTarget($monologLogger)]);
```

Custom targets extend `\Yiisoft\Log\Target` and implement `export()`.

## Verification Checklist

1. Production mode returns generic message + correct status code; no stack traces leak.
2. Accept-header negotiation works: browser gets HTML, API client gets JSON/problem+json.
3. Exception map produces expected status codes; errors land in the configured destination.
4. Console command logs are visible immediately (intervals tuned).

## Related Skills

- `/yii3-hardening` — no secrets/PII in logs, generic production messages
