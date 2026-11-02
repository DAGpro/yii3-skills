# Yii3 API Signatures Cheat-Sheet

> **Source of Truth:** Verified against official `yiisoft/*` package sources. In target projects, always verify installed signatures in `vendor/yiisoft/<package>/src/`.
> Use these exact FQCNs, constructor parameters, and method signatures to avoid hallucinations and version drift.
> Interfaces borrowed from external standards packages (`psr/http-message`, `psr/container`, `symfony/console`) are marked in their sections — verify their exact declarations against the installed vendor copy.

---

## Table of Contents
- [1. Response Factory (`yiisoft/data-response`)](#1-response-factory-yiisoftdata-response)
- [2. Validation (`yiisoft/validator`)](#2-validation-yiisoftvalidator)
- [3. Hydrator (`yiisoft/hydrator`)](#3-hydrator-yiisofthydrator)
- [4. Database Connection & Transactions (`yiisoft/db`)](#4-database-connection--transactions-yiisoftdb)
- [5. Database Commands & Batch Insert (`yiisoft/db`)](#5-database-commands--batch-insert-yiisoftdb)
- [6. Migrations (`yiisoft/db-migration`)](#6-migrations-yiisoftdb-migration)
- [7. Current User & Permissions (`yiisoft/user`)](#7-current-user--permissions-yiisoftuser)
- [8. URL Generation (`yiisoft/router`)](#8-url-generation-yiisoftrouter)
- [9. HTTP Routes & Groups (`yiisoft/router`)](#9-http-routes--groups-yiisoftrouter)
- [10. Current Route Arguments (`yiisoft/router`)](#10-current-route-arguments-yiisoftrouter)
- [11. HTML View Renderer (`yiisoft/yii-view-renderer`)](#11-html-view-renderer-yiisoftyii-view-renderer)
- [12. Console Exit Codes (`yiisoft/yii-console`)](#12-console-exit-codes-yiisoftyii-console)
- [13. PSR-7 Uploaded Files (`Psr\Http\Message`)](#13-psr-7-uploaded-files-psrhttpmessage)
- [14. RBAC Custom Rule (`yiisoft/rbac`)](#14-rbac-custom-rule-yiisoftrbac)
- [15. PSR-14 Event Dispatcher (`Psr\EventDispatcher`)](#15-psr-14-event-dispatcher-psreventdispatcher)
- [16. Dependency Injection (`yiisoft/di` + `psr/container`)](#16-dependency-injection-yiisoftdi--psrcontainer)
- [17. Cache (`yiisoft/cache`)](#17-cache-yiisoftcache)
- [18. Mailer (`yiisoft/mailer`)](#18-mailer-yiisoftmailer)
- [19. Session (`yiisoft/session`)](#19-session-yiisoftsession)
- [20. CSRF Protection (`yiisoft/csrf`)](#20-csrf-protection-yiisoftcsrf)
- [21. Security (`yiisoft/security`)](#21-security-yiisoftsecurity)
- [22. Middleware & PSR-15 (`yiisoft/middleware-dispatcher`)](#22-middleware--psr-15-yiisoftmiddleware-dispatcher)
- [23. Authentication (`yiisoft/auth`)](#23-authentication-yiisoftauth)
- [24. HTTP Status & Method Constants (`yiisoft/http`)](#24-http-status--method-constants-yiisofthttp)

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
declare(strict_types=1);

use Yiisoft\Http\Status;

return $this->responseFactory->createResponse(['data' => $payload], Status::OK);
return $this->responseFactory->createResponse(['errors' => $errors], Status::UNPROCESSABLE_ENTITY);
```
> Pitfalls:
> - A wrong import silently resolves to the deprecated root-namespace twin `Yiisoft\DataResponse\DataResponseFactoryInterface` (untyped `$data`, returns the deprecated `DataResponse`). The canonical contract lives in `Yiisoft\DataResponse\ResponseFactory`.
> - The concrete `DataResponseFactory` (bound to the interface by DI) wraps `$data` into a `DataStream`; `DataResponse` itself is `@deprecated` in favor of `DataStream`.
> - Reading a `DataStream` without a formatter set throws `LogicException` ("Formatter is not set.").

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
$result->getErrorMessages(): array; // flat list of strings
$result->getErrorMessagesIndexedByProperty(): array; // ['title' => ['Title is required.']]
$result->getErrorMessagesIndexedByPath(string $separator = '.', ?string $escape = '.'): array;
```
> Pitfalls:
> - `getErrorMessagesIndexedByProperty()` throws `InvalidArgumentException` when a top-level key is non-string — use `getErrorMessagesIndexedByPath()` for list-style data. Errors not bound to a property use the `''` key.
> - `Each` takes the whole rules array as ONE constructor argument, not variadic: `new Each([new Integer(min: 0, max: 255)])`.
> - Cross-property rules are `FilledAtLeast` and `FilledOnlyOneOf` — the 1.x names `AtLeast` / `OneOf` no longer exist.
> - Strict type-check rules live in `Yiisoft\Validator\Rule\Type\` (`IntegerType`, `FloatType`, `StringType`, `BooleanType`) — distinct FQCNs from the pattern-based `Yiisoft\Validator\Rule\Integer` / `Rule\Number`.
> - DI binds `ValidatorInterface::class` to `Yiisoft\Validator\Validator`.

**Usage:**
```php
declare(strict_types=1);

use Yiisoft\Validator\Rule\Each;
use Yiisoft\Validator\Rule\Integer;
use Yiisoft\Validator\ValidatorInterface;

$result = $this->validator->validate($payload, [
    'quantity' => new Each([new Integer(min: 0, max: 255)]),
]);

if (!$result->isValid()) {
    $errors = $result->getErrorMessagesIndexedByProperty();
}
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
declare(strict_types=1);

use App\User\CreateUserRequest;

$body = $request->getParsedBody();

/** @var CreateUserRequest $dto */
$dto = $this->hydrator->create(CreateUserRequest::class, is_array($body) ? $body : []);
```
> Note: `$request->getParsedBody()` may return a non-array when no body parser middleware has run — production code guards with `is_array()`. Plain arrays are auto-wrapped into `ArrayData` by the hydrator.

---

## 4. Database Connection & Transactions (`yiisoft/db`)
```php
namespace Yiisoft\Db\Connection;

use Closure;
use Yiisoft\Db\Command\CommandInterface;
use Yiisoft\Db\Expression\ExpressionInterface;
use Yiisoft\Db\Query\QueryInterface;
use Yiisoft\Db\Transaction\TransactionInterface;

interface ConnectionInterface
{
    public function createCommand(?string $sql = null, array $params = []): CommandInterface;
    public function transaction(Closure $closure, ?string $isolationLevel = null): mixed;
    public function beginTransaction(?string $isolationLevel = null): TransactionInterface;
    public function getTransaction(): ?TransactionInterface;
    public function createQuery(): QueryInterface;
    public function select(array|bool|float|int|string|ExpressionInterface $columns = [], ?string $option = null): QueryInterface;
    public function getLastInsertId(?string $sequenceName = null): string;
}
```
```php
namespace Yiisoft\Db\Transaction;

interface TransactionInterface
{
    public function begin(?string $isolationLevel = null): void;
    public function commit(): void;
    public function rollBack(): void;
}
```
Isolation level constants: `TransactionInterface::READ_UNCOMMITTED`, `READ_COMMITTED`, `REPEATABLE_READ`, `SERIALIZABLE`.

**Usage:**
```php
declare(strict_types=1);

use Throwable;
use Yiisoft\Db\Connection\ConnectionInterface;

// Callback form — the closure receives the connection, its return value is passed through:
$result = $db->transaction(function (ConnectionInterface $db) {
    // operations inside the atomic transaction
});

// Manual form — note the capital B in rollBack():
$transaction = $db->beginTransaction();
try {
    $transaction->commit();
} catch (Throwable $exception) {
    $transaction->rollBack();
    throw $exception;
}
```
> Pitfalls:
> - `TransactionInterface::rollBack()` is spelled with a capital `B`.
> - `getLastInsertId()` returns a STRING, not an int.
> - For static access without DI there is `Yiisoft\Db\Connection\ConnectionProvider::get(string $name = ConnectionProvider::DEFAULT): ConnectionInterface`.

---

## 5. Database Commands & Batch Insert (`yiisoft/db`)
```php
namespace Yiisoft\Db\Command;

use Yiisoft\Db\Expression\ExpressionInterface;
use Yiisoft\Db\Query\QueryInterface;

interface CommandInterface
{
    public function insert(string $table, array|QueryInterface $columns): static;
    public function insertBatch(string $table, iterable $rows, array $columns = []): static;
    public function update(
        string $table,
        array $columns,
        array|ExpressionInterface|string $condition = '',
        array|ExpressionInterface|string|null $from = null,
        array $params = [],
    ): static;
    public function delete(string $table, array|string $condition = '', array $params = []): static;
    public function upsert(string $table, array|QueryInterface $insertColumns, array|bool $updateColumns = true): static;
    public function execute(): int;
    public function queryAll(): array;
    public function queryOne(): ?array;
    public function queryScalar(): bool|string|int|float|null;
}
```
**Usage:**
```php
declare(strict_types=1);

$db->createCommand()
   ->insertBatch(table: 'product', rows: [['Widget A', 100], ['Widget B', 200]], columns: ['title', 'price'])
   ->execute();

$db->createCommand()
   ->upsert('product', ['title' => 'Widget A', 'price' => 120])
   ->execute();
```
> Notes:
> - `insertBatch()` takes `rows` before `columns`; the legacy insert-many command method (columns before rows) known from Yii 2 does not exist in `yiisoft/db`, and the same-named `MigrationBuilder::batchInsert()` is deprecated — use `insertBatch()`.
> - `upsert()` has exactly 3 parameters — there is no `$params` argument.
> - `queryScalar()` returns `false` when no value is found.
> - `Query` requires a connection in its constructor: `new Query($db)` (with `__construct(protected ConnectionInterface $db)`). Calling `where()` twice on the same query throws `LogicException`.
> - `insertReturningPks()` exists but is flagged unstable in its own docblock ("use only as a last resort").

---

## 6. Migrations (`yiisoft/db-migration`)
```php
namespace Yiisoft\Db\Migration;

use Yiisoft\Db\Schema\Column\ColumnInterface;

final class MigrationBuilder
{
    public function createTable(string $table, array $columns, ?string $options = null): void;
    public function dropTable(string $table): void;
    public function addColumn(string $table, string $column, ColumnInterface|string $type): void;
    public function dropColumn(string $table, string $column): void;
    public function createIndex(string $table, string $name, array|string $columns, ?string $indexType = null, ?string $indexMethod = null): void;
    public function dropIndex(string $table, string $name): void;
    public function addForeignKey(string $table, string $name, array|string $columns, string $referenceTable, array|string $referenceColumns, ?string $delete = null, ?string $update = null): void;
    public function dropForeignKey(string $table, string $name): void;
    public function insertBatch(string $table, iterable $rows, array $columns = []): void;
    /** @deprecated Use {@see insertBatch()} instead. */
    public function batchInsert(string $table, array $columns, iterable $rows): void;
}
```
Migration file contracts (there is NO base `Migration` class):
```php
namespace Yiisoft\Db\Migration;

interface MigrationInterface
{
    public function up(MigrationBuilder $b): void;
}

interface RevertibleMigrationInterface extends MigrationInterface
{
    public function down(MigrationBuilder $b): void;
}

interface TransactionalMigrationInterface extends MigrationInterface
{
}
```
> Notes:
> - `MigrationBuilder::batchInsert()` (columns before rows) is deprecated — use `insertBatch()` (rows before columns).
> - Migrations implement `MigrationInterface` or `RevertibleMigrationInterface`; they are wrapped in a DB transaction only when they additionally implement the marker `TransactionalMigrationInterface`.
> - `dropIndex()` silently skips a missing index — no error is thrown.
> - FK `$delete` / `$update` arguments accept `ReferentialAction::*` values (e.g. `ReferentialAction::CASCADE`); the only `IndexType` constant is `IndexType::UNIQUE`. Generator naming conventions: index `idx-$table-$column`, FK `fk-$table-$column`.

**Usage:**
```php
declare(strict_types=1);

use Yiisoft\Db\Constant\ColumnType;
use Yiisoft\Db\Constant\PseudoType;
use Yiisoft\Db\Constant\ReferentialAction;

$b->createTable('{{%order}}', [
    'id' => PseudoType::PK,
    'user_id' => ColumnType::INTEGER . ' NOT NULL',
    'total' => ColumnType::DECIMAL . '(10,2) NOT NULL',
    'created_at' => ColumnType::TIMESTAMP . ' NOT NULL',
]);

$b->addForeignKey(
    table: 'order',
    name: 'fk-order-user_id',
    columns: 'user_id',
    referenceTable: '{{%user}}',
    referenceColumns: 'id',
    delete: ReferentialAction::CASCADE,
);
```

---

## 7. Current User & Permissions (`yiisoft/user`)
```php
namespace Yiisoft\User;

use Psr\EventDispatcher\EventDispatcherInterface;
use Yiisoft\Access\AccessCheckerInterface;
use Yiisoft\Auth\IdentityInterface;
use Yiisoft\Auth\IdentityRepositoryInterface;
use Yiisoft\Session\SessionInterface;
use Yiisoft\User\Guest\GuestIdentityFactoryInterface;

final class CurrentUser
{
    public function __construct(
        IdentityRepositoryInterface $identityRepository,
        EventDispatcherInterface $eventDispatcher,
        ?GuestIdentityFactoryInterface $guestIdentityFactory = null,
    );

    public function getIdentity(): IdentityInterface;
    public function getId(): ?string;
    public function isGuest(): bool;
    public function can(string|BackedEnum $permissionName, array $params = []): bool;
    public function login(IdentityInterface $identity): bool;
    public function logout(): bool;

    public function withSession(SessionInterface $session): self;
    public function withAccessChecker(AccessCheckerInterface $accessChecker): self;
    public function withAuthTimeout(int $timeout): self;
    public function withAbsoluteAuthTimeout(int $timeout): self;
}
```
> Pitfalls:
> - `can()` ALWAYS returns `false` unless an access checker is provided via `withAccessChecker()`.
> - `login()` accepts the identity only — there is NO duration overload (the Yii 2 muscle-memory call `login($identity, 3600)` does not exist). Configure timeouts immutably via `withAuthTimeout()` / `withAbsoluteAuthTimeout()`.
> - `getIdentity()` never returns null — a guest fallback identity is returned when not logged in.
> - `Yiisoft\User\UserAuth` is `@deprecated` — use `Yiisoft\User\Method\WebAuth` (or `Yiisoft\User\Method\ApiAuth`).

**Usage:**
```php
declare(strict_types=1);

use Yiisoft\Http\Status;

if (!$this->currentUser->can('editPost', ['authorId' => $post->getAuthorId()])) {
    return $this->responseFactory->createResponse(['message' => 'Forbidden'], Status::FORBIDDEN);
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
        ?string $hash = null,
        ?string $scheme = null,
        ?string $host = null,
    ): string;

    public function generateFromCurrent(
        array $replacedArguments,
        array $queryParameters = [],
        ?string $hash = null,
        ?string $fallbackRouteName = null,
    ): string;
}
```
> Notes:
> - Unused route arguments are moved to query parameters automatically.
> - An unknown route name throws `RouteNotFoundException`.
> - `generateFromCurrent()` keeps the current route arguments and replaces the given ones.

**Usage:**
```php
declare(strict_types=1);

$url = $this->urlGenerator->generate('order.view', ['id' => $orderId]);
```

---

## 9. HTTP Routes & Groups (`yiisoft/router`)
```php
namespace Yiisoft\Router;

class Route implements Stringable
{
    /** @deprecated Use new \Yiisoft\Router\Route\Get() instead. */
    public static function get(string $pattern): self;
    /** @deprecated Use new \Yiisoft\Router\Route\Post() instead. */
    public static function post(string $pattern): self;
    /** @deprecated Use new \Yiisoft\Router\Route\Put() instead. */
    public static function put(string $pattern): self;
    /** @deprecated Use new \Yiisoft\Router\Route\Delete() instead. */
    public static function delete(string $pattern): self;
    /** @deprecated Use new \Yiisoft\Router\Route\Patch() instead. */
    public static function patch(string $pattern): self;
    /** @deprecated Use new \Yiisoft\Router\Route\Head() instead. */
    public static function head(string $pattern): self;
    /** @deprecated Use new \Yiisoft\Router\Route\Options() instead. */
    public static function options(string $pattern): self;
    /** @deprecated Use new Route(pattern: $pattern, methods: $methods) instead. */
    public static function methods(array $methods, string $pattern): self;

    public function action(array|callable|string $middlewareDefinition): self;
    public function name(string|BackedEnum $name): self;
    public function middleware(array|callable|string ...$definition): self;
}

final class Group
{
    public function __construct(
        ?string $prefix = null,
        array $routes = [],
        array $middlewares = [],
        array $hosts = [],
        ?string $namePrefix = null,
        array $disabledMiddlewares = [],
        array|callable|string|null $corsMiddleware = null,
    );
    /** @deprecated Use new Group() instead. */
    public static function create(?string $prefix = null): self;
    public function routes(Group|Route ...$routes): self;
    public function middleware(array|callable|string ...$definition): self;
    public function namePrefix(string $namePrefix): self;
    public function withCors(array|callable|string|null $middlewareDefinition): self;
}
```
Modern verb factory (`Yiisoft\Router\Route\Get`; siblings `Post`, `Put`, `Delete`, `Patch`, `Head`, `Options`):
```php
namespace Yiisoft\Router\Route;

final class Get extends Route
{
    public function __construct(
        string $pattern,
        ?string $name = null,
        array|callable|string|null $action = null,
        array $middlewares = [],
        array $defaults = [],
        array $hosts = [],
        bool $override = false,
        array $disabledMiddlewares = [],
    );
}
```
**Modern route declaration** (static factories above are deprecated since router 4.0.3; in older installed versions they are equivalent):
```php
declare(strict_types=1);

use App\Presentation\Action\User\ViewUserAction;
use Yiisoft\Router\Route\Get;

(new Get('/users/{id:\d+}'))->action(ViewUserAction::class)->name('user.view');
```
> Notes:
> - Trap: middleware appended via `->middleware()` AFTER `->action()` is still inserted BEFORE the action in the final middleware stack.
> - Register routes via `RouteCollector::addRoute(Route|Group ...$routes)` — variadic, the single registration entry point since 4.0.0 (`addGroup()` was removed).
> - `Route::methods()` throws `LogicException` when called on a subclass of `Route` — factories must use the constructor.
> - Pattern constraint syntax such as `{id:\d+}` is adapter-dependent.

---

## 10. Current Route Arguments (`yiisoft/router`)
```php
namespace Yiisoft\Router;

use Psr\Http\Message\UriInterface;

final class CurrentRoute
{
    public function getName(): ?string;
    public function getArgument(string $name, ?string $default = null): ?string;
    public function getArguments(): array;
    public function getHost(): ?string;
    public function getPattern(): ?string;
    public function getMethods(): ?array;
    public function getUri(): ?UriInterface;
}
```
> Note: `getMethod()` (singular) does NOT exist — only the plural `getMethods()`.

**Usage in Action:**
```php
declare(strict_types=1);

use Psr\Http\Message\ResponseInterface;
use Yiisoft\Router\CurrentRoute;

public function __invoke(CurrentRoute $currentRoute): ResponseInterface
{
    $id = (int) $currentRoute->getArgument('id');
}
```

---

## 11. HTML View Renderer (`yiisoft/yii-view-renderer`)
```php
namespace Yiisoft\Yii\View\Renderer;

use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\StreamFactoryInterface;
use Yiisoft\Aliases\Aliases;
use Yiisoft\View\WebView;
use Yiisoft\Yii\View\Renderer\InjectionContainer\InjectionContainerInterface;

final class WebViewRenderer implements ViewContextInterface
{
    public function __construct(
        ResponseFactoryInterface $responseFactory,
        StreamFactoryInterface $streamFactory,
        Aliases $aliases,
        WebView $view,
        ?string $viewPath = null,
        ?string $layout = null,
        array $injections = [],
        ?InjectionContainerInterface $injectionContainer = null,
        string $contentType = 'text/html',
        string $encoding = 'UTF-8',
    );

    public function render(string $view, array $parameters = []): ResponseInterface;
    public function renderPartial(string $view, array $parameters = []): ResponseInterface;
    public function renderAsString(string $view, array $parameters = []): string;
    public function renderPartialAsString(string $view, array $parameters = []): string;

    public function withController(object $controller): self;
    public function withControllerName(string $name): self;
    public function withViewPath(string $viewPath): self;
    public function withLayout(?string $layout): self;
    public function withLocale(string $locale): self;
    public function withContentType(string $contentType): self;
    public function withEncoding(string $encoding): self;
    public function withInjections(object|string ...$injections): self;
    public function withAddedInjections(object|string ...$injections): self;
}
```
> Notes:
> - The old `ViewRenderer` is `@deprecated` since 7.4.0 — use `WebViewRenderer`. On the deprecated renderer `render()` / `renderPartial()` returned `DataResponse`; on `WebViewRenderer` they return `ResponseInterface`.
> - `Yiisoft\DataResponse\DataResponse` is `@deprecated` (use `DataStream`) — actions may still declare `ResponseInterface` as their return type.
> - The concrete object returned by `render()` is `@internal` (`ViewResponse`) — always type actions against `ResponseInterface`.
> - Rendering is deferred until the response body is read; failures surface at body-read time, not at the `render()` call. `renderAsString()` / `renderPartialAsString()` render immediately.
> - `withLayout(null)` disables the layout; `renderPartial()` renders without the layout. `getViewPath(): string` throws `LogicException` when no view path is set.

**Usage in Action:**
```php
declare(strict_types=1);

use Psr\Http\Message\ResponseInterface;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

public function index(WebViewRenderer $viewRenderer): ResponseInterface
{
    return $viewRenderer->render('index', ['products' => $products]);
}
```

---

## 12. Console Exit Codes (`yiisoft/yii-console`)
```php
namespace Yiisoft\Yii\Console;

/** @final */
class ExitCode
{
    public const OK = 0;
    public const UNSPECIFIED_ERROR = 1;
    public const USAGE = 64;
    public const DATAERR = 65;
    public const NOINPUT = 66;
    public const NOUSER = 67;
    public const NOHOST = 68;
    public const UNAVAILABLE = 69;
    public const SOFTWARE = 70;
    public const OSERR = 71;
    public const OSFILE = 72;
    public const CANTCREAT = 73;
    public const IOERR = 74;
    public const TEMPFAIL = 75;
    public const PROTOCOL = 76;
    public const NOPERM = 77;
    public const CONFIG = 78;
}
```
Also on the class: `public static array $reasons` (exit-code to description map) and `public static function getReason(int $exitCode): string` (returns "Unknown exit code" for unlisted codes).
**Usage in Console Command:**
```php
declare(strict_types=1);

use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Yiisoft\Yii\Console\ExitCode;

#[AsCommand(name: 'app:greet', description: 'Greets the user.')]
final class GreetCommand extends Command
{
    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        return ExitCode::OK;
    }
}
```
> Notes:
> - `ExitCode` is `@final` — do not extend it despite the missing `final` keyword.
> - The `execute()` override idiom above is the pattern used by official commands; the base declaration lives in Symfony Console — verify it against `vendor/symfony/console/` (`Symfony\Component\Console\Command\Command`).
> - Command classes are `final` classes extending `Symfony\Component\Console\Command\Command`, registered with the `#[AsCommand]` attribute (`name` + `description`).

---

## 13. PSR-7 Uploaded Files (`Psr\Http\Message`)
```php
namespace Psr\Http\Message;

/**
 * Standard PSR-7 uploaded-file contract. Yii3 code receives implementations through the nested
 * array returned by ServerRequestInterface::getUploadedFiles().
 *
 * NOTE: PSR-7 is an external standard outside the verified yiisoft/* sources — the exact
 * method declarations below follow the PSR-7 standard surface and MUST be verified against
 * the installed package: vendor/psr/http-message/src/UploadedFileInterface.php
 */
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
declare(strict_types=1);

use Psr\Http\Message\UploadedFileInterface;

/** @var array<string, UploadedFileInterface> $files */
$files = $request->getUploadedFiles();
$avatar = $files['avatar'] ?? null;
```
> Notes:
> - `getUploadedFiles()` returns a plain (possibly nested) PHP array keyed by form field name with `UploadedFileInterface` values — nested field names produce nested arrays.
> - Sibling FQCNs in use across Yii3 packages: `Psr\Http\Message\ServerRequestInterface`, `Psr\Http\Message\ResponseInterface`, `Psr\Http\Message\StreamInterface`.

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
declare(strict_types=1);

use Yiisoft\Rbac\Item;
use Yiisoft\Rbac\RuleContext;
use Yiisoft\Rbac\RuleInterface;

final readonly class AuthorRule implements RuleInterface
{
    public function execute(?string $userId, Item $item, RuleContext $context): bool
    {
        $authorId = $context->getParameterValue('authorId');

        return $userId !== null && $userId === (string) $authorId;
    }
}
```
> Notes:
> - `Item` is an `abstract class` and `RuleContext` is `final` — both live in `Yiisoft\Rbac` (no extra imports needed inside the same namespace).
> - `RuleContext::getParameterValue(string $name): mixed` returns `mixed`; `$userId` is `?string`, so compare against the string-cast value.

---

## 15. PSR-14 Event Dispatcher (`Psr\EventDispatcher`)
```php
namespace Psr\EventDispatcher;

interface EventDispatcherInterface
{
    /**
     * The PSR interface itself declares the result via a docblock only (`@return object`) —
     * implementable without a native return type.
     */
    public function dispatch(object $event);
}
```
Effective contract per the official implementation (`vendor/yiisoft/event-dispatcher/src/Dispatcher/Dispatcher.php`):
```php
namespace Yiisoft\EventDispatcher\Dispatcher;

use Psr\EventDispatcher\ListenerProviderInterface;

final class Dispatcher implements EventDispatcherInterface
{
    public function __construct(private ListenerProviderInterface $listenerProvider);

    public function dispatch(object $event): object;
}
```
> Notes:
> - Do not type the native `: object` return against the PSR interface declaration — attribute it to `Yiisoft\EventDispatcher\Dispatcher\Dispatcher`.
> - Companion PSR-14 interfaces in use: `ListenerProviderInterface` (`getListenersForEvent(object $event): iterable`) and `StoppableEventInterface` (checked in the dispatch loop).

**Usage in Use Case:**
```php
declare(strict_types=1);

$this->eventDispatcher->dispatch(new OrderCreatedEvent($order->getId()));
```

---

## 16. Dependency Injection (`yiisoft/di` + `psr/container`)
```php
namespace Yiisoft\Di;

use Psr\Container\ContainerInterface;

final class Container implements ContainerInterface
{
    public function __construct(?ContainerConfigInterface $config = null);

    /** Resolved instances are cached — one shared instance per container. */
    public function get(string $id);
    public function has(string $id): bool;
}
```
> Notes:
> - Type-hint generated constructors with `Psr\Container\ContainerInterface` (PSR-11), NOT `Yiisoft\Di\Container`. The verbatim PSR-11 interface declaration is not reproduced here — verify it in `vendor/psr/container/src/ContainerInterface.php`.
> - `#[Injectable]` does NOT exist in `yiisoft/di` — constructor autowiring is implicit; never generate this attribute.
> - Definition-array forms: class-string map, array definition (`'class'`, `'__construct()'` with named arguments, `'$property'`, `'method()'`), closures, objects. The key is `'class'` (there is no `'__class'` key); a definition missing `'class'` throws `InvalidConfigException`.
> - `Reference::to()` / `Reference::optional()` live in `Yiisoft\Definitions\Reference` (package `yiisoft/definitions`), not in `yiisoft/di`.
> - `ContainerConfig` has a private constructor — start with `ContainerConfig::create()` and chain `withDefinitions()`, `withProviders()`, `withTags()`, `withValidate()`, `withDelegates()`, `withStrictMode()`.

**Usage:**
```php
declare(strict_types=1);

use Yiisoft\Di\Container;
use Yiisoft\Di\ContainerConfig;
use Yiisoft\Validator\Validator;
use Yiisoft\Validator\ValidatorInterface;

$config = ContainerConfig::create()
    ->withDefinitions([
        ValidatorInterface::class => Validator::class,
    ]);

$container = new Container($config);
$validator = $container->get(ValidatorInterface::class);
```

---

## 17. Cache (`yiisoft/cache`)
```php
namespace Yiisoft\Cache;

use DateInterval;
use Yiisoft\Cache\Dependency\Dependency;

interface CacheInterface
{
    public function psr(): \Psr\SimpleCache\CacheInterface;

    public function getOrSet(
        mixed $key,
        callable $callable,
        DateInterval|int|null $ttl = null,
        ?Dependency $dependency = null,
        float $beta = 1.0,
    );

    public function remove(mixed $key): void;
}
```
> Notes:
> - `CacheInterface` does NOT extend PSR-16 — it is a wrapper around `\Psr\SimpleCache\CacheInterface` with stampede prevention ("Probably early expiration").
> - `getOrSet()` has NO native return type (`@return mixed` in the docblock) — do not add `: mixed` when implementing; the callable receives the PSR-16 handler.
> - Pitfall: `ArrayCache` / `NullCache` implement `Psr\SimpleCache\CacheInterface`, NOT `Yiisoft\Cache\CacheInterface` — they must be wrapped: `new Cache(new ArrayCache())`.
> - `final class Cache` ctor: `new Cache(\Psr\SimpleCache\CacheInterface $handler, Ttl|DateInterval|int|null $defaultTtl = null)`; a `null` TTL means cache forever.
> - Composite array keys are allowed; the `Ttl` value object (`Ttl::seconds()`, `minutes()`, `hours()`, `days()`, `forever()`, `from()`) is accepted only by the constructor. `TagDependency` supports tag-based invalidation.

**Usage:**
```php
declare(strict_types=1);

use Psr\SimpleCache\CacheInterface;
use Yiisoft\Cache\ArrayCache;
use Yiisoft\Cache\Cache;

$cache = new Cache(new ArrayCache());

$data = $cache->getOrSet(
    ['top-products', 10],
    function (CacheInterface $cache): array {
        return $this->findTopProducts(10);
    },
    3600,
);

$cache->remove(['top-products', 10]);
```

---

## 18. Mailer (`yiisoft/mailer`)
```php
namespace Yiisoft\Mailer;

interface MailerInterface
{
    public function send(MessageInterface $message): void;
    public function sendMultiple(array $messages): SendResults;
}
```
```php
namespace Yiisoft\Mailer;

interface MessageInterface extends Stringable
{
    public function withFrom(array|string|null $from): static;
    public function withTo(array|string|null $to): static;
    public function withSubject(?string $subject): static;
    public function withTextBody(?string $text): static;
    public function withHtmlBody(?string $html): static;
    public function withAttachments(File ...$files): static;
    public function withHeader(string $name, string|array $value): static;
}
```
> Notes:
> - `with*` methods are immutable — they return a new instance and MUST be reassigned.
> - Addresses may be `[email => name]` arrays.
> - `sendMultiple()` collects failures into `SendResults` instead of throwing.
> - `withAttachments()` is variadic `File` objects and is `@no-named-arguments`. `File` has a private constructor — create files only via `File::fromPath()` / `File::fromContent()`.
> - `final class Message` has an all-optional constructor, but the canonical construction is the `with*` chain; `NullMailer` / `StubMailer` are available for tests.

**Usage:**
```php
declare(strict_types=1);

use Yiisoft\Mailer\Message;

$message = (new Message())
    ->withFrom('noreply@example.com')
    ->withTo('user@example.com')
    ->withSubject('Welcome!')
    ->withTextBody('Hello and welcome!');

$this->mailer->send($message);
```

---

## 19. Session (`yiisoft/session`)
```php
namespace Yiisoft\Session;

interface SessionInterface
{
    public function get(string $key, $default = null);
    public function set(string $key, $value): void;
    public function pull(string $key, $default = null);
    public function close(): void;
    public function open(): void;
    public function isActive(): bool;
    public function getId(): ?string;
    public function regenerateId(): void;
    public function has(string $key): bool;
    public function remove(string $key): void;
    public function clear(): void;
    public function destroy(): void;
    public function getCookieParameters(): array;
}
```
> Notes:
> - `get()`, `set()`, `pull()` are intentionally untyped in the source — reproduce them exactly when implementing the interface.
> - Session is obtained via DI injection of `SessionInterface`, NOT via request attributes.
> - `final class Session` ctor: `new Session(array $options = [], ?SessionHandlerInterface $handler = null)`; `final class SessionMiddleware` (ctor `(SessionInterface $session)`) reads the session cookie and commits the `Set-Cookie` header on close.
> - Canonical pipeline order: `ErrorCatcher` → `SessionMiddleware` → `CsrfTokenMiddleware` → `Router`.
> - Flash API lives in `Yiisoft\Session\Flash` (`FlashInterface`: `set()`, `add()`, `get()`, `getAll()`, `has()`, `remove()`, `removeAll()`); `final class Flash` ctor: `(SessionInterface $session)`.

**Usage:**
```php
declare(strict_types=1);

use Yiisoft\Session\SessionInterface;

// Inject SessionInterface via DI (constructor or method injection):
$session->set('lastVisit', time());
$lastVisit = $session->get('lastVisit');
$flash = $session->pull('flash_message');
```

---

## 20. CSRF Protection (`yiisoft/csrf`)
```php
namespace Yiisoft\Csrf;

use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class CsrfTokenMiddleware implements MiddlewareInterface
{
    public const PARAMETER_NAME = '_csrf';
    public const HEADER_NAME = 'X-CSRF-Token';

    public function __construct(
        ResponseFactoryInterface $responseFactory,
        CsrfTokenInterface $token,
        ?RequestHandlerInterface $failureHandler = null,
    );
}
```
```php
namespace Yiisoft\Csrf;

interface CsrfTokenInterface
{
    public function getValue(): string;
    public function validate(string $token): bool;
}
```
> Notes:
> - `CsrfMiddleware` is `@deprecated` (since 2.2.0) — the canonical middleware is `CsrfTokenMiddleware`.
> - The token is read from the parsed body (`PARAMETER_NAME`) first, then from the header (`HEADER_NAME`). Safe methods (GET, HEAD, OPTIONS) skip validation; failure returns 422 unless a `failureHandler` is provided.
> - Default DI pipeline: `CsrfTokenInterface` → `MaskedCsrfToken(SynchronizerCsrfToken(RandomCsrfTokenGenerator, SessionCsrfTokenStorage))`; a stateless variant `Yiisoft\Csrf\Hmac\HmacCsrfToken` exists.

**Usage:**
```php
declare(strict_types=1);

use Yiisoft\Csrf\CsrfTokenInterface;

$token = $this->csrfToken->getValue();
```

---

## 21. Security (`yiisoft/security`)
```php
namespace Yiisoft\Security;

final class PasswordHasher
{
    public function __construct(
        ?string $algorithm = PASSWORD_DEFAULT,
        ?array $parameters = null,
    );

    public function hash(string $password): string;
    public function validate(string $password, string $hash): bool;
    public function needsRehash(string $hash): bool;
}
```
> Notes:
> - There is NO `PasswordHasherInterface` in `yiisoft/security` — type-hint the concrete `final class PasswordHasher`.
> - `validate()` throws `InvalidArgumentException` on an empty password; `hash()`, `validate()`, `needsRehash()` are `#[SensitiveParameter]`-annotated.
> - Also in the package: `Random::string(int $length = 32): string` (static), `Crypt` (requires ext-openssl; `encryptByPassword`/`encryptByKey`/`decryptByPassword`/`decryptByKey`), `Mac::sign()`/`getMessage()`, `TokenMask::apply()`/`remove()`.

**Usage:**
```php
declare(strict_types=1);

use Yiisoft\Security\PasswordHasher;

$hasher = new PasswordHasher();
$hash = $hasher->hash($password);

if (!$hasher->validate($password, $hash)) {
    // invalid credentials
}
```

---

## 22. Middleware & PSR-15 (`yiisoft/middleware-dispatcher`)
```php
namespace Psr\Http\Server;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

interface MiddlewareInterface
{
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface;
}

interface RequestHandlerInterface
{
    public function handle(ServerRequestInterface $request): ResponseInterface;
}
```
```php
namespace Yiisoft\Middleware\Dispatcher;

use Psr\EventDispatcher\EventDispatcherInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class MiddlewareDispatcher
{
    public function __construct(
        MiddlewareFactory $middlewareFactory,
        ?EventDispatcherInterface $eventDispatcher = null,
        array $middlewareDefinitions = [],
    );

    public function dispatch(ServerRequestInterface $request, RequestHandlerInterface $fallbackHandler): ResponseInterface;
}
```
> Notes:
> - The dispatcher class is `Yiisoft\Middleware\Dispatcher\MiddlewareDispatcher` — there is NO `Yiisoft\Middleware\Dispatcher\Dispatcher`.
> - `withMiddlewares()` is `@deprecated` since 5.5.0 — pass middleware definitions to the constructor. An empty pipeline throws `RuntimeException` ("Stack is empty.").
> - `MiddlewareFactory::create(array|callable|string $middlewareDefinition): MiddlewareInterface` accepts PSR-15 class names, handler/invokable class names, callables (including `[Controller::class, 'action']`), array definitions, and container aliases; an invalid definition throws `InvalidMiddlewareDefinitionException`.
> - The first-specified middleware executes first; a middleware that does not call `$handler->handle($request)` short-circuits the pipeline.
> - Actions and callables are invoked through `Yiisoft\Injector\Injector`: `(new Injector($container))->invoke($callback, $parameters)`. `invoke()` has NO native return type — do not write `: mixed`; `Injector::make(string $class, array $arguments = []): object`.

**Usage:**
```php
declare(strict_types=1);

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class SecurityHeadersMiddleware implements MiddlewareInterface
{
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        return $handler->handle($request)->withHeader('X-Frame-Options', 'DENY');
    }
}
```

---

## 23. Authentication (`yiisoft/auth`)
```php
namespace Yiisoft\Auth;

interface IdentityInterface
{
    public function getId(): ?string;
}

interface IdentityRepositoryInterface
{
    public function findIdentity(string $id): ?IdentityInterface;
}

interface IdentityWithTokenRepositoryInterface
{
    public function findIdentityByToken(string $token, ?string $type = null): ?IdentityInterface;
}
```
```php
namespace Yiisoft\Auth;

use Psr\Http\Message\ServerRequestInterface;

interface AuthenticatorInterface
{
    public function authenticate(ServerRequestInterface $request): ?IdentityInterface;
}

interface AuthenticatorWithChallengeInterface extends AuthenticatorInterface
{
    public function challenge(ResponseInterface $response): ResponseInterface;
}
```
> Notes:
> - `findIdentity()` takes a STRING id — cast numeric DB keys before lookup.
> - `AuthenticationMethodInterface` is `@deprecated` — implement `AuthenticatorInterface` (or `AuthenticatorWithChallengeInterface` when a challenge is needed on failure).
> - The PSR-15 middleware `Yiisoft\Auth\Middleware\Authentication` stores the identity as a request attribute keyed by its own class name; the default failure handler responds with 401.
> - Concrete methods in `Yiisoft\Auth\Method`: `HttpBearer`, `HttpHeader` (default header `X-Api-Key`), `HttpBasic`, `HttpCookie`, `QueryParameter`, `Composite`.
> - In `yiisoft/user`: `WebAuth` is the current authenticator; `UserAuth` is `@deprecated`.

**Usage:**
```php
declare(strict_types=1);

use Yiisoft\Auth\IdentityInterface;
use Yiisoft\Auth\Middleware\Authentication;

/** @var IdentityInterface|null $identity */
$identity = $request->getAttribute(Authentication::class);
```

---

## 24. HTTP Status & Method Constants (`yiisoft/http`)
```php
namespace Yiisoft\Http;

final class Status
{
    public const OK = 200;
    public const CREATED = 201;
    public const NO_CONTENT = 204;
    public const MOVED_PERMANENTLY = 301;
    public const FOUND = 302;
    public const BAD_REQUEST = 400;
    public const UNAUTHORIZED = 401;
    public const FORBIDDEN = 403;
    public const NOT_FOUND = 404;
    public const CONFLICT = 409;
    public const UNPROCESSABLE_ENTITY = 422;
    public const TOO_MANY_REQUESTS = 429;
    public const INTERNAL_SERVER_ERROR = 500;
    public const SERVICE_UNAVAILABLE = 503;
}
```
> Notes:
> - `Status` is a plain final class of `public const` ints (not an enum); the full set is 62 constants plus the `Status::TEXTS` reason-phrase map — see `vendor/yiisoft/http/src/Status.php`.
> - Name traps: `Status::CONTINUE` (not `CONTINUE_`) and `RANGE_UNSATISFIABLE`.
> - `Method` is a final class of string constants (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`, `QUERY`). `Method::ANY` is `@deprecated` — use `Method::ALL` (which excludes `QUERY`).
> - `Header` provides ~99 header-name constants (e.g. `Header::AUTHORIZATION`, `Header::CONTENT_TYPE`, `Header::ETAG`) for `withHeader(Header::XXX, $value)` calls; `ContentDispositionHeader::{ATTACHMENT, INLINE}` covers download dispositions.

**Usage:**
```php
declare(strict_types=1);

use Yiisoft\Http\Method;
use Yiisoft\Http\Status;

if ($request->getMethod() === Method::POST) {
    return $this->responseFactory->createResponse(['status' => 'created'], Status::CREATED);
}
```
