# Yii3 REST API Endpoint Patterns

Supplement to SKILL.md - load when generating REST/JSON API endpoints. Follows the official
"REST APIs - Quick start" guide; reference template is https://github.com/yiisoft/app-api.

## Project Analysis

1. Load context per `yii3` master skill. Determine template type:
   - **API template** (`yiisoft/app-api`) — input resolving, body parsing, data-response are preconfigured.
   - **Web template** — extra packages needed:
     ```sh
     composer require yiisoft/input-http yiisoft/request-body-parser yiisoft/data-response
     ```
     And in `config/web/di/application.php`:
     - `RequestBodyParser::class` before `Router::class`;
     - `ContentNegotiatorDataResponseMiddleware` with `JsonFormatter` before error handling;
     - composite `ParametersResolverInterface` with `HydratorAttributeParametersResolver`
       + `RequestInputParametersResolver`.
2. Ask for: HTTP method + path, request/response fields, persistence needs, status codes.
3. For protected endpoints use stateless authentication — `findIdentityByToken()` in the identity
   repository and the `Yiisoft\Auth\Middleware\Authentication` middleware on the API group
   (see `yii3-auth` skill). Never rely on sessions for a public REST API.

## Request Input

`src/Api/Post/CreatePostInput.php`:

```php
<?php

declare(strict_types=1);

namespace {Namespace}\Api\Post;

use Yiisoft\Input\Http\AbstractInput;
use Yiisoft\Input\Http\Attribute\Data\FromBody;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;

#[FromBody]
final class CreatePostInput extends AbstractInput
{
    #[Required]
    #[Length(min: 2, max: 100)]
    public string $title = '';

    #[Required]
    public string $content = '';
}
```

Variants:
- Combine body + other sources via parameter attributes:

  ```php
  #[FromBody]
  final class UpdatePostInput extends AbstractInput
  {
      public function __construct(
          #[Query('id')]
          public int $id = 0,
          #[Required]
          public string $title = '',
      ) {}
  }
  ```

- File uploads: `#[UploadedFiles('image')]` on the property, request as `multipart/form-data`.
- Attributes from `Yiisoft\Input\Http\Attribute\Parameter\*`: `Query`, `Body`, `Header`, `Cookie`,
  `UploadedFiles`; route parameters come via the router's `RouteArgument` attribute.

## Action

`src/Api/Post/CreatePostAction.php`:

```php
<?php

declare(strict_types=1);

namespace {Namespace}\Api\Post;

use {Namespace}Api\Shared\ResponseFactory;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\Http\Status;

final readonly class CreatePostAction
{
    public function __invoke(
        CreatePostInput $input,
        ResponseFactory $responseFactory,
    ): ResponseInterface {
        $result = $input->getValidationResult();

        if (!$result->isValid()) {
            return $responseFactory->failValidation($result);
        }

        return $responseFactory
            ->success([
                'title' => $input->title,
                'content' => $input->content,
            ])
            ->withStatus(Status::CREATED);
    }
}
```

Alternative centralized style (default in the API template): configure `RequestInputParametersResolver`
to throw `Yiisoft\Input\Http\InputValidationException` and convert it to a JSON error response in a single
error handler — then actions skip manual `$result->isValid()` checks. Follow whichever pattern the project uses.

## Response Factory & Presenters

Prefer `yiisoft/data-response` over writing JSON into PSR-7 manually. Shared wrapper:

```php
final readonly class ResponseFactory
{
    public function __construct(
        private DataResponseFactoryInterface $dataResponseFactory,
    ) {}

    public function success(array|object|null $data = null): ResponseInterface
    {
        return $this->dataResponseFactory->createResponse([
            'status' => 'success',
            'data' => $data,
        ]);
    }

    public function failValidation(Result $result): ResponseInterface
    {
        return $this->dataResponseFactory
            ->createResponse([
                'status' => 'failed',
                'error_message' => 'Validation failed.',
            ])
            ->withStatus(Status::UNPROCESSABLE_ENTITY);
    }
}
```

Presenters map entities to API arrays and stay separate from domain objects:

```php
/**
 * @implements PresenterInterface<Post>
 */
final readonly class PostPresenter implements PresenterInterface
{
    public function present(mixed $value): array
    {
        return [
            'id' => $value->id,
            'title' => $value->title,
            'content' => $value->content,
        ];
    }
}
```

Status codes: `201 Created` on create; `422 Unprocessable Entity` on validation errors; `204 No Content`
on successful delete; `404 Not Found` when an entity does not exist.

## Route

Register in `config/common/routes.php`; group `/api` routes so shared middleware (CORS, auth, formatting)
applies to all of them:

```php
Group::create('/api')
    ->routes(
        Route::methods([Method::POST], '/posts')
            ->action(CreatePostAction::class)
            ->name('api.post.create'),
    )
```

Route names follow the `{entities}.{action}` convention prefixed with the group (`api.post.create`).

CORS for an API group - add the CORS middleware to the group:

```php
Group::create('/api')
    ->middleware(\Yiisoft\Cors\Middleware\CorsMiddleware::class)
    ->routes(/* ... */)
```

The router auto-answers `405 Method Not Allowed` and empty `204 OPTIONS` responses for known paths.

## Verify

1. `php -l` all files.
2. Test with curl:

   ```sh
   curl -X POST http://localhost:8080/api/posts \
       -H 'Content-Type: application/json' \
       -H 'Accept: application/json' \
       -d '{"title":"First post","content":"Text"}'
   ```

   Expect `Content-Type: application/json`, correct status code, and `422` with field-level errors on bad input.
