# Yii3 OpenAPI & Swagger Integration Guide

> Configuration and usage guide for `yiisoft/yii-swagger`, documenting routes and DTOs using PHP 8 attributes (`zircote/swagger-php`), and serving interactive Swagger UI documentation.

---

## Table of Contents
- [1. Overview & Architecture](#1-overview--architecture)
- [2. Installation & Dependency Protocol](#2-installation--dependency-protocol)
- [3. Configuration in `params.php`](#3-configuration-in-paramsphp)
- [4. Route Integration & Serving Documentation](#4-route-integration--serving-documentation)
- [5. Documenting API Endpoints with PHP Attributes](#5-documenting-api-endpoints-with-php-attributes)
  - [5.1. Global API Information & Security Schemes](#51-global-api-information--security-schemes)
  - [5.2. Action Endpoint Attributes (Get, Post, Put, Delete)](#52-action-endpoint-attributes-get-post-put-delete)
  - [5.3. Parameters (Path, Query, Header)](#53-parameters-path-query-header)
  - [5.4. Request Body & DTO Schemas](#54-request-body--dto-schemas)
  - [5.5. Responses & Error Models](#55-responses--error-models)
- [6. Swagger UI Customization & Asset Management](#6-swagger-ui-customization--asset-management)
- [7. Environment Protection & Performance Caching](#7-environment-protection--performance-caching)
- [8. Anti-Patterns & Common Traps](#8-anti-patterns--common-traps)
- [9. Related Topic Guides](#9-related-topic-guides)

---

## 1. Overview & Architecture

The `yiisoft/yii-swagger` package provides seamless OpenAPI v3 specification generation and interactive Swagger UI rendering for Yii3 applications. It builds on top of [zircote/swagger-php](https://github.com/zircote/swagger-php) for scanning PHP 8 attributes and [swagger-api/swagger-ui](https://swagger.io/tools/swagger-ui/) for UI assets.

### Core Architecture Components

| Component / FQCN | Role | Responsibilities |
|---|---|---|
| `Yiisoft\Yii\Swagger\Service\SwaggerService` | Specification Generator | Scans configured directories (`source-paths`), analyzes PHP 8 attributes, builds and validates `OpenApi\Annotations\OpenApi` graph. |
| `Yiisoft\Yii\Swagger\Action\SwaggerJson` | JSON Action Handler | PSR-15 `RequestHandlerInterface` serving the compiled OpenAPI specification as a `DataResponse` (requires `FormatDataResponseAsJson` middleware). Supports PSR-16 caching. |
| `Yiisoft\Yii\Swagger\Action\SwaggerUi` | UI Action Handler | PSR-15 `RequestHandlerInterface` rendering the HTML Swagger UI page via `WebViewRenderer` and registering client assets (`SwaggerUiAsset`). |
| `Yiisoft\Yii\Swagger\Asset\SwaggerUiAsset` | Asset Bundle | Registers Swagger UI CSS and JavaScript bundles from `@vendor/swagger-api/swagger-ui/dist`. |

---

## 2. Installation & Dependency Protocol

Install `yiisoft/yii-swagger` using Composer:

```bash
composer require yiisoft/yii-swagger
```

This installs `yiisoft/yii-swagger`, `zircote/swagger-php`, and `swagger-api/swagger-ui`. In target applications using JSON responses and web rendering, ensure companion packages are available:

```bash
composer require yiisoft/data-response yiisoft/view yiisoft/assets
```

---

## 3. Configuration in `params.php`

Configure Swagger parameters in `config/params.php` or `config/web/params.php`:

```php
declare(strict_types=1);

return [
    'yiisoft/yii-swagger' => [
        // Directories scanned for OpenAPI PHP attributes
        'source-paths' => [
            '@src/Presentation/Action',
            '@src/Domain',
        ],
        // Cache TTL in seconds (null = infinite, int = seconds, omitted/false = disabled)
        'cacheTTL' => 3600,
        // Swagger UI client options (passed to SwaggerUIBundle in browser)
        'ui-params' => [
            'persistAuthorization' => true,
            'displayRequestDuration' => true,
            'filter' => true,
            'deepLinking' => true,
            'tryItOutEnabled' => true,
        ],
        // Scanner options passed to OpenApi\Generator
        'options' => [
            'aliases' => [],
            'namespaces' => [],
            'config' => [],
            'validate' => true,
            'version' => null,
        ],
    ],
];
```

### Required Aliases for Assets

Swagger UI depends on asset publishing. Verify that path aliases are registered in `config/common/aliases.php` or `config/params.php`:

```php
return [
    'yiisoft/aliases' => [
        'aliases' => [
            '@root' => dirname(__DIR__),
            '@src' => '@root/src',
            '@views' => '@root/views',
            '@public' => '@root/public',
            '@assets' => '@public/assets',
            '@assetsUrl' => '/assets',
        ],
    ],
];
```

---

## 4. Route Integration & Serving Documentation

Register Swagger UI and JSON specification endpoints in `config/web/routes.php`.

### Group Route Registration

```php
declare(strict_types=1);

use Yiisoft\DataResponse\Middleware\FormatDataResponseAsHtml;
use Yiisoft\DataResponse\Middleware\FormatDataResponseAsJson;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route;
use Yiisoft\Yii\Swagger\Action\SwaggerJson;
use Yiisoft\Yii\Swagger\Action\SwaggerUi;

return [
    Group::create('/swagger', [
        // 1. Swagger UI HTML viewer
        Route::get('')
            ->middleware(FormatDataResponseAsHtml::class)
            ->action(fn (SwaggerUi $swaggerUi) => $swaggerUi->withJsonUrl('/swagger/json-url'))
            ->name('swagger.ui'),

        // 2. OpenAPI JSON specification endpoint
        Route::get('/json-url')
            ->middleware(FormatDataResponseAsJson::class)
            ->action(SwaggerJson::class)
            ->name('swagger.json'),
    ]),
];
```

> [!IMPORTANT]
> `SwaggerJson` returns a `DataResponse` wrapping an `OpenApi\Annotations\OpenApi` object. It **must** be piped through `FormatDataResponseAsJson::class` middleware to produce valid HTTP JSON output.

---

## 5. Documenting API Endpoints with PHP Attributes

Use standard `OpenApi\Attributes` (imported as `OA`) to document API contracts directly in code.

### 5.1. Global API Information & Security Schemes

Place global API metadata in a central controller, action, or a dedicated configuration class:

```php
declare(strict_types=1);

namespace App\Presentation\Action\Api;

use OpenApi\Attributes as OA;

#[OA\Info(
    version: '1.0.0',
    title: 'Acme REST API',
    description: 'High-performance HTTP API built with Yii3 Framework.',
    contact: new OA\Contact(name: 'API Support', email: 'api@example.com'),
    license: new OA\License(name: 'MIT', url: 'https://opensource.org/licenses/MIT')
)]
#[OA\Server(
    url: '/',
    description: 'Current Environment Server'
)]
#[OA\SecurityScheme(
    securityScheme: 'bearerAuth',
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Enter your Bearer token in the format: Bearer <token>'
)]
final class ApiDoc
{
}
```

### 5.2. Action Endpoint Attributes (Get, Post, Put, Delete)

Annotate single-action invokable controllers or controller methods:

```php
declare(strict_types=1);

namespace App\Presentation\Action\Post;

use App\Application\Post\PostRepositoryInterface;
use OpenApi\Attributes as OA;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;

final readonly class GetPostAction
{
    public function __construct(
        private PostRepositoryInterface $postRepository,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    #[OA\Get(
        path: '/api/v1/posts/{id}',
        summary: 'Retrieve post by ID',
        description: 'Returns single published post record with author metadata.',
        tags: ['Posts'],
        security: [['bearerAuth' => []]],
        parameters: [
            new OA\Parameter(
                name: 'id',
                in: 'path',
                required: true,
                description: 'Unique post identifier',
                schema: new OA\Schema(type: 'string', format: 'uuid')
            ),
        ],
        responses: [
            new OA\Response(
                response: Status::OK,
                description: 'Post found successfully',
                content: new OA\JsonContent(ref: '#/components/schemas/PostResponse')
            ),
            new OA\Response(
                response: Status::NOT_FOUND,
                description: 'Post not found',
                content: new OA\JsonContent(ref: '#/components/schemas/ErrorResponse')
            ),
            new OA\Response(
                response: Status::UNAUTHORIZED,
                description: 'Missing or invalid authentication token'
            ),
        ]
    )]
    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $id = (string) $request->getAttribute('id');
        $post = $this->postRepository->findById($id);

        if ($post === null) {
            return $this->responseFactory->createResponse(
                ['error' => 'Post not found'],
                Status::NOT_FOUND
            );
        }

        return $this->responseFactory->createResponse([
            'id' => $post->getId(),
            'title' => $post->getTitle(),
            'content' => $post->getContent(),
        ]);
    }
}
```

### 5.3. Parameters (Path, Query, Header)

```php
#[OA\Get(
    path: '/api/v1/posts',
    summary: 'List paginated posts',
    tags: ['Posts'],
    parameters: [
        new OA\Parameter(
            name: 'page',
            in: 'query',
            required: false,
            description: 'Page index for pagination',
            schema: new OA\Schema(type: 'integer', default: 1)
        ),
        new OA\Parameter(
            name: 'limit',
            in: 'query',
            required: false,
            description: 'Number of items per page',
            schema: new OA\Schema(type: 'integer', default: 20)
        ),
        new OA\Parameter(
            name: 'X-Client-Version',
            in: 'header',
            required: false,
            description: 'Client application version header',
            schema: new OA\Schema(type: 'string')
        ),
    ],
    responses: [
        new OA\Response(
            response: 200,
            description: 'List of posts',
            content: new OA\JsonContent(
                type: 'array',
                items: new OA\Items(ref: '#/components/schemas/PostResponse')
            )
        ),
    ]
)]
```

### 5.4. Request Body & DTO Schemas

Document incoming request DTOs using `#[OA\Schema]`:

```php
declare(strict_types=1);

namespace App\Application\Post\DTO;

use OpenApi\Attributes as OA;

#[OA\Schema(
    schema: 'CreatePostRequest',
    description: 'Payload for creating a new blog post',
    required: ['title', 'content']
)]
final readonly class CreatePostRequest
{
    public function __construct(
        #[OA\Property(
            description: 'Post title',
            type: 'string',
            maxLength: 255,
            example: 'Getting Started with Yii 3'
        )]
        public string $title,

        #[OA\Property(
            description: 'Post markdown content',
            type: 'string',
            example: 'Yii 3 is a modern, modular PHP framework...'
        )]
        public string $content,

        #[OA\Property(
            description: 'Optional publish status flag',
            type: 'boolean',
            default: false
        )]
        public bool $isPublished = false,
    ) {}
}
```

Referencing the request DTO in the mutating action:

```php
#[OA\Post(
    path: '/api/v1/posts',
    summary: 'Create a new blog post',
    tags: ['Posts'],
    security: [['bearerAuth' => []]],
    requestBody: new OA\RequestBody(
        required: true,
        description: 'New post data payload',
        content: new OA\JsonContent(ref: '#/components/schemas/CreatePostRequest')
    ),
    responses: [
        new OA\Response(
            response: Status::CREATED,
            description: 'Post created successfully',
            content: new OA\JsonContent(ref: '#/components/schemas/PostResponse')
        ),
        new OA\Response(
            response: Status::UNPROCESSABLE_ENTITY,
            description: 'Validation failed',
            content: new OA\JsonContent(ref: '#/components/schemas/ValidationErrorResponse')
        ),
    ]
)]
```

### 5.5. Responses & Error Models

```php
declare(strict_types=1);

namespace App\Presentation\DTO;

use OpenApi\Attributes as OA;

#[OA\Schema(
    schema: 'ValidationErrorResponse',
    description: 'Validation error response payload',
    required: ['status', 'errors']
)]
final readonly class ValidationErrorResponse
{
    #[OA\Property(type: 'string', example: 'failed')]
    public string $status;

    #[OA\Property(
        type: 'object',
        additionalProperties: new OA\AdditionalProperties(
            type: 'array',
            items: new OA\Items(type: 'string')
        ),
        example: ['title' => ['Value cannot be blank.']]
    )]
    public array $errors;
}
```

---

## 6. Swagger UI Customization & Asset Management

Parameters inside `config/params.php` under `'yiisoft/yii-swagger'['ui-params']` map directly to official Swagger UI browser options:

```php
'ui-params' => [
    'dom_id' => '#swagger-ui',
    'deepLinking' => true,
    'displayRequestDuration' => true,
    'persistAuthorization' => true,     // Keeps auth bearer token across page refreshes
    'filter' => true,                   // Adds filter input box for endpoints
    'showExtensions' => true,
    'showCommonExtensions' => true,
    'docExpansion' => 'list',           // 'none', 'list', or 'full'
    'defaultModelsExpandDepth' => 1,
],
```

For custom layouts or views, customize the `SwaggerUi` action in `config/web/di/swagger.php`:

```php
use Yiisoft\Yii\Swagger\Action\SwaggerUi;

return [
    SwaggerUi::class => [
        '__construct()' => [
            'params' => $params['yiisoft/yii-swagger']['ui-params'],
        ],
    ],
];
```

---

## 7. Environment Protection & Performance Caching

### 7.1. Caching Compiled Specifications

Scanning multiple directories on every request causes high CPU overhead. Enable caching in production via `params.php`:

```php
'yiisoft/yii-swagger' => [
    'source-paths' => [
        '@src/Presentation/Action',
        '@src/Domain',
    ],
    // Cache for 24 hours in production, set to null or false in local dev
    'cacheTTL' => $_ENV['APP_ENV'] === 'prod' ? 86400 : null,
],
```

### 7.2. Restricting Swagger UI Access in Production

To hide Swagger UI from unauthorized public users in production environments:

1. Attach an IP filter or authentication middleware to the `/swagger` route group:

```php
use App\Presentation\Middleware\AdminAuthMiddleware;
use Yiisoft\Router\Group;
use Yiisoft\Yii\Middleware\IpFilter;

Group::create('/swagger', [
    // routes...
])
->middleware(AdminAuthMiddleware::class);
```

2. Or disable the group registration entirely when `APP_ENV === 'prod'`:

```php
$routes = [
    // Application routes...
];

if ($_ENV['APP_ENV'] !== 'prod') {
    $routes[] = Group::create('/swagger', [
        // Swagger routes...
    ]);
}

return $routes;
```

---

## 8. Anti-Patterns & Common Traps

| Anti-Pattern | Why It Fails | Idiomatic Yii3 Solution |
|---|---|---|
| **Using legacy PHPDoc annotations (`@OA\...`)** | Deprecated, slow, and fragile in PHP 8.2+. | Use native PHP 8 attributes: `#[OA\Get]`, `#[OA\Schema]`, `#[OA\Property]`. |
| **Omitting `FormatDataResponseAsJson` middleware** | `SwaggerJson` returns a `DataResponse`; browser receives empty or unformatted body. | Attach `->middleware(FormatDataResponseAsJson::class)` to `/swagger/json-url`. |
| **Hardcoding host URLs in `#[OA\Server]`** | Breaks across local, staging, and production environments. | Use relative server path `#[OA\Server(url: '/')]`. |
| **Missing `@assets` / `@assetsUrl` path aliases** | `SwaggerUiAsset` cannot publish CSS/JS assets, rendering a blank white page. | Define `@assets` and `@assetsUrl` in `config/common/aliases.php`. |
| **Leaving infinite cache in local development** | Code changes in OpenAPI attributes do not show up until cache is purged. | Set `'cacheTTL' => null` or flush cache during development. |

---

## 9. Related Topic Guides

- [Routing Guide](routes.md) — Route groups, middleware ordering, and URL matching rules.
- [Actions & Controllers Guide](actions-and-controllers.md) — Single-action invokables and PSR-7 data responses.
- [Validation & Forms Guide](validation-and-forms.md) — Validating request DTOs with `yiisoft/validator` attributes.
- [PSR-15 Middlewares Guide](middlewares.md) — Guarding endpoints with authentication and rate limiting.
