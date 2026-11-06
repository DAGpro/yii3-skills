# Yii3 Error Handling & Exception Management Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Practical guide and configuration recipes for error catching pipelines, custom HTML/JSON renderers, Friendly Exceptions, and Sentry monitoring using `yiisoft/error-handler`, `yiisoft/friendly-exception`, `yiisoft/yii-sentry`, and `yiisoft/yii-event`.

This topic is split into two focused guides — load the one that matches the task:

- [Web Pipeline & Renderers](infra-error-handling-web.md) — error handling architecture & core contracts, `ErrorCatcher` middleware ordering, `ExceptionResponder` mapping, DI renderer providers, custom HTML/JSON renderers, Friendly Exceptions, user exceptions & information disclosure (§1–§7).
- [Logging, Sentry, Console & Low-Level](infra-error-handling-ops.md) — `yiisoft/yii-sentry` monitoring, console error handling architecture, low-level PHP `ErrorHandler` (§8–§10).

Read this file for the anti-pattern matrix (§11) and related guides (§12).

---
## 11. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| Yii2 `'errorHandler' => ['errorAction' => 'site/error']` | Yii3 does not use controller actions as error handlers. Actions require a route match and cannot reliably handle pipeline-level failures. `yiisoft/error-handler` has no error-action mechanism. | Use `ErrorCatcher` middleware and `ThrowableRendererInterface` (`HtmlRenderer` / `JsonRenderer`). |
| Configuring `HtmlRenderer` with `'templates' => [404 => ..., 500 => ...]` | `HtmlRenderer` does not support status code keyed template arrays. It only accepts `template` (production) and `verboseTemplate` (development). | Map exceptions to status codes via `ExceptionResponder`; pipeline-end 404s belong to the fallback request handler (e.g. the app template's `App\Web\NotFound\NotFoundHandler`). |
| Calling `$errorData->getData()` | `ErrorData` does not have a `getData()` method. Calling it triggers a fatal runtime error. | Cast to string: `(string) $errorData` or `$errorData->__toString()`. |
| Placing `ErrorCatcher` after other middlewares | Exceptions thrown before `ErrorCatcher` bypass `SentryMiddleware` capture and `ExceptionResponder` mapping, are handled only by the `yiisoft/yii-runner-http` safety net (re-processed through the container's `ErrorCatcher`), and under a custom runner escape to the global PHP error handler. `BeforeRequest` is request-only (it never observes a response); the `null`-response signal belongs to `AfterRequest` — and to `AfterEmit` when even the recovery pass fails. | Place `ErrorCatcher` as the very first entry in the HTTP middleware stack. |
| Registering listeners as one-element arrays (`ApplicationError::class => [[Listener::class]]`) | A nested array is not a valid listener definition; `yiisoft/yii-event`'s `CallableFactory` throws `Yiisoft\Yii\Event\InvalidListenerConfigurationException` (full definition table: [Events & Listeners Guide, §4.2](core-events-design.md#42-declarative-event-mapping--supported-listener-formats)). | Use `ApplicationError::class => [Listener::class]` (invokable class-string) or `[[Listener::class, '__invoke']]`. |
| Configuring Sentry cron monitoring with snake_case keys (`monitor_slug`, `max_runtime`, `checkin_margin`) | Single-word keys (`slug`, `schedule`, `timezone`) coincidentally match their snake_case spelling; every multi-word key breaks (`monitor_slug`, `max_runtime`, `checkin_margin` do not exist). Unknown array keys are ignored and a missing `slug` throws `InvalidArgumentException`. | Use the camelCase schema: `slug`, `schedule`, `timezone`, `checkinMargin`, `maxRuntime`, `failureIssueThreshold`, `recoveryThreshold` (see [§8.3 of the Error Handling Ops Guide](infra-error-handling-ops.md#83-sentry-console-integration--cron-monitoring)). |
| Overriding `ContentTypeRendererProvider::class` in DI to swap renderers | The shipped `di-web.php` constructs the provider directly inside its `DynamicReference::to()` closure, so a bare class override is never consumed. | Override the `rendererProvider` of `ThrowableResponseFactoryInterface` (see [§5.2 of the Web Pipeline Guide](infra-error-handling-web.md#52-json-error-renderer-rfc-7807-problem-details-with-throwablerendererinterface)); remember a custom `$renderers` map replaces the default map entirely. |
| Referencing `Yiisoft\ErrorHandler\Factory\ThrowableResponseFactory` | Removed in `yiisoft/error-handler` 5.0.0 (Chg #162; 4.1.0 deprecated it). | Use `Yiisoft\ErrorHandler\ThrowableResponseFactory`. |
| Instantiating `ErrorCatcher` without `ThrowableResponseFactoryInterface` | `ErrorCatcher` constructor strictly requires `ThrowableResponseFactoryInterface $throwableResponseFactory` (only the dispatcher is optional). | Inject `ThrowableResponseFactoryInterface` via DI container. |
| Expecting console commands to use `ThrowableRendererInterface` | Console runner does not use PSR-7 error renderers; it uses Symfony Console output formatting via `Application::renderThrowable()`. | Rely on `Yiisoft\Yii\Console\Application::renderThrowable()` and the `ErrorListener` logging shipped by `yiisoft/yii-console` for the Symfony `ConsoleErrorEvent` (the event itself comes from the `symfony/console` dependency). |
| Throwing raw domain/persistence exceptions with sensitive details in production | Exposes database credentials, SQL queries, or filesystem paths to end users. | Mark safe exception messages with `#[UserException]` or extend `UserException`. Non-user exceptions display a generic message in production. |
| Catching `Throwable` inside every controller action and returning manual 500 responses | Bloats actions, bypasses `ErrorCatcher` content negotiation, suppresses Sentry error capture, and hides stack traces in dev. | Let unexpected exceptions bubble up to `ErrorCatcher` and map anticipated errors with `ExceptionResponder`. |
| Using HTML tags in `FriendlyExceptionInterface::getSolution()` | Renders raw unescaped HTML or broken layout in console terminals and markdown renderers (`parseMarkdown()` allow-lists roughly 30 tags only). | Use plain text and simple markdown formatting (`*`, `` ` ``, `-`) in `getSolution()`. |
| Swallowing exceptions in custom middleware without re-throwing | Bypasses `ErrorCatcher` logging, breaks Sentry exception tracking, skips `SessionMiddleware` commit/discard semantics, and leaves the client without a proper response unless a valid PSR-7 response is returned. | Either re-throw (`throw $e;`) or return a valid PSR-7 `ResponseInterface`. |

---

## 12. Related Topic Guides

- [Friendly Exceptions Guide](core-friendly-exceptions.md) — `FriendlyExceptionInterface` contract, Markdown solution invariants, and automatic web/console rendering (§6 of infra-error-handling-web.md).
- [Actions & Controllers Guide](http-actions-and-controllers.md) — Action handlers, PSR-7 response factories, and thin-action error delegation.
- [PSR-15 Middlewares Guide](http-middlewares.md) — Canonical global-pipeline wiring (`Application` dispatcher, §4.1), `SessionMiddleware` commit/discard lifecycle (§3.1), and custom error middleware.
- [Logging Guide](infra-logging.md) — PSR-3 logger configuration, log targets, and context logging.
- [Events & Listeners Guide](core-events-and-listeners.md) — PSR-14 dispatcher wiring, listener definition formats, and event configuration groups.