# Yii3 Feature Archetype Recipes

> **Grounding:** APIs in `vendor/yiisoft/<pkg>/src/`, patterns in this guide, conventions in architecture artifact (SKILL.md Core rule 2).

> Concrete, end-to-end implementation recipes for the 7 primary Yii3 feature archetypes across task scopes (surgical vs composite features) and architecture patterns (Explicit Architecture, Structured Modules, Layered Architecture).

## Table of Contents

- [1. Feature Archetypes](#1-feature-archetypes)
  - [Decomposition by Task Scope & Architecture Pattern](#decomposition-by-task-scope--architecture-pattern)
  - [Archetype A: State-Changing Business Process (e.g., checkout, registration, booking, payment)](#archetype-a-state-changing-business-process-eg-checkout-registration-booking-payment)
  - [Archetype B: Read / Query / Data Listing (e.g., catalog, user profile, analytics report)](#archetype-b-read--query--data-listing-eg-catalog-user-profile-analytics-report)
  - [Archetype C: Async / Background Job (e.g., CSV export, batch sync, notifications)](#archetype-c-async--background-job-eg-csv-export-batch-sync-notifications)
  - [Archetype D: Web Form / Interactive Page (HTML UI)](#archetype-d-web-form--interactive-page-html-ui)
  - [Archetype E: CLI / Console Command (e.g., data import, reindexing, cron cleanup)](#archetype-e-cli--console-command-eg-data-import-reindexing-cron-cleanup)
  - [Archetype F: RESTful Resource CRUD (Full API Lifecycle)](#archetype-f-restful-resource-crud-full-api-lifecycle)
  - [Archetype G: File Upload & Media Processing (e.g., avatar, document import, invoice PDF)](#archetype-g-file-upload--media-processing-eg-avatar-document-import-invoice-pdf)

## 1. Feature Archetypes

When a feature request arrives, classify it into an archetype and align decomposition with the task scope (surgical task vs composite feature) and the project's **Architecture Pattern** (`Explicit Architecture`, `Structured Modules`, `Layered Architecture` per `references/instructions/core-architecture-alignment.md`):

### Decomposition by Task Scope & Architecture Pattern

The workflow aligns implementation depth with task scope and the target codebase's architectural constraints:

| Task Scope | Architecture Pattern | Domain / Entity | Service / Handler | Repository Contract | Presentation (Action) |
|---|---|---|---|---|---|
| **Surgical Task** (1–3 files, bugfix, config/DI) | Any (Explicit / Structured / Layered) | Skipped | Skipped | Touched only | Surgical edit (touched files only; schema migrations skipped unless surgical task requires schema changes) |
| **Composite Feature** (Standard) | **Layered Architecture** (`layers`) | Active Record / DB model (optional POPO) | Application Service | Concrete Repository or Active Record model directly (consumed by Service) | Thin Action returning `ResponseInterface` (delegates to Service) |
| **Composite Feature** (Standard) | **Structured Modules** (`structured`) | Module Entity / Rich Model | Feature Service or Use Case Handler | Module Repository (interfaces at module boundaries) | Thin Action returning `ResponseInterface` |
| **Composite Feature** (Standard) | **Explicit Architecture** (`explicit`) | Pure Entity + Value Objects | Use Case Handler (`*Command` + `*Handler`) | Pure Repository Interface + Infrastructure Implementation | Thin Action returning `ResponseInterface` |
| **Mission-Critical Slice** | **Layered Architecture** (`layers`) | Validated Model / Entity | Application Service with atomic transactions & events | Explicit Repository | Thin Action returning `ResponseInterface` |
| **Mission-Critical Slice** | **Structured Modules** (`structured`) | Module Aggregate + Domain Events | Module Use Case Handler + transaction boundary | Module Repository Interface + Implementation | Thin Action returning `ResponseInterface` |
| **Mission-Critical Slice** | **Explicit Architecture** (`explicit`) | Pure Aggregate Entity + Value Objects | Dedicated Use Case Handler (`*Command` + `*Handler`) + Domain Events | Explicit Repository Interface + DB Implementation | Thin Action returning `ResponseInterface` |

*Universal Invariants across all scopes and patterns:*
- **Thin Actions:** Actions strictly remain thin HTTP transport adapters returning `ResponseInterface`; zero direct SQL, persistence, or transaction management in presentation.
- **Transactions:** Handled strictly in Application Services or Use Case Handlers via `ConnectionInterface::transaction()`, never inside HTTP Actions.
- **Surgical Migrations:** Schema migrations are skipped *only* when the task does not require schema changes. If a bugfix or surgical task alters the database schema, a reversible migration (`up()` / `down()`) MUST be authored.
- **Architectural Respect:** A mission-critical task in a Structured Modules project demands enterprise rigor (atomic transactions, event publishing, idempotency, comprehensive integration tests) while respecting the project's modular conventions without unilaterally rewriting the project into Explicit Architecture.
- **Undetermined Architecture Pattern (3-Step Fallback Protocol):**
  1. **Explicit Architecture Artifact:** If `.ai-factory/ARCHITECTURE.md` (or `docs/architecture/`) exists, its declared pattern dictates the architecture (`layers` → Layered Architecture, `structured` → Structured Modules, `explicit` → Explicit Architecture).
  2. **Existing Codebase Inspection:** If no artifact exists, inspect 2–3 existing features in `src/` to classify the dominant style (`src/Models/` + `src/Services/` → Layered; `src/[Module]/` → Structured Modules; `src/Domain/` + interfaces → Explicit).
  3. **Convention Fallback:** If the codebase is new, empty, or ambiguous, default to **Layered Architecture** (`layers`).

### Archetype A: State-Changing Business Process (e.g., checkout, registration, booking, payment)
Creates or modifies domain state and involves side-effects.

**Artifact Graph by Task Scope:**
- **Standard Composite Feature:**
  1. **Persistence & Schema:** DB migration (`yiisoft/db-migration`) with reversible `down()`. Storage via concrete repository, Active Record model, or Cycle mapper.
  2. **Application / Business Logic:** Application Service (e.g. `OrderService::createOrder()`) or Use Case Handler wrapping multi-step persistence in `ConnectionInterface::transaction()`. Events dispatched strictly after commit.
  3. **Presentation / HTTP:** Typed Input DTO with `Yiisoft\Validator\Rule\*` attributes; thin single-action controller returning `ResponseInterface`.
  4. **Wiring & Tests:** Route per project routing style (`config/common/routes.php` default, [Routing Guide](../packages/http-routes-definition.md#choosing-how-to-route-http-requests)), DI bindings per project config style (`config/common/di/*.php` default, [Config Organization](../packages/core-config-tree.md#26-choosing-how-to-organize-application-configs)), unit and HTTP integration tests.
- **Mission-Critical Slice (Decomposition adapts to Architecture Pattern; Explicit baseline shown below):**
  1. **Domain:** Pure Entity/Aggregate + Value Objects; PSR-14 Domain Events; pure `*RepositoryInterface`.
  2. **Infrastructure / Persistence:** DB migration; storage implementation of the repository interface (`Sql*Repository`).
  3. **Application / Use Case:** Dedicated single-responsibility Use Case Handler (`*Command` + `*Handler`); post-commit event listeners.
  4. **Presentation & Wiring:** Typed Input DTO; thin Action delegating to the Use Case Handler; full DI binding and Production Readiness Gate.
- **Surgical Task:** Touched components only (1–3 files); skips domain aggregates; skips migrations only if no DB schema changes are required (author reversible migration if schema changes).

**Standard Artifact Graph (Mission-Critical / Explicit baseline):**
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
   - **Action / Controller:** Choose one handler shape per project style (`__invoke(ServerRequestInterface $request): ResponseInterface` single-action invokable default, PSR-15 `RequestHandlerInterface`, or plain constructor-DI controller method `[UserController::class, 'view']` — see [`http-actions-core.md` §1](../packages/http-actions-core.md#1-core-action-principles-in-yii3)).
     - *Responsibility:* Hydrate DTO (`yiisoft/hydrator`; the integrated HTTP path is `yiisoft/hydrator-validator` + `yiisoft/input-http`), validate (`yiisoft/validator`), call Use Case, return `ResponseInterface` via `Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface` (including self-contained `JsonResponseFactory` — [`http-actions-core.md` §3.4](../packages/http-actions-core.md#34-choosing-how-to-return-an-http-response)), `Yiisoft\Yii\View\Renderer\WebViewRenderer` (`ViewRenderer` is deprecated), or PSR-17 `ResponseFactoryInterface`.
     - *Anti-pattern:* Never put SQL queries, password hashing, or email sending directly inside the Action.
5. **Configuration & Wiring (Mandatory):**
   - **DI:** Bind `OrderRepositoryInterface => SqlOrderRepository` per project config style (`config/common/di/*.php` default, [`core-config-tree.md` §2.6](../packages/core-config-tree.md#26-choosing-how-to-organize-application-configs)). Definition forms: `Interface::class => Class::class` or `['class' => ..., '__construct()' => [...]]`.
   - **Events:** Map listeners per project event wiring (`config/**/events.php` in the `eventsConfigGroup` parameter via `yiisoft/yii-event` default, or programmatic `ListenerCollection` — [Events & Listeners Guide, §4](../packages/core-events-design.md#4-event-configuration-yiisoftconfig--yiisoftyii-event)).
   - **Routes:** Register routes per project routing style (`config/common/routes.php` default — the canonical template has no `routes-web` group — or `FileRouter` middleware; [`http-routes-definition.md` §1](../packages/http-routes-definition.md#choosing-how-to-route-http-requests)). Use version-aware route syntax — see Archetype F and the [Routing Guide](../packages/http-routes.md).

---

### Archetype B: Read / Query / Data Listing (e.g., catalog, user profile, analytics report)
Queries data without changing state; supports pagination, sorting, filters.

**Required Artifact Graph:**
1. **Query DTO:** Strongly typed filter/pagination parameters (rule attributes + `#[FromQuery]` — same DTO pattern as Archetype F).
2. **Read Service / Query Repository:** Read-only queries using `yiisoft/db` or `yiisoft/data` (`DataReaderInterface`, `OffsetPaginator`, `Sort`).
3. **Action:** Hydrates query parameters, calls Read Service, formats data.
4. **Presentation:**
   - API: `DataResponseFactoryInterface` (or `JsonResponseFactory`) with serialized data and paginator metadata.
   - Web: View template using `yiisoft/view` and the `Yiisoft\Yii\DataView\GridView\GridView` widget.
5. **Wiring:** Route per project routing style (`config/common/routes.php` default) and DI binding per project config style (`config/common/di/*.php` default).

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

> [!TIP]
> **Pagination & Sorting Reference:**
> For the complete reference on `QueryDataReader` sorting (`Sort::only()` / `Sort::any()`) and `OffsetPaginator` behavior, see the [Persistence: Plain DB Guide, §5.1](../packages/persistence-db-readers-and-drivers.md#51-querydatareader--sorting-sortonly-sortany) and [§5.2](../packages/persistence-db-readers-and-drivers.md#52-offset-pagination-offsetpaginator).

**API response composition** (fragment of an Archetype B list action):

```php
// Fragment of an Archetype B list action — the API response composition:
$list = $this->productListService->getList(currentPage: $page);
return $this->dataResponseFactory->createResponse($list, Status::OK); // Yiisoft\Http\Status
```

**Web listing:** render through `yiisoft/view` templates and the dataview widget — note the doubled sub-namespace: `Yiisoft\Yii\DataView\GridView\GridView::widget()->dataReader($paginator)->columns(new DataColumn(property: 'title', header: 'Title'))` (rendering details are owned by the [DataView Widgets Guide, §1–§2](../packages/http-dataview-widgets.md)).

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

> [!TIP]
> **Queue & Jobs Reference:**
> For the complete reference on producer push patterns (`QueueProducerInterface`, delayed execution, `status()` with the `MessageStatus` codes), custom message DTOs with the `fromPayload()` contract, handler mapping in params (including the zero-config path when the message type equals the handler FQCN), and worker CLI commands, see the [Queue & Asynchronous Jobs Guide, §3-§4](../packages/infra-queue-jobs.md#3-pushing-messages-to-queue).
> For the push/consume/failure middleware pipelines, see [§5](../packages/infra-queue-jobs.md#5-middleware-subsystems-failure-handling--pipelines); for broker adapter specifics (`queue-db`, `queue-redis`, `queue-amqp`), see the [Queue Broker Adapters Guide](../packages/infra-queue-brokers.md).

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
use Psr\Http\Message\ServerRequestInterface;
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

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $form = new SignupForm();

        if (!$this->formHydrator->populateFromPostAndValidate($form, $request)) {
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
    <?php // $csrf (masked token) is injected by CsrfViewInjection; middleware reads _csrf body param or X-CSRF-Token header. ?>
    <input type="hidden" name="_csrf" value="<?= Html::encode((string) $csrf) ?>">
    <?= Field::text($form, 'login') ?>
    <?= Field::password($form, 'password') ?>
    <button type="submit">Sign up</button>
</form>
```

Note: CSRF is not auto-embedded by `yiisoft/form` or `yiisoft/form-model` — the middleware plus the rendered token handle it (see the [Validation & Forms Guide](../packages/http-validation-and-forms.md), the [HTTP State Guide](../packages/http-state.md), and the [Middlewares Guide, §3.2 — CSRF Middleware Behavior](../packages/http-middlewares-protocol.md#32-csrf-middleware-behavior)).

---

### Archetype E: CLI / Console Command (e.g., data import, reindexing, cron cleanup)
Processes background or maintenance tasks via command line interface (`yiisoft/yii-console`).

**Required Artifact Graph:**
1. **Console Command Class:**
   - Extends `Symfony\Component\Console\Command\Command` — there is NO Yii base command class in `yiisoft/yii-console/src/`; the real package commands are `final`.
   - Constructor injection of Use Cases / Services works (commands are resolved via the DI container); call `parent::__construct()` after promoted properties.
   - Arguments & options are configured in `configure()` (`addArgument('file', InputArgument::OPTIONAL, ...)`, `addOption('chunk', 'c', InputOption::VALUE_OPTIONAL, ...)`). `#[AsCommand]` sets **name/description only** (it is required in practice for lazy loading); the params-map command name overrides the attribute name.
   - Returns `Yiisoft\Yii\Console\ExitCode::OK` or `ExitCode::UNSPECIFIED_ERROR` as the app-level convention (recommended, not strictly enforced: the full sysexits palette and `getReason()` exist, and ecosystem packages also use Symfony's `Command::SUCCESS`/`FAILURE`/`INVALID`).
   - *Anti-pattern:* Never put raw SQL queries or business algorithms directly inside the command; delegate to Use Cases.

> [!TIP]
> **Console & Batch Reference:**
> For the complete reference on styled terminal I/O (`SymfonyStyle` banners, tables, prompts, progress bars), see the [Console Commands Guide, §5](../packages/infra-commands-execution.md#5-interactive-terminal-ux-with-symfonystyle); for exit-code conventions, see [§6](../packages/infra-commands-execution.md#6-standard-exit-codes-yiisoftyiiconsoleexitcode).
> For memory-safe cursor streaming (`Query::each()` / `Query::batch()`) and bulk inserts, see the [Persistence: Plain DB Guide, §3.4](../packages/persistence-db-connection-and-queries.md#34-memory-safe-cursor-streaming-each--batch).

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
     The `:` separator is the naming convention; alias/hidden syntax `'start|run|s|r'` is supported (see the [Commands Guide](../packages/infra-commands.md)).

---

### Archetype F: RESTful Resource CRUD (Full API Lifecycle)
Exposes complete collection and resource management with standard HTTP semantics.

**Required Artifact Graph:**
1. **Actions (Single-Action Handlers):**
   - `ListAction`: Takes Query DTO with `#[FromQuery]` (`Yiisoft\Input\Http\Attribute\Data\FromQuery` — package `yiisoft/input-http`, class-level attribute); uses `Yiisoft\Data\Paginator\OffsetPaginator`; returns `200 OK` (`Status::OK`) with items and pagination meta (see Archetype B for the meta shape).
   - `ViewAction`: Takes path parameter ID; calls Use Case / Application Service (which retrieves entity via Repository); returns `200 OK` or throws/returns `404 Not Found`.
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
     > [!TIP]
     > **Routing Reference:**
     > **Version-aware route syntax:** the snippet uses the `yiisoft/router` >= 4.0.3 constructor classes — discriminator: check whether `vendor/yiisoft/router/src/Route/Get.php` exists in the installed project (static factories are deprecated since 4.0.3). For the complete reference on verb classes and route collection wiring, see the [Routing Guide, §1.1](../packages/http-routes-definition.md#11-dedicated-http-verb-classes).

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

> [!TIP]
> **File Upload Reference:**
> For the complete reference on `File` / `Image` validation rules and safe post-validation storage, see the [Validation & Forms Guide, §5](../packages/http-validation-advanced.md#5-file--image-validation); for the upload pipeline and storage/wiring placement, see the [File Handling Guide, §4](../packages/http-file-handling.md#4-file-uploads-psr-7--validator) and [§5](../packages/http-file-handling.md#5-placement--wiring).

---
