# Yii3 Actions & Controllers Package Guide

> Practical recommendations and idiomatic patterns for using official `yiisoft/*` packages inside Yii3 Actions and Controllers.
>
> Actions belong to the **Presentation Layer**: they orchestrate HTTP input/output and delegate all business logic, persistence, and heavy calculations to Application Use Cases and Domain models.

---

## Table of Contents
- [1. Core Action Principles in Yii3](#1-core-action-principles-in-yii3)
- [2. Action Concern → Package Quick Matrix](#2-action-concern--package-quick-matrix)
- [3. Detailed Package Usage in Actions](#3-detailed-package-usage-in-actions)
- [4. Anti-Pattern Matrix: Actions & Presentation Layer](#4-anti-pattern-matrix-actions--presentation-layer)
- [5. Related Topic Guides](#5-related-topic-guides)

---

## 1. Core Action Principles in Yii3

1. **Strict PSR-7 Contract:**
   - Every Action handler MUST accept `Psr\Http\Message\ServerRequestInterface` (or parameters auto-resolved by `yiisoft/input-http` / `yiisoft/middleware-dispatcher`).
   - Every Action handler MUST return `Psr\Http\Message\ResponseInterface` (never `array`, `string`, `int`, or `void`). Returning anything other than a `ResponseInterface` causes `Yiisoft\Middleware\Dispatcher\InvalidMiddlewareDefinitionException`.
2. **Single-Action Invokable Classes (Recommended):**
   - Prefer single-action classes implementing `__invoke(ServerRequestInterface $request): ResponseInterface` or PSR-15 `Psr\Http\Server\RequestHandlerInterface::handle(ServerRequestInterface $request): ResponseInterface`.
   - Multi-action controllers (e.g. `[UserController::class, 'view']`) are supported via `MiddlewareFactory`, but every action method must strictly return `ResponseInterface`.
   - Actions are mapped to HTTP endpoints via route definitions. For routing syntax, FastRoute placeholders, and route groups, see [Routing Guide](routes.md).
   - Actions are the terminal handlers of the PSR-15 pipeline. For middleware ordering, body parsers, and guard filters, see [PSR-15 Middlewares Guide](middlewares.md).
3. **Thin Action Principle (Strict Boundary):**
   - **Allowed in Actions:**
     - Extract request parameters, route arguments (`CurrentRoute`), query params, headers, cookies, and parsed body.
     - Hydrate and validate input DTOs (`HydratorInterface`, `ValidatorInterface`, `yiisoft/input-http`) or Form Models (`FormHydrator`).
     - Check current user state and permissions (`Yiisoft\User\CurrentUser`).
     - Invoke an Application Use Case, Command Handler, or Service.
     - Build and return PSR-7 responses (`DataResponseFactoryInterface`, `ViewRenderer`, `WebViewRenderer`, `DownloadResponseFactory`, HTTP redirects).
   - **Strictly Forbidden in Actions (Anti-Patterns):**
     - ❌ Direct SQL queries, Query Builder, or ActiveRecord / Cycle persistence calls (delegate to Repositories / Use Cases).
     - ❌ Database transaction management (`$db->transaction()` belongs in Use Cases / Unit of Work).
     - ❌ Business logic, domain rules, password hashing, or token cryptography.
     - ❌ Sending emails or pushing queue jobs directly (delegate to Use Cases or PSR-14 Event Listeners).

---

## 2. Action Concern → Package Quick Matrix

| Action Concern | Official Package | Injected Service / Interface | Return / Result Type |
|---|---|---|---|
| **API Response (JSON/XML)** | `yiisoft/data-response` | `Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface` | `Psr\Http\Message\ResponseInterface` |
| **HTML Rendering** | `yiisoft/yii-view-renderer` | `Yiisoft\Yii\View\Renderer\ViewRenderer` or `WebViewRenderer` | `Psr\Http\Message\ResponseInterface` |
| **HTTP Statuses & Headers** | `yiisoft/http` | `Yiisoft\Http\Status`, `Yiisoft\Http\Header`, `Yiisoft\Http\Method` | Constants (`Status::OK`, `Header::LOCATION`) |
| **Route Parameters** | `yiisoft/router` | `Yiisoft\Router\CurrentRoute` | `$currentRoute->getArgument('id')` (`?string`) |
| **Redirects & URLs** | `yiisoft/router` | `Yiisoft\Router\UrlGeneratorInterface` | `$urlGenerator->generate('route', $arguments)` |
| **Input DTO Hydration** | `yiisoft/hydrator` | `Yiisoft\Hydrator\HydratorInterface` | `$hydrator->create(Dto::class, $data)` |
| **Input DTO Auto-Mapping** | `yiisoft/input-http` | `Yiisoft\Input\Http\AbstractInput`, `#[FromBody]`, `#[FromQuery]` | Typed DTO parameter in `__invoke` |
| **Input Validation** | `yiisoft/validator` | `Yiisoft\Validator\ValidatorInterface` | `Yiisoft\Validator\Result` |
| **HTML Form Hydration** | `yiisoft/form-model` | `Yiisoft\FormModel\FormHydrator` | `$formHydrator->populateFromPostAndValidate(...)` |
| **HTML Form Widgets** | `yiisoft/form-model`, `yiisoft/form`, `yiisoft/html` | `Yiisoft\FormModel\Field`, `Yiisoft\Html\Html` | HTML widgets rendered in views |
| **File Downloads** | `yiisoft/response-download` | `Yiisoft\ResponseDownload\DownloadResponseFactory` | `Psr\Http\Message\ResponseInterface` |
| **Pagination & Sorting** | `yiisoft/data` | `Yiisoft\Data\Paginator\OffsetPaginator`, `Yiisoft\Data\Reader\Sort` | Iterable data + pagination metadata |
| **Current User & Auth** | `yiisoft/user` | `Yiisoft\User\CurrentUser` | `$currentUser->getId()`, `$currentUser->can(...)` |
| **API JWT Token Creation** | `yiisoft/auth-jwt` | `Yiisoft\Auth\Jwt\TokenFactoryInterface` | `$tokenFactory->create($payload, 'jws_compact')` |
| **Flash Messages** | `yiisoft/session` | `Yiisoft\Session\Flash\FlashInterface` | `$flash->add('success', $msg)` |
| **Session Data** | `yiisoft/session` | `Yiisoft\Session\SessionInterface` | `$session->get($key)`, `$session->set($key, $val)` |
| **Cookies Management** | `yiisoft/cookies` | `Yiisoft\Cookies\Cookie` | `$cookie->addToResponse($response)` |
| **Translations (i18n)** | `yiisoft/translator` | `Yiisoft\Translator\TranslatorInterface` | `$translator->translate($id, parameters: $params)` |
| **CSRF Token** | `yiisoft/csrf` | `Yiisoft\Csrf\CsrfTokenInterface` | `$csrfToken->getValue()` |
| **Request Provider** | `yiisoft/request-provider` | `Yiisoft\RequestProvider\RequestProviderInterface` | `$requestProvider->get()` |

---

## 3. Detailed Package Usage in Actions

### 3.1. Route Parameters & Redirects (`yiisoft/router`, `yiisoft/http`)

Use `CurrentRoute` to retrieve path parameters defined in route patterns (e.g. `/users/{id:\d+}`). Use `UrlGeneratorInterface` to generate absolute or relative URLs for redirects, and create redirect responses using PSR-17 `ResponseFactoryInterface` with `Status::FOUND` (302) or `Status::SEE_OTHER` (303).

```php
declare(strict_types=1);

namespace App\Presentation\Action\User;

use App\Application\User\GetUserUseCase;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;
use Yiisoft\Router\UrlGeneratorInterface;

final readonly class ViewUserAction
{
    public function __construct(
        private CurrentRoute $currentRoute,
        private UrlGeneratorInterface $urlGenerator,
        private ResponseFactoryInterface $responseFactory,
        private DataResponseFactoryInterface $dataResponseFactory,
        private GetUserUseCase $getUserUseCase,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        // 1. Read route argument (e.g. from /users/{id})
        // Note: getArgument() returns ?string; cast to int if needed.
        $id = $this->currentRoute->getArgument('id');
        if ($id === null) {
            // Redirect using UrlGeneratorInterface and Status::FOUND (302)
            $fallbackUrl = $this->urlGenerator->generate('user/index');
            return $this->responseFactory
                ->createResponse(Status::FOUND)
                ->withHeader(Header::LOCATION, $fallbackUrl);
        }

        $user = $this->getUserUseCase->findById((int) $id);
        if ($user === null) {
            return $this->dataResponseFactory->createResponse(
                ['error' => 'User not found.'],
                Status::NOT_FOUND
            );
        }

        return $this->dataResponseFactory->createResponse(
            ['data' => $user->toArray()],
            Status::OK
        );
    }
}
```

**Key Recommendations & Named Arguments:**
- Never read route parameters from `$_GET` or `$request->getAttribute('id')`; always use `$currentRoute->getArgument('id')`.
- `UrlGeneratorInterface::generate()` parameter signature:
  `generate(string $name, array $arguments = [], array $queryParameters = [], ?string $hash = null): string`.
- `UrlGeneratorInterface::generateAbsolute()` parameter signature:
  `generateAbsolute(string $name, array $arguments = [], array $queryParameters = [], ?string $hash = null, ?string $scheme = null, ?string $host = null): string`.
- For redirects, always use `Status::FOUND` (302) for standard GET redirects or `Status::SEE_OTHER` (303) after POST submissions, along with `Header::LOCATION`.

---

### 3.2. Request Parsing & DTO Hydration (`yiisoft/hydrator`, `yiisoft/input-http`, `yiisoft/validator`)

In Yii3, request bodies and query parameters should be converted into strongly-typed DTOs rather than reading raw associative arrays across the action.

> [!IMPORTANT]
> To parse JSON request bodies (`application/json`), the PSR-15 middleware `Yiisoft\Request\Body\RequestBodyParser` from package `yiisoft/request-body-parser` MUST be added to the middleware pipeline before the action. Otherwise, `$request->getParsedBody()` returns `null` for JSON payloads.

#### Approach A: Manual Hydration via `HydratorInterface` + `ValidatorInterface`
Suitable for any DTO class without framework dependencies.

**The DTO Class:**
```php
declare(strict_types=1);

namespace App\Application\Post;

use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\Rule\StringValue;

final class CreatePostDto
{
    #[Required]
    #[StringValue]
    #[Length(min: 3, max: 255)]
    public string $title = '';

    #[Required]
    #[StringValue]
    #[Length(min: 10)]
    public string $content = '';
}
```

**The Action Handler:**
```php
declare(strict_types=1);

namespace App\Presentation\Action\Post;

use App\Application\Post\CreatePostDto;
use App\Application\Post\CreatePostUseCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Hydrator\HydratorInterface;
use Yiisoft\Validator\ValidatorInterface;

final readonly class CreatePostAction
{
    public function __construct(
        private HydratorInterface $hydrator,
        private ValidatorInterface $validator,
        private DataResponseFactoryInterface $responseFactory,
        private CreatePostUseCase $useCase,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        // Body parsed by RequestBodyParser middleware
        $data = (array) ($request->getParsedBody() ?? []);

        /** @var CreatePostDto $dto */
        $dto = $this->hydrator->create(CreatePostDto::class, $data);

        $result = $this->validator->validate($dto);
        if (!$result->isValid()) {
            return $this->responseFactory->createResponse(
                [
                    'status' => 'error',
                    'errors' => $result->getErrorMessagesIndexedByPath(),
                ],
                Status::UNPROCESSABLE_ENTITY // HTTP 422
            );
        }

        $post = $this->useCase->execute($dto);

        return $this->responseFactory->createResponse(
            ['data' => $post->toArray()],
            Status::CREATED // HTTP 201
        );
    }
}
```

#### Approach B: Attribute-Based Input DTO via `yiisoft/input-http`
When `yiisoft/input-http` is configured with `RequestInputParametersResolver`, DTOs extending `AbstractInput` are automatically resolved and injected directly into `__invoke()`:

**The Input DTO:**
```php
declare(strict_types=1);

namespace App\Presentation\Action\Post\Input;

use Yiisoft\Input\Http\AbstractInput;
use Yiisoft\Input\Http\Attribute\Data\FromBody;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\Rule\StringValue;

#[FromBody]
final class CreatePostInput extends AbstractInput
{
    #[Required]
    #[StringValue]
    #[Length(min: 3, max: 255)]
    public string $title = '';

    #[Required]
    #[StringValue]
    #[Length(min: 10)]
    public string $content = '';
}
```

**The Action Handler:**
```php
declare(strict_types=1);

namespace App\Presentation\Action\Post;

use App\Application\Post\CreatePostUseCase;
use App\Presentation\Action\Post\Input\CreatePostInput;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;

final readonly class CreatePostAutoAction
{
    public function __construct(
        private DataResponseFactoryInterface $responseFactory,
        private CreatePostUseCase $useCase,
    ) {}

    // Input DTO is automatically resolved, populated from request body, and validated
    public function __invoke(CreatePostInput $input): ResponseInterface
    {
        $validationResult = $input->getValidationResult();
        if (!$validationResult->isValid()) {
            return $this->responseFactory->createResponse(
                [
                    'status' => 'error',
                    'errors' => $validationResult->getErrorMessagesIndexedByPath(),
                ],
                Status::UNPROCESSABLE_ENTITY
            );
        }

        $post = $this->useCase->execute($input->title, $input->content);

        return $this->responseFactory->createResponse(
            ['data' => $post->toArray()],
            Status::CREATED
        );
    }
}
```

> [!NOTE]
> In `RequestInputParametersResolver`, if `$throwInputValidationException = true`, invalid inputs automatically throw `Yiisoft\Input\Http\InputValidationException` instead of entering the action. If `false` (default), the action checks `$input->getValidationResult()`.

---

### 3.3. Validation Handling (`yiisoft/validator`)

Yii3 uses `yiisoft/validator` with PHP attributes (`#[Required]`, `#[Email]`, `#[Length]`, `#[Regex]`, `#[Integer]`) and returns a `Yiisoft\Validator\Result` object.

Excerpt from within an action handler (full skeleton shown in §3.2 Approach A):

```php
use Yiisoft\Validator\Result;
use Yiisoft\Validator\ValidatorInterface;
use Yiisoft\Http\Status;

$result = $this->validator->validate($dto);
if (!$result->isValid()) {
    return $this->responseFactory->createResponse([
        'status' => 'error',
        'message' => 'Validation failed.',
        // ['title' => ['Title is required.']]
        'errors' => $result->getErrorMessagesIndexedByPath(),
    ], Status::UNPROCESSABLE_ENTITY); // HTTP 422
}
```

**Key `Result` Inspection Methods:**
- `$result->isValid(): bool` — `true` if there are no validation errors.
- `$result->getErrorMessagesIndexedByPath(string $separator = '.', ?string $escape = '.'): array` — returns `['title' => ['Title is required.']]` (multi-dimensional).
- `$result->getFirstErrorMessagesIndexedByPath(string $separator = '.', ?string $escape = '.'): array` — returns `['title' => 'Title is required.']` (single error per path).
- `$result->getErrorMessages(): array` — returns a flat list of all error message strings.
- `$result->isPropertyValid(string $property): bool` — checks if a specific property passed validation.

> [!TIP]
> For the full built-in rules catalog, custom rule authoring, `skipOnEmpty`/`when` modifiers, message translation,
> FormModel + `FormHydrator`, and `yiisoft/input-http` wiring details, see [Validation & Forms Guide](validation-and-forms.md).

---

### 3.4. REST API Responses (`yiisoft/data-response`, `yiisoft/http`)

Use `Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface` to generate structured API responses. Content negotiation middleware (`Yiisoft\DataResponse\Middleware\ContentNegotiatorDataResponseMiddleware`) automatically formats the data stream to JSON or XML according to the client's `Accept` header:

```php
declare(strict_types=1);

use Yiisoft\DataResponse\Formatter\JsonFormatter;
use Yiisoft\DataResponse\Formatter\XmlFormatter;
use Yiisoft\DataResponse\Middleware\ContentNegotiatorDataResponseMiddleware;

$contentNegotiator = new ContentNegotiatorDataResponseMiddleware([
    'application/json' => new JsonFormatter(),
    'application/xml' => new XmlFormatter(),
]);
```

> [!IMPORTANT]
> 1. Always inject `Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface`. The old interface `Yiisoft\DataResponse\DataResponseFactoryInterface` is deprecated.
> 2. The old middleware `Yiisoft\DataResponse\Middleware\ContentNegotiator` is also deprecated. Use `ContentNegotiatorDataResponseMiddleware` with a formatter map (`Yiisoft\DataResponse\Formatter\JsonFormatter`, `Yiisoft\DataResponse\Formatter\XmlFormatter`).

```php
declare(strict_types=1);

namespace App\Presentation\Action\Api\User;

use App\Application\User\GetUserUseCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;

final readonly class GetUserApiAction
{
    public function __construct(
        private CurrentRoute $currentRoute,
        private GetUserUseCase $useCase,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $id = $this->currentRoute->getArgument('id');
        if ($id === null) {
            return $this->responseFactory->createResponse(
                ['error' => 'Missing required parameter "id".'],
                Status::BAD_REQUEST
            );
        }

        $user = $this->useCase->findById((int) $id);
        if ($user === null) {
            return $this->responseFactory->createResponse(
                ['error' => 'User not found.'],
                Status::NOT_FOUND
            );
        }

        return $this->responseFactory->createResponse([
            'data' => [
                'id' => $user->getId(),
                'email' => $user->getEmail(),
                'name' => $user->getName(),
            ],
        ], Status::OK);
    }
}
```

**Exact Named Arguments for `createResponse`:**
```php
public function createResponse(
    mixed $data = null,
    int $code = Status::OK,
    string $reasonPhrase = '',
): ResponseInterface;
```

**Common HTTP Status Codes:**
- `Status::OK` (200): standard success.
- `Status::CREATED` (201): resource created (e.g. after POST).
- `Status::NO_CONTENT` (204): operation succeeded with no payload (e.g. after DELETE).
- `Status::BAD_REQUEST` (400): malformed request.
- `Status::UNAUTHORIZED` (401): unauthenticated user.
- `Status::FORBIDDEN` (403): authenticated user lacks permissions.
- `Status::NOT_FOUND` (404): resource does not exist.
- `Status::UNPROCESSABLE_ENTITY` (422): input validation errors.

---

### 3.5. HTML Web Views & Form Models (`yiisoft/yii-view-renderer`, `yiisoft/form-model`)

For full-page web applications, inject `Yiisoft\Yii\View\Renderer\ViewRenderer` (or `WebViewRenderer`) for template rendering and `FormHydrator` for populating and validating HTML forms.

**The Form Model:**
```php
declare(strict_types=1);

namespace App\Presentation\Action\Web\Contact\Form;

use Yiisoft\FormModel\FormModel;
use Yiisoft\Validator\Rule\Email;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;

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

**The Action Handler:**
```php
declare(strict_types=1);

namespace App\Presentation\Action\Web\Contact;

use App\Application\Contact\ContactDto;
use App\Application\Contact\ContactUseCase;
use App\Presentation\Action\Web\Contact\Form\ContactForm;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\FormModel\FormHydrator;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;
use Yiisoft\Router\UrlGeneratorInterface;
use Yiisoft\Session\Flash\FlashInterface;
use Yiisoft\Yii\View\Renderer\ViewRenderer;

final readonly class ContactAction
{
    public function __construct(
        private ViewRenderer $viewRenderer,
        private FormHydrator $formHydrator,
        private ContactUseCase $useCase,
        private FlashInterface $flash,
        private UrlGeneratorInterface $urlGenerator,
        private ResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $form = new ContactForm();

        // Automatically detects POST, populates from parsed body, and validates
        if ($this->formHydrator->populateFromPostAndValidate($form, $request)) {
            $this->useCase->execute(new ContactDto(
                name: $form->name,
                email: $form->email,
                message: $form->message,
            ));
            
            $this->flash->add('success', 'Your message has been sent successfully.');
            
            $redirectUrl = $this->urlGenerator->generate('contact/index');
            return $this->responseFactory
                ->createResponse(Status::FOUND)
                ->withHeader(Header::LOCATION, $redirectUrl);
        }

        // Render HTML view with the form model
        // If POST failed validation, return 422 Unprocessable Entity
        $response = $this->viewRenderer->render('contact/index', [
            'form' => $form,
        ]);

        if ($request->getMethod() === 'POST' && !$form->isValid()) {
            return $response->withStatus(Status::UNPROCESSABLE_ENTITY);
        }

        return $response;
    }
}
```

> [!WARNING]
> **The Form Name / Scope Trap:**
> By default, `FormModel::getFormName()` returns the short class name (e.g. `'ContactForm'`). When `populateFromPostAndValidate()` is called, it looks for nested data: `$request->getParsedBody()['ContactForm']`.
> If your HTML inputs are flat (e.g. `<input name="email">` instead of `<input name="ContactForm[email]">`), hydration will fail unless you pass `scope: ''` or override `getFormName(): string { return ''; }` in your form model.

> [!TIP]
> For layout configurations, page lifecycle, asset bundles, custom widgets, and DataView components (`GridView`, `ListView`, `DetailView`), see [Views, Layouts & Widgets Guide](views-and-widgets.md).

**ViewRenderer Capabilities:**
- Full layout rendering: `$this->viewRenderer->render('contact/index', ['form' => $form])`.
- Partial rendering (no layout, for HTMX/AJAX/modals): `$this->viewRenderer->renderPartial('partial/_modal', [...])`.
- Custom layout per action: `$this->viewRenderer->withLayout('layout/blank')->render('login', [...])`.
- Setting HTTP status: Call `->withStatus(Status::BAD_REQUEST)` on the **returned `ResponseInterface`**, NOT on `$viewRenderer` itself (which does not have a `withStatus()` method).

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

**Real Method Signatures of `DownloadResponseFactory`:**
```php
// 1. Sends an existing file from disk
public function sendFile(
    string $filePath,
    ?string $attachmentName = null,
    string $disposition = ContentDispositionHeader::ATTACHMENT,
    ?string $mimeType = null,
    ?ServerRequestInterface $request = null,
): ResponseInterface;

// 2. Streams an in-memory PSR-7 StreamInterface to the client
// Note: $mimeType is NON-nullable here (unlike sendFile()/sendContentAsFile()).
public function sendStreamAsFile(
    StreamInterface $stream,
    string $attachmentName,
    string $disposition = ContentDispositionHeader::ATTACHMENT,
    string $mimeType = 'application/octet-stream',
    ?ServerRequestInterface $request = null,
): ResponseInterface;

// 3. Sends raw string content as a downloadable file
public function sendContentAsFile(
    string $content,
    string $attachmentName,
    string $disposition = ContentDispositionHeader::ATTACHMENT,
    ?string $mimeType = null,
    ?ServerRequestInterface $request = null,
): ResponseInterface;

// 4. Delegates sending to Nginx/Apache/FrankenPHP acceleration headers
public function xSendFile(
    string $filePath,
    ?string $attachmentName = null,
    string $disposition = ContentDispositionHeader::ATTACHMENT,
    ?string $mimeType = null,
    string $xHeader = 'X-Sendfile', // or 'X-Accel-Redirect' for Nginx
): ResponseInterface;
```

> [!CAUTION]
> 1. Do NOT call `sendStream()` or `send()`. The actual method names are `sendStreamAsFile()` and `sendContentAsFile()`. Calling nonexistent shorthand names will cause fatal PHP errors.
> 2. Mind the `$mimeType` asymmetry: in `sendFile()` and `sendContentAsFile()` it is `?string $mimeType = null` (guessed from content), but in `sendStreamAsFile()` it is a required-to-exist non-nullable `string $mimeType = 'application/octet-stream'`. Passing `mimeType: null` as a named argument to `sendStreamAsFile()` throws `TypeError: ... must be of type string, null given`.

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
- `Sort::only(['col1', 'col2'])` ignores unconfigured field names submitted by clients, protecting against SQL injection and sorting crashes.
- When calling `$paginator->read()`, if the requested page exceeds `$paginator->getTotalPages()`, it throws `Yiisoft\Data\Paginator\PageNotFoundException`. Always catch this exception to return HTTP 404 or redirect.

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

**Authentication in Login Actions:**
- **Web Session Login:**
  ```php
  $this->currentUser->login($identity);
  ```
- **Web Session Logout:**
  ```php
  $this->currentUser->logout();
  ```
- **API JWT Token Creation (`yiisoft/auth-jwt`):**
  ```php
  use Yiisoft\Auth\Jwt\TokenFactoryInterface;

  // Exact signature: create(array $payload, string $format, ?int $signatureIndex = null): string
  $token = $this->tokenFactory->create(['sub' => $identity->getId()], 'jws_compact');
  ```
  > [!CAUTION]
  > The method on `TokenFactoryInterface` is `create()`, NOT `createToken()`. The `$format` argument must match a serializer name registered in `JWSSerializerManager`. The package's default config registers `Jose\Component\Signature\Serializer\CompactSerializer`, whose format name is `'jws_compact'` — if you add other serializers (e.g. flattened/general JSON), pass their names instead.

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

**Reading Cookies from Request:**
```php
$cookies = $request->getCookieParams();
$theme = $cookies['preferred_theme'] ?? 'light';
```

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
> Notice the named argument is `parameters:`, NOT `params:`. Passing `params:` in PHP 8 will result in an `Unknown named parameter $params` Fatal Error.

---

### 3.11. Action Resolution & Dispatching (`yiisoft/middleware-dispatcher`)

Yii3 executes actions through `Yiisoft\Middleware\Dispatcher\MiddlewareFactory`. Any route handler can be registered as:

1. **Invokable Action Class (Best Practice):**
   ```php
   Route::get('/users/{id:\d+}')->action(ViewUserAction::class)
   ```
   Requires method `__invoke(ServerRequestInterface $request, ...): ResponseInterface`.
2. **PSR-15 RequestHandlerInterface:**
   ```php
   Route::get('/health')->action(HealthCheckHandler::class)
   ```
   Requires method `handle(ServerRequestInterface $request): ResponseInterface`.
3. **Controller Method Pair:**
   ```php
   Route::get('/users')->action([UserController::class, 'index'])
   ```
   Requires method `index(ServerRequestInterface $request, ...): ResponseInterface`.

**Parameter Resolution Rules:**
- Parameters of action methods are resolved using `CompositeParametersResolver`:
  - `ServerRequestInterface` and `RequestHandlerInterface` are passed automatically.
  - DTO parameters extending `AbstractInput` are resolved by `RequestInputParametersResolver` (`yiisoft/input-http`).
  - Route arguments can be injected into action parameters via `#[RouteArgument('id')]` (`Yiisoft\Router\HydratorAttribute\RouteArgument`, shipped in `yiisoft/router`).
  - All other typed dependencies are resolved from the DI container via `Yiisoft\Injector\Injector`.
- **Return Type Requirement:** The return value MUST implement `Psr\Http\Message\ResponseInterface`. Returning `null`, `void`, `array`, `string`, or `int` immediately throws `InvalidMiddlewareDefinitionException`.

> [!TIP]
> **Error Handling & Exception Propagation:**
> If an action or domain service throws an unhandled exception, it is caught by `ErrorCatcher` and converted into an appropriate HTTP response or RFC 7807 problem details. For exception responders and error templates, see [Error Handling Guide](error-handling.md).

---

## 4. Anti-Pattern Matrix: Actions & Presentation Layer

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| ❌ `class SiteController extends Controller` with `actionIndex()` | Yii3 does not have a monolithic `yii\web\Controller` base class. Actions are standalone handlers or PSR-15 middlewares. | ✅ Create a single-action invokable class: `final readonly class IndexAction { public function __invoke(ServerRequestInterface $request): ResponseInterface { ... } }`. |
| ❌ Returning `array`, `string`, or `void` from Action | Yii3's `MiddlewareFactory` strictly expects `Psr\Http\Message\ResponseInterface`. Returning anything else throws `InvalidMiddlewareDefinitionException`. | ✅ Always return a PSR-7 `ResponseInterface` via `DataResponseFactoryInterface`, `ViewRenderer`, `WebViewRenderer`, or `ResponseFactoryInterface`. |
| ❌ Injecting deprecated `Yiisoft\DataResponse\DataResponseFactoryInterface` or registering `Yiisoft\DataResponse\Middleware\ContentNegotiator` | Both are marked `@deprecated` in `yiisoft/data-response` and will be removed in a future release. | ✅ Inject `Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface` and use `Yiisoft\DataResponse\Middleware\ContentNegotiatorDataResponseMiddleware` with `JsonFormatter` / `XmlFormatter`. |
| ❌ Calling `Yii::$app->...` anywhere in the Action | Yii3 completely eliminated global static service locators and `Yii::$app`. | ✅ Inject all dependencies explicitly via the Action constructor (`CurrentRoute`, `DataResponseFactoryInterface`, etc.). |
| ❌ Reading route arguments via `$_GET['id']` or `$request->getAttribute('id')` | Route parameters in `yiisoft/router` are stored in `CurrentRoute`, not in `$_GET` or default request attributes. | ✅ Inject `Yiisoft\Router\CurrentRoute` and call `$currentRoute->getArgument('id')`. |
| ❌ Instantiating cookies with nonexistent `Cookie::create(...)` | `Cookie::create()` does not exist in `yiisoft/cookies` and causes `Error: Call to undefined method`. | ✅ Instantiate via constructor: `new Cookie('name', 'val')` and mutate with `withMaxAge()`, `withPath()`, etc. |
| ❌ Importing nonexistent enum `use Yiisoft\Cookies\SameSite;` | There is no `SameSite` class or enum in `yiisoft/cookies`. | ✅ Use class constants on `Cookie`: `Cookie::SAME_SITE_LAX`, `Cookie::SAME_SITE_STRICT`, `Cookie::SAME_SITE_NONE`. |
| ❌ Calling nonexistent `TokenFactoryInterface::createToken(...)` | In `yiisoft/auth-jwt`, the method is `create(array $payload, string $format, ?int $signatureIndex = null)`. Calling `createToken()` causes a Fatal Error. | ✅ Call `$tokenFactory->create(['sub' => $id], 'jws_compact')`. |
| ❌ Calling nonexistent `DownloadResponseFactory::sendStream(...)` or `send(...)` | `DownloadResponseFactory` only exposes `sendStreamAsFile()`, `sendContentAsFile()`, `sendFile()`, and `xSendFile()`. Shorthand names cause Fatal Errors. | ✅ Call `$downloadFactory->sendStreamAsFile($stream, $name)` or `$downloadFactory->sendContentAsFile($content, $name)`. |
| ❌ Calling `$this->viewRenderer->withStatus(404)->render(...)` | `ViewRenderer` and `WebViewRenderer` do not have a `withStatus()` method. | ✅ Call `withStatus()` on the returned response: `$this->viewRenderer->render(...)->withStatus(Status::NOT_FOUND)`. |
| ❌ Forgetting `$form->getFormName()` scope in `populateFromPostAndValidate()` | By default, `FormModel::getFormName()` expects nested body data: `$body['FormName']['field']`. Flat form inputs will silently fail hydration. | ✅ If using flat form inputs, override `getFormName(): string { return ''; }` in the form model or pass `scope: ''` to `populateFromPostAndValidate()`. |
| ❌ Direct SQL or Active Record / Cycle queries inside Actions | Violates Presentation Layer separation of concerns and bypasses business logic encapsulation. | ✅ Delegate all data fetching and persistence to Application Use Cases or Repository interfaces. |
| ❌ Managing database transactions (`$db->transaction()`) inside Actions | Presentation layer should never control database transaction lifecycles. | ✅ Manage transaction boundaries inside Application Use Cases or Unit of Work services. |
| ❌ Assuming JSON request bodies are parsed without `RequestBodyParser` middleware | PSR-7 does not decode JSON payloads natively; `$request->getParsedBody()` returns `null` without parsing middleware. | ✅ Add `Yiisoft\Request\Body\RequestBodyParser` middleware to the route group or application pipeline. |
| ❌ Passing named parameter `params:` to `TranslatorInterface::translate()` | The parameter name in `TranslatorInterface::translate()` is `$parameters`. In PHP 8, passing `params:` throws an `Unknown named parameter` Fatal Error. | ✅ Call `$this->translator->translate($id, parameters: ['user' => $name])`. |
| ❌ Ignoring `PageNotFoundException` when reading `OffsetPaginator` | When `$page > $paginator->getTotalPages()`, `$paginator->read()` throws `PageNotFoundException`. An unhandled exception yields a 500 server error. | ✅ Wrap `$paginator->read()` in `try ... catch (PageNotFoundException)` and return HTTP 404 or redirect. |
| ❌ Using Yii2 `$model->load($_POST)` or `$model->validate()` on DTOs | Yii3 DTOs do not extend `yii\base\Model` and do not have `load()` or `validate()` methods. | ✅ Use `HydratorInterface::create(Dto::class, (array) $request->getParsedBody())` and `ValidatorInterface::validate($dto)`. |

---

## 5. Related Topic Guides

- [Routing Guide](routes.md) — Route definition, FastRoute patterns, and URL generation.
- [PSR-15 Middlewares Guide](middlewares.md) — Middleware pipeline ordering, authentication guards, and request manipulation.
- [Views, Layouts & Widgets Guide](views-and-widgets.md) — HTML view templates, layouts, asset bundles, and DataView widgets.
- [Error Handling Guide](error-handling.md) — Exception catching, status code responders, and RFC 7807 error formats.
- [Validation & Forms Guide](validation-and-forms.md) — Input validation, FormModel hydration, and DTO rules.

