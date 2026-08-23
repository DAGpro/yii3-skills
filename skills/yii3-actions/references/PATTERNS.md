# Yii3 Action Patterns — Universal Examples

> **Namespace convention**: Replace `{Namespace}` with the project's actual namespace (e.g. `App\Slice\User`, `App\Module\Blog`, `App\Domain\Order`). Detect from existing files.

## Complete CRUD with FormModel

### FormModel

```php
<?php

declare(strict_types=1);

namespace {Namespace}\User\Form;

use Yiisoft\FormModel\FormModel;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Email;

final class UserForm extends FormModel
{
    #[Required]
    #[Length(min: 2, max: 100)]
    private ?string $name = null;

    #[Required]
    #[Email]
    private ?string $email = null;

    public function getName(): ?string { return $this->name; }
    public function setName(?string $value): void { $this->name = $value; }
    public function getEmail(): ?string { return $this->email; }
    public function setEmail(?string $value): void { $this->email = $value; }
}
```

### List Action with yiisoft/data

```php
<?php

declare(strict_types=1);

namespace {Namespace}\User\Action;

use {Namespace}\User\Repository\UserRepositoryInterface;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Log\LoggerInterface;
use Yiisoft\Data\Reader\OffsetPaginator;
use Yiisoft\Data\Reader\Sort;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class ListUsersAction
{
    public function __construct(
        private UserRepositoryInterface $userRepository,
        private WebViewRenderer $viewRenderer,
        private LoggerInterface $logger,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $this->logger->debug('ListUsersAction invoked');

        $page = max(1, (int) ($request->getQueryParams()['page'] ?? 1));

        $sort = Sort::only(['id', 'name', 'email'])
            ->withOrder(['name' => 'asc']);

        $reader = $this->userRepository->getDataReader()
            ->withSort($sort);

        $paginator = (new OffsetPaginator($reader))
            ->withPageSize(20)
            ->withCurrentPage($page);

        return $this->viewRenderer->render('users/list', [
            'users' => $paginator->read(),
            'paginator' => $paginator,
        ]);
    }
}
```

### Create Action with FormModel + FormHydrator

```php
<?php

declare(strict_types=1);

namespace {Namespace}\{Feature}\Action;

use {Namespace}\{Feature}\Form\UserForm;
use {Namespace}\{Feature}\UseCase\CreateUser;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Log\LoggerInterface;
use Yiisoft\FormModel\FormHydrator;
use Yiisoft\Http\Status;
use Yiisoft\Router\UrlGeneratorInterface;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class CreateUserAction
{
    public function __construct(
        private CreateUser $createUser,
        private FormHydrator $formHydrator,
        private WebViewRenderer $viewRenderer,
        private ResponseFactoryInterface $responseFactory,
        private UrlGeneratorInterface $urlGenerator,
        private LoggerInterface $logger,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $this->logger->debug('CreateUserAction invoked');

        $form = new UserForm();
        $errors = [];

        if ($request->getMethod() === 'POST') {
            if ($this->formHydrator->populateFromPostAndValidate($form, $request)) {
                try {
                    $this->createUser->execute($form);
                    $this->logger->debug('User created');

                    return $this->responseFactory
                        ->createResponse(Status::SEE_OTHER)
                        ->withHeader('Location', $this->urlGenerator->generate('users'));
                } catch (\RuntimeException $e) {
                    $this->logger->warning('Create failed: {error}', ['error' => $e->getMessage()]);
                }
            } else {
                $errors = $form->getValidationResult()->getErrorMessagesIndexedByProperty();
            }
        }

        return $this->viewRenderer->render('users/form', [
            'form' => $form,
            'errors' => $errors,
        ]);
    }
}
```

### Edit Action

```php
<?php

declare(strict_types=1);

namespace {Namespace}\User\Action;

use {Namespace}\User\Form\UserForm;
use {Namespace}\User\Repository\UserRepositoryInterface;
use {Namespace}\User\UseCase\UpdateUser;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Log\LoggerInterface;
use Yiisoft\FormModel\FormHydrator;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;
use Yiisoft\Router\UrlGeneratorInterface;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class EditUserAction
{
    public function __construct(
        private UpdateUser $updateUser,
        private UserRepositoryInterface $userRepository,
        private FormHydrator $formHydrator,
        private WebViewRenderer $viewRenderer,
        private ResponseFactoryInterface $responseFactory,
        private UrlGeneratorInterface $urlGenerator,
        private CurrentRoute $currentRoute,
        private LoggerInterface $logger,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $id = (int) $this->currentRoute->getArgument('id');
        $this->logger->debug('EditUserAction invoked (id={id})', ['id' => $id]);

        $user = $this->userRepository->findById($id);
        if ($user === null) {
            return $this->responseFactory->createResponse(Status::NOT_FOUND);
        }

        $form = new UserForm();
        $form->setName($user->name());
        $form->setEmail($user->email());
        $errors = [];

        if ($request->getMethod() === 'POST') {
            if ($this->formHydrator->populateFromPostAndValidate($form, $request)) {
                try {
                    $this->updateUser->execute($id, $form);

                    return $this->responseFactory
                        ->createResponse(Status::SEE_OTHER)
                        ->withHeader('Location', $this->urlGenerator->generate('users'));
                } catch (\RuntimeException $e) {
                    $this->logger->warning('Update failed: {error}', ['error' => $e->getMessage()]);
                }
            } else {
                $errors = $form->getValidationResult()->getErrorMessagesIndexedByProperty();
            }
        }

        return $this->viewRenderer->render('users/form', [
            'form' => $form,
            'errors' => $errors,
            'user' => $user,
        ]);
    }
}
```

### Delete Action

```php
<?php

declare(strict_types=1);

namespace {Namespace}\User\Action;

use {Namespace}\User\UseCase\DeleteUser;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Log\LoggerInterface;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;
use Yiisoft\Router\UrlGeneratorInterface;

final readonly class DeleteUserAction
{
    public function __construct(
        private DeleteUser $deleteUser,
        private ResponseFactoryInterface $responseFactory,
        private UrlGeneratorInterface $urlGenerator,
        private CurrentRoute $currentRoute,
        private LoggerInterface $logger,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $id = (int) $this->currentRoute->getArgument('id');
        $this->logger->debug('DeleteUserAction invoked (id={id})', ['id' => $id]);

        try {
            $this->deleteUser->execute($id);
            $this->logger->debug('User deleted');
        } catch (\RuntimeException $e) {
            $this->logger->warning('Delete failed: {error}', ['error' => $e->getMessage()]);
        }

        return $this->responseFactory
            ->createResponse(Status::SEE_OTHER)
            ->withHeader('Location', $this->urlGenerator->generate('users'));
    }
}
```

## Input DTO Pattern (yiisoft/input-http)

> Full REST API variant (`#[Query]`/`#[Header]` attributes, validation flow, data-response) — see [API.md](API.md).

```php
<?php

declare(strict_types=1);

namespace {Namespace}\User\Input;

use Yiisoft\Input\Http\AbstractInput;
use Yiisoft\Input\Http\Attribute\Data\FromBody;

#[FromBody]
final class CreateUserInput extends AbstractInput
{
    public string $name;
    public string $email;
}

// In action with auto-resolution:
final readonly class CreateUserAction
{
    public function __invoke(CreateUserInput $input): ResponseInterface
    {
        // $input is automatically hydrated from POST body
    }
}
```

## File Download Pattern (yiisoft/response-download)

```php
<?php

declare(strict_types=1);

namespace {Namespace}\Export\Action;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Log\LoggerInterface;
use Yiisoft\ResponseDownload\DownloadResponseFactory;

final readonly class ExportUsersAction
{
    public function __construct(
        private DownloadResponseFactory $downloadFactory,
        private LoggerInterface $logger,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $this->logger->debug('ExportUsersAction invoked');

        $csv = $this->generateCsv();

        return $this->downloadFactory->sendContentAsFile(
            $csv,
            'users-export.csv',
            'text/csv',
        );
    }

    private function generateCsv(): string
    {
        $output = fopen('php://temp', 'r+');
        fputcsv($output, ['ID', 'Name', 'Email']);
        // Add rows...
        rewind($output);
        return stream_get_contents($output);
    }
}
```

## Session + Flash Pattern (yiisoft/session)

```php
<?php

declare(strict_types=1);

namespace {Namespace}\User\Action;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\FormModel\FormHydrator;
use Psr\Http\Message\ResponseFactoryInterface;
use Yiisoft\Session\SessionInterface;
use Yiisoft\Session\Flash\FlashInterface;
use Yiisoft\Router\UrlGeneratorInterface;
use Yiisoft\Http\Status;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class LoginAction
{
    public function __construct(
        private FormHydrator $formHydrator,
        private ResponseFactoryInterface $responseFactory,
        private WebViewRenderer $viewRenderer,
        private SessionInterface $session,
        private FlashInterface $flash,
        private UrlGeneratorInterface $urlGenerator,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $form = new LoginForm();

        if ($this->formHydrator->populateFromPostAndValidate($form, $request)) {
            $user = $this->authenticate($form->getUsername(), $form->getPassword());

            if ($user !== null) {
                $this->session->set('user_id', $user->getId());
                $this->flash->set('success', 'Welcome back!');

                return $this->responseFactory
                    ->createResponse(Status::SEE_OTHER)
                    ->withHeader('Location', $this->urlGenerator->generate('dashboard'));
            }

            $this->flash->set('error', 'Invalid credentials');
        }

        // Re-render the login form on GET or failed POST.
        // Flash messages are read in the template: <?= $flash->get('success') ?>
        return $this->viewRenderer->render('site/login', ['form' => $form]);
    }
}
```

> **GridView tables (columns, filters, sorting, pagination)** — see `/yii3-view` (references/DATAVIEW.md).
> **Template markup (HTML Helper forms, widgets, layout rendering)** — see `/yii3-view` (references/PATTERNS.md).

## Testing Patterns

> **Important:** `WebViewRenderer`, `FormHydrator` and other framework services are `final` classes —
> they cannot be mocked or implemented by anonymous classes. Mock only interfaces
> (`*RepositoryInterface`, `UrlGeneratorInterface`, `LoggerInterface`, your own UseCase interfaces)
> in unit tests, and cover actions end-to-end with functional tests.

### Unit test — UseCase layer (PHPUnit)

```php
<?php

declare(strict_types=1);

namespace {Namespace}\Tests\Unit\{Feature}\UseCase;

use {Namespace}\{Feature}\Form\UserForm;
use {Namespace}\{Feature}\Repository\UserRepositoryInterface;
use {Namespace}\{Feature}\UseCase\CreateUser;
use PHPUnit\Framework\TestCase;

final class CreateUserTest extends TestCase
{
    public function testSavesUserWithValidData(): void
    {
        $repository = $this->createMock(UserRepositoryInterface::class);
        $repository->expects($this->once())->method('save');

        $form = new UserForm();
        $form->setName('John');
        $form->setEmail('john@example.com');

        (new CreateUser($repository))->execute($form);
    }
}
```

### Functional test — action end-to-end

Follows the [Yii3 functional testing guide](https://yiisoft.github.io/docs/guide/testing/functional.html):
Codeception `Functional` suite boots the application in-process via a `FunctionalTester` helper that
sends PSR-7 requests through `HttpApplicationRunner`. This covers `FormHydrator`, `WebViewRenderer`
and routing without mocking final classes.

```php
<?php

declare(strict_types=1);

namespace {Namespace}\Tests\Functional;

use App\Tests\Support\FunctionalTester;
use HttpSoft\Message\ServerRequest;
use Yiisoft\Http\Status;

use function PHPUnit\Framework\assertSame;

final class CreateUserActionCest
{
    public function createsUserOnValidSubmit(FunctionalTester $tester): void
    {
        $response = $tester->sendRequest(
            (new ServerRequest(uri: '/users/create', method: 'POST'))
                ->withHeader('Content-Type', 'application/x-www-form-urlencoded')
                ->withParsedBody([
                    'UserForm' => ['name' => 'John', 'email' => 'john@example.com'],
                ]),
        );

        assertSame(Status::SEE_OTHER, $response->getStatusCode());
    }

    public function reRendersFormOnValidationError(FunctionalTester $tester): void
    {
        $response = $tester->sendRequest(
            (new ServerRequest(uri: '/users/create', method: 'POST'))
                ->withHeader('Content-Type', 'application/x-www-form-urlencoded')
                ->withParsedBody(['UserForm' => ['name' => '', 'email' => 'bad']]),
        );

        assertSame(Status::OK, $response->getStatusCode());
    }
}
```

The `sendRequest()` helper ships with the app template (`tests/Support/FunctionalTester.php`);
adapt names/scope to the project's generated tester.

### Testo Example

[Testo](https://github.com/yiisoft/testo) — Yiisoft's upcoming test framework. Test plain classes
and interface-based dependencies only:

```php
<?php

declare(strict_types=1);

namespace {Namespace}\Tests\{Feature}\UseCase;

use {Namespace}\{Feature}\Form\UserForm;
use {Namespace}\{Feature}\Repository\UserRepositoryInterface;
use {Namespace}\{Feature}\UseCase\CreateUser;
use Psr\Log\NullLogger;
use Testo\Assert;
use Testo\Test;

#[Test]
final class CreateUserTest
{
    public function savesUserWithValidData(): void
    {
        $saved = [];
        $repository = new class ($saved) implements UserRepositoryInterface {
            public function __construct(private array &$saved) {}
            public function save(object $user): void { $this->saved[] = $user; }
            // ...other interface methods
        };

        $form = new UserForm();
        $form->setName('John');
        $form->setEmail('john@example.com');

        (new CreateUser($repository, new NullLogger()))->execute($form);

        Assert::count($saved, 1);
    }
}
```


## Common Mistakes & Fixes

| Mistake                  | Fix                                                                                                            |
|--------------------------|----------------------------------------------------------------------------------------------------------------|
| `new Response(200)`      | Use `ResponseFactoryInterface::createResponse(Status::OK)` (`Status` is a class of int constants, not an enum) |
| `$request->get('id')`    | Use `CurrentRoute::getArgument('id')`                                                                          |
| `$_POST['name']`         | Use `$request->getParsedBody()['name']`                                                                        |
| `echo "Hello"` in action | Use `$this->viewRenderer->render(...)`                                                                         |
| `die()` or `exit()`      | Return proper Response                                                                                         |
| Business logic in action | Extract to UseCase class                                                                                       |
| Direct DB queries        | Use Repository pattern                                                                                         |
| `float` for money        | Use `int` (cents) or `Decimal`                                                                                 |
| Mutable action class     | Use `final readonly class`                                                                                     |
| Missing CSRF check       | Add `->csrf($csrf)` to `Html::form()` (requires `CsrfViewInjection`)                                           |

## Performance Patterns

### Lazy Pagination with DataReader

```php
$paginator = (new OffsetPaginator($reader))
    ->withPageSize(20)
    ->withCurrentPage($page);

$users = $paginator->read(); // Only loads 20 records
```

### Eager Loading Relations

```php
// In repository - avoid N+1
public function getDataReader(): DataReaderInterface
{
    return $this->dataReader
        ->withEagerLoad(['profile', 'roles']);
}
```

### Cache Expensive Queries

```php
use Psr\SimpleCache\CacheInterface;

final readonly class ListUsersAction
{
    public function __construct(
        private UserRepositoryInterface $userRepository,
        private CacheInterface $cache,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $page = max(1, (int) ($request->getQueryParams()['page'] ?? 1));
        $cacheKey = 'users_list_' . $page;
        $users = $this->cache->get($cacheKey);

        if ($users === null) {
            $users = $this->userRepository->findAllPaginated($page);
            $this->cache->set($cacheKey, $users, 300);
        }

        return $this->viewRenderer->render('users/list', [
            'users' => $users,
        ]);
    }
}
```
