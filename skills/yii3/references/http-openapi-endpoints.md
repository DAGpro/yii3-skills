# Yii3 OpenAPI: Documenting Endpoints with Attributes

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Part of the [OpenAPI & Swagger Guide](http-openapi-swagger.md) split — anti-patterns and related guides live there.

## 5. Documenting API Endpoints with PHP 8 Attributes

Yii 3 leverages PHP 8 attributes from `zircote/swagger-php` (`OpenApi\Attributes`, aliased as `OA`).

### 5.1. Global API Information & Tags

Define application-wide OpenAPI metadata on a central, uninstantiated class (e.g., `App\Presentation\Action\Api\ApiDoc`):

```php
declare(strict_types=1);

namespace App\Presentation\Action\Api;

use OpenApi\Attributes as OA;

#[OA\Info(
    version: '1.0.0',
    title: 'Acme E-Commerce REST API',
    description: 'High-performance headless API built with Yii 3 Framework.',
    termsOfService: 'https://example.com/terms',
    contact: new OA\Contact(
        name: 'API Platform Engineering',
        url: 'https://example.com/support',
        email: 'api-support@example.com'
    ),
    license: new OA\License(
        name: 'MIT License',
        url: 'https://opensource.org/licenses/MIT'
    )
)]
#[OA\Server(
    url: '/',
    description: 'Current Environment Relative Gateway'
)]
#[OA\Tag(
    name: 'Products',
    description: 'Product catalog query and mutation operations'
)]
#[OA\Tag(
    name: 'Orders',
    description: 'Customer order placement and lifecycle management'
)]
final class ApiDoc
{
}
```

> [!TIP]
> Always set `#[OA\Server(url: '/')]`. Using relative server URLs ensures that "Try it out" works seamlessly in local development (`localhost:8080`), staging environments, and production domains without editing configuration files.

### 5.2. Security Schemes (Bearer JWT, API Key, OAuth 2.0)

Declare all security schemes supported by your application in a dedicated class (`SecurityDoc` below — or reuse the central `ApiDoc` if you prefer a single metadata class):

```php
declare(strict_types=1);

namespace App\Presentation\Action\Api;

use OpenApi\Attributes as OA;

// 1. HTTP Bearer Token (JWT)
#[OA\SecurityScheme(
    securityScheme: 'bearerAuth',
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Enter your JWT access token as: Bearer <token>'
)]

// 2. API Key via Request Header
#[OA\SecurityScheme(
    securityScheme: 'apiKeyHeader',
    type: 'apiKey',
    in: 'header',
    name: 'X-API-KEY',
    description: 'Client application secret key'
)]

// 3. API Key via Query Parameter
#[OA\SecurityScheme(
    securityScheme: 'apiKeyQuery',
    type: 'apiKey',
    in: 'query',
    name: 'api_key',
    description: 'API key for third-party webhook callbacks'
)]

// 4. OAuth 2.0 Authorization Code & Client Credentials Flows
#[OA\SecurityScheme(
    securityScheme: 'oauth2',
    type: 'oauth2',
    description: 'OAuth 2.0 authentication provider',
    flows: new OA\Flows(
        authorizationCode: new OA\Flow(
            authorizationUrl: 'https://auth.example.com/oauth/authorize',
            tokenUrl: 'https://auth.example.com/oauth/token',
            refreshUrl: 'https://auth.example.com/oauth/token/refresh',
            scopes: [
                'read:products' => 'Read catalog products',
                'write:products' => 'Manage product records',
                'orders:create' => 'Place new customer orders',
            ]
        ),
        clientCredentials: new OA\Flow(
            tokenUrl: 'https://auth.example.com/oauth/token',
            scopes: [
                'service:sync' => 'Machine-to-machine catalog synchronization',
            ]
        )
    )
)]
final class SecurityDoc
{
}
```

### 5.3. Endpoint Actions & CRUD Operations (Get, Post, Put, Patch, Delete)

Yii 3 strongly recommends single-action invokable controllers (`__invoke`).

#### 5.3.1. GET Endpoint (Retrieving Single Resource)

```php
declare(strict_types=1);

namespace App\Presentation\Action\Product;

use App\Application\Product\ProductService;
use OpenApi\Attributes as OA;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;

use function sprintf;

final readonly class GetProductAction
{
    public function __construct(
        private ProductService $productService,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    #[OA\Get(
        path: '/api/v1/products/{id}',
        summary: 'Fetch product details',
        description: 'Returns complete product entity with pricing and stock metadata.',
        tags: ['Products'],
        security: [['bearerAuth' => []]],
        parameters: [
            new OA\Parameter(
                name: 'id',
                in: 'path',
                required: true,
                description: 'Unique product UUID identifier',
                schema: new OA\Schema(type: 'string', format: 'uuid', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
            ),
        ],
        responses: [
            new OA\Response(
                response: Status::OK,
                description: 'Product retrieved successfully',
                content: new OA\JsonContent(ref: '#/components/schemas/ProductResponse')
            ),
            new OA\Response(
                response: Status::NOT_FOUND,
                description: 'Product with specified ID not found',
                content: new OA\JsonContent(ref: '#/components/schemas/ProblemDetails')
            ),
            new OA\Response(
                response: Status::UNAUTHORIZED,
                description: 'Authentication token missing or invalid'
            ),
        ]
    )]
    public function __invoke(CurrentRoute $currentRoute): ResponseInterface
    {
        $id = $currentRoute->getArgument('id');
        if ($id === null) {
            return $this->responseFactory->createResponse(
                ['title' => 'Missing product ID in route', 'status' => Status::BAD_REQUEST],
                Status::BAD_REQUEST
            );
        }

        $product = $this->productService->findById($id);
        if ($product === null) {
            return $this->responseFactory->createResponse(
                [
                    'type' => 'https://example.com/errors/not-found',
                    'title' => 'Product Not Found',
                    'status' => Status::NOT_FOUND,
                    'detail' => sprintf('Product with ID "%s" does not exist.', $id),
                ],
                Status::NOT_FOUND
            );
        }

        return $this->responseFactory->createResponse([
            'id' => $product->getId(),
            'sku' => $product->getSku(),
            'title' => $product->getTitle(),
            'price' => $product->getPrice(),
            'stock' => $product->getStock(),
        ]);
    }
}
```

#### 5.3.2. DELETE Endpoint

```php
declare(strict_types=1);

namespace App\Presentation\Action\Product;

use App\Application\Product\ProductService;
use OpenApi\Attributes as OA;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;

final readonly class DeleteProductAction
{
    public function __construct(
        private ProductService $productService,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    #[OA\Delete(
        path: '/api/v1/products/{id}',
        summary: 'Delete product',
        tags: ['Products'],
        security: [['bearerAuth' => []]],
        parameters: [
            new OA\Parameter(
                name: 'id',
                in: 'path',
                required: true,
                schema: new OA\Schema(type: 'string', format: 'uuid')
            ),
        ],
        responses: [
            new OA\Response(
                response: Status::NO_CONTENT,
                description: 'Product deleted successfully'
            ),
            new OA\Response(
                response: Status::NOT_FOUND,
                description: 'Product not found',
                content: new OA\JsonContent(ref: '#/components/schemas/ProblemDetails')
            ),
        ]
    )]
    public function __invoke(CurrentRoute $currentRoute): ResponseInterface
    {
        $id = (string) $currentRoute->getArgument('id');
        $this->productService->delete($id);

        return $this->responseFactory->createResponse(null, Status::NO_CONTENT);
    }
}
```

### 5.4. Route Parameters: Injecting `CurrentRoute` vs Broken PSR-7 Attributes

> [!CAUTION]
> **Fatal Routing Trap:** route match arguments (e.g. `{id}`, `{slug}`) are stored in `Yiisoft\Router\CurrentRoute`, not in PSR-7 request attributes — `$request->getAttribute('id')` always evaluates to `null`. See the [Routing Guide, §4.3 Trap 1](http-routes-definition.md#43-critical-traps--ingress-caveats).

Always inject `Yiisoft\Router\CurrentRoute` into action methods or constructor:

```php
// CORRECT (Yii 3 idiomatic):
public function __invoke(CurrentRoute $currentRoute): ResponseInterface
{
    $id = $currentRoute->getArgument('id');
    // ...
}

// ALSO CORRECT (via Hydrator parameter attribute):
use Yiisoft\Router\HydratorAttribute\RouteArgument;

public function __invoke(#[RouteArgument('id')] string $id): ResponseInterface
{
    // ...
}

// WRONG (will be null):
public function __invoke(ServerRequestInterface $request): ResponseInterface
{
    $id = $request->getAttribute('id'); // NULL!
}
```

### 5.5. Query & Header Parameters

```php
declare(strict_types=1);

namespace App\Presentation\Action\Product;

use OpenApi\Attributes as OA;

#[OA\Get(
    path: '/api/v1/products',
    summary: 'Search & filter product catalog',
    tags: ['Products'],
    parameters: [
        new OA\Parameter(
            name: 'query',
            in: 'query',
            required: false,
            description: 'Full-text search keywords',
            schema: new OA\Schema(type: 'string')
        ),
        new OA\Parameter(
            name: 'category_id',
            in: 'query',
            required: false,
            description: 'Filter by category UUID',
            schema: new OA\Schema(type: 'string', format: 'uuid')
        ),
        new OA\Parameter(
            name: 'page',
            in: 'query',
            required: false,
            description: '1-based pagination page number',
            schema: new OA\Schema(type: 'integer', default: 1, minimum: 1)
        ),
        new OA\Parameter(
            name: 'limit',
            in: 'query',
            required: false,
            description: 'Records per page',
            schema: new OA\Schema(type: 'integer', default: 20, minimum: 1, maximum: 100)
        ),
        new OA\Parameter(
            name: 'X-Client-Locale',
            in: 'header',
            required: false,
            description: 'Client preferred language (ISO 639-1)',
            schema: new OA\Schema(type: 'string', default: 'en')
        ),
    ],
    responses: [
        new OA\Response(
            response: 200,
            description: 'Paginated product list',
            content: new OA\JsonContent(
                properties: [
                    new OA\Property(
                        property: 'items',
                        type: 'array',
                        items: new OA\Items(ref: '#/components/schemas/ProductResponse')
                    ),
                    new OA\Property(
                        property: 'pagination',
                        properties: [
                            new OA\Property(property: 'page', type: 'integer', example: 1),
                            new OA\Property(property: 'limit', type: 'integer', example: 20),
                            new OA\Property(property: 'total', type: 'integer', example: 145),
                        ]
                    ),
                ]
            )
        ),
    ]
)]
final readonly class ListProductsAction
{
    // ...
}
```

### 5.6. DTO Schemas & Dual Attributes (OpenAPI + `yiisoft/validator`)

Yii 3 applications achieve clean single-source-of-truth DTOs by pairing `OpenApi\Attributes` with `Yiisoft\Validator\Rule\*` attributes on constructor-promoted properties.

#### 5.6.1. BackedEnum for Type Safety

```php
declare(strict_types=1);

namespace App\Domain\Product;

enum ProductStatus: string
{
    case DRAFT = 'draft';
    case ACTIVE = 'active';
    case ARCHIVED = 'archived';
}
```

#### 5.6.2. Dual-Attributed DTO

```php
declare(strict_types=1);

namespace App\Application\Product\DTO;

use App\Domain\Product\ProductStatus;
use OpenApi\Attributes as OA;
use Yiisoft\Validator\Rule\InEnum;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Number;
use Yiisoft\Validator\Rule\Regex;
use Yiisoft\Validator\Rule\Required;

#[OA\Schema(
    schema: 'CreateProductRequest',
    description: 'Payload for registering a new catalog product',
    required: ['sku', 'title', 'price']
)]
final readonly class CreateProductRequest
{
    public function __construct(
        #[OA\Property(
            description: 'Unique Stock Keeping Unit (alphanumeric with dashes)',
            type: 'string',
            pattern: '^[A-Z0-9\-]{3,30}$',
            example: 'ELEC-LAPTOP-01'
        )]
        #[Required]
        #[Regex('/^[A-Z0-9\-]{3,30}$/', message: 'SKU must be uppercase alphanumeric with dashes.')]
        public string $sku,

        #[OA\Property(
            description: 'Product display title',
            type: 'string',
            minLength: 3,
            maxLength: 255,
            example: 'Mechanical Gaming Keyboard'
        )]
        #[Required]
        #[Length(min: 3, max: 255)]
        public string $title,

        #[OA\Property(
            description: 'Price in decimal format',
            type: 'number',
            format: 'float',
            minimum: 0.01,
            example: 129.99
        )]
        #[Required]
        #[Number(min: 0.01)]
        public float $price,

        #[OA\Property(
            description: 'Initial stock quantity',
            type: 'integer',
            minimum: 0,
            default: 0,
            example: 50
        )]
        #[Number(min: 0)]
        public int $stock = 0,

        #[OA\Property(
            description: 'Lifecycle status',
            type: 'string',
            enum: ProductStatus::class,
            default: 'draft',
            example: 'active'
        )]
        #[InEnum(ProductStatus::class)]
        public string $status = 'draft',
    ) {}
}
```

#### 5.6.3. Mutating Action with Hydration and Validation

```php
declare(strict_types=1);

namespace App\Presentation\Action\Product;

use App\Application\Product\DTO\CreateProductRequest;
use App\Application\Product\ProductService;
use OpenApi\Attributes as OA;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Hydrator\HydratorInterface;
use Yiisoft\Validator\ValidatorInterface;

final readonly class CreateProductAction
{
    public function __construct(
        private HydratorInterface $hydrator,
        private ValidatorInterface $validator,
        private ProductService $productService,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    #[OA\Post(
        path: '/api/v1/products',
        summary: 'Create a new product',
        tags: ['Products'],
        security: [['bearerAuth' => []]],
        requestBody: new OA\RequestBody(
            required: true,
            description: 'Product initialization payload',
            content: new OA\JsonContent(ref: '#/components/schemas/CreateProductRequest')
        ),
        responses: [
            new OA\Response(
                response: Status::CREATED,
                description: 'Product successfully created',
                content: new OA\JsonContent(ref: '#/components/schemas/ProductResponse')
            ),
            new OA\Response(
                response: Status::UNPROCESSABLE_ENTITY,
                description: 'Validation failed',
                content: new OA\JsonContent(ref: '#/components/schemas/ProblemDetails')
            ),
        ]
    )]
    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        // Hydrate + validate + 422 problem+json — canonical recipe: Actions & Controllers Guide §3.2.
        // On failure, the payload's `invalid-params` is a path-indexed map
        // (`Result::getErrorMessagesIndexedByPath()` — see the ValidationProblemDetailsResponder, §3.2, item 5).
        $dto = /* hydrated + validated CreateProductRequest per the recipe above */;

        $product = $this->productService->createFromDTO($dto);

        return $this->responseFactory->createResponse([
            'id' => $product->getId(),
            'sku' => $product->getSku(),
            'title' => $product->getTitle(),
            'price' => $product->getPrice(),
            'stock' => $product->getStock(),
        ], Status::CREATED);
    }
}
```

> [!TIP]
> **Request Parsing & Validation Reference:**
> For the complete reference on the manual hydrate → validate → 422 loop and the RFC 7807
> `ValidationProblemDetailsResponder` (which serializes `invalid-params` as a path-indexed map via
> `getErrorMessagesIndexedByPath()`), see the [Actions & Controllers Guide, §3.2 — Request Parsing & DTO Hydration](http-actions-core.md#32-request-parsing--dto-hydration-yiisofthydrator-yiisoftinput-http-yiisoftvalidator) and [§3.2, item 5 — RFC 7807 Problem Details Error Responder](http-actions-core.md#5-rfc-7807-problem-details-error-responder).

### 5.7. File Uploads (`multipart/form-data`)

Documenting binary file uploads requires `#[OA\MediaType(mediaType: 'multipart/form-data')]` with `type: 'string', format: 'binary'`.

```php
declare(strict_types=1);

namespace App\Presentation\Action\Product;

use OpenApi\Attributes as OA;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Message\UploadedFileInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Validator\Rule\File;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\ValidatorInterface;

final readonly class UploadProductImageAction
{
    public function __construct(
        private ValidatorInterface $validator,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    #[OA\Post(
        path: '/api/v1/products/{id}/image',
        summary: 'Upload product hero image',
        tags: ['Products'],
        security: [['bearerAuth' => []]],
        parameters: [
            new OA\Parameter(
                name: 'id',
                in: 'path',
                required: true,
                schema: new OA\Schema(type: 'string', format: 'uuid')
            ),
        ],
        requestBody: new OA\RequestBody(
            required: true,
            description: 'Multipart form containing product image',
            content: new OA\MediaType(
                mediaType: 'multipart/form-data',
                schema: new OA\Schema(
                    required: ['image'],
                    properties: [
                        new OA\Property(
                            property: 'image',
                            description: 'Binary JPEG or PNG image file (max 5MB)',
                            type: 'string',
                            format: 'binary'
                        ),
                        new OA\Property(
                            property: 'caption',
                            description: 'Optional image caption',
                            type: 'string',
                            example: 'Front view with RGB backlight'
                        ),
                    ]
                )
            )
        ),
        responses: [
            new OA\Response(
                response: Status::OK,
                description: 'Image uploaded successfully',
                content: new OA\JsonContent(
                    properties: [
                        new OA\Property(property: 'imageUrl', type: 'string', format: 'uri', example: 'https://cdn.example.com/products/hero.jpg'),
                    ]
                )
            ),
            new OA\Response(
                response: Status::UNPROCESSABLE_ENTITY,
                description: 'Uploaded file is invalid or too large',
                content: new OA\JsonContent(ref: '#/components/schemas/ProblemDetails')
            ),
        ]
    )]
    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $uploadedFiles = $request->getUploadedFiles();
        /** @var UploadedFileInterface|null $file */
        $file = $uploadedFiles['image'] ?? null;

        $validationResult = $this->validator->validate($file, [
            new Required(message: 'Image file is required.'),
            new File(
                maxSize: 5 * 1024 * 1024, // 5 MB in bytes
                extensions: ['jpg', 'jpeg', 'png', 'webp'],
                mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
            ),
        ]);

        if (!$validationResult->isValid()) {
            return $this->responseFactory->createResponse([
                'type' => 'https://example.com/errors/invalid-upload',
                'title' => 'File Upload Error',
                'status' => Status::UNPROCESSABLE_ENTITY,
                'detail' => $validationResult->getErrorMessages()[0] ?? 'Uploaded file is invalid.',
            ], Status::UNPROCESSABLE_ENTITY);
        }

        // Storage step — persist with `$file->moveTo($targetPath)`. Building the safe destination
        // (random server-side name, sanitized client extension, alias resolved via the injected
        // `Aliases` service — `$aliases->get(...)`, an instance method, not a static call,
        // directory creation) is the filesystem slice owned by the File Handling Guide — see the
        // bridge below.
        $targetPath = /* destination per File Handling Guide §4/§5: alias-resolved path + random server-side name */;
        $file->moveTo($targetPath);

        return $this->responseFactory->createResponse([
            'imageUrl' => $targetPath,
        ]);
    }
}
```

> [!TIP]
> **File Handling Reference:**
> For the complete reference on the filesystem-level storage step (random file names via
> `bin2hex(random_bytes(16))`, path-traversal sanitization with `basename()`/`pathinfo()`,
> `FileHelper::ensureDirectory()`, and alias resolution before `moveTo()`), see the
> [File Handling Guide, §4 — File Uploads (PSR-7 + Validator)](http-file-handling.md#4-file-uploads-psr-7--validator) and [§5 — Placement & Wiring](http-file-handling.md#5-placement--wiring).

### 5.8. Standardized Error Models: RFC 7807 / RFC 9457 Problem Details

Document standard HTTP error responses adhering to RFC 7807 / RFC 9457:

```php
declare(strict_types=1);

namespace App\Presentation\DTO;

use OpenApi\Attributes as OA;

#[OA\Schema(
    schema: 'ProblemDetails',
    description: 'RFC 7807 / RFC 9457 Standard Problem Details error payload',
    required: ['type', 'title', 'status'],
    properties: [
        new OA\Property(
            property: 'type',
            description: 'URI reference identifying problem category',
            type: 'string',
            format: 'uri',
            example: 'https://example.com/errors/validation-failed'
        ),
        new OA\Property(
            property: 'title',
            description: 'Short human-readable summary of problem',
            type: 'string',
            example: 'Validation Failed'
        ),
        new OA\Property(
            property: 'status',
            description: 'HTTP status code',
            type: 'integer',
            example: 422
        ),
        new OA\Property(
            property: 'detail',
            description: 'Detailed human-readable explanation',
            type: 'string',
            nullable: true,
            example: 'The request payload contains 2 invalid fields.'
        ),
        new OA\Property(
            property: 'instance',
            description: 'URI reference identifying the specific occurrence',
            type: 'string',
            format: 'uri',
            nullable: true,
            example: '/api/v1/products'
        ),
        new OA\Property(
            property: 'invalid-params',
            description: 'Validation failures as a list of {name, reason} objects — a custom API-specific shape, NOT the framework default (canonical shape: path-indexed map, see the note below).',
            type: 'array',
            items: new OA\Items(
                properties: [
                    new OA\Property(property: 'name', type: 'string', example: 'sku'),
                    new OA\Property(property: 'reason', type: 'string', example: 'SKU must be uppercase alphanumeric with dashes.'),
                ]
            )
        ),
    ]
)]
final readonly class ProblemDetails
{
}
```

> [!IMPORTANT]
> **Canonical `invalid-params` shape:** the canonical `ValidationProblemDetailsResponder`
> serializes `invalid-params` as a **path-indexed map of message lists** —
> `Result::getErrorMessagesIndexedByPath()`, e.g. `{"sku": ["SKU must be uppercase alphanumeric with dashes."]}` —
> not as a list of `{name, reason}` objects. The object-list items modeled above are a **custom-shape
> variant**, not the framework default; only commit to them deliberately across the whole API.
> For the canonical responder, see the [Actions & Controllers Guide, §3.2, item 5 — RFC 7807 Problem Details Error Responder](http-actions-core.md#5-rfc-7807-problem-details-error-responder).

---

## 6. Multi-Version API Documentation (`/swagger/v1` & `/swagger/v2`)

When an application supports multiple API versions (e.g. `/api/v1` and `/api/v2`), maintain isolated documentation trees using the immutable modifiers `SwaggerJson::withPaths(string ...$paths)` and `SwaggerUi::withJsonUrl(string $jsonUrl)`.

```php
declare(strict_types=1);

use Yiisoft\DataResponse\Middleware\JsonDataResponseMiddleware;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route\Get;
use Yiisoft\Yii\Swagger\Action\SwaggerJson;
use Yiisoft\Yii\Swagger\Action\SwaggerUi;

return [
    (new Group('/swagger'))->routes(
        // Default Redirect to v1
        (new Get(''))
            ->action(static fn (SwaggerUi $ui): SwaggerUi => $ui->withJsonUrl('/swagger/v1/json'))
            ->name('swagger.root'),

        // API Version 1
        (new Group('/v1'))->routes(
            (new Get(''))
                ->action(static fn (SwaggerUi $ui): SwaggerUi => $ui->withJsonUrl('/swagger/v1/json'))
                ->name('swagger.v1.ui'),
            (new Get('/json'))
                ->middleware(JsonDataResponseMiddleware::class)
                ->action(static fn (SwaggerJson $json): SwaggerJson => $json->withPaths(
                    '@src/Presentation/Action/Api/ApiDoc.php',
                    '@src/Presentation/Action/V1',
                    '@src/Application/DTO/V1',
                ))
                ->name('swagger.v1.json'),
        ),

        // API Version 2
        (new Group('/v2'))->routes(
            (new Get(''))
                ->action(static fn (SwaggerUi $ui): SwaggerUi => $ui->withJsonUrl('/swagger/v2/json'))
                ->name('swagger.v2.ui'),
            (new Get('/json'))
                ->middleware(JsonDataResponseMiddleware::class)
                ->action(static fn (SwaggerJson $json): SwaggerJson => $json->withPaths(
                    '@src/Presentation/Action/Api/ApiDoc.php',
                    '@src/Presentation/Action/V2',
                    '@src/Application/DTO/V2',
                ))
                ->name('swagger.v2.json'),
        ),
    ),
];
```

---
