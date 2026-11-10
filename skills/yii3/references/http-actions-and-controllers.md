# Yii3 Actions & Controllers Package Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Practical recommendations and idiomatic patterns for using official `yiisoft/*` packages inside Yii3 Actions and Controllers.
>
> Actions belong to the **Presentation Layer**: they orchestrate HTTP input/output and delegate all business logic, persistence, and heavy calculations to Application Use Cases and Domain models.

This topic is split into two focused guides — load the one that matches the task:

- [Core Principles, Input & Responses](http-actions-core.md) — core action principles, concern-to-package matrix, route parameters & redirects, request parsing & DTO hydration, validation handling, REST API responses (§1–§3.4).
- [Presentation & Platform Concerns](http-actions-concerns.md) — HTML web views & form models, file downloads & binary responses, listing/pagination/sorting, authentication & authorization, cookies & sessions, i18n, action resolution & dispatching (§3.5–§3.11).

Read this file for the anti-pattern matrix (§4) and related guides (§5).

---
## 4. Anti-Pattern Matrix: Actions & Presentation Layer

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| ❌ `class SiteController extends Controller` with `actionIndex()` | Yii3 does not have a monolithic `yii\web\Controller` base class. Actions are standalone handlers or PSR-15 middlewares. | ✅ Create a single-action invokable class: `final readonly class IndexAction { public function __invoke(ServerRequestInterface $request): ResponseInterface { ... } }`. |
| ❌ Returning `array`, `string`, or `void` from Action | Yii3's `MiddlewareFactory` strictly expects `Psr\Http\Message\ResponseInterface`. Returning anything else from an action method throws `InvalidMiddlewareDefinitionException` when the returned value is checked after execution. | ✅ Always return a PSR-7 `ResponseInterface` via `Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface`, `WebViewRenderer`, or `ResponseFactoryInterface`. |
| ❌ Injecting deprecated `Yiisoft\DataResponse\DataResponseFactoryInterface` or registering `Yiisoft\DataResponse\Middleware\ContentNegotiator` | Both are marked `@deprecated` in `yiisoft/data-response` and will be removed in a future version. | ✅ Inject `Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface` and use `Yiisoft\DataResponse\Middleware\ContentNegotiatorDataResponseMiddleware` with `JsonFormatter` / `XmlFormatter`. |
| ❌ Calling `Yii::$app->...` anywhere in the Action | Yii3 completely eliminated global static service locators and `Yii::$app`. | ✅ Inject all dependencies explicitly via the Action constructor (`CurrentRoute`, `DataResponseFactoryInterface`, etc.). |
| ❌ Reading route arguments via `$_GET['id']` or `$request->getAttribute('id')` | Route parameters in `yiisoft/router` are stored in `CurrentRoute`, not in `$_GET` or default request attributes. | ✅ Inject `Yiisoft\Router\CurrentRoute` and call `$currentRoute->getArgument('id')`. |
| ❌ Instantiating cookies with nonexistent `Cookie::create(...)` | `Cookie::create()` does not exist in `yiisoft/cookies` and causes `Error: Call to undefined method`. | ✅ Instantiate via constructor: `new Cookie('name', 'val')` and mutate with `withMaxAge()`, `withPath()`, etc. |
| ❌ Importing nonexistent enum `use Yiisoft\Cookies\SameSite;` | There is no `SameSite` class or enum in `yiisoft/cookies`. | ✅ Use class constants on `Cookie`: `Cookie::SAME_SITE_LAX`, `Cookie::SAME_SITE_STRICT`, `Cookie::SAME_SITE_NONE`. |
| ❌ Registering deprecated `Yiisoft\Csrf\CsrfMiddleware` | `CsrfMiddleware` is marked `@deprecated` in `yiisoft/csrf`. | ✅ Use `Yiisoft\Csrf\CsrfTokenMiddleware` (parsed body parameter `_csrf`, header `X-CSRF-Token`). |
| ❌ Calling nonexistent `TokenFactoryInterface::createToken(...)` | In `yiisoft/auth-jwt`, the method is `create(array $payload, string $format, ?int $signatureIndex = null)`. Calling `createToken()` causes a Fatal Error. | ✅ Call `$tokenFactory->create(['sub' => $id], CompactSerializer::NAME)`. |
| ❌ Calling `$this->webViewRenderer->withStatus(404)->render(...)` | `WebViewRenderer` and the deprecated `ViewRenderer` do not have a `withStatus()` method. | ✅ Call `withStatus()` on the returned response: `$this->webViewRenderer->render(...)->withStatus(Status::NOT_FOUND)`. |
| ❌ Forgetting `$form->getFormName()` scope in `populateFromPostAndValidate()` | By default, `FormModel::getFormName()` expects nested body data: `$body['FormName']['field']`. When the scope key is missing from the parsed body, `populateFromPostAndValidate()` deterministically returns `false` and validation is skipped. | ✅ If using flat form inputs, override `getFormName(): string { return ''; }` in the form model or pass `scope: ''` to `populateFromPostAndValidate()`, and always branch on the returned `bool`. |
| ❌ Direct SQL or Active Record / Cycle queries inside Actions | Violates Presentation Layer separation of concerns and bypasses business logic encapsulation. | ✅ Delegate all business logic, data fetching, and persistence to Application Use Cases or Application Services. |
| ❌ Managing database transactions (`$db->transaction()`) inside Actions | Presentation layer should never control database transaction lifecycles. | ✅ Manage transaction boundaries inside Application Use Cases or Unit of Work services. |
| ❌ Assuming JSON request bodies are parsed without `RequestBodyParser` middleware | PSR-7 does not decode JSON payloads natively; `$request->getParsedBody()` returns `null` without parsing middleware. | ✅ Add `Yiisoft\Request\Body\RequestBodyParser` middleware to the route group or application pipeline. |
| ❌ Passing named parameter `params:` to `TranslatorInterface::translate()` | The parameter name in `TranslatorInterface::translate()` is `$parameters`. In PHP 8, passing `params:` throws an `Unknown named parameter` Fatal Error. | ✅ Call `$this->translator->translate($id, parameters: ['user' => $name])`. |
| ❌ Ignoring `PageNotFoundException` when reading `OffsetPaginator` | When `$page > max(1, $paginator->getTotalPages())`, `$paginator->read()` throws `PageNotFoundException`. An unhandled exception yields a 500 server error. | ✅ Wrap `$paginator->read()` in `try ... catch (PageNotFoundException)` and return HTTP 404 or redirect. |
| ❌ Using Yii2 `$model->load($_POST)` or `$model->validate()` on DTOs | Yii3 DTOs do not extend `yii\base\Model` and do not have `load()` or `validate()` methods. | ✅ Use `HydratorInterface::create(Dto::class, (array) $request->getParsedBody())` and `ValidatorInterface::validate($dto)`. |

---

## 5. Related Topic Guides

- [Routing Guide](http-routes.md) — Route definition, FastRoute patterns, and URL generation.
- [PSR-15 Middlewares Guide](http-middlewares.md) — Middleware pipeline ordering, authentication guards, and request manipulation.
- [Views, Layouts & Widgets Guide](http-views-and-widgets.md) — HTML view templates, layouts, asset bundles, and custom widgets.
- [DataView Widgets Guide](http-dataview-widgets.md) — `GridView`, `ListView`, and `DetailView` rendering.
- [Error Handling Guide](infra-error-handling.md) — Exception catching, status code responders, and error presentation formats.
- [Validation & Forms Guide](http-validation-and-forms.md) — Input validation, FormModel hydration, and DTO rules.
- [OpenAPI & Swagger Guide](http-openapi-swagger.md) — Documenting API action endpoints, request bodies, and schemas with PHP 8 attributes.
- [HTTP State Guide](http-state.md) — Sessions, cookies, flash messages, and CSRF state management in depth.
- [i18n & Translation Guide](http-i18n-translation.md) — Message sources, categories, plural forms, and locale handling.
- [Authentication & RBAC Guide](infra-auth-and-rbac.md) — CurrentUser identity, permissions checking, and JWT issuance.
- [File Handling Guide](http-file-handling.md) — Streamed file downloads, X-Sendfile acceleration, and uploaded files.
