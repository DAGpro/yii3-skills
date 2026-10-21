# Yii3 Actions & Controllers Package Guide

> Practical recommendations and idiomatic patterns for using official `yiisoft/*` packages inside Yii3 Actions and Controllers.
>
> **Source of Truth:** Verified against official `yiisoft/*` sources in `references/` and `PACKAGES.md`.
> Actions belong to the **Presentation Layer**: they orchestrate HTTP input/output and delegate all business logic, persistence, and heavy calculations to Application Use Cases and Domain models.

---

## 1. Core Action Principles in Yii3

1. **Strict PSR-7 Contract:**
   - Every Action handler MUST accept `Psr\Http\Message\ServerRequestInterface` (or auto-resolved parameters via `yiisoft/input-http`).
   - Every Action handler MUST return `Psr\Http\Message\ResponseInterface` (never `array`, `string`, or `void`).
2. **Single-Action Invokable Classes (Recommended):**
   - Prefer single-action classes implementing `__invoke(ServerRequestInterface $request): ResponseInterface` or PSR-15 `RequestHandlerInterface`.
   - Multi-action controllers are allowed if existing project architecture dictates it, but individual action methods must still accept request and return `ResponseInterface`.
3. **Thin Action Principle (Strict Boundary):**
   - **Allowed in Actions:**
     - Extract request parameters, route arguments, headers, cookies, and body.
     - Hydrate and validate input DTOs / Form Models.
     - Check current user state and permissions (`CurrentUser`).
     - Call an Application Use Case / Service.
     - Build and return PSR-7 responses (`DataResponseFactoryInterface`, `ViewRenderer`, `DownloadResponseFactory`, redirects).
   - **Strictly Forbidden in Actions (Anti-Patterns):**
     - ❌ Direct SQL queries, Query Builder, or ActiveRecord / Cycle persistence calls (delegate to Repositories / Use Cases).
     - ❌ Database transaction management (`$db->transaction()` belongs in Use Cases).
     - ❌ Password hashing, token generation, or business cryptography.
     - ❌ Sending emails or pushing queue jobs directly (delegate to Use Cases or PSR-14 Event Listeners).

---

## 2. Action Concern → Package Quick Matrix

| Action Concern | Official Package | Injected Service / Interface | Return / Result Type |
|---|---|---|---|
| **API Response (JSON/XML)** | `yiisoft/data-response` | `Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface` | `ResponseInterface` |
| **HTML Rendering** | `yiisoft/yii-view-renderer` | `Yiisoft\Yii\View\Renderer\ViewRenderer` | `ResponseInterface` |
| **HTTP Statuses & Headers** | `yiisoft/http` | `Yiisoft\Http\Status`, `Yiisoft\Http\Header`, `Yiisoft\Http\Method` | Constants |
| **Route Parameters** | `yiisoft/router` | `Yiisoft\Router\CurrentRoute` | `$currentRoute->getArgument('id')` |
| **Redirects & URLs** | `yiisoft/router` | `Yiisoft\Router\UrlGeneratorInterface` | `$urlGenerator->generate('route', $params)` |
| **Input DTO Hydration** | `yiisoft/hydrator` | `Yiisoft\Hydrator\HydratorInterface` | `$hydrator->create(Dto::class, $data)` |
| **Input DTO Auto-Mapping** | `yiisoft/input-http` | `Yiisoft\Input\Http\AbstractInput`, `#[FromBody]`, `#[FromQuery]` | Typed DTO parameter |
| **Input Validation** | `yiisoft/validator` | `Yiisoft\Validator\ValidatorInterface` | `Yiisoft\Validator\Result` |
| **HTML Form Hydration** | `yiisoft/form-model` | `Yiisoft\FormModel\FormHydrator` | `$formHydrator->populateFromPostAndValidate(...)` |
| **HTML Form Widgets** | `yiisoft/form`, `yiisoft/html` | `Yiisoft\Form\Widget\Form`, `Yiisoft\Html\Html` | HTML widgets in views |
| **File Downloads** | `yiisoft/response-download` | `Yiisoft\ResponseDownload\DownloadResponseFactory` | `ResponseInterface` |
| **Pagination & Sorting** | `yiisoft/data` | `Yiisoft\Data\Paginator\OffsetPaginator`, `Yiisoft\Data\Reader\Sort` | Iterable data + metadata |
| **Current User & Auth** | `yiisoft/user` | `Yiisoft\User\CurrentUser` | `$currentUser->getId()`, `$currentUser->can(...)` |
| **API JWT Token Creation** | `yiisoft/auth-jwt` | `Yiisoft\Auth\Jwt\TokenFactoryInterface` | `$tokenFactory->createToken($payload)` |
| **Flash Messages** | `yiisoft/session` | `Yiisoft\Session\Flash\FlashInterface` | `$flash->add('success', $msg)` |
| **Session Data** | `yiisoft/session` | `Yiisoft\Session\SessionInterface` | `$session->get($key)`, `$session->set($key, $val)` |
| **Cookies Management** | `yiisoft/cookies` | `Yiisoft\Cookies\Cookie`, `Yiisoft\Cookies\CookieCollection` | `$cookie->addToResponse($response)` |
| **Translations (i18n)** | `yiisoft/translator` | `Yiisoft\Translator\TranslatorInterface` | `$translator->translate($id, $params, $category)` |
| **CSRF Token** | `yiisoft/csrf` | `Yiisoft\Csrf\CsrfTokenInterface` | `$csrfToken->getValue()` |

---

## 3. Detailed Package Usage in Actions

### 3.1. Route Parameters & Redirects (`yiisoft/router`, `yiisoft/http`)

Use `CurrentRoute` to retrieve path parameters defined in `config/**/routes.php`. Use `UrlGeneratorInterface` to generate absolute or relative URLs for redirects.

```php
declare(strict_types=1);

namespace App\Presentation\Action\User;

use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;
use Yiisoft\Router\UrlGeneratorInterface;

final class ViewUserAction
{
    public function __construct(
        private CurrentRoute $currentRoute,
        private UrlGeneratorInterface $urlGenerator,
        private ResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        // 1. Read route argument (e.g. /users/{id})
        $id = $this->currentRoute->getArgument('id');
        if ($id === null) {
            // Redirect using UrlGeneratorInterface and Status::FOUND
            $fallbackUrl = $this->urlGenerator->generate('user/index');
            return $this->responseFactory
                ->createResponse(Status::FOUND)
                ->withHeader(Header::LOCATION, $fallbackUrl);
        }

        // ... process and return response
    }
}
```

**Key Recommendations:**
- Never read route parameters from `$_GET` or `$request->getAttribute('id')` directly; always use `CurrentRoute::getArgument('name')`.
- For redirects, always use `Yiisoft\Http\Status::FOUND` (302) or `Status::SEE_OTHER` (303) and `Yiisoft\Http\Header::LOCATION`.

---

### 3.2. Request Parsing & DTO Hydration (`yiisoft/input-http`, `yiisoft/hydrator`)

In Yii3, request bodies and query parameters should be converted into strongly-typed DTOs rather than reading associative arrays across the action.

#### Approach A: Manual Hydration via `HydratorInterface`
Suitable for any DTO class:

```php
declare(strict_types=1);

namespace App\Presentation\Action\Post;

use App\Application\Post\CreatePostDto;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Hydrator\HydratorInterface;
use Yiisoft\Validator\ValidatorInterface;

final class CreatePostAction
{
    public function __construct(
        private HydratorInterface $hydrator,
        private ValidatorInterface $validator,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        // Request body parsed by yiisoft/request-body-parser middleware
        $data = (array) ($request->getParsedBody() ?? []);
        
        /** @var CreatePostDto $dto */
        $dto = $this->hydrator->create(CreatePostDto::class, $data);

        $result = $this->validator->validate($dto);
        if (!$result->isValid()) {
            // handle validation error
        }

        // pass $dto to application use case
    }
}
```

#### Approach B: Attribute-Based Input DTO via `yiisoft/input-http`
When `yiisoft/input-http` is installed and registered in middleware parameters resolver, DTOs extending `AbstractInput` can be injected directly into the action method:

```php
declare(strict_types=1);

namespace App\Presentation\Action\Post;

use App\Presentation\Action\Post\Input\CreatePostInput;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;

final class CreatePostAction
{
    public function __construct(
        private DataResponseFactoryInterface $responseFactory,
        private CreatePostUseCase $useCase,
    ) {}

    // Input DTO is automatically resolved, populated from request body, and validated
    public function __invoke(CreatePostInput $input): ResponseInterface
    {
        $validationResult = $input->getValidationResult();
        if ($validationResult !== null && !$validationResult->isValid()) {
            return $this->responseFactory->createResponse([
                'errors' => $validationResult->getErrorMessagesIndexedByPath(),
            ], Status::UNPROCESSABLE_ENTITY);
        }

        $post = $this->useCase->execute($input->toCommand());

        return $this->responseFactory->createResponse(['data' => $post], Status::CREATED);
    }
}
```

**The corresponding Input DTO:**
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
    public string $content = '';
}
```

---

### 3.3. Validation Handling (`yiisoft/validator`)

Yii3 uses `yiisoft/validator` with PHP attributes (`#[Required]`, `#[Email]`, `#[Length]`, etc.) or custom validation rules.

```php
use Yiisoft\Validator\ValidatorInterface;
use Yiisoft\Http\Status;

// In Action:
$result = $this->validator->validate($dto);
if (!$result->isValid()) {
    return $this->responseFactory->createResponse([
        'status' => 'error',
        'message' => 'Validation failed.',
        // getErrorMessagesIndexedByPath() gives ['title' => ['Title is required.']]
        'errors' => $result->getErrorMessagesIndexedByPath(),
    ], Status::UNPROCESSABLE_ENTITY); // HTTP 422
}
```

**Key Recommendations:**
- Always return HTTP `Status::UNPROCESSABLE_ENTITY` (422) for input validation failures in REST APIs.
- Use `getErrorMessagesIndexedByPath()` for clean client-side field binding.

---

### 3.4. REST API Responses (`yiisoft/data-response`)

Use `DataResponseFactoryInterface` to generate structured API responses. Content negotiation middleware will automatically serialize the payload to JSON or XML based on the `Accept` header.

```php
declare(strict_types=1);

namespace App\Presentation\Action\Api\User;

use App\Application\User\GetUserUseCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;

final class GetUserApiAction
{
    public function __construct(
        private CurrentRoute $currentRoute,
        private GetUserUseCase $useCase,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $id = $this->currentRoute->getArgument('id');
        $user = $this->useCase->findById($id);

        if ($user === null) {
            return $this->responseFactory->createResponse(
                ['error' => 'User not found.'],
                Status::NOT_FOUND
            );
        }

        // 200 OK with payload
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

**Common Status Codes:**
- `Status::OK` (200): standard success.
- `Status::CREATED` (201): resource created (e.g. after POST).
- `Status::NO_CONTENT` (204): operation succeeded with no payload (e.g. after DELETE).
- `Status::BAD_REQUEST` (400): malformed request.
- `Status::UNAUTHORIZED` (401): unauthenticated user.
- `Status::FORBIDDEN` (403): authenticated user lacks permissions.
- `Status::NOT_FOUND` (404): resource does not exist.
- `Status::UNPROCESSABLE_ENTITY` (422): validation error.

---

### 3.5. HTML Web Views & Form Models (`yiisoft/yii-view-renderer`, `yiisoft/form-model`)

For full-page web applications, use `ViewRenderer` for rendering PHP templates and `FormHydrator` for populating and validating HTML forms.

```php
declare(strict_types=1);

namespace App\Presentation\Action\Web\Contact;

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

final class ContactAction
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
            $this->useCase->execute($form->toDto());
            
            $this->flash->add('success', 'Your message has been sent successfully.');
            
            $redirectUrl = $this->urlGenerator->generate('contact/index');
            return $this->responseFactory
                ->createResponse(Status::FOUND)
                ->withHeader(Header::LOCATION, $redirectUrl);
        }

        // Render HTML view with the form model
        return $this->viewRenderer->render('contact/index', [
            'form' => $form,
        ]);
    }
}
```

**Key Recommendations:**
- Use `$this->formHydrator->populateFromPostAndValidate($form, $request)` instead of writing manual `if ($request->getMethod() === 'POST')` and manual validation chains.
- For HTMX or modal dialogues, render partial fragments with `$this->viewRenderer->renderPartial('partial/view', [...])`.
- Custom layout per action: `$this->viewRenderer->withLayout('layout/blank')->render('login', [...])`.

---

### 3.6. File Downloads & Binary Responses (`yiisoft/response-download`)

To stream files, send attachments, or use web server `X-Sendfile` acceleration, inject `DownloadResponseFactory`:

```php
declare(strict_types=1);

namespace App\Presentation\Action\Export;

use App\Application\Export\GenerateReportUseCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Http\ContentDispositionHeader;
use Yiisoft\ResponseDownload\DownloadResponseFactory;

final class DownloadReportAction
{
    public function __construct(
        private GenerateReportUseCase $useCase,
        private DownloadResponseFactory $downloadFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $filePath = $this->useCase->getReportPath();

        // Generates PSR-7 response with appropriate Content-Type, Content-Disposition, and Content-Length
        return $this->downloadFactory->sendFile(
            $filePath,
            'monthly-report.pdf',
            ContentDispositionHeader::ATTACHMENT,
            'application/pdf'
        );
    }
}
```

**Download Options:**
- `sendFile(string $filePath, ...)`: sends existing file from disk.
- `sendStream(StreamInterface $stream, ...)`: streams in-memory stream to client.
- `send(string $content, ...)`: sends raw string content as file download.
- `xSendFile(string $filePath, ...)`: delegates large file sending to Nginx/Apache `X-Accel-Redirect` / `X-Sendfile`.

---

### 3.7. Data Listing, Pagination & Sorting (`yiisoft/data`)

Use `OffsetPaginator` and `Sort` from `yiisoft/data` to structure list endpoints with pagination.

```php
declare(strict_types=1);

namespace App\Presentation\Action\Api\Post;

use App\Domain\Post\PostRepositoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Data\Paginator\OffsetPaginator;
use Yiisoft\Data\Reader\Sort;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;

final class ListPostsAction
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
            ->withOrderString($params['sort'] ?? '-createdAt');

        $dataReader = $this->postRepository->findAll()->withSort($sort);
        
        $paginator = (new OffsetPaginator($dataReader))
            ->withPageSize($pageSize)
            ->withCurrentPage($page);

        return $this->responseFactory->createResponse([
            'data' => iterator_to_array($paginator->read()),
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

---

### 3.8. Authentication & Authorization (`yiisoft/user`, `yiisoft/auth-jwt`)

Actions use `CurrentUser` to inspect the caller's identity and evaluate RBAC permissions.

```php
declare(strict_types=1);

namespace App\Presentation\Action\Post;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\User\CurrentUser;

final class DeletePostAction
{
    public function __construct(
        private CurrentUser $currentUser,
        private DataResponseFactoryInterface $responseFactory,
        private DeletePostUseCase $useCase,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        // 1. Authentication check
        if ($this->currentUser->isGuest()) {
            return $this->responseFactory->createResponse(
                ['error' => 'Authentication required.'],
                Status::UNAUTHORIZED
            );
        }

        // 2. Permission check (RBAC)
        if (!$this->currentUser->can('delete_post')) {
            return $this->responseFactory->createResponse(
                ['error' => 'Forbidden: insufficient permissions.'],
                Status::FORBIDDEN
            );
        }

        $userId = $this->currentUser->getId();
        // ... perform deletion via use case
        
        return $this->responseFactory->createResponse(null, Status::NO_CONTENT);
    }
}
```

**In Login Actions:**
- Web Session: `$this->currentUser->login($identity);`
- API JWT: `$token = $this->tokenFactory->createToken(['sub' => $identity->getId()]);`

---

### 3.9. Cookies & Sessions (`yiisoft/cookies`, `yiisoft/session`)

Manage cookies by adding them to the PSR-7 response using `Cookie::create()` and `CookieCollection`:

```php
use DateInterval;
use Yiisoft\Cookies\Cookie;
use Yiisoft\Cookies\SameSite;

// In Action: Setting a cookie on response
$cookie = Cookie::create('preferred_theme', 'dark')
    ->withMaxAge(new DateInterval('P30D'))
    ->withPath('/')
    ->withHttpOnly(true)
    ->withSecure(true)
    ->withSameSite(SameSite::LAX);

$response = $this->responseFactory->createResponse(['status' => 'ok']);
return $cookie->addToResponse($response);
```

**Reading Cookies:**
```php
$cookieParams = $request->getCookieParams();
$theme = $cookieParams['preferred_theme'] ?? 'light';
```

---

### 3.10. Internationalization & Localization (`yiisoft/translator`)

Inject `TranslatorInterface` to localize user messages, flash notifications, or API error labels:

```php
declare(strict_types=1);

namespace App\Presentation\Action\Web\Profile;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Session\Flash\FlashInterface;
use Yiisoft\Translator\TranslatorInterface;

final class UpdateProfileAction
{
    public function __construct(
        private TranslatorInterface $translator,
        private FlashInterface $flash,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        // ...
        $message = $this->translator->translate(
            'profile.updated_successfully',
            ['name' => $user->getName()],
            'user'
        );
        $this->flash->add('success', $message);
        
        // ...
    }
}
```

---

## 4. Anti-Patterns & Yii2 Migration Matrix for Actions

| Forbidden Yii2 Anti-Pattern | Required Yii3 Idiom |
|---|---|
| ❌ `class SiteController extends Controller` with `actionIndex()` | ✅ Single-Action invokable classes: `__invoke(ServerRequestInterface $request): ResponseInterface`. |
| ❌ `$this->render('index', [...])` inside controller | ✅ Inject `ViewRenderer` and call `$this->viewRenderer->render('index', [...])`. |
| ❌ `Yii::$app->request->post('title')` | ✅ Map to DTO via `HydratorInterface` or read `$request->getParsedBody()`. |
| ❌ `Yii::$app->request->get('id')` | ✅ Inject `CurrentRoute` and call `$currentRoute->getArgument('id')`. |
| ❌ `Yii::$app->user->identity` / `Yii::$app->user->id` | ✅ Inject `Yiisoft\User\CurrentUser` and call `$currentUser->getIdentity()` / `$currentUser->getId()`. |
| ❌ `Yii::$app->session->setFlash('success', '...')` | ✅ Inject `Yiisoft\Session\Flash\FlashInterface` and call `$flash->add('success', '...')`. |
| ❌ `return $this->asJson(['status' => 'ok'])` | ✅ Inject `DataResponseFactoryInterface` and return `$responseFactory->createResponse(['status' => 'ok'])`. |
| ❌ Direct SQL or Active Record queries inside Action | ✅ Delegate to Application Use Case or Query Repository interface. |
| ❌ `$db->transaction(...)` inside Action | ✅ Transaction boundaries belong strictly inside Use Cases. |
| ❌ Returning `array`, `string`, or `void` from Action | ✅ Actions MUST strictly return `Psr\Http\Message\ResponseInterface`. |
| ❌ Guessing method signatures | ✅ Always inspect `references/<package>/src/` or `vendor/yiisoft/<package>/src/` before calling methods. |
