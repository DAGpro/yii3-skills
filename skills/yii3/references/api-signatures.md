# Yii3 API Signatures Cheat-Sheet

> **Source of Truth:** Verified against official `yiisoft/*` source code in `references/`.
> Use these exact FQCNs, constructor parameters, and method signatures to avoid hallucinations and version drift.

---

## 1. Response Factory (`yiisoft/data-response`)
```php
namespace Yiisoft\DataResponse\ResponseFactory;

use Psr\Http\Message\ResponseInterface;
use Yiisoft\Http\Status;

interface DataResponseFactoryInterface
{
    public function createResponse(
        mixed $data = null,
        int $code = Status::OK,
        string $reasonPhrase = '',
    ): ResponseInterface;
}
```
**Usage:**
```php
return $this->responseFactory->createResponse(['data' => $payload], 200);
return $this->responseFactory->createResponse(['errors' => $errors], 422);
```

---

## 2. Validation (`yiisoft/validator`)
```php
namespace Yiisoft\Validator;

interface ValidatorInterface
{
    public function validate(
        mixed $data,
        callable|iterable|object|string|null $rules = null,
        ?ValidationContext $context = null,
    ): Result;
}
```
**Result methods:**
```php
$result->isValid(): bool;
$result->getErrorMessages(): array; // ['Field is required.', ...]
$result->getErrorMessagesIndexedByProperty(): array; // ['title' => ['Title is required.']]
```

---

## 3. Hydrator (`yiisoft/hydrator`)
```php
namespace Yiisoft\Hydrator;

interface HydratorInterface
{
    /** @psalm-return T */
    public function create(string $class, array|DataInterface $data = []): object;
    public function hydrate(object $object, array|DataInterface $data = []): void;
}
```
**Usage:**
```php
/** @var CreateUserRequest $dto */
$dto = $this->hydrator->create(CreateUserRequest::class, $request->getParsedBody());
```

---

## 4. Database Connection & Transactions (`yiisoft/db`)
```php
namespace Yiisoft\Db\Connection;

use Closure;
use Yiisoft\Db\Command\CommandInterface;
use Yiisoft\Db\Transaction\TransactionInterface;

interface ConnectionInterface
{
    public function createCommand(?string $sql = null, array $params = []): CommandInterface;
    public function transaction(Closure $closure, ?string $isolationLevel = null): mixed;
    public function beginTransaction(?string $isolationLevel = null): TransactionInterface;
    public function getTransaction(): ?TransactionInterface;
}
```
**Usage:**
```php
$db->transaction(function (ConnectionInterface $db) use ($order) {
    // operations inside atomic transaction
});
```

---

## 5. Database Commands & Batch Insert (`yiisoft/db`)
```php
namespace Yiisoft\Db\Command;

interface CommandInterface
{
    public function insert(string $table, array|QueryInterface $columns): static;
    public function batchInsert(string $table, array $columns, iterable $rows): static;
    public function update(string $table, array $columns, array|string $condition = '', array $params = []): static;
    public function delete(string $table, array|string $condition = '', array $params = []): static;
    public function execute(): int;
    public function queryAll(): array;
    public function queryOne(): array|false;
    public function queryScalar(): mixed;
}
```
**Usage:**
```php
$db->createCommand()
   ->batchInsert('product', ['title', 'price'], [['Widget A', 100], ['Widget B', 200]])
   ->execute();
```

---

## 6. Migrations (`yiisoft/db-migration`)
```php
namespace Yiisoft\Db\Migration;

use Yiisoft\Db\Constant\ColumnType;
use Yiisoft\Db\Constant\PseudoType;

final class MigrationBuilder
{
    public function createTable(string $table, array $columns, ?string $options = null): void;
    public function dropTable(string $table): void;
    public function addColumn(string $table, string $column, ColumnInterface|string $type): void;
    public function dropColumn(string $table, string $column): void;
    public function createIndex(string $table, string $name, array|string $columns, ?string $indexType = null): void;
    public function dropIndex(string $table, string $name): void;
    public function addForeignKey(string $table, string $name, array|string $columns, string $refTable, array|string $refColumns, ?string $delete = null, ?string $update = null): void;
    public function dropForeignKey(string $table, string $name): void;
}
```
**Usage:**
```php
$b->createTable('{{%order}}', [
    'id' => PseudoType::PK,
    'user_id' => ColumnType::INTEGER . ' NOT NULL',
    'total' => ColumnType::DECIMAL . '(10,2) NOT NULL',
    'created_at' => ColumnType::TIMESTAMP . ' NOT NULL',
]);
```

---

## 7. Current User & Permissions (`yiisoft/user`)
```php
namespace Yiisoft\User;

use Yiisoft\Auth\IdentityInterface;

final class CurrentUser
{
    public function getIdentity(): IdentityInterface;
    public function getId(): ?string;
    public function isGuest(): bool;
    public function can(string|BackedEnum $permissionName, array $parameters = []): bool;
    public function login(IdentityInterface $identity): bool;
    public function logout(): bool;
}
```
**Usage:**
```php
if (!$this->currentUser->can('editPost', ['authorId' => $post->getAuthorId()])) {
    return $this->responseFactory->createResponse(['message' => 'Forbidden'], 403);
}
```

---

## 8. URL Generation (`yiisoft/router`)
```php
namespace Yiisoft\Router;

interface UrlGeneratorInterface
{
    public function generate(
        string $name,
        array $arguments = [],
        array $queryParameters = [],
        ?string $hash = null,
    ): string;

    public function generateAbsolute(
        string $name,
        array $arguments = [],
        array $queryParameters = [],
        ?string $scheme = null,
        ?string $host = null,
        ?string $hash = null,
    ): string;
}
```
**Usage:**
```php
$url = $this->urlGenerator->generate('order.view', ['id' => $orderId]);
```

---

## 9. HTTP Routes & Groups (`yiisoft/router`)
```php
namespace Yiisoft\Router;

final class Route
{
    public static function get(string $pattern): self;
    public static function post(string $pattern): self;
    public static function put(string $pattern): self;
    public static function delete(string $pattern): self;
    public static function patch(string $pattern): self;
    public static function methods(array $methods, string $pattern): self;

    public function action(array|callable|string $action): self;
    public function name(string $name): self;
    public function middleware(array|callable|string ...$middleware): self;
}

final class Group
{
    public static function create(?string $prefix = null): self;
    public function routes(Group|Route ...$routes): self;
    public function middleware(array|callable|string ...$middleware): self;
    public function namePrefix(string $namePrefix): self;
}
```

---

## 10. Current Route Arguments (`yiisoft/router`)
```php
namespace Yiisoft\Router;

final class CurrentRoute
{
    public function getName(): ?string;
    public function getArgument(string $name, ?string $default = null): ?string;
    public function getArguments(): array;
}
```
**Usage in Action:**
```php
public function __invoke(CurrentRoute $currentRoute): ResponseInterface
{
    $id = (int)$currentRoute->getArgument('id');
}
```

---

## 11. HTML View Renderer (`yiisoft/yii-view-renderer`)
```php
namespace Yiisoft\Yii\View\Renderer;

use Psr\Http\Message\ResponseInterface;

final class ViewRenderer implements ViewContextInterface
{
    public function render(string $view, array $parameters = []): ResponseInterface;
    public function renderPartial(string $view, array $parameters = []): ResponseInterface;
    public function withViewPath(string $viewPath): self;
}
```
**Usage:**
```php
return $this->viewRenderer->render('index', ['products' => $products]);
```

---

## 12. Console Exit Codes (`yiisoft/yii-console`)
```php
namespace Yiisoft\Yii\Console;

class ExitCode
{
    public const OK = 0;
    public const UNSPECIFIED_ERROR = 1;
    public const USAGE = 64;
    public const DATAERR = 65;
    public const NOINPUT = 66;
    public const UNAVAILABLE = 69;
}
```
**Usage in Console Command:**
```php
protected function execute(InputInterface $input, OutputInterface $output): int
{
    return ExitCode::OK;
}
```

---

## 13. PSR-7 Uploaded Files (`Psr\Http\Message`)
```php
namespace Psr\Http\Message;

interface UploadedFileInterface
{
    public function getStream(): StreamInterface;
    public function moveTo(string $targetPath): void;
    public function getSize(): ?int;
    public function getError(): int;
    public function getClientFilename(): ?string;
    public function getClientMediaType(): ?string;
}
```
**Usage in Action:**
```php
/** @var UploadedFileInterface[] $files */
$files = $request->getUploadedFiles();
$avatar = $files['avatar'] ?? null;
```

---

## 14. RBAC Custom Rule (`yiisoft/rbac`)
```php
namespace Yiisoft\Rbac;

interface RuleInterface
{
    public function execute(?string $userId, Item $item, RuleContext $context): bool;
}
```
**Usage:**
```php
final readonly class AuthorRule implements RuleInterface
{
    public function execute(?string $userId, Item $item, RuleContext $context): bool
    {
        $authorId = $context->getParameter('authorId');
        return $userId !== null && $userId === (string)$authorId;
    }
}
```

---

## 15. PSR-14 Event Dispatcher (`Psr\EventDispatcher`)
```php
namespace Psr\EventDispatcher;

interface EventDispatcherInterface
{
    public function dispatch(object $event): object;
}
```
**Usage in Use Case:**
```php
$this->eventDispatcher->dispatch(new OrderCreatedEvent($order->getId()));
```
