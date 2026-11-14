# Yii3 OpenAPI: DTO Schemas, File Uploads, Error Models & Multi-Version Docs

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Complex OpenAPI schemas in Yii3: DTO schemas with dual validation attributes (`yiisoft/validator`), file uploads (`multipart/form-data`), standardized RFC 7807 / 9457 Problem Details error models, and multi-version API documentation (`/swagger/v1` & `/swagger/v2`).

## Table of Contents

- [1. DTO Schemas & Dual Attributes (OpenAPI + `yiisoft/validator`)](#1-dto-schemas--dual-attributes-openapi--yiisoftvalidator)
  - [5.7. File Uploads (`multipart/form-data`)](#57-file-uploads-multipartform-data)
  - [5.8. Standardized Error Models: RFC 7807 / RFC 9457 Problem Details](#58-standardized-error-models-rfc-7807--rfc-9457-problem-details)
- [6. Multi-Version API Documentation (`/swagger/v1` & `/swagger/v2`)](#6-multi-version-api-documentation-swaggerv1--swaggerv2)

## 1. DTO Schemas & Dual Attributes (OpenAPI + `yiisoft/validator`)
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

use App\Infrastructure\FileStorage\ProductImageStorage;
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
        private ProductImageStorage $storage,
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

        // Storage step — delegated to the infrastructure file-storage service (File Handling
        // Guide, §5: "Filesystem manipulation (moving, copying, cleanup) belongs in
        // infrastructure/services, not in actions — an action validates and calls a use case").
        // The service builds the safe destination (random server-side name, sanitized client
        // extension, alias resolution via the injected `Aliases` service — `$aliases->get(...)`,
        // an instance method, not a static call, directory creation) and runs
        // `$file->moveTo($targetPath)` — see the bridge below.
        $targetPath = $this->storage->save($file);

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
> `FileHelper::ensureDirectory()`, alias resolution before `moveTo()`, and the infrastructure
> file-storage service recipe (`DocumentStorage`) that owns the filesystem slice), see the
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
