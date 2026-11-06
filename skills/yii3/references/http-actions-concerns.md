# Yii3 Actions: Presentation & Platform Concerns

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Part of the [Actions & Controllers Guide](http-actions-and-controllers.md) split — §3.5–§3.11 of 'Detailed Package Usage in Actions'; the anti-pattern matrix and related guides live in the parent.

### 3.5. HTML Web Views & Form Models (`yiisoft/yii-view-renderer`, `yiisoft/form-model`)

For full-page web applications, inject `Yiisoft\Yii\View\Renderer\WebViewRenderer` — the current renderer (the older `ViewRenderer` is `@deprecated`, see the note at the end of this section) — for template rendering, and `FormHydrator` for populating and validating HTML forms.

**The Form Model** (compact skeleton; the full lifecycle example — hydration → validation → redirect — lives in the [Forms & Typed DTO Hydration Guide, §8.3](http-forms-and-hydration.md)):

```php
final class ContactForm extends FormModel
{
    #[Required]
    #[Length(min: 2, max: 100)]
    public string $name = '';

    #[Required]
    #[Email]
    public string $email = '';

    #[Required]
    #[Length(min: 10, max: 2000)]
    public string $message = '';
}
```

**The Action Handler** — thin invokable: `populateFromPostAndValidate($form, $request)` → on success delegate to the use case (`$this->useCase->execute(new ContactDto(...))`), add a flash message, and redirect via `UrlGeneratorInterface`; on failure render the view with `WebViewRenderer` and return 422 when the request was POST and `$form->isValid()` is `false`.

> [!WARNING]
> **The Form Name / Scope Trap:** with no explicit `scope`, `populateFromPostAndValidate()` falls back to `FormModel::getFormName()` — the hydrator looks for nested data `$request->getParsedBody()['ContactForm']`; pass `scope: ''` for flat inputs (or override `getFormName(): string { return ''; }`). Missing scope data is not silent: the method deterministically returns `false` — always branch on the returned `bool`. Full semantics: [Forms & Typed DTO Hydration Guide, §8.2](http-forms-and-hydration.md).

> [!TIP]
> For layout configurations, page lifecycle, asset bundles, and custom widgets, see [Views, Layouts & Widgets Guide](http-views-and-widgets.md); for `GridView`, `ListView`, and `DetailView`, see the [DataView Widgets Guide](http-dataview-widgets.md).

**WebViewRenderer Capabilities:**
- Full layout rendering: `$this->webViewRenderer->render('contact/index', ['form' => $form])` returns a typed `ResponseInterface` and sets `Content-Type: text/html; charset=UTF-8` (customizable via `withContentType()` / `withEncoding()`).
- Partial rendering (no layout, for HTMX/AJAX/modals): `$this->webViewRenderer->renderPartial('partial/_modal', [...])`.
- Custom layout per action: `$this->webViewRenderer->withLayout('@views/layout/blank.php')->render('login', [...])` — for layout path/alias argument semantics and layout configuration, see the [Views, Layouts & Widgets Guide, §1.2](http-views.md#12-key-webviewrenderer-api-methods).
- Controller-to-view path mapping: `$this->webViewRenderer->withController($this)` or `->withControllerName('contact')` prefixes relative view names.
- Setting HTTP status: Call `->withStatus(Status::BAD_REQUEST)` on the **returned `ResponseInterface`**, NOT on the renderer itself (which does not have a `withStatus()` method).

> [!IMPORTANT]
> **`ViewRenderer` is deprecated.** The legacy `Yiisoft\Yii\View\Renderer\ViewRenderer` returns a `DataResponse` (which still implements `ResponseInterface`) and will be removed in a future version. Use `WebViewRenderer` in new code and migrate existing actions to it.

---

### 3.6. File Downloads & Binary Responses (`yiisoft/response-download`, `yiisoft/http`)

To stream files, send attachments, or use web server `X-Sendfile` / `X-Accel-Redirect` acceleration, inject `Yiisoft\ResponseDownload\DownloadResponseFactory`:

```php
declare(strict_types=1);

namespace App\Presentation\Action\Export;

use App\Application\Export\GenerateReportUseCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Http\ContentDispositionHeader;
use Yiisoft\ResponseDownload\DownloadResponseFactory;

final readonly class DownloadReportAction
{
    public function __construct(
        private GenerateReportUseCase $useCase,
        private DownloadResponseFactory $downloadFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $filePath = $this->useCase->getReportPath();

        // Generates PSR-7 response with Content-Type, Content-Disposition, and Content-Length
        return $this->downloadFactory->sendFile(
            filePath: $filePath,
            attachmentName: 'monthly-report.pdf',
            disposition: ContentDispositionHeader::ATTACHMENT,
            mimeType: 'application/pdf',
            request: $request,
        );
    }
}
```

> [!NOTE]
> The four download factory methods (`sendFile()`, `sendStreamAsFile()`, `sendContentAsFile()`, `xSendFile()`), web server `X-Sendfile` acceleration, and byte-range streaming are owned by the [File Handling Guide](http-file-handling.md), section 3. Traps: there are no `sendStream()`/`send()` shortcuts (calling them throws a fatal `Error`), and `$mimeType` is non-nullable in `sendStreamAsFile()` (passing `mimeType: null` throws `TypeError: ... must be of type string, null given`).

---

### 3.7. Data Listing, Pagination & Sorting (`yiisoft/data`)

Use `OffsetPaginator` and `Sort` from `yiisoft/data` to structure list endpoints with pagination and sorting.

```php
declare(strict_types=1);

namespace App\Presentation\Action\Api\Post;

use App\Domain\Post\PostRepositoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Data\Paginator\OffsetPaginator;
use Yiisoft\Data\Paginator\PageNotFoundException;
use Yiisoft\Data\Reader\Sort;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;

final readonly class ListPostsAction
{
    private const DEFAULT_PAGE_SIZE = 20;
    private const MAX_PAGE_SIZE = 100;

    public function __construct(
        private PostRepositoryInterface $postRepository,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $params = $request->getQueryParams();
        $page = max(1, (int) ($params['page'] ?? 1));
        $pageSize = min(self::MAX_PAGE_SIZE, max(1, (int) ($params['page_size'] ?? self::DEFAULT_PAGE_SIZE)));

        $sort = Sort::only(['id', 'createdAt', 'title'])
            ->withOrderString((string) ($params['sort'] ?? '-createdAt'));

        $dataReader = $this->postRepository->findAll()->withSort($sort);

        $paginator = (new OffsetPaginator($dataReader))
            ->withPageSize($pageSize)
            ->withCurrentPage($page);

        try {
            $items = iterator_to_array($paginator->read());
        } catch (PageNotFoundException) {
            return $this->responseFactory->createResponse(
                ['error' => 'Page not found.'],
                Status::NOT_FOUND
            );
        }

        return $this->responseFactory->createResponse([
            'data' => $items,
            'pagination' => [
                'currentPage' => $paginator->getCurrentPage(),
                'pageSize' => $paginator->getPageSize(),
                'totalItems' => $paginator->getTotalItems(),
                'totalPages' => $paginator->getTotalPages(),
            ],
        ], Status::OK);
    }
}
```

**Key Traps & Recommendations:**
- `Sort::only(['col1', 'col2'])` acts as a **field whitelist**: sort field names submitted by clients that are not in the list are silently dropped. This guarantees sorting happens only on configured fields — it is a whitelist, not a general SQL-injection protection mechanism.
- `$paginator->read()` returns an `iterable` (a generator): `Yiisoft\Data\Paginator\PageNotFoundException` is thrown lazily on the first iteration, not at the `read()` call itself. Keep the consumption (`foreach` or `iterator_to_array()`) inside the `try` block, as in the example above. Note that `getTotalPages(): int` can legitimately be `0` for an empty data set.

**Large Datasets & List Filtering:**
- For very large tables, prefer `Yiisoft\Data\Paginator\KeysetPaginator`: its performance does not depend on the page number and results stay consistent under concurrent insertions and deletions. Trade-offs: no total-pages metadata, only "previous/next" navigation, and the data reader must stay sorted.
- For list filtering, use the data reader's `withFilter(Yiisoft\Data\Reader\FilterInterface)` (the `FilterableDataInterface` contract) with composable filter objects from `Yiisoft\Data\Reader\Filter` (`Equals`, `In`, `Like`, `AndX`, `GreaterThan`, ...). Build filters from validated input, never from raw query strings.

---

### 3.8. Authentication & Authorization (`yiisoft/user`, `yiisoft/auth-jwt`)

Actions use `CurrentUser` to inspect the caller's identity and evaluate RBAC permissions.

```php
declare(strict_types=1);

namespace App\Presentation\Action\Post;

use App\Application\Post\DeletePostUseCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;
use Yiisoft\User\CurrentUser;

final readonly class DeletePostAction
{
    public function __construct(
        private CurrentUser $currentUser,
        private CurrentRoute $currentRoute,
        private DataResponseFactoryInterface $responseFactory,
        private DeletePostUseCase $useCase,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        // 1. Authentication check
        if ($this->currentUser->isGuest()) {
            return $this->responseFactory->createResponse(
                ['error' => 'Authentication required.'],
                Status::UNAUTHORIZED // HTTP 401
            );
        }

        // 2. Permission check (RBAC)
        if (!$this->currentUser->can('delete_post')) {
            return $this->responseFactory->createResponse(
                ['error' => 'Forbidden: insufficient permissions.'],
                Status::FORBIDDEN // HTTP 403
            );
        }

        $id = (int) $this->currentRoute->getArgument('id');
        $this->useCase->execute($id, $this->currentUser->getId());

        return $this->responseFactory->createResponse(null, Status::NO_CONTENT); // HTTP 204
    }
}
```

> [!CAUTION]
> `CurrentUser::can()` has the signature `can(string|BackedEnum $permissionName, array $params = []): bool` and delegates to `Yiisoft\Access\AccessCheckerInterface` (backed by `yiisoft/rbac` in the application wiring). **When no access checker is attached, `can()` always returns `false`** — every permission check silently denies access. Make sure the application wires an access checker.
> Related members: `getId(): ?string` returns `null` for guests (safe to use after the `isGuest()` check above), and `getIdentity(): IdentityInterface` is the accessor for the current identity object. The `IdentityInterface` contract itself ships in `yiisoft/auth`.

**Authentication in Login Actions:**
- **Web Session Login:** `$this->currentUser->login($identity)` — exact signature `login(IdentityInterface $identity): bool`. On success it stores the identity and regenerates the session ID (session-fixation protection).
- **Web Session Logout:** `$this->currentUser->logout(): bool`.
- **API JWT Token Creation (`yiisoft/auth-jwt`):**
  ```php
  use Jose\Component\Signature\Serializer\CompactSerializer;
  use Yiisoft\Auth\Jwt\TokenFactoryInterface;

  // Exact signature: create(array $payload, string $format, ?int $signatureIndex = null): string
  $token = $this->tokenFactory->create(['sub' => $identity->getId()], CompactSerializer::NAME);
  ```
  > [!NOTE]
  > The method on `TokenFactoryInterface` is `create()` (NOT `createToken()`), requiring `CompactSerializer::NAME`. Full JWT issuer recipes, key algorithms, token parsing, and auth-pipeline middleware wiring are owned by the [JWT Authentication Guide](infra-auth-jwt.md), section 2.

#### CSRF Token (`yiisoft/csrf`)

Inject `Yiisoft\Csrf\CsrfTokenInterface` into presentation actions or form handlers to obtain the masked token:
```php
$csrfToken = $this->csrfToken->getValue();
```
The token is obtained **only** through `CsrfTokenInterface::getValue(): string` (it is not exposed as a request attribute).

> [!NOTE]
> Pipeline validation via `CsrfTokenMiddleware` (`CsrfMiddleware` is `@deprecated`), masked tokens, AJAX/cookie double-submit flows, and 422 failure handlers are owned by the [HTTP State Guide](http-state.md), section 5.

---

### 3.9. Cookies & Sessions (`yiisoft/cookies`, `yiisoft/session`)

Manage cookies by creating `Yiisoft\Cookies\Cookie` instances and attaching them to the PSR-7 response:

```php
declare(strict_types=1);

namespace App\Presentation\Action\Preferences;

use DateInterval;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Cookies\Cookie;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;

final readonly class SetThemeAction
{
    public function __construct(
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $body = (array) ($request->getParsedBody() ?? []);
        $theme = ($body['theme'] ?? 'light') === 'dark' ? 'dark' : 'light';

        // 1. Instantiate Cookie via constructor (NO Cookie::create() method exists)
        $cookie = (new Cookie('preferred_theme', $theme))
            ->withMaxAge(new DateInterval('P30D'))
            ->withPath('/')
            ->withHttpOnly(true)
            ->withSecure(true)
            ->withSameSite(Cookie::SAME_SITE_LAX);

        $response = $this->responseFactory->createResponse(['status' => 'ok'], Status::OK);

        // 2. Add Cookie to PSR-7 response
        return $cookie->addToResponse($response);
    }
}
```

> [!CAUTION]
> 1. `Yiisoft\Cookies\Cookie` has **no static `create()` method**. Instantiate it via `new Cookie($name, $value)`.
> 2. There is **no `SameSite` class or enum**. SameSite constants are located directly on the `Cookie` class: `Cookie::SAME_SITE_LAX`, `Cookie::SAME_SITE_STRICT`, `Cookie::SAME_SITE_NONE`.
> 3. `withMaxAge()` accepts a `DateInterval` ONLY — passing an `int` (seconds) throws a `TypeError`.

**Reading Cookies from Request:**
```php
$cookies = $request->getCookieParams();
$theme = $cookies['preferred_theme'] ?? 'light';
```

**Cookie Deletion (idiom):** send a cookie with the same name and an expired date:
```php
return (new Cookie('preferred_theme'))->expire()->addToResponse($response);
```
> [!NOTE]
> Cookie collections (`CookieCollection`), signing (`CookieSigner`), encryption (`CookieEncryptor`), session middleware ordering, and custom session storage engines are owned by the [HTTP State Guide](http-state.md), sections 2–4.

**Session & Flash Messages (`yiisoft/session`):**
```php
// Inject Yiisoft\Session\Flash\FlashInterface
$this->flash->add('success', 'Profile updated successfully.');
$allFlashes = $this->flash->getAll();

// Inject Yiisoft\Session\SessionInterface
$this->session->set('last_page', '/dashboard');
$lastPage = $this->session->get('last_page', default: '/');
$this->session->remove('last_page');
```

**Flash & Session Regeneration:** the `FlashInterface` method set, consuming-read semantics, and session-id regeneration (`regenerateId()`) — see the [HTTP State Guide, §3](http-state.md#3-flash-messages).

---

### 3.10. Internationalization & Localization (`yiisoft/translator`)

Inject `Yiisoft\Translator\TranslatorInterface` to localize user messages, flash notifications, or API error labels:

```php
declare(strict_types=1);

namespace App\Presentation\Action\Web\Profile;

use App\Domain\User\User;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Session\Flash\FlashInterface;
use Yiisoft\Translator\TranslatorInterface;

final readonly class NotifyUserAction
{
    public function __construct(
        private TranslatorInterface $translator,
        private FlashInterface $flash,
    ) {}

    public function notify(User $user): void
    {
        // Exact signature: translate(string|Stringable $id, array $parameters = [], ?string $category = null, ?string $locale = null): string
        $message = $this->translator->translate(
            id: 'profile.updated_successfully',
            parameters: ['name' => $user->getName()],
            category: 'user',
        );

        $this->flash->add('success', $message);
    }
}
```

> [!TIP]
> Notice the named argument is `parameters:`, NOT `params:`. Passing `params:` produces an `Unknown named parameter $params` fatal error — this is the PHP language consequence of a wrong named parameter, not a framework-level check.

> [!NOTE]
> Message source backends (PHP files, Gettext, DB), category sources, plural rules, and locale-detecting middleware are owned by the [i18n & Translation Guide](http-i18n-translation.md). Translating via an unregistered category returns the raw message ID as-is.

---

### 3.11. Action Resolution & Dispatching (`yiisoft/middleware-dispatcher`)

Yii3 executes actions through `Yiisoft\Middleware\Dispatcher\MiddlewareFactory`. Any route handler can be registered as:

1. **Invokable Action Class (Best Practice):**
   ```php
   (new \Yiisoft\Router\Route\Get('/users/{id:\d+}'))->action(ViewUserAction::class)
   ```
   Requires method `__invoke(ServerRequestInterface $request, ...): ResponseInterface`.
2. **PSR-15 RequestHandlerInterface:**
   ```php
   (new \Yiisoft\Router\Route\Get('/health'))->action(HealthCheckHandler::class)
   ```
   Requires method `handle(ServerRequestInterface $request): ResponseInterface`.
3. **Controller Method Pair:**
   ```php
   (new \Yiisoft\Router\Route\Get('/users'))->action([UserController::class, 'index'])
   ```
   Requires method `index(ServerRequestInterface $request, ...): ResponseInterface`.

> [!IMPORTANT]
> `Route` is a normal class in the `Yiisoft\Router\Route` sub-namespace, not a static facade. The static factories `Route::get()`, `Route::post()`, `Route::put()`, `Route::delete()` (and the other HTTP verb helpers) are `@deprecated` — use `new \Yiisoft\Router\Route\Get(...)`, `new \Yiisoft\Router\Route\Post(...)`, etc. instead. Each accepts the URL pattern as the first constructor argument and supports named arguments such as `name:` and `action:`.

**Route Argument Injection via `#[RouteArgument]`:**
```php
declare(strict_types=1);

namespace App\Presentation\Action\User;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Router\HydratorAttribute\RouteArgument;

final readonly class ShowUserAction
{
    public function __construct(
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(
        ServerRequestInterface $request,
        #[RouteArgument('id')]
        ?string $id = null,
    ): ResponseInterface {
        return $this->responseFactory->createResponse(['id' => $id]);
    }
}
```

**Missing Route Argument Behavior:**
- `CurrentRoute::getArgument('id')` returns `?string` — a missing route argument yields `null` (or the caller-provided default), never an exception.
- With `#[RouteArgument('id')]`, a missing argument makes the attribute resolver fail: the action parameter keeps its declared default value (as above), or hydration fails when no default is declared.
- `UrlGeneratorInterface::generate()` on an unknown route name throws `Yiisoft\Router\RouteNotFoundException`.

**Parameter Resolution Rules:**
- `Yiisoft\Middleware\Dispatcher\MiddlewareFactory` itself passes `ServerRequestInterface` and `RequestHandlerInterface` into every action invocation — they are provided automatically by the factory wrappers, never by the parameters resolver chain.
- Remaining named parameters are resolved by the application's `CompositeParametersResolver` (`Yiisoft\Middleware\Dispatcher\CompositeParametersResolver`), composed of `HydratorAttributeParametersResolver` and `RequestInputParametersResolver` (both from `yiisoft/input-http`):
  - Parameters carrying hydrator parameter attributes (e.g. `#[RouteArgument('id')]`) are resolved by `HydratorAttributeParametersResolver`.
  - DTO parameters implementing `RequestInputInterface` (e.g. `AbstractInput` subclasses) are resolved by `RequestInputParametersResolver`.
  - All other class-typed dependencies are resolved from the DI container via `Yiisoft\Injector\Injector` — builtin-typed parameters are never container-resolved.
- **Return Type Requirement:** Action methods MUST return `Psr\Http\Message\ResponseInterface`. The returned value is checked after execution (inside the middleware wrapper's `process()`): returning `null`, `void`, `array`, `string`, or `int` from an action method throws `Yiisoft\Middleware\Dispatcher\InvalidMiddlewareDefinitionException`. Plain callables registered as middleware may also legally return `MiddlewareInterface` or `RequestHandlerInterface`; action methods may not.

> [!TIP]
> **Error Handling & Exception Propagation:**
> If an action or domain service throws an unhandled exception, it is caught by `Yiisoft\ErrorHandler\Middleware\ErrorCatcher` (package `yiisoft/error-handler`) and converted into an appropriate HTTP response. For exception responders and error templates, see [Error Handling Guide](infra-error-handling.md).

---
