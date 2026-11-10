# Yii3 Feature Decomposition Recipes

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Guides how to decompose high-level business feature requests into complete, idiomatic Yii3 architecture artifacts (Domain, Persistence, Use Cases, Presentation, Wiring, Tests).
>
> **Source of Truth:** For class signatures and interfaces, inspect the installed `vendor/yiisoft/<pkg>/src/`. Decompose user business requests into the appropriate artifact graph per the execution mode (`Patch`, `Feature`, `Enterprise`) and the project's architectural tier (Pragmatic, Balanced, Strict per `references/core-architecture-alignment.md`).
>
> All complete class snippets carry `declare(strict_types=1);` and are grounded in installed package sources. APIs deprecated in current package versions are flagged inline with their replacements — see also [Section 7](#7-verified-pitfalls--deprecations).

---

> **TL;DR:** Feature archetypes with complete artifact graphs (§1); authorization protocol (§3); persistence strategy selection (§4); layering & placement rules (§5); the Chain Integrity Checklist (§6); verified pitfalls & deprecations (§7).
> **Read in full when:** decomposing a new business feature (Feature or Enterprise mode) — §1 and §6 are the decomposition contract referenced by SKILL.md Mission Workflow.

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

When a feature request arrives, classify it into an archetype and align decomposition intensity with two independent axes: the active **Execution Mode** (`Patch`, `Feature`, `Enterprise`) and the project's **Architectural Tier** (`Pragmatic`, `Balanced`, `Strict` per `references/core-architecture-alignment.md`):

### Decomposition Intensity by Execution Mode & Architectural Tier

The workflow decouples the task's operational scope (**Execution Mode**) from the target codebase's architectural constraints (**Architectural Tier**). All 9 combinations are valid:

| Execution Mode | Architectural Tier | Domain / Entity | Service / Handler | Repository Contract | Presentation (Action) |
|---|---|---|---|---|---|
| **Patch** (`--mode=patch`) | Any (Pragmatic / Balanced / Strict) | Skipped | Skipped | Touched only | Surgical edit (touched files only; schema migrations skipped unless patch requires schema changes) |
| **Feature** (default, ~80%) | **Pragmatic** (`layers`) | Active Record / DB model (optional POPO) | Application Service | Concrete Repository or Active Record model directly | Thin Action returning `ResponseInterface` |
| **Feature** (default, ~80%) | **Balanced** (`structured`) | Module Entity / Rich Model | Feature Service or Use Case Handler | Module Repository (interfaces at module boundaries) | Thin Action returning `ResponseInterface` |
| **Feature** (default, ~80%) | **Strict** (`explicit`) | Pure Entity + Value Objects | Use Case Handler (`*Command` + `*Handler`) | Pure Repository Interface + Infrastructure Implementation | Thin Action returning `ResponseInterface` |
| **Enterprise** (`--mode=enterprise`) | **Pragmatic** (`layers`) | Validated Model / Entity | Application Service with atomic transactions & events | Explicit Repository | Thin Action returning `ResponseInterface` |
| **Enterprise** (`--mode=enterprise`) | **Balanced** (`structured`) | Module Aggregate + Domain Events | Module Use Case Handler + transaction boundary | Module Repository Interface + Implementation | Thin Action returning `ResponseInterface` |
| **Enterprise** (`--mode=enterprise`) | **Strict** (`explicit`) | Pure Aggregate Entity + Value Objects | Dedicated Use Case Handler (`*Command` + `*Handler`) + Domain Events | Explicit Repository Interface + DB Implementation | Thin Action returning `ResponseInterface` |

*Universal Invariants across all modes and tiers:*
- **Thin Actions:** Actions strictly remain thin HTTP transport adapters returning `ResponseInterface`; zero direct SQL, persistence, or transaction management in presentation.
- **Transactions:** Handled strictly in Application Services or Use Case Handlers via `ConnectionInterface::transaction()`, never inside HTTP Actions.
- **Patch Migrations:** In Patch Mode, schema migrations are skipped *only* when the patch does not require schema changes. If a bugfix or patch alters the database schema, a reversible migration (`up()` / `down()`) MUST be authored.
- **Architectural Respect:** An Enterprise task in a Balanced project demands enterprise rigor (atomic transactions, event publishing, idempotency, comprehensive integration tests) while respecting the project's Balanced modular conventions without unilaterally rewriting the project into Strict Clean Architecture.

### Archetype A: State-Changing Business Process (e.g., checkout, registration, booking, payment)
Creates or modifies domain state and involves side-effects.

**Artifact Graph by Execution Mode:**
- **In Feature Mode (Canonical Default):**
  1. **Persistence & Schema:** DB migration (`yiisoft/db-migration`) with reversible `down()`. Storage via concrete repository, Active Record model, or Cycle mapper.
  2. **Application / Business Logic:** Application Service (e.g. `OrderService::createOrder()`) or Use Case Handler wrapping multi-step persistence in `ConnectionInterface::transaction()`. Events dispatched strictly after commit.
  3. **Presentation / HTTP:** Typed Input DTO with `Yiisoft\Validator\Rule\*` attributes; thin single-action controller returning `ResponseInterface`.
  4. **Wiring & Tests:** Route in `config/common/routes.php`, DI bindings in `config/common/di/*.php`, unit and HTTP integration tests.
- **In Enterprise Mode (Decomposition adapts to Tier; Strict baseline shown below):**
  1. **Domain:** Pure Entity/Aggregate + Value Objects; PSR-14 Domain Events; pure `*RepositoryInterface`.
  2. **Infrastructure / Persistence:** DB migration; storage implementation of the repository interface (`Sql*Repository`).
  3. **Application / Use Case:** Dedicated single-responsibility Use Case Handler (`*Command` + `*Handler`); post-commit event listeners.
  4. **Presentation & Wiring:** Typed Input DTO; thin Action delegating to the Use Case Handler; full DI binding and Production Readiness Gate.
- **In Patch Mode:** Touched stages only (1–3 files); skips domain aggregates; skips migrations only if no DB schema changes are required (author reversible migration if schema changes).

**Standard Artifact Graph (Enterprise / Strict baseline):**
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
   - **Single-Action Controller / Action:** Commonly an invokable class (`__invoke(ServerRequestInterface $request): ResponseInterface`) or a PSR-15 `RequestHandlerInterface` implementation.
     - *Responsibility:* Hydrate DTO (`yiisoft/hydrator`; the integrated HTTP path is `yiisoft/hydrator-validator` + `yiisoft/input-http`), validate (`yiisoft/validator`), call Use Case, return `ResponseInterface` via `Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface` (API) or `Yiisoft\Yii\View\Renderer\WebViewRenderer` (HTML; `ViewRenderer` is deprecated since yii-view-renderer 7.4.0).
     - *Anti-pattern:* Never put SQL queries, password hashing, or email sending directly inside the Action.
5. **Configuration & Wiring (Mandatory):**
   - **DI:** Bind `OrderRepositoryInterface => SqlOrderRepository` in `config/common/di/*.php`. Definition forms: `Interface::class => Class::class` or the full form `['class' => ..., '__construct()' => [...]]`.
   - **Events:** Map listeners in the events config group selected by the `'yiisoft/yii-event' => ['eventsConfigGroup' => ...]` param (`events-web` for HTTP, `events-console` for console). Group declaration, the `$events` reference wiring, and the file-mapping recipe (e.g. `config/common/events.php`) are owned by the [Events & Listeners Guide, §4.1](core-events-design.md#41-configuration-architecture--scopes).
   - **Routes:** Register routes in `config/common/routes.php` (the only routes group in the canonical template — there is no `routes-web` group). Use version-aware route syntax — see Archetype F and the [Routing Guide](http-routes.md).

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

> [!TIP]
> **Pagination & Sorting Reference:**
> For the complete reference on `QueryDataReader` sorting (`Sort::only()` / `Sort::any()`) and `OffsetPaginator` behavior, see the [Persistence: Plain DB Guide, §5.1](persistence-db-readers-and-drivers.md#51-querydatareader--sorting-sortonly-sortany) and [§5.2](persistence-db-readers-and-drivers.md#52-offset-pagination-offsetpaginator).

**API response composition** (fragment of an Archetype B list action):

```php
// Fragment of an Archetype B list action — the API response composition:
$list = $this->productListService->getList(currentPage: $page);
return $this->dataResponseFactory->createResponse($list, Status::OK); // Yiisoft\Http\Status
```

**Web listing:** render through `yiisoft/view` templates and the dataview widget — note the doubled sub-namespace: `Yiisoft\Yii\DataView\GridView\GridView::widget()->dataReader($paginator)->columns(new DataColumn(property: 'title', header: 'Title'))` (rendering details are owned by the [DataView Widgets Guide, §1–§2](http-dataview-widgets.md)).

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
> For the complete reference on producer push patterns (`QueueProducerInterface`, delayed execution, `status()` with the `MessageStatus` codes), custom message DTOs with the `fromPayload()` contract, handler mapping in params (including the zero-config path when the message type equals the handler FQCN), and worker CLI commands, see the [Queue & Asynchronous Jobs Guide, §3-§4](infra-queue-jobs.md#3-pushing-messages-to-queue).
> For the push/consume/failure middleware pipelines, see [§5](infra-queue-jobs.md#5-middleware-subsystems-failure-handling--pipelines); for broker adapter specifics (`queue-db`, `queue-redis`, `queue-amqp`), see the [Queue Broker Adapters Guide](infra-queue-brokers.md).

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
    <!-- CSRF: the `csrf` view parameter (masked token) is injected by CsrfViewInjection;
         the middleware reads the token from the `_csrf` body param or the `X-CSRF-Token` header. -->
    <input type="hidden" name="_csrf" value="<?= Html::encode((string) $csrf) ?>">
    <?= Field::text($form, 'login') ?>
    <?= Field::password($form, 'password') ?>
    <button type="submit">Sign up</button>
</form>
```

Note: CSRF is not auto-embedded by `yiisoft/form` or `yiisoft/form-model` — the middleware plus the rendered token handle it (see the [Validation & Forms Guide](http-validation-and-forms.md), the [HTTP State Guide](http-state.md), and the [Middlewares Guide, §3.2 — CSRF Middleware Behavior](http-middlewares.md#32-csrf-middleware-behavior)).

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
> For the complete reference on styled terminal I/O (`SymfonyStyle` banners, tables, prompts, progress bars), see the [Console Commands Guide, §5](infra-commands.md#5-interactive-terminal-ux-with-symfonystyle); for exit-code conventions, see [§6](infra-commands.md#6-standard-exit-codes-yiisoftyiiconsoleexitcode).
> For memory-safe cursor streaming (`Query::each()` / `Query::batch()`) and bulk inserts, see the [Persistence: Plain DB Guide, §3.4](persistence-db-connection-and-queries.md#34-memory-safe-cursor-streaming-each--batch).

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
     The `:` separator is the naming convention; alias/hidden syntax `'start|run|s|r'` is supported (see the [Commands Guide](infra-commands.md)).

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
     > [!TIP]
     > **Routing Reference:**
     > **Version-aware route syntax:** the snippet uses the `yiisoft/router` >= 4.0.3 constructor classes — discriminator: check whether `vendor/yiisoft/router/src/Route/Get.php` exists in the installed project (static factories are deprecated since 4.0.3). For the complete reference on verb classes and route collection wiring, see the [Routing Guide, §1.1](http-routes-definition.md#11-dedicated-http-verb-classes).

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
> For the complete reference on `File` / `Image` validation rules and safe post-validation storage, see the [Validation & Forms Guide, §5](http-validation-advanced.md#5-file--image-validation); for the upload pipeline and storage/wiring placement, see the [File Handling Guide, §4](http-file-handling.md#4-file-uploads-psr-7--validator) and [§5](http-file-handling.md#5-placement--wiring).

---

## 2. Business Capability Inference

Translate business terms in user requirements to a Yii3 capability key, then resolve the required packages, driver choices, and key interfaces for that key in the [Package Catalog, §1 — Capability Quick-Lookup Matrix](package-catalog.md#1-capability-quick-lookup-matrix):

| Business Need in User Prompt | Yii3 Capability Key(s) |
|---|---|
| Passwords, hashing, tokens | `security` |
| Email notifications, confirmation | `mail`, `events` |
| Tables, schema, DB storage | `db`, `migrations` |
| Form validation, payload validation | `validation`, `hydrator` |
| REST API, JSON output | `response` |
| Data grids, pagination, sorting | `dataview`, `data` |
| Background tasks, deferred jobs | `queue` |
| Access control, permissions | `rbac`, `access` |
| External login ("sign in with ..."), OAuth2 / OIDC | `auth-client` |
| Console commands, CLI imports | `console` |
| Session, flash messages | `session` |
| File download / export | `download` |
| File uploads & images | `validation` (PSR-7 upload contract) |
| CSS-framework UI components (Bootstrap 5, Bulma) | `widgets` |
| Slugs, case conversion, deep array access, safe JSON | `utilities` |
| IP allow/deny lists, CIDR checks, DNS/email-domain validation | `network` |

When a capability offers interchangeable driver backends (database, cache, queue, RBAC storage), select **exactly one** driver per the [Package Catalog, §3](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family) before writing code — see the [Dependency Protocol](core-dependency-protocol.md) for the full install/verify gate.

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
   - Notice exact Yii3 signature (never use Yii2 signatures). Canonical `AuthorRule` skeleton — `execute(?string $userId, Item $item, RuleContext $context): bool` with the `authorId` parameter comparison:
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
   - `Item` is an `abstract class` and `RuleContext` is `final` (both in `Yiisoft\Rbac`); `RuleContext::getParameterValue(string $name): mixed` returns `mixed`, so compare the string-cast value against the `?string $userId`.
3. **Wiring:**
   - Register rule in `config/common/params.php` under `'yiisoft/rbac-rules-container' => ['rules' => [...]]` (the package default params also carry `'validate' => true`; rule values are yiisoft/factory definitions — class-strings or alias maps).
   - Plan migration or RBAC seeder creating the Permission, attaching the Rule (`Item::withRuleName()`), and assigning to Roles (see the [Auth & RBAC Guide](infra-auth-and-rbac.md)).

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

**Strict rule: never dispatch side-effect events (email, SMS, queue push) inside an uncommitted transaction.** Collect the events on the aggregate and dispatch them strictly after `$db->transaction()` returns — the full pattern (aggregate `recordEvent()` / `releaseEvents()` plus the use-case dispatch loop) is owned by the [Events & Listeners Guide, §5](core-events-design.md#5-mandatory-post-commit-event-dispatching-rule).

> `releaseEvents()` is an application convention — no yiisoft package provides it; model it on your own aggregate base class.
> The commit happens inside `transaction()` before it returns (rollback + rethrow on any `Throwable`), so dispatching after the call provably runs post-commit.
> PSR-14 dispatch is synchronous: listeners run inline before `dispatch()` returns (no outbox or deferral in `yiisoft/event-dispatcher` / `yiisoft/yii-event`) — anything pushed to the queue or mailed starts immediately, which is exactly why the invariant matters.

---

## 5. Layering & Directory Placement Rules

Match the project's architecture style (the resolved architecture artifact, else the dominant existing `src/` style — SKILL.md Core rule 3):

**Choosing a style (decision rule):**
1. If a resolved architecture artifact prescribes a layout, follow it — it is the supreme structural authority.
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

**Topic cross-links:** [Actions & Controllers](http-actions-and-controllers.md), [Routing](http-routes.md), [Validation & Forms](http-validation-and-forms.md), [DI & Config](core-di-and-config.md), [Persistence: Plain DB](persistence-db.md), [Persistence: Active Record](persistence-active-record.md), [Persistence: Cycle ORM](persistence-cycle-orm.md), [Migrations](persistence-migrations.md), [Events & Listeners](core-events-and-listeners.md), [Queue Jobs](infra-queue-jobs.md), [Console Commands](infra-commands.md), [Auth & RBAC](infra-auth-and-rbac.md), [Mailer](infra-mailer.md), [Views & Widgets](http-views-and-widgets.md), [File Handling](http-file-handling.md), [HTTP State](http-state.md).

---

## 6. Chain Integrity Checklist (No Missing Links)

Every feature implementation must satisfy these architectural tiers and integrity invariants:

### 6.1. Three-Tier Mode Intensity

| Mode | Applicable Scope | Graph Shape & Architecture | Mandatory Invariants |
|---|---|---|---|
| **Patch** | Single route, config/DI edit, single bugfix, helper lookup. | Touched stages only. Domain layers and extended DoD skipped. | Per-step wiring gate for any touched interface/route/command. |
| **Feature** (Default) | Standard business feature or CRUD without complex domain invariants (admin dictionaries, lookup tables, settings toggles). | Actions strictly thin (zero direct SQL/persistence). Domain abstractions collapse: Application Service / Use Case directly interacts with concrete repository without separate Domain Entity or Repository Interface pair (if project architecture permits). | Thin Actions, Input DTOs with validation rules, DB transactions in handlers, per-step wiring gates, unit/functional tests. |
| **Enterprise** | State-changing business processes, state machines, multi-step transactions, async queues/events, auth/security, infrastructure slices. | Complete bottom-up graph: Aggregate Entity, Value Objects, Repository Interface + Implementation, Use Case Command & Handler, Domain Events, Input DTOs, Actions, Tests. | All per-step wiring gates, post-commit event dispatch, full Production Readiness Gate. |

### 6.2. Mission State Tracker Schema

Before writing code, establish and print the explicit Mission State:

```markdown
### Mission State
- **Mode:** <Patch | Feature | Enterprise>
- **Architecture:** <project source | convention fallback>
- **Guides:** <primary guides to load>
- **Stage Progress:**
  - Stage 1 [Migration & Schema]: <pending | skipped — reason>
  - Stage 2 [Domain Entity & Repository Contract]: <pending | skipped — reason>
  - Stage 3 [Repository Implementation]: <pending | skipped — reason>
  - Stage 4 [Use Case & Domain Events]: <pending | skipped — reason>
  - Stage 5 [Input DTO & Action / Command]: <pending | skipped — reason>
  - Stage 6 [Config Audit & Wiring Gate]: pending
  - Stage 7 [Tests & Quality Gate]: pending
```

As each stage completes, verify its per-step wiring gate immediately and record the transition (`Stage N complete: <artifacts> | Wiring gate: pass`).

### 6.3. Chain Integrity Invariants

- [ ] **Mission State complete:** All active stages in the Mission State tracker completed with passing wiring gates.
- [ ] **Data layer connected:** If entity persists state → Migration exists + Repository implements Interface.
- [ ] **DI registered:** Every newly introduced interface has a binding in `config/common/di/*.php` or `config/web/di/*.php`.
- [ ] **Route reachable:** Every newly created Action is mounted in `config/common/routes.php` (the canonical template has no `routes-web` group) with correct HTTP method and typed parameter tokens (`{id:\d+}`).
- [ ] **Console command wired:** Every Console Command is registered in `config/console/params.php`.
- [ ] **Events wired:** Any Domain Event has listeners mapped in the events config group selected by `eventsConfigGroup` (see [Events & Listeners Guide, §4.1](core-events-design.md#41-configuration-architecture--scopes)).
- [ ] **Events post-commit:** All event dispatches with external side-effects (mail, sms, queue) occur outside/after DB transactions (see [Events & Listeners Guide, §5](core-events-design.md#5-mandatory-post-commit-event-dispatching-rule)).
- [ ] **Input sanitized:** Any user input passes through a DTO validated with `yiisoft/validator` attributes.
- [ ] **Forms protected:** Web forms are covered by the active CSRF middleware `Yiisoft\Csrf\CsrfTokenMiddleware` (with `SessionMiddleware` before it) and token validation.
- [ ] **Action is thin:** Action only coordinates HTTP: Request -> Hydrate DTO -> Validate -> Call Handler/Service -> Build Response.
- [ ] **Response is PSR-7:** Action returns `Psr\Http\Message\ResponseInterface` via `ResponseFactory\DataResponseFactoryInterface` or `WebViewRenderer` (the `ViewRenderer` alias is deprecated).

---

## 7. Verified Pitfalls & Deprecations

Deprecation-sensitive and error-prone APIs, verified against installed package sources. Check the installed versions under `vendor/` before generating code.

| # | Pitfall | Guidance | Anchor |
|---|---|---|---|
| 1 | `ViewRenderer` deprecated | `Yiisoft\Yii\View\Renderer\ViewRenderer` is `@deprecated` since yii-view-renderer 7.4.0 — use `WebViewRenderer` (`render(...): ResponseInterface`; the deprecated `ViewRenderer::render(string $view, array $parameters = [])` returns the legacy `DataResponse`). Layout defaults to none when unset. Full signature surface: inspect the installed sources under `vendor/yiisoft/yii-view-renderer/src/` | `vendor/yiisoft/yii-view-renderer/src/ViewRenderer.php`, `src/WebViewRenderer.php` |
| 2 | Legacy data-response surface | Root-namespace `DataResponseFactoryInterface`, `DataResponse`, and the formatter middleware are `@deprecated` — use `Yiisoft\DataResponse\ResponseFactory\*` factories: `createResponse(mixed $data = null, int $code = Status::OK, string $reasonPhrase = '')` has no `$headers` parameter (chain `->withHeader()` afterwards). `JsonResponseFactory` is self-contained for JSON APIs | `vendor/yiisoft/data-response/src/` |
| 3 | CSRF class rename | `Yiisoft\Csrf\CsrfMiddleware` is `@deprecated` (since csrf 2.2.0) — use `Yiisoft\Csrf\CsrfTokenMiddleware`: token read from the `_csrf` body param or `X-CSRF-Token` header, safe methods (GET/HEAD/OPTIONS) skipped, failure responds `422`. `SessionMiddleware` must precede it in the stack. Behavior details: [Middlewares Guide, §3.2](http-middlewares.md#32-csrf-middleware-behavior) | `vendor/yiisoft/csrf/src/CsrfTokenMiddleware.php` |
| 4 | Mailer templates removed | Mailer template rendering (`MessageBodyRenderer`, `compose()`, `withTemplate()`) was removed in mailer 6.0.0 — render HTML via `yiisoft/view` and pass it to `withHtmlBody()`. The base package binds only `FileMailer`; the `MailerInterface => Mailer` binding ships with `yiisoft/mailer-symfony` | `vendor/yiisoft/mailer/` (CHANGELOG, `config/`) |
| 5 | Router version skew | Discriminator: check whether `vendor/yiisoft/router/src/Route/Get.php` exists in the installed project — static factories are deprecated since 4.0.3. Verb-class syntax: [Routing Guide, §1.1](http-routes-definition.md#11-dedicated-http-verb-classes) | `vendor/yiisoft/router/src/Route.php`, `src/Route/Get.php` |
| 6 | Wrong data-reader name | There is NO `ArrayDataReader` in `yiisoft/data` 2.x — the in-memory reader is `Yiisoft\Data\Reader\Iterable\IterableDataReader` | `vendor/yiisoft/data/src/Reader/Iterable/` |
| 7 | GridView namespace | The dataview grid FQCN has a doubled sub-namespace: `Yiisoft\Yii\DataView\GridView\GridView` | `vendor/yiisoft/yii-dataview/src/GridView/GridView.php` |
| 8 | Hydration attributes location | `#[FromQuery]` / `#[FromBody]` live in `Yiisoft\Input\Http\Attribute\Data\*` (package `yiisoft/input-http`), NOT in `Yiisoft\Hydrator\*` | `vendor/yiisoft/input-http/src/Attribute/Data/` |
| 9 | `Inflector` is instance-only | All `Yiisoft\Strings\Inflector` methods are instance methods: `(new Inflector())->toSlug('Hello World')` — never call statically. Method catalog: [Utility Packages Guide, §3.2](core-utilities.md#32-inflector-case-slugs-pluralization-transliteration) | `vendor/yiisoft/strings/src/Inflector.php` |
| 10 | No `StringHelper::truncate()` | `yiisoft/strings` 2.x provides `truncateBegin`, `truncateMiddle`, `truncateEnd`, `truncateWords`, `truncateWordsByLength` — there is no plain `truncate()`. Available methods: [Utility Packages Guide, §3.1](core-utilities.md#31-stringhelper-32-utf-8-safe-methods) | `vendor/yiisoft/strings/src/StringHelper.php` |
| 11 | `ArrayHelper::getValue()` dotted keys | Dotted string keys are NOT traversed by `getValue()` — use `getValueByPath()` or an array of keys. Path-aware access: [Utility Packages Guide, §2.1](core-utilities.md#21-getting-setting--removing-values-direct-and-by-path) | `vendor/yiisoft/arrays/src/ArrayHelper.php` |
| 12 | RBAC fails closed | `CurrentUser::can()` returns `false` without an attached checker — `withAccessChecker()` must be applied by DI wiring. Without a configured guest role, guest checks also fail closed. Action-layer wiring: [Actions & Controllers Guide, §3.8](http-actions-concerns.md#38-authentication--authorization-yiisoftuser-yiisoftauth-jwt) | `vendor/yiisoft/user/src/CurrentUser.php` |
| 13 | Queue retry is opt-in | Retry is not built into `yiisoft/queue` core — see the [Queue & Asynchronous Jobs Guide, §5](infra-queue-jobs.md#5-middleware-subsystems-failure-handling--pipelines) for the failure middleware pipeline | `vendor/yiisoft/queue/config/params.php` |
| 14 | No Yii base console command | Extend `Symfony\Component\Console\Command\Command` (no `Yiisoft\Yii\Console\Command` base class exists); exit-code conventions: [Console Commands Guide, §6](infra-commands.md#6-standard-exit-codes-yiisoftyiiconsoleexitcode) | `vendor/yiisoft/yii-console/src/Command/` |
| 15 | Upload contract is PSR-7 | `UploadedFileInterface` comes from `psr/http-message` (NOT `yiisoft/http`, which only ships header/status/method classes); `moveTo()` and temp-file semantics are PSR-7 contract — verify against `vendor/psr/http-message/` | `vendor/yiisoft/validator/src/Rule/File.php` |
| 16 | Active Record `tableName()` | Non-static instance method (`public function tableName(): string`); overriding is optional (`{{%snake_case}}` derived from the class short name). A stale `public static` docblock example inside the package's `ActiveRecord.php` must not be copied. `save()` returns `void` | `vendor/yiisoft/active-record/src/` |
| 17 | Dispatch is synchronous | PSR-14 listeners run inline before `dispatch()` returns (no outbox/deferral) — this is why the post-commit invariant in §4 matters | `vendor/yiisoft/event-dispatcher/src/Dispatcher/Dispatcher.php` |
| 18 | form-model strict fill | Only properties carrying validation rules are populated from request data by default — `#[Safe]` opts a property out. Hydration & mass-assignment details: [Validation & Forms Guide, §8.2](http-forms-and-hydration.md#82-formhydrator-population-getpost-scoping-and-mass-assignment-protection) | `vendor/yiisoft/form-model/src/FormHydrator.php` |
| 19 | Views are not auto-escaped | Template output is NOT escaped automatically — escape with `Html::encode()`. Escaping catalog: [Views & Widgets Guide, §4](http-views.md#4-mandatory-xss-escaping--safe-html-yiisofthtmlhtml) | `vendor/yiisoft/view/` (docs: use-in-web-environment) |
| 20 | Event config fails late | Config-format errors throw at build time, but bad listener definitions pass config build and fail at dispatch — run `ListenerConfigurationChecker::check()` in development (timing details: [Events & Listeners Guide, §4.3](core-events-design.md#43-verifying-event-configurations-ahead-of-time)) | `vendor/yiisoft/yii-event/src/ListenerConfigurationChecker.php` |
