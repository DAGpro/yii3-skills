# Yii3 OpenAPI: Documenting Endpoints with Attributes

> **Grounding:** APIs in `vendor/yiisoft/<pkg>/src/`, patterns in this guide, conventions in architecture artifact (SKILL.md Core rule 2).

> Part of the [OpenAPI & Swagger Guide](http-openapi-swagger.md) split — anti-patterns and related guides live there.

## Table of Contents

- [5. Documenting API Endpoints with PHP 8 Attributes](#5-documenting-api-endpoints-with-php-8-attributes)
  - [5.1. Global API Information & Tags](#51-global-api-information--tags)
  - [5.2. Security Schemes (Bearer JWT, API Key, OAuth 2.0)](#52-security-schemes-bearer-jwt-api-key-oauth-20)
  - [5.3. Endpoint Actions & CRUD Operations (Get, Delete)](#53-endpoint-actions--crud-operations-get-delete)
  - [5.4. Route Parameters: Injecting `CurrentRoute` vs Broken PSR-7 Attributes](#54-route-parameters-injecting-currentroute-vs-broken-psr-7-attributes)
  - [5.5. Query & Header Parameters](#55-query--header-parameters)
  - [5.6. DTO Schemas, File Uploads & Error Models](#56-dto-schemas-file-uploads--error-models)

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

### 5.3. Endpoint Actions & CRUD Operations (Get, Delete)

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

### 5.6. DTO Schemas, File Uploads & Error Models

For DTO schemas with dual validation attributes, multipart file uploads, RFC 7807 problem details error models, and multi-version API documentation, see [OpenAPI Schemas, Uploads & Error Models](http-openapi-schemas.md).
