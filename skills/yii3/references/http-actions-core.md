# Yii3 Actions: Core Principles, Input & Responses

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Part of the [Actions & Controllers Guide](http-actions-and-controllers.md) split — the anti-pattern matrix and related guides live there.

## 1. Core Action Principles in Yii3

1. **Strict PSR-7 Contract:**
   - Every Action handler MUST accept `Psr\Http\Message\ServerRequestInterface` (or parameters auto-resolved by `yiisoft/input-http` / `yiisoft/middleware-dispatcher`).
   - Every Action handler MUST return `Psr\Http\Message\ResponseInterface` (never `array`, `string`, `int`, or `void`). Returning anything other than a `ResponseInterface` causes `Yiisoft\Middleware\Dispatcher\InvalidMiddlewareDefinitionException`.
2. **Single-Action Invokable Classes (Recommended):**
   - Prefer single-action classes implementing `__invoke(ServerRequestInterface $request): ResponseInterface` or PSR-15 `Psr\Http\Server\RequestHandlerInterface::handle(ServerRequestInterface $request): ResponseInterface`.
   - Multi-action controllers (e.g. `[UserController::class, 'view']`) are supported via `MiddlewareFactory`, but every action method must strictly return `ResponseInterface`.
   - Actions are mapped to HTTP endpoints via route definitions. For routing syntax, FastRoute placeholders, and route groups, see [Routing Guide](http-routes.md).
   - Actions are the terminal handlers of the PSR-15 pipeline. For middleware ordering, body parsers, and guard filters, see [PSR-15 Middlewares Guide](http-middlewares.md).
3. **Thin Action Principle (Strict Boundary):**
   - **Allowed in Actions:**
     - Extract request parameters, route arguments (`CurrentRoute`), query params, headers, cookies, and parsed body.
     - Hydrate and validate input DTOs (`HydratorInterface`, `ValidatorInterface`, `yiisoft/input-http`) or Form Models (`FormHydrator`).
     - Check current user state and permissions (`Yiisoft\User\CurrentUser`).
     - Invoke an Application Use Case, Command Handler, or Service.
     - Build and return PSR-7 responses (`DataResponseFactoryInterface`, `WebViewRenderer`, `DownloadResponseFactory`, HTTP redirects). The legacy `ViewRenderer` is `@deprecated`.
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
| **HTML Rendering** | `yiisoft/yii-view-renderer` | `Yiisoft\Yii\View\Renderer\WebViewRenderer` (primary; `ViewRenderer` is `@deprecated`) | `Psr\Http\Message\ResponseInterface` |
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
| **API JWT Token Creation** | `yiisoft/auth-jwt` | `Yiisoft\Auth\Jwt\TokenFactoryInterface` | `$tokenFactory->create($payload, CompactSerializer::NAME)` |
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

> [!NOTE]
> FastRoute pattern syntax, route groups, reverse URL generation, and long-running worker resets are owned by the [Routing Guide](http-routes.md).

---

### 3.2. Request Parsing & DTO Hydration (`yiisoft/hydrator`, `yiisoft/input-http`, `yiisoft/validator`)

In Yii3, request bodies and query parameters should be converted into strongly-typed DTOs rather than reading raw associative arrays across the action.

> [!IMPORTANT]
> To parse JSON request bodies (`application/json`), the PSR-15 middleware `Yiisoft\Request\Body\RequestBodyParser` from package `yiisoft/request-body-parser` MUST be added to the middleware pipeline before the action. Otherwise, `$request->getParsedBody()` returns `null` for JSON payloads. Note that the package ships only a JSON parser out of the box; parsing other body formats requires a custom `ParserInterface` implementation. Canonical description and pipeline placement: [PSR-15 Middlewares Guide](http-middlewares.md).

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

##### 1. Class Data Attributes: `#[FromBody]` & `#[FromQuery]`

`yiisoft/input-http` resolves action method parameters implementing `Yiisoft\Input\Http\RequestInputInterface` (or extending `Yiisoft\Input\Http\AbstractInput`).

Class-level data attributes (`Yiisoft\Input\Http\Attribute\Data\*`):
- `#[FromBody(name: null, map: [], strict: false)]` &rarr; reads from `$request->getParsedBody()`.
- `#[FromQuery(name: null, map: [], strict: false)]` &rarr; reads from `$request->getQueryParams()`.

Setting `$name = 'user'` extracts a nested key from the body or query parameters.

> [!WARNING]
> There are strictly **NO** `#[FromRoute]`, `#[FromHeader]`, or `#[FromCookie]` class data attributes in `yiisoft/input-http`. Route parameters are retrieved via `Yiisoft\Router\CurrentRoute` or `#[Request]`. Headers are retrieved via PSR-7 `$request->getHeaderLine()`.

##### 2. Parameter Attributes: `#[Body]`, `#[Query]`, `#[Request]`, `#[UploadedFiles]`

Parameter attributes (`Yiisoft\Input\Http\Attribute\Parameter\*`) pull specific request segments into DTO properties or directly into action parameters:
- `#[Body('title')]` &rarr; extracts a single property from the request body.
- `#[Query('page')]` &rarr; extracts a query parameter.
- `#[UploadedFiles('avatar')]` &rarr; extracts uploaded files from `$request->getUploadedFiles()`. The mapping is type-hint based on the raw upload-map value:
    - A `UploadedFileInterface`-typed property or parameter receives **one element**; an `array`-typed one receives the **whole list** at that path.
    - Dot-paths address nested upload maps: `#[UploadedFiles('gallery.images')]`.
    - A missing path is **fail-soft** — the property keeps its declared default value, nothing is thrown.
- **`#[Request('attributeName')]`:** Reads from **PSR-7 request attributes** (`$request->getAttributes()`), such as router match parameters or middleware context. **It does NOT read HTTP headers.**

**Canonical Upload Action (`File` rule + 422 errors):** the action validates the upload, returns HTTP 422 with errors indexed by path, and dispatches to a use case. Moving the file to permanent storage (directories, alias resolution, naming conventions) is owned by the [File Handling Guide, §4](http-file-handling.md#4-file-uploads-psr-7--validator):

```php
declare(strict_types=1);

namespace App\Presentation\Action\Document;

use App\Application\Document\StoreDocumentUseCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Message\UploadedFileInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Validator\Rule\File;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\ValidatorInterface;

final readonly class UploadDocumentAction
{
    public function __construct(
        private ValidatorInterface $validator,
        private StoreDocumentUseCase $useCase,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $uploaded = $request->getUploadedFiles()['document'] ?? null;

        // String-keyed rules require the same key in the data set:
        $result = $this->validator->validate(
            ['document' => $uploaded],
            ['document' => [new Required(), new File(extensions: ['pdf', 'docx'], maxSize: 10 * 1024 * 1024)]],
        );
        if (!$result->isValid()) {
            return $this->responseFactory->createResponse(
                ['status' => 'error', 'errors' => $result->getErrorMessagesIndexedByPath()],
                Status::UNPROCESSABLE_ENTITY // HTTP 422
            );
        }

        /** @var UploadedFileInterface $uploaded */
        // The File rule already reports non-OK upload error codes as validation errors.
        // Persist with $uploaded->moveTo() — directory creation, alias resolution, and naming
        // conventions: see the File Handling Guide, §4.
        $this->useCase->handle($uploaded);

        return $this->responseFactory->createResponse(['status' => 'ok'], Status::CREATED);
    }
}
```

##### 3. Direct Action Parameter Resolution (`HydratorAttributeParametersResolver`)

`yiisoft/input-http` provides two parameter resolvers implementing `Yiisoft\Middleware\Dispatcher\ParametersResolverInterface`:
1. **`RequestInputParametersResolver`:** Resolves full DTOs extending `AbstractInput` or implementing `RequestInputInterface`.
2. **`HydratorAttributeParametersResolver`:** Resolves **individual action method parameters** directly decorated with hydrator attributes, without requiring a separate DTO class!

```php
declare(strict_types=1);

namespace App\Presentation\Api\Post;

use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Input\Http\Attribute\Parameter\Query;

final readonly class ListPostsAction
{
    public function __construct(
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    // HydratorAttributeParametersResolver injects $page, $limit, and $search directly:
    public function __invoke(
        #[Query('page')] int $page = 1,
        #[Query('limit')] int $limit = 20,
        #[Query('search')] ?string $search = null,
    ): ResponseInterface {
        $payload = [
            'page' => $page,
            'limit' => $limit,
            'search' => $search,
        ];

        return $this->responseFactory->createResponse($payload);
    }
}
```

##### 4. Exception-Driven Flow (`throwInputValidationException`)

In `config/common/params.php`:
```php
declare(strict_types=1);

return [
    'yiisoft/input-http' => [
        'requestInputParametersResolver' => [
            'throwInputValidationException' => true, // Default is false
        ],
    ],
];
```
When set to `true`, invalid inputs throw `Yiisoft\Input\Http\InputValidationException` before the action executes, which can be handled centrally by an exception middleware.

##### 5. RFC 7807 Problem Details Error Responder

> [!CAUTION]
> **`InputValidationException` API Invariant:**
> `Yiisoft\Input\Http\InputValidationException` does **NOT** provide a `getResponse()` method. It encapsulates strictly `private Result $result`, accessible via `getResult(): Result`. Creating an RFC 7807 response is the explicit responsibility of your responder or exception handling middleware.

```php
declare(strict_types=1);

namespace App\Presentation\Api\Shared;

use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;
use Yiisoft\Input\Http\InputValidationException;
use Yiisoft\Validator\Result;

final readonly class ValidationProblemDetailsResponder
{
    public function __construct(
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function respond(Result|InputValidationException $validation): ResponseInterface
    {
        $result = $validation instanceof InputValidationException
            ? $validation->getResult()
            : $validation;

        $payload = [
            'type' => 'https://tools.ietf.org/html/rfc4918#section-11.2',
            'title' => 'Validation Failed',
            'status' => Status::UNPROCESSABLE_ENTITY,
            'detail' => 'One or more parameters failed validation.',
            'invalid-params' => $result->getErrorMessagesIndexedByPath(),
        ];

        return $this->responseFactory
            ->createResponse($payload, Status::UNPROCESSABLE_ENTITY)
            ->withHeader(Header::CONTENT_TYPE, 'application/problem+json');
    }
}
```

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
> FormModel + `FormHydrator`, and `yiisoft/input-http` wiring details, see [Validation & Forms Guide](http-validation-and-forms.md).

> [!CAUTION]
> **Optional fields are not skipped by default.** The per-rule `skipOnEmpty` option defaults to `null`, which the validator normalizes to "never skip". An empty value in an optional property therefore still fails `Length`, `Integer`, `Regex`, and similar rules. Pass `skipOnEmpty: true` on the rule (or configure the validator with `defaultSkipOnEmpty`) to make fields truly optional.

---

### 3.4. REST API Responses (`yiisoft/data-response`, `yiisoft/http`)

Use `Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface` to generate structured API responses. Content negotiation middleware (`Yiisoft\DataResponse\Middleware\ContentNegotiatorDataResponseMiddleware`) automatically formats the data stream to JSON or XML according to the client's `Accept` header:

> [!IMPORTANT]
> Always inject `Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface`. The legacy interface `Yiisoft\DataResponse\DataResponseFactoryInterface` and the old middleware `Yiisoft\DataResponse\Middleware\ContentNegotiator` are deprecated.

> [!NOTE]
> Pipeline content negotiation via `ContentNegotiatorDataResponseMiddleware` (with `JsonFormatter` / `XmlFormatter`), formatter maps, and `Accept` header fallback handlers are owned by the [PSR-15 Middlewares Guide](http-middlewares.md), section 5.

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
