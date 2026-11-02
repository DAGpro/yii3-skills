# Yii3 Feature Decomposition Recipes

> Guides how to decompose high-level business feature requests into complete, idiomatic Yii3 architecture artifacts (Domain, Persistence, Use Cases, Presentation, Wiring, Tests).
>
> **Source of Truth:** For class signatures and interfaces, inspect the installed `vendor/yiisoft/<pkg>/src/`. Always decompose user business requests into the complete, layered artifact graph below.
>
> All complete class snippets carry `declare(strict_types=1);` and are grounded in installed package sources. APIs deprecated in current package versions are flagged inline with their replacements — see also [Section 7](#7-verified-pitfalls--deprecations).

---

## Table of Contents
- [1. Feature Archetypes](#1-feature-archetypes)
  - [Archetype A: State-Changing Business Process (e.g., checkout, registration, booking, payment)](#archetype-a-state-changing-business-process-eg-checkout-registration-booking-payment)
  - [Archetype B: Read / Query / Data Listing (e.g., catalog, user profile, analytics report)](#archetype-b-read--query--data-listing-eg-catalog-user-profile-analytics-report)
  - [Archetype C: Async / Background Job (e.g., CSV export, batch sync, notifications)](#archetype-c-async--background-job-eg-csv-export-batch-sync-notifications)
  - [Archetype D: Web Form / Interactive Page (HTML UI)](#archetype-d-web-form--interactive-page-html-ui)
  - [Archetype E: CLI / Console Command (e.g., data import, reindexing, cron cleanup)](#archetype-e-cli--console-command-eg-data-import-reindexing-cron-cleanup)
  - [Archetype F: RESTful Resource CRUD (Full API Lifecycle)](#archetype-f-restful-resource-crud-full-api-lifecycle)
  - [Archetype G: File Upload & Media Processing (e.g., avatar, document import, invoice PDF)](#archetype-g-file-upload--media-processing-eg-avatar-document-import-invoice-pdf)
- [2. Business Capability Inference](#2-business-capability-inference)
- [3. Authorization & RBAC Protocol (`yiisoft/rbac` + `yiisoft/user`)](#3-authorization--rbac-protocol-yiisoftrbac--yiisoftuser)
- [4. Persistence Strategy Selection (Plain DB vs Active Record vs Cycle)](#4-persistence-strategy-selection-plain-db-vs-active-record-vs-cycle)
  - [Post-Commit Event Dispatching Invariant](#post-commit-event-dispatching-invariant)
- [5. Layering & Directory Placement Rules](#5-layering--directory-placement-rules)
  - [Style 1: Vertical Slice (Feature-based, common in modern Yii3 apps)](#style-1-vertical-slice-feature-based-common-in-modern-yii3-apps)
  - [Style 2: Layered / Clean (Traditional)](#style-2-layered--clean-traditional)
- [6. Chain Integrity Checklist (No Missing Links)](#6-chain-integrity-checklist-no-missing-links)
- [7. Verified Pitfalls & Deprecations](#7-verified-pitfalls--deprecations)

---

## 1. Feature Archetypes

When a feature request arrives, classify it into an archetype:

### Archetype A: State-Changing Business Process (e.g., checkout, registration, booking, payment)
Creates or modifies domain state and involves side-effects.

**Required Artifact Graph:**
1. **Domain:**
   - **Entity / Aggregate / Value Objects:** Domain state and invariants (POPO or mapped entity).
   - **Domain Events:** PSR-14 event classes (e.g., `UserRegisteredEvent`, `OrderCreatedEvent`).
   - **Repository Interface:** Pure PHP interface (e.g., `OrderRepositoryInterface`), independent of storage/HTTP.
2. **Infrastructure / Persistence:**
   - **Migration:** `yiisoft/db-migration` migration class creating/altering tables.
   - **Repository Implementation:** Storage implementation using `yiisoft/db` (`ConnectionInterface`), ActiveRecord, or Cycle.
   - **External Clients / Adapters:** Mailer, SMS, payment gateway integrations (implementing domain/app interfaces).
3. **Application / Use Case:**
   - **Command / Use Case Service:** Coordinates transaction (`$db->transaction()`), calls repository, dispatches domain events via PSR-14 `EventDispatcherInterface`.
   - **Event Listeners / Handlers:** Handle side-effects asynchronously or detached (e.g., `SendWelcomeEmailListener` via `yiisoft/mailer`).
4. **Presentation / HTTP:**
   - **Input DTO:** Strongly-typed class with `Yiisoft\Validator\Rule\*` PHP attributes (note: the `Image`, `Date\*`, and `Type\*` rule families are nested one level deeper, e.g. `Yiisoft\Validator\Rule\Image\Image`).
   - **Single Action Handler:** Commonly an invokable class (`__invoke(ServerRequestInterface $request): ResponseInterface`) or a PSR-15 `RequestHandlerInterface` implementation.
     - *Responsibility:* Hydrate DTO (`yiisoft/hydrator`; the integrated HTTP path is `yiisoft/hydrator-validator` + `yiisoft/input-http`), validate (`yiisoft/validator`), call Use Case, return `ResponseInterface` via `Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface` (API) or `Yiisoft\Yii\View\Renderer\WebViewRenderer` (HTML; `ViewRenderer` is deprecated since yii-view-renderer 7.4.0).
     - *Anti-pattern:* Never put SQL queries, password hashing, or email sending directly inside the Action.
5. **Configuration & Wiring (Mandatory):**
   - **DI:** Bind `OrderRepositoryInterface => SqlOrderRepository` in `config/common/di/*.php`. Definition forms: `Interface::class => Class::class` or the full form `['class' => ..., '__construct()' => [...]]`.
   - **Events:** Map listeners in the events config group selected by the `'yiisoft/yii-event' => ['eventsConfigGroup' => ...]` param (`events-web` for HTTP, `events-console` for console; the canonical app template ships `'events' => []` and `'events-web' => ['$events']`). A file-based layout (e.g. `config/common/events.php`) works only if you also map that file into the `events` group in the app's root config plugin — the same way `'routes' => 'common/routes.php'` is mapped.
   - **Routes:** Register routes in `config/common/routes.php` (the only routes group in the canonical template — there is no `routes-web` group). Use version-aware route syntax — see Archetype F and the [Routing Guide](routes.md).

---

### Archetype B: Read / Query / Data Listing (e.g., catalog, user profile, analytics report)
Queries data without changing state; supports pagination, sorting, filters.

**Required Artifact Graph:**
1. **Query DTO:** Strongly typed filter/pagination parameters (rule attributes + `#[FromQuery]` — same DTO pattern as Archetype F).
2. **Read Service / Query Repository:** Read-only queries using `yiisoft/db` or `yiisoft/data` (`DataReaderInterface`, `OffsetPaginator`, `Sort`).
3. **Action:** Hydrates query parameters, calls Read Service, formats data.
4. **Presentation:**
   - API: `DataResponseFactoryInterface` with serialized data and paginator metadata.
   - Web: View template using `yiisoft/view` and the `Yiisoft\Yii\DataView\GridView\GridView` widget.
5. **Wiring:** Route in `config/common/routes.php`, bind the reader implementation in `config/common/di/*.php`.

**Reference read service (pagination + meta):**

```php
declare(strict_types=1);

namespace App\Catalog\Product;

use Yiisoft\Data\Paginator\OffsetPaginator;
use Yiisoft\Data\Reader\DataReaderInterface;

/**
 * Read service for product listings.
 *
 * $products is the DI-bound Yiisoft\Data\Reader\DataReaderInterface:
 * - DB source: yiisoft/data-db provides QueryDataReader(QueryInterface $query, ?Sort $sort = null, ...);
 * - In-memory source: Yiisoft\Data\Reader\Iterable\IterableDataReader
 *   (there is NO ArrayDataReader in yiisoft/data 2.x).
 */
final readonly class ProductListService
{
    public function __construct(
        private DataReaderInterface $products,
    ) {}

    /**
     * Pagination meta is application-composed (the paginator only exposes getters);
     * this is the canonical app-api demo shape.
     *
     * @return array{items: iterable, pageSize: int, currentPage: int, totalPages: int}
     */
    public function getList(int $currentPage = 1, int $pageSize = 10): array
    {
        $paginator = (new OffsetPaginator($this->products))
            ->withPageSize($pageSize)
            ->withCurrentPage($currentPage);

        return [
            // read(): iterable — throws PageNotFoundException on an out-of-range page
            // (map that to a 404 response in the action).
            'items' => $paginator->read(),
            'pageSize' => $paginator->getPageSize(),
            'currentPage' => $paginator->getCurrentPage(),
            'totalPages' => $paginator->getTotalPages(),
        ];
    }
}
```

**Sorting:** build a whitelist with `Sort::only([...])` (each config item is shaped `['asc' => ..., 'desc' => ..., 'default' => ...]`) and parse the client order string with `->withOrderString('-title')` (a `-` prefix means descending). Apply the sort where the reader is constructed — `yiisoft/data-db`'s `QueryDataReader` takes `?Sort $sort = null` as its second constructor argument. `Sort::any()` disables the whitelist; use it only for trusted/internal listings.

**API response composition** (fragment of an Archetype B list action):

```php
// Fragment of an Archetype B list action — the API response composition:
$list = $this->productListService->getList(currentPage: $page);
return $this->dataResponseFactory->createResponse($list, Status::OK); // Yiisoft\Http\Status
```

**Web listing:** render through `yiisoft/view` templates and the dataview widget — note the doubled sub-namespace: `Yiisoft\Yii\DataView\GridView\GridView::widget()->dataReader($paginator)->columns(new DataColumn(property: 'title', header: 'Title'))` (see the [Views & Widgets Guide](views-and-widgets.md)).

---

### Archetype C: Async / Background Job (e.g., CSV export, batch sync, notifications)
Deferred execution via queue.

**Required Artifact Graph:**
1. **Message / Job DTO:** Serializable data payload for queue (`yiisoft/queue`). Payloads are restricted to `bool|int|float|string|array|null` (recursively) — objects cannot travel through the queue.
2. **Job Handler:** Worker consuming message and calling the corresponding Use Case.
3. **Producer Action / Command:** Pushes message via `Yiisoft\Queue\QueueProducerInterface`.
4. **Wiring:** Register a queue adapter (`yiisoft/queue-amqp`, `yiisoft/queue-db`, or `yiisoft/queue-redis`) and the handler mapping in **params** (not DI definitions).

**Reference handler (consumer side):**

```php
declare(strict_types=1);

namespace App\Notification\Queue;

use App\Notification\SendWelcomeEmailUseCase;
use Yiisoft\Queue\Message\Handler\HandlerInterface;
use Yiisoft\Queue\Message\MessageInterface;

/**
 * Consumer-side job handler (Archetype C).
 * Class-string handlers registered in params must implement HandlerInterface.
 */
final class SendWelcomeEmailHandler implements HandlerInterface
{
    public function __construct(
        private SendWelcomeEmailUseCase $useCase, // application use case
    ) {}

    public function handle(MessageInterface $message): void
    {
        // Payloads are scalars/recursive arrays only (bool|int|float|string|array|null).
        $payload = $message->getPayload();
        if (is_array($payload)) {
            $this->useCase->handle((string) ($payload['userId'] ?? ''));
        }
    }
}
```

**Handler mapping (params key, not DI):**

```php
// config/common/params.php (or config/console/params.php for console-only apps) —
// the handler mapping is a params key of yiisoft/queue, not a DI definition:
'yiisoft/queue' => [
    'handlers' => [
        'send-welcome-email' => \App\Notification\Queue\SendWelcomeEmailHandler::class,
        // Callable form is also supported: 'generate-report' => [ReportHandler::class, 'handle'],
    ],
    'messages' => [],
    'middlewares-push' => [],
    'middlewares-consume' => [],
    'middlewares-fail' => [], // built-in middlewares: SendAgainMiddleware, ExponentialDelayMiddleware
],
```

**Push pattern (producer side):** inject `Yiisoft\Queue\QueueProducerInterface` and call `push(MessageInterface $message): MessageInterface`. Messages follow the `Yiisoft\Queue\Message\MessageInterface` factory contract `fromPayload(string $type, bool|int|float|string|array|null $payload): static`; check `vendor/yiisoft/queue/src/Message/` for the concrete message class in the installed version. Zero-config path: if the message type equals the handler FQCN, no `handlers` entry is needed. Track delivery with `status(string|int $id): MessageStatus` (`NOT_FOUND=0`, `WAITING=1`, `RESERVED=2`, `DONE=3`).

**Workers:** the consumer commands `queue:run`, `queue:listen`, and `queue:listen-all` are auto-registered under `'yiisoft/yii-console' => ['commands' => [...]]` by the queue package.

**Retry is NOT built into the core package:** configure the `middlewares-fail` list (built-in middlewares `SendAgainMiddleware`, `ExponentialDelayMiddleware`). Adapter notes: `queue-db` works with any `ConnectionInterface` (TTR default 300 s; ships the `queue` table migration), `queue-redis` requires ext-redis (a handler returning `true` acknowledges/deletes the message), `queue-amqp`'s `status()` throws `NotImplementedException` and delays require exchange settings. Adapters pin `yiisoft/queue` at dev-master — anchor wiring to the installed vendor versions (see the [Queue Jobs Guide](queue-jobs.md)).

---

### Archetype D: Web Form / Interactive Page (HTML UI)
Full-page rendering with forms and assets.

**Required Artifact Graph:**
1. **Form Model / Input DTO:** Form fields with validation rules (`yiisoft/form-model`).
2. **View & Layout:** `.php` templates using `yiisoft/view` / `yiisoft/yii-view-renderer` (default template extension is `.php`; templates are plain PHP scripts).
3. **Form Elements:** Model-bound field helpers via `yiisoft/form-model` (`Field::text(...)`, `Field::password(...)`, `Field::checkbox(...)`); `yiisoft/form` field widgets (`Yiisoft\Form\Field\*`: Text, Textarea, Checkbox, Select, File, Hidden, Email, Number, Password, SubmitButton, ErrorSummary, ...); `yiisoft/html` (`Yiisoft\Html`) is the low-level layer.
4. **Assets:** Bundle extending `Yiisoft\Assets\AssetBundle`.
5. **Action:** GET renders form, POST processes via Use Case.
6. **Wiring:** Route in `config/common/routes.php`; middleware stack — `Yiisoft\Session\SessionMiddleware` MUST precede the CSRF middleware; the active CSRF class is `Yiisoft\Csrf\CsrfTokenMiddleware` (`CsrfMiddleware` is `@deprecated` since csrf 2.2.0). Default DI wiring auto-applies the CSRF middleware via the config plugin; invalid tokens are rejected with `422` before the action runs.

**Reference form model (strict-fill rules apply):**

```php
declare(strict_types=1);

namespace App\User\Form;

use Yiisoft\Validator\Label;
use Yiisoft\FormModel\FormModel;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;

/**
 * Web form model (Archetype D).
 * Strict fill: only properties that carry validation rules are populated
 * from request data by default (#[Safe] opts a property out).
 */
final class SignupForm extends FormModel
{
    public function __construct(
        #[Label('Login')]
        #[Required]
        #[Length(min: 2, max: 64)]
        public ?string $login = null,
        #[Label('Password')]
        #[Required]
        #[Length(min: 8)]
        public ?string $password = null,
    ) {}
}
```

**Reference action (populate-and-validate round trip):**

```php
declare(strict_types=1);

namespace App\User\Action;

use App\User\Form\SignupForm;
use App\User\Signup\SignupUseCase;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\FormModel\FormHydrator;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

/**
 * Web form action (Archetype D): GET renders, POST processes.
 * POST requires the CSRF middleware to be active — invalid tokens are
 * rejected with 422 before this action runs.
 */
final readonly class SignupAction
{
    public function __construct(
        private FormHydrator $formHydrator,
        private WebViewRenderer $viewRenderer,
        private SignupUseCase $signup, // application use case
    ) {}

    public function __invoke(): ResponseInterface
    {
        $form = new SignupForm();

        if (!$this->formHydrator->populateFromPostAndValidate($form)) {
            // Re-render with errors: $form->getValidationResult() carries the Result.
            // withController($this) / withControllerName() scope the view path if needed.
            return $this->viewRenderer->render('user/signup', ['form' => $form]);
        }

        $this->signup->handle($form);

        return $this->viewRenderer->render('user/success');
    }
}
```

**Template fragment** (fragment of `templates/user/signup.php` — templates are plain `.php` scripts and output is NOT auto-escaped, so escape with `Html::encode()`):

```php
<!-- Fragment of templates/user/signup.php -->
<?php use Yiisoft\FormModel\Field; use Yiisoft\Html\Html; ?>
<form method="post">
    <!-- CSRF: the `csrf` view parameter (masked token) is injected by CsrfViewInjection;
         the middleware reads the token from the `_csrf` body param or the `X-CSRF-Token` header. -->
    <input type="hidden" name="_csrf" value="<?= Html::encode((string) $csrf) ?>">
    <?= Field::text($form, 'login') ?>
    <?= Field::password($form, 'password') ?>
    <button type="submit">Sign up</button>
</form>
```

Note: CSRF is not auto-embedded by `yiisoft/form` or `yiisoft/form-model` — the middleware plus the rendered token handle it (see the [Validation & Forms Guide](validation-and-forms.md) and the [HTTP State Guide](http-state.md)).

---

### Archetype E: CLI / Console Command (e.g., data import, reindexing, cron cleanup)
Processes background or maintenance tasks via command line interface (`yiisoft/yii-console`).

**Required Artifact Graph:**
1. **Console Command Class:**
   - Extends `Symfony\Component\Console\Command\Command` — there is NO Yii base command class in `yiisoft/yii-console/src/`; the real package commands are `final`.
   - Constructor injection of Use Cases / Services works (commands are resolved via the DI container); call `parent::__construct()` after promoted properties.
   - Arguments & options are configured in `configure()` (`addArgument('file', InputArgument::OPTIONAL, ...)`, `addOption('chunk', 'c', InputOption::VALUE_OPTIONAL, ...)`). `#[AsCommand]` sets **name/description only** (it is required in practice for lazy loading); the params-map command name overrides the attribute name.
   - Uses `new SymfonyStyle($input, $output)` for styled terminal I/O; methods observed in real package code: `title`, `section`, `note`, `writeln`, `table`, `success`, `warning`, `error`, `confirm`, `choice` (free-form ask goes through `QuestionHelper::ask()` per Symfony docs).
   - For batch/bulk processing:
     * Stream or chunk data (generators / `iterable`) to avoid out-of-memory. Verified streaming reads in `yiisoft/db`: `Query::batch(int $batchSize = 100): BatchQueryResultInterface` and `Query::each()`.
     * Terminal feedback: use the verified `SymfonyStyle` methods above; for a determinate progress bar, `Symfony\Component\Console\Helper\ProgressBar` is documented in the Symfony Console docs (symfony/console is a third-party dependency — verify against `vendor/symfony/console/`).
     * Execute bulk database writes via `insertBatch(string $table, iterable $rows, array $columns = []): static` + `execute(): int` (named arguments `table`, `rows`, `columns`). `$rows` accepts generators; the whole batch is ONE SQL statement — size the chunks yourself.
   - Returns `Yiisoft\Yii\Console\ExitCode::OK` or `ExitCode::UNSPECIFIED_ERROR` as the app-level convention (recommended, not strictly enforced: the full sysexits palette and `getReason()` exist, and ecosystem packages also use Symfony's `Command::SUCCESS`/`FAILURE`/`INVALID`).
   - *Anti-pattern:* Never put raw SQL queries or business algorithms directly inside the command; delegate to Use Cases.

**Reference command class** (Symfony Console imports follow the standard `Symfony\Component\Console\*` layout per Symfony docs — symfony/console is not re-exported by the yiisoft packages, so verify those exact class paths against `vendor/symfony/console/`):

```php
declare(strict_types=1);

namespace App\Catalog\Console;

use App\Catalog\Import\ImportProductsHandler;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Throwable;
use Yiisoft\Yii\Console\ExitCode;

#[AsCommand(name: 'catalog:import', description: 'Imports catalog rows in chunks')]
final class ImportCommand extends Command
{
    public function __construct(
        private readonly ImportProductsHandler $handler, // application use case
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addArgument('file', InputArgument::OPTIONAL, 'Path to the source file')
            ->addOption('chunk', 'c', InputOption::VALUE_OPTIONAL, 'Rows per bulk insert');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $io->title('Catalog import');

        try {
            // The handler streams data (yiisoft/db: Query::batch() / Query::each()) and issues
            // bulk writes per chunk:
            //   insertBatch(table: 'catalog_product', rows: $batchRows, columns: ['sku', 'title'])
            //     ->execute(): int  — the whole batch is ONE SQL statement; size chunks yourself.
            foreach ($this->handler->readChunks() as $batchRows) {
                $this->handler->importChunk($batchRows);
            }
        } catch (Throwable $exception) {
            $io->error($exception->getMessage());
            return ExitCode::UNSPECIFIED_ERROR;
        }

        $io->success('Import finished');
        return ExitCode::OK;
    }
}
```

2. **Wiring (Mandatory):**
   - Register in `config/console/params.php` (`config/params.php` for console-only projects; `config/common/params.php` is also valid and merged into the console params):
     ```php
     'yiisoft/yii-console' => [
         'commands' => [
             'catalog:import' => \App\Catalog\Console\ImportCommand::class,
         ],
     ],
     ```
     The `:` separator is the naming convention; alias/hidden syntax `'start|run|s|r'` is supported (see the [Commands Guide](commands.md)).

---

### Archetype F: RESTful Resource CRUD (Full API Lifecycle)
Exposes complete collection and resource management with standard HTTP semantics.

**Required Artifact Graph:**
1. **Actions (Single-Action Handlers):**
   - `ListAction`: Takes Query DTO with `#[FromQuery]` (`Yiisoft\Input\Http\Attribute\Data\FromQuery` — package `yiisoft/input-http`, class-level attribute); uses `Yiisoft\Data\Paginator\OffsetPaginator`; returns `200 OK` (`Status::OK`) with items and pagination meta (see Archetype B for the meta shape).
   - `ViewAction`: Takes path parameter ID; fetches entity via Repository; returns `200 OK` or throws/returns `404 Not Found`.
   - `CreateAction`: Takes Input DTO with `#[FromBody]` (`Yiisoft\Input\Http\Attribute\Data\FromBody` — package `yiisoft/input-http`, class-level attribute); validates; returns `422 Unprocessable Entity` with `$result->getErrorMessagesIndexedByProperty()` on error; on success calls Use Case and returns `201 Created` with a `Location` header (`Yiisoft\Http\Header::LOCATION`; headers are set afterwards via `->withHeader()` — the data-response factory takes no headers parameter).
   - `UpdateAction`: Takes path parameter ID and Input DTO; validates; calls Use Case; returns `200 OK` with updated resource.
   - `DeleteAction`: Takes path parameter ID; calls Use Case; returns `204 No Content`.
   - Use `Yiisoft\Http\Status` constants instead of raw integers.
2. **Nested Sub-Resources (e.g., `/api/orders/{orderId:\d+}/items`):**
   - Always verify parent existence in Use Case: if parent missing, throw Domain Exception -> Action maps to `404 Not Found`. (The router middleware itself delegates on no-match — the parent-missing 404 mapping is application logic in the action.)
   - Ensure transactional consistency when creating or updating items bound to the parent entity.
3. **DTO & Validation:**
   - Dedicated DTOs for Create and Update (if writable fields differ, preventing mass-assignment of IDs/timestamps). `yiisoft/form-model`'s strict fill (only properties with validation rules are populated) gives the same protection for web forms.
   - Strict PHP 8 attributes (`#[Required]`, `#[Length]`, `#[Regex]`, `#[Integer]` — all in `Yiisoft\Validator\Rule\`).
4. **Wiring:**
   - Route group in `config/common/routes.php` (`yiisoft/router` >= 4.0.3 constructor classes):
     ```php
     use Yiisoft\Router\Group;
     use Yiisoft\Router\Route\Delete;
     use Yiisoft\Router\Route\Get;
     use Yiisoft\Router\Route\Post;
     use Yiisoft\Router\Route\Put;

     new Group('/api/products')
         ->routes(
             (new Get(''))->action(ListProductsAction::class)->name('api.products.list'),
             (new Post(''))->action(CreateProductAction::class)->name('api.products.create'),
             (new Get('/{id:\d+}'))->action(ViewProductAction::class)->name('api.products.view'),
             (new Put('/{id:\d+}'))->action(UpdateProductAction::class)->name('api.products.update'),
             (new Delete('/{id:\d+}'))->action(DeleteProductAction::class)->name('api.products.delete'),
         );
     ```
     > **Version-aware route syntax.** The snippet uses the `yiisoft/router` >= 4.0.3 constructor
     > classes (`Yiisoft\Router\Route\Get|Post|Put|Delete|Patch|Head|Options`). On released <= 4.0.2
     > (pinned by the canonical app template, which itself uses them) those classes do not exist and
     > the static factories are the only API: `Group::create('/api/products')->routes(Route::get(...), ...)`.
     > On >= 4.0.3 the static factories `Route::get()`/`Route::post()` and `Group::create()` are `@deprecated`.
     > Discriminator: check whether `vendor/yiisoft/router/src/Route/Get.php` exists in the installed project.
     > Routes live in `config/common/routes.php` (the canonical template has no `routes-web` group); the
     > `routes` config group is consumed by DI, which builds `RouteCollectionInterface` via
     > `(new RouteCollector())->addRoute(...$config->get('routes'))` — see the [Routing Guide](routes.md).

---

### Archetype G: File Upload & Media Processing (e.g., avatar, document import, invoice PDF)
Processes multipart form-data uploads securely.

**Required Artifact Graph:**
1. **Input DTO:**
   - Uses PHP attribute `Yiisoft\Validator\Rule\File` (the image-dimension rule lives one level deeper: `Yiisoft\Validator\Rule\Image\Image`, with `width/height/minWidth/minHeight/maxWidth/maxHeight/aspectRatio` constraints — `extensions`/`maxSize` belong to `File`, not `Image`):
     ```php
     declare(strict_types=1);

     namespace App\Media\Api;

     use Psr\Http\Message\UploadedFileInterface;
     use Yiisoft\Validator\Rule\File;

     final readonly class UploadAvatarRequest
     {
         public function __construct(
             #[File(extensions: ['jpg', 'png', 'webp'], maxSize: 2 * 1024 * 1024)]
             public UploadedFileInterface $avatar,
         ) {}
     }
     ```
   - Rule details: `size` is mutually exclusive with `minSize`/`maxSize`; `trustClientMediaType` defaults to `false`; multiple files are validated with `Each(new File(...))`; an absent upload (`UPLOAD_ERR_NO_FILE`) is handled via `skipOnEmpty`.
2. **Storage Service (Infrastructure):** moves the uploaded file under a randomly generated name (`Yiisoft\Security\Random::string()` is a verified generator). Never trust the client filename.
3. **Action:**
   - Retrieves uploaded file from `$request->getUploadedFiles()['avatar']` (or via the per-parameter `#[UploadedFiles]` attribute — `Yiisoft\Input\Http\Attribute\Parameter\UploadedFiles`, whose resolver reads `getUploadedFiles()`).
   - Validates via `ValidatorInterface`, calls Use Case, returns response with file URL.

**Reference storage service:**

```php
declare(strict_types=1);

namespace App\Media\Storage;

use Psr\Http\Message\UploadedFileInterface;
use Yiisoft\Security\Random;

/**
 * Storage service (Archetype G). Never trust the client-supplied filename —
 * it is unvalidated user input (validators only use it as a message placeholder).
 */
final readonly class AvatarStorage
{
    public function __construct(
        private string $uploadDir, // wire the path via DI params
    ) {}

    public function store(UploadedFileInterface $uploadedFile): string
    {
        // Random::string(int $length = 32): string — static, base64url-safe [A-Za-z0-9_-]+
        $storedName = Random::string(32);

        // PSR-7 contract (psr/http-message): moveTo() moves the temporary upload to its
        // final destination. Verify the exact signature against vendor/psr/http-message/.
        $uploadedFile->moveTo($this->uploadDir . '/' . $storedName);

        return $storedName;
    }
}
```

**Action composition** (fragment):

```php
// Fragment of an upload action (Archetype G):
$uploadedFile = $request->getUploadedFiles()['avatar'] ?? null;
// validate the DTO (#[File] attributes) via ValidatorInterface, then delegate to the Use Case
// which hands the UploadedFileInterface to the storage service.
```

---

## 2. Business Capability Inference

Translate business terms in user requirements to corresponding Yii3 capabilities and packages:

| Business Need in User Prompt | Yii3 Capability Key | Required Packages | Key Interfaces & Classes |
|---|---|---|---|
| Passwords, hashing, tokens | `security` | `yiisoft/security` | `PasswordHasher`, `Random` |
| Email notifications, confirmation | `mail`, `events` | `yiisoft/mailer`, `yiisoft/mailer-symfony` (ships the `MailerInterface` binding), `yiisoft/yii-event` | `MailerInterface`, `MessageInterface`, `EventDispatcherInterface` |
| Tables, schema, DB storage | `db`, `migrations` | `yiisoft/db`, `yiisoft/db-migration`, plus ONE driver (`yiisoft/db-mysql` / `db-pgsql` / `db-sqlite` / `db-mssql` / `db-oracle`) | `ConnectionInterface`, `MigrationBuilder` |
| Form validation, payload validation | `validation`, `hydrator` | `yiisoft/validator`, `yiisoft/hydrator`, `yiisoft/hydrator-validator`, `yiisoft/input-http` | `ValidatorInterface`, `HydratorInterface`, rule attributes (`#[Required]`, `#[Length]`, `#[StringValue]`) |
| REST API, JSON output | `response` | `yiisoft/data-response` | `ResponseFactory\DataResponseFactoryInterface`, `ResponseFactory\*` factories (`DataStream`); root-namespace `DataResponse` is deprecated |
| Data grids, pagination, sorting | `dataview`, `data` | `yiisoft/data`, `yiisoft/data-db` (DB-backed readers), `yiisoft/yii-dataview` | `OffsetPaginator`, `Sort`, `DataReaderInterface`, `GridView` |
| Background tasks, deferred jobs | `queue` | `yiisoft/queue`, adapter (`yiisoft/queue-db` / `yiisoft/queue-redis` / `yiisoft/queue-amqp`) | `QueueProducerInterface`, `MessageInterface` |
| Access control, permissions | `rbac`, `access` | `yiisoft/rbac`, `yiisoft/rbac-rules-container` (dynamic rules), `yiisoft/user` | `ManagerInterface`, `CurrentUser` |
| External login ("sign in with ..."), OAuth2 / OIDC | `auth-client` | `yiisoft/yii-auth-client` | `Collection`, `AuthAction` (PSR-15 middleware), `Client\OpenIdConnect`, `Widget\AuthChoice` |
| Console commands, CLI imports | `console` | `yiisoft/yii-console` | `Symfony\Component\Console\Command\Command`, `ExitCode` |
| Session, flash messages | `session` | `yiisoft/session` | `SessionInterface`, `FlashInterface` (in the `Flash` sub-namespace) |
| File download / export | `response-download` | `yiisoft/response-download` | `DownloadResponseFactory` |
| File uploads & images | `validation` + PSR-7 upload contract | `yiisoft/validator`, `psr/http-message` | `UploadedFileInterface` (PSR-7), `#[File]`, `#[Image]` |
| CSS-framework UI components (Bootstrap 5, Bulma) | `widgets` | `yiisoft/widget` (base + factory only, no concrete widgets), `yiisoft/yii-widgets`, `yiisoft/bootstrap5` or `yiisoft/yii-bulma` | `Alert` (`Yiisoft\Yii\Widgets\Alert`, `Yiisoft\Bootstrap5\Alert`), `NavBar` (Bootstrap5 + Bulma), `Tabs` (Bulma only; Bootstrap5 uses `Nav` + `NavStyle::TABS`; Bulma's alert analog is `Message`) |
| Slugs, case conversion, deep array access, safe JSON | `utilities` | `yiisoft/strings`, `yiisoft/arrays`, `yiisoft/json` | `Inflector` (instance API), `StringHelper`, `ArrayHelper`, `Json` |
| IP allow/deny lists, CIDR checks, DNS/email-domain validation | `network` | `yiisoft/network-utilities` | `IpHelper`, `IpRanges`, `DnsHelper` |

---

## 3. Authorization & RBAC Protocol (`yiisoft/rbac` + `yiisoft/user`)

When a feature requires role-based or permission-based checks:
1. **Permission Check in Presentation / Action:**
   - Inject `Yiisoft\User\CurrentUser`.
   - Check permission before invoking Use Case — the signature is `can(string|BackedEnum $permissionName, array $params = []): bool`:
     ```php
     // Inside an action with injected CurrentUser and DataResponseFactoryInterface.
     if (!$this->currentUser->can('editPost', ['authorId' => $post->getAuthorId()])) {
         // Array payload + status is valid for Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface:
         // createResponse(mixed $data = null, int $code = Status::OK, string $reasonPhrase = '')
         // (no $headers parameter — add headers afterwards via ->withHeader();
         //  for self-contained JSON responses prefer JsonResponseFactory).
         return $this->dataResponseFactory->createResponse(['message' => 'Forbidden'], Status::FORBIDDEN);
     }
     ```
   - *Fail-closed pitfall:* `can()` returns `false` whenever no access checker is attached — the DI wiring must apply `CurrentUser::withAccessChecker(...)`. Guest requests have a `null` user id: either configure a guest role in the RBAC manager or the checks fail closed.
2. **Dynamic Rule Implementation:**
   - Create class implementing `Yiisoft\Rbac\RuleInterface`.
   - Notice exact Yii3 signature (never use Yii2 signatures):
     ```php
     declare(strict_types=1);

     namespace App\User\Rbac;

     use Yiisoft\Rbac\Item;
     use Yiisoft\Rbac\RuleContext;
     use Yiisoft\Rbac\RuleInterface;

     final readonly class AuthorRule implements RuleInterface
     {
         public function execute(?string $userId, Item $item, RuleContext $context): bool
         {
             $authorId = $context->getParameterValue('authorId');
             return $userId !== null && $userId === (string)$authorId;
         }
     }
     ```
3. **Wiring:**
   - Register rule in `config/common/params.php` under `'yiisoft/rbac-rules-container' => ['rules' => [...]]` (the package default params also carry `'validate' => true`; rule values are yiisoft/factory definitions — class-strings or alias maps).
   - Plan migration or RBAC seeder creating the Permission, attaching the Rule (`Item::withRuleName()`), and assigning to Roles (see the [Auth & RBAC Guide](auth-and-rbac.md)).

---

## 4. Persistence Strategy Selection (Plain DB vs Active Record vs Cycle)

Inspect `composer.json` and existing repositories to detect storage engine:

| Strategy | Detected Package | Entity Style | Repository Implementation Pattern |
|---|---|---|---|
| **Plain DB** | `yiisoft/db` | Pure POPO (Plain Old PHP Object) with constructor promotion | Injects `ConnectionInterface`. Uses `(new Query($this->db))->from('table')`, `$this->db->createCommand()`, and `$this->db->transaction()`. |
| **Active Record** | `yiisoft/active-record` | Extends `Yiisoft\ActiveRecord\ActiveRecord`; `tableName()` is a non-static instance method (`public function tableName(): string`) and overriding it is optional (the base class derives `{{%snake_case}}` from the class short name) | Models handle their own SQL via `ActiveQuery` (a query builder extending `Yiisoft\Db\Query\Query`). Repository encapsulates complex finder methods and persists models via `$ar->save(?array $properties = null): void`. Validated outside via DTO (app convention, not a package contract). |
| **Cycle ORM** | `yiisoft/yii-cycle` | Entity with PHP attributes `#[Entity]`, `#[Column]` | Injects `Cycle\ORM\EntityManagerInterface` and `Cycle\ORM\Select\Repository`. Zero DB dependency in domain entity. |

*Rule:* Never mix persistence strategies within the same module/context.

### Post-Commit Event Dispatching Invariant
When a Use Case involves both database mutation and Domain Events:
```php
// Strict rule: Never dispatch side-effect events (email, SMS, queue push) inside an uncommitted transaction!
$this->db->transaction(function () use ($order) {
    $this->orderRepository->save($order);
});

// Dispatch events ONLY after successful commit:
foreach ($order->releaseEvents() as $event) {
    $this->eventDispatcher->dispatch($event);
}
```

> `releaseEvents()` is an application convention — no yiisoft package provides it; model it on your own aggregate base class.
> The commit happens inside `transaction()` before it returns (rollback + rethrow on any `Throwable`), so dispatching after the call provably runs post-commit.
> PSR-14 dispatch is synchronous: listeners run inline before `dispatch()` returns (no outbox or deferral in `yiisoft/event-dispatcher` / `yiisoft/yii-event`) — anything pushed to the queue or mailed starts immediately, which is exactly why the invariant matters.

---

## 5. Layering & Directory Placement Rules

Match the project's architecture style (discovered from `.ai-factory/ARCHITECTURE.md` or existing `src/`):

**Choosing a style (decision rule):**
1. If the target `.ai-factory/ARCHITECTURE.md` prescribes a layout, follow it — it is the supreme structural authority.
2. Otherwise match the dominant existing `src/` layout: one module, one style; never mix styles within the same module/context (mirrors the persistence rule in §4).
3. Greenfield: Style 1 (vertical slice) is common in modern Yii3 apps; Style 2 suits larger teams with strict layer boundaries.

### Style 1: Vertical Slice (Feature-based, common in modern Yii3 apps)
```
src/
  Order/
    Checkout/
      CheckoutAction.php       # Presentation / HTTP
      CheckoutRequest.php      # Input DTO with rule attributes (#[Required], #[Length], ...)
      CheckoutHandler.php      # Application Use Case
      OrderCreatedEvent.php    # Domain Event
      SendReceiptListener.php  # Event Listener
    Domain/
      Order.php                # Entity
      OrderRepositoryInterface.php
    Infrastructure/
      SqlOrderRepository.php   # Persistence
```

### Style 2: Layered / Clean (Traditional)
```
src/
  Domain/
    Order/
      Order.php
      OrderRepositoryInterface.php
      Event/OrderCreatedEvent.php
  Application/
    Order/
      CheckoutCommand.php
      CheckoutHandler.php
      Listener/SendReceiptListener.php
  Infrastructure/
    Persistence/
      SqlOrderRepository.php
  Presentation/
    Http/
      Action/Order/CheckoutAction.php
      Request/Order/CheckoutRequest.php
```

**Topic cross-links:** [Actions & Controllers](actions-and-controllers.md), [Routing](routes.md), [Validation & Forms](validation-and-forms.md), [DI & Config](di-and-config.md), [Persistence: Plain DB](persistence-db.md), [Persistence: Active Record](persistence-active-record.md), [Persistence: Cycle ORM](persistence-cycle-orm.md), [Migrations](migrations.md), [Events & Listeners](events-and-listeners.md), [Queue Jobs](queue-jobs.md), [Console Commands](commands.md), [Auth & RBAC](auth-and-rbac.md), [Mailer](mailer.md), [Views & Widgets](views-and-widgets.md), [File Handling](file-handling.md), [HTTP State](http-state.md).

---

## 6. Chain Integrity Checklist (No Missing Links)

Every feature implementation plan must satisfy these integrity invariants:
- [ ] **Data layer connected:** If entity persists state → Migration exists + Repository implements Interface.
- [ ] **DI registered:** Every newly introduced interface has a binding in `config/common/di/*.php` or `config/web/di/*.php`.
- [ ] **Route reachable:** Every newly created Action is mounted in `config/common/routes.php` (the canonical template has no `routes-web` group) with correct HTTP method and typed parameter tokens (`{id:\d+}`).
- [ ] **Console command wired:** Every Console Command is registered in `config/console/params.php`.
- [ ] **Events wired:** Any Domain Event has listeners mapped in the events config group selected by `eventsConfigGroup` (`events-web` / `events-console`; a file such as `config/common/events.php` must also be mapped in the root config plugin).
- [ ] **Events post-commit:** All event dispatches with external side-effects (mail, sms, queue) occur outside/after DB transactions.
- [ ] **Input sanitized:** Any user input passes through a DTO validated with `yiisoft/validator` attributes.
- [ ] **Forms protected:** Web forms are covered by the active CSRF middleware `Yiisoft\Csrf\CsrfTokenMiddleware` (with `SessionMiddleware` before it) and token validation.
- [ ] **Action is thin:** Action only coordinates HTTP: Request -> Hydrate DTO -> Validate -> Call Handler/Service -> Build Response.
- [ ] **Response is PSR-7:** Action returns `Psr\Http\Message\ResponseInterface` via `ResponseFactory\DataResponseFactoryInterface` or `WebViewRenderer` (the `ViewRenderer` alias is deprecated).

---

## 7. Verified Pitfalls & Deprecations

Deprecation-sensitive and error-prone APIs, verified against installed package sources. Check the installed versions under `vendor/` before generating code.

| # | Pitfall | Guidance | Anchor |
|---|---|---|---|
| 1 | `ViewRenderer` deprecated | `Yiisoft\Yii\View\Renderer\ViewRenderer` is `@deprecated` since yii-view-renderer 7.4.0 — use `WebViewRenderer` (`render(...): ResponseInterface`; the deprecated `ViewRenderer::render(string $view, array $parameters = [])` returns the legacy `DataResponse`). Layout defaults to none when unset | `vendor/yiisoft/yii-view-renderer/src/ViewRenderer.php`, `src/WebViewRenderer.php` |
| 2 | Legacy data-response surface | Root-namespace `DataResponseFactoryInterface`, `DataResponse`, and the formatter middleware are `@deprecated` — use `Yiisoft\DataResponse\ResponseFactory\*` factories: `createResponse(mixed $data = null, int $code = Status::OK, string $reasonPhrase = '')` has no `$headers` parameter (chain `->withHeader()` afterwards). `JsonResponseFactory` is self-contained for JSON APIs | `vendor/yiisoft/data-response/src/` |
| 3 | CSRF class rename | `Yiisoft\Csrf\CsrfMiddleware` is `@deprecated` (since csrf 2.2.0) — use `Yiisoft\Csrf\CsrfTokenMiddleware`: token read from the `_csrf` body param or `X-CSRF-Token` header, safe methods (GET/HEAD/OPTIONS) skipped, failure responds `422`. `SessionMiddleware` must precede it in the stack | `vendor/yiisoft/csrf/src/CsrfTokenMiddleware.php` |
| 4 | Mailer templates removed | Mailer template rendering (`MessageBodyRenderer`, `compose()`, `withTemplate()`) was removed in mailer 6.0.0 — render HTML via `yiisoft/view` and pass it to `withHtmlBody()`. The base package binds only `FileMailer`; the `MailerInterface => Mailer` binding ships with `yiisoft/mailer-symfony` | `vendor/yiisoft/mailer/` (CHANGELOG, `config/`) |
| 5 | Router version skew | `yiisoft/router` <= 4.0.2: static factories `Route::get()/post()` + `Group::create()` are the only API. >= 4.0.3: constructor classes `Yiisoft\Router\Route\{Get,Post,Put,Delete,Patch,Head,Options}`, static factories `@deprecated`. Discriminator: existence of `vendor/yiisoft/router/src/Route/Get.php` | `vendor/yiisoft/router/src/Route.php`, `src/Route/Get.php` |
| 6 | Wrong data-reader name | There is NO `ArrayDataReader` in `yiisoft/data` 2.x — the in-memory reader is `Yiisoft\Data\Reader\Iterable\IterableDataReader` | `vendor/yiisoft/data/src/Reader/Iterable/` |
| 7 | GridView namespace | The dataview grid FQCN has a doubled sub-namespace: `Yiisoft\Yii\DataView\GridView\GridView` | `vendor/yiisoft/yii-dataview/src/GridView/GridView.php` |
| 8 | Hydration attributes location | `#[FromQuery]` / `#[FromBody]` live in `Yiisoft\Input\Http\Attribute\Data\*` (package `yiisoft/input-http`), NOT in `Yiisoft\Hydrator\*` | `vendor/yiisoft/input-http/src/Attribute/Data/` |
| 9 | `Inflector` is instance-only | All `Yiisoft\Strings\Inflector` methods are instance methods: `(new Inflector())->toSlug('Hello World')` — never call statically | `vendor/yiisoft/strings/src/Inflector.php` |
| 10 | No `StringHelper::truncate()` | `yiisoft/strings` 2.x provides `truncateBegin`, `truncateMiddle`, `truncateEnd`, `truncateWords`, `truncateWordsByLength` — there is no plain `truncate()` | `vendor/yiisoft/strings/src/StringHelper.php` |
| 11 | `ArrayHelper::getValue()` dotted keys | Dotted string keys are NOT traversed by `getValue()` — use `getValueByPath()` or an array of keys | `vendor/yiisoft/arrays/src/ArrayHelper.php` |
| 12 | RBAC fails closed | `CurrentUser::can()` returns `false` without an attached checker — `withAccessChecker()` must be applied by DI wiring. Without a configured guest role, guest checks also fail closed | `vendor/yiisoft/user/src/CurrentUser.php` |
| 13 | Queue retry is opt-in | Retry is not built into `yiisoft/queue` core — configure `middlewares-fail` (built-ins `SendAgainMiddleware`, `ExponentialDelayMiddleware`). Payloads are scalars/recursive arrays only; handler mapping is a params key, not DI | `vendor/yiisoft/queue/config/params.php` |
| 14 | No Yii base console command | Extend `Symfony\Component\Console\Command\Command` (no `Yiisoft\Yii\Console\Command` base class exists). `ExitCode::OK`/`UNSPECIFIED_ERROR` is the recommended app-level convention, not a package-enforced one | `vendor/yiisoft/yii-console/src/Command/` |
| 15 | Upload contract is PSR-7 | `UploadedFileInterface` comes from `psr/http-message` (NOT `yiisoft/http`, which only ships header/status/method classes); `moveTo()` and temp-file semantics are PSR-7 contract — verify against `vendor/psr/http-message/` | `vendor/yiisoft/validator/src/Rule/File.php` |
| 16 | Active Record `tableName()` | Non-static instance method (`public function tableName(): string`); overriding is optional (`{{%snake_case}}` derived from the class short name). A stale `public static` docblock example inside the package's `ActiveRecord.php` must not be copied. `save()` returns `void` | `vendor/yiisoft/active-record/src/` |
| 17 | Dispatch is synchronous | PSR-14 listeners run inline before `dispatch()` returns (no outbox/deferral) — this is why the post-commit invariant in §4 matters | `vendor/yiisoft/event-dispatcher/src/Dispatcher/Dispatcher.php` |
| 18 | form-model strict fill | Only properties carrying validation rules are populated from request data by default — `#[Safe]` opts a property out | `vendor/yiisoft/form-model/src/FormHydrator.php` |
| 19 | Views are not auto-escaped | Template output is NOT escaped automatically — escape with `Html::encode()` | `vendor/yiisoft/view/` (docs: use-in-web-environment) |
| 20 | Event config fails late | Config-format errors throw at build time, but bad listener definitions pass config build and fail at dispatch — run `ListenerConfigurationChecker::check()` in development | `vendor/yiisoft/yii-event/src/ListenerConfigurationChecker.php` |
