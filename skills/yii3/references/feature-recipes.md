# Yii3 Feature Decomposition Recipes

> Guides how to decompose high-level business feature requests into complete, idiomatic Yii3 architecture artifacts (Domain, Persistence, Use Cases, Presentation, Wiring, Tests).
>
> **Source of Truth:** For class signatures and interfaces, inspect the installed `vendor/yiisoft/<pkg>/src/`. Always decompose user business requests into the complete, layered artifact graph below.

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
   - **Input DTO:** Strongly-typed class with `Yiisoft\Validator\Rule\*` PHP attributes.
   - **Single Action Handler:** Invokable (`__invoke(ServerRequestInterface $request): ResponseInterface`) or PSR-15 `RequestHandlerInterface`.
     - *Responsibility:* Hydrate DTO (`yiisoft/hydrator`), validate (`yiisoft/validator`), call Use Case, return `ResponseInterface` via `DataResponseFactoryInterface` (API) or `ViewRenderer` (HTML).
     - *Anti-pattern:* Never put SQL queries, password hashing, or email sending directly inside the Action.
5. **Configuration & Wiring (Mandatory):**
   - **DI:** Bind `OrderRepositoryInterface => SqlOrderRepository` in `config/common/di/*.php`.
   - **Events:** Register listener to event in `config/common/events.php` or `config/web/events.php`.
   - **Routes:** Register `Route::post(...)` in `config/common/routes.php` or `config/web/routes.php`.

---

### Archetype B: Read / Query / Data Listing (e.g., catalog, user profile, analytics report)
Queries data without changing state; supports pagination, sorting, filters.

**Required Artifact Graph:**
1. **Query DTO:** Strongly typed filter/pagination parameters.
2. **Read Service / Query Repository:** Read-only queries using `yiisoft/db` or `yiisoft/data` (`DataReaderInterface`, `OffsetPaginator`, `Sort`).
3. **Action:** Hydrates query parameters, calls Read Service, formats data.
4. **Presentation:**
   - API: `DataResponseFactoryInterface` with serialized data and paginator metadata.
   - Web: View template using `yiisoft/view` and widgets (`yiisoft/yii-dataview` / `GridView`).
5. **Wiring:** Route in `routes.php`, DI binding in `di/*.php`.

---

### Archetype C: Async / Background Job (e.g., CSV export, batch sync, notifications)
Deferred execution via queue.

**Required Artifact Graph:**
1. **Message / Job DTO:** Serializable data payload for queue (`yiisoft/queue`).
2. **Job Handler:** Worker consuming message and calling the corresponding Use Case.
3. **Producer Action / Command:** Pushes message to `QueueInterface`.
4. **Wiring:** Register queue adapter (`yiisoft/queue-amqp`, `yiisoft/queue-db`, etc.) and handler mapping in DI/queue config.

---

### Archetype D: Web Form / Interactive Page (HTML UI)
Full-page rendering with forms and assets.

**Required Artifact Graph:**
1. **Form Model / Input DTO:** Form fields with validation rules.
2. **View & Layout:** `.php` templates using `yiisoft/view` / `yiisoft/yii-view-renderer`.
3. **Form Elements:** Rendered using `yiisoft/form` and `yiisoft/html`.
4. **Assets:** Bundle extending `Yiisoft\Assets\AssetBundle`.
5. **Action:** GET renders form, POST processes via Use Case.
6. **Wiring:** Route with middleware (CSRF `yiisoft/csrf`, Session `yiisoft/session`).

---

### Archetype E: CLI / Console Command (e.g., data import, reindexing, cron cleanup)
Processes background or maintenance tasks via command line interface (`yiisoft/yii-console`).

**Required Artifact Graph:**
1. **Console Command Class:**
   - Extends `Symfony\Component\Console\Command\Command`.
   - Constructor injection of Use Cases / Services.
   - Arguments & options configured via `configure()` or `#[AsCommand(name: 'catalog:import')]`.
   - Uses `SymfonyStyle($input, $output)` for interactive input (`ask`, `confirm`, `choice`, `askHidden`).
   - For batch/bulk processing:
     * Stream or chunk data (generators / `iterable`) to avoid out-of-memory.
     * Use `Symfony\Component\Console\Helper\ProgressBar` for terminal feedback.
     * Execute bulk database writes via `$db->createCommand()->batchInsert($table, $columns, $batchRows)->execute()`.
   - Strictly returns `Yiisoft\Yii\Console\ExitCode::OK` or `ExitCode::UNSPECIFIED_ERROR`.
   - *Anti-pattern:* Never put raw SQL queries or business algorithms directly inside the command; delegate to Use Cases.
2. **Wiring (Mandatory):**
   - Register in `config/console/params.php` (or `config/common/params.php`):
     ```php
     'yiisoft/yii-console' => [
         'commands' => [
             'catalog:import' => \App\Catalog\Console\ImportCommand::class,
         ],
     ],
     ```

---

### Archetype F: RESTful Resource CRUD (Full API Lifecycle)
Exposes complete collection and resource management with standard HTTP semantics.

**Required Artifact Graph:**
1. **Actions (Single-Action Handlers):**
   - `ListAction`: Takes Query DTO with `#[FromQuery]`; uses `Yiisoft\Data\Paginator\OffsetPaginator`; returns `200 OK` with items and pagination meta.
   - `ViewAction`: Takes path parameter ID; fetches entity via Repository; returns `200 OK` or throws/returns `404 Not Found`.
   - `CreateAction`: Takes Input DTO with `#[FromBody]`; validates; returns `422 Unprocessable Entity` with `$result->getErrorMessagesIndexedByProperty()` on error; on success calls Use Case and returns `201 Created` with `Location` header.
   - `UpdateAction`: Takes path parameter ID and Input DTO; validates; calls Use Case; returns `200 OK` with updated resource.
   - `DeleteAction`: Takes path parameter ID; calls Use Case; returns `204 No Content`.
2. **Nested Sub-Resources (e.g., `/api/orders/{orderId:\d+}/items`):**
   - Always verify parent existence in Use Case: if parent missing, throw Domain Exception -> Action maps to `404 Not Found`.
   - Ensure transactional consistency when creating or updating items bound to the parent entity.
3. **DTO & Validation:**
   - Dedicated DTOs for Create and Update (if writable fields differ, preventing mass-assignment of IDs/timestamps).
   - Strict PHP 8 attributes (`#[Required]`, `#[Length]`, `#[Regex]`, `#[Integer]`).
4. **Wiring:**
   - Route group in `config/web/routes.php`:
     ```php
     Group::create('/api/products')
         ->routes(
             Route::get('')->action(ListProductsAction::class)->name('api.products.list'),
             Route::post('')->action(CreateProductAction::class)->name('api.products.create'),
             Route::get('/{id:\d+}')->action(ViewProductAction::class)->name('api.products.view'),
             Route::put('/{id:\d+}')->action(UpdateProductAction::class)->name('api.products.update'),
             Route::delete('/{id:\d+}')->action(DeleteProductAction::class)->name('api.products.delete'),
         );
     ```

---

### Archetype G: File Upload & Media Processing (e.g., avatar, document import, invoice PDF)
Processes multipart form-data uploads securely.

**Required Artifact Graph:**
1. **Input DTO:**
   - Uses PHP attribute `Yiisoft\Validator\Rule\File\File` or `Image`:
     ```php
     final readonly class UploadAvatarRequest
     {
         public function __construct(
             #[File(extensions: ['jpg', 'png', 'webp'], maxSize: 2 * 1024 * 1024)]
             public UploadedFileInterface $avatar,
         ) {}
     }
     ```
2. **Storage Service (Infrastructure):**
   - Moves uploaded file via `$uploadedFile->moveTo($targetPath)` using a randomly generated UUID name. Never trust the client filename.
3. **Action:**
   - Retrieves uploaded file from `$request->getUploadedFiles()['avatar']`.
   - Validates via `ValidatorInterface`, calls Use Case, returns response with file URL.

---

## 2. Business Capability Inference

Translate business terms in user requirements to corresponding Yii3 capabilities and packages:

| Business Need in User Prompt | Yii3 Capability Key | Required Packages | Key Interfaces & Classes |
|---|---|---|---|
| Passwords, hashing, tokens | `security` | `yiisoft/security` | `PasswordHasher`, `Random` |
| Email notifications, confirmation | `mail`, `events` | `yiisoft/mailer`, `yiisoft/yii-event` | `MailerInterface`, `MessageInterface`, `EventDispatcherInterface` |
| Tables, schema, DB storage | `db`, `migrations` | `yiisoft/db`, `yiisoft/db-migration`, driver | `ConnectionInterface`, `MigrationBuilder` |
| Form validation, payload validation | `validation`, `hydrator` | `yiisoft/validator`, `yiisoft/hydrator` | `ValidatorInterface`, `HydratorInterface`, `#[Rule]` attributes |
| REST API, JSON output | `response` | `yiisoft/data-response` | `ResponseFactory\DataResponseFactoryInterface`, `DataResponse` |
| Data grids, pagination, sorting | `dataview`, `data` | `yiisoft/data`, `yiisoft/yii-dataview` | `OffsetPaginator`, `Sort`, `DataReaderInterface` |
| Background tasks, deferred jobs | `queue` | `yiisoft/queue`, adapter (`queue-db` / `queue-redis`) | `QueueInterface`, `MessageInterface` |
| Access control, permissions | `rbac`, `access` | `yiisoft/rbac`, `yiisoft/user` | `ManagerInterface`, `CurrentUser` |
| Console commands, CLI imports | `console` | `yiisoft/yii-console` | `Symfony\Component\Console\Command\Command`, `ExitCode` |
| Session, flash messages | `session` | `yiisoft/session` | `SessionInterface`, `FlashInterface` |
| File download / export | `response-download` | `yiisoft/response-download` | `ResponseDownloadFactoryInterface` |
| File uploads & images | `validation`, `http` | `yiisoft/validator`, `yiisoft/http` | `UploadedFileInterface`, `#[File]`, `#[Image]` |

---

## 3. Authorization & RBAC Protocol (`yiisoft/rbac` + `yiisoft/user`)

When a feature requires role-based or permission-based checks:
1. **Permission Check in Presentation / Action:**
   - Inject `Yiisoft\User\CurrentUser`.
   - Check permission before invoking Use Case:
     ```php
     if (!$this->currentUser->can('editPost', ['authorId' => $post->getAuthorId()])) {
         return $this->responseFactory->createResponse(['message' => 'Forbidden'], 403);
     }
     ```
2. **Dynamic Rule Implementation:**
   - Create class implementing `Yiisoft\Rbac\RuleInterface`.
   - Notice exact Yii3 signature (never use Yii2 signatures):
     ```php
     use Yiisoft\Rbac\Item;
     use Yiisoft\Rbac\RuleContext;
     use Yiisoft\Rbac\RuleInterface;

     final readonly class AuthorRule implements RuleInterface
     {
         public function execute(?string $userId, Item $item, RuleContext $context): bool
         {
             $authorId = $context->getParameter('authorId');
             return $userId !== null && $userId === (string)$authorId;
         }
     }
     ```
3. **Wiring:**
   - Register rule in `config/common/params.php` under `'yiisoft/rbac-rules-container' => ['rules' => [...]]`.
   - Plan migration or RBAC seeder creating the Permission, attaching the Rule, and assigning to Roles.

---

## 4. Persistence Strategy Selection (Plain DB vs Active Record vs Cycle)

Inspect `composer.json` and existing repositories to detect storage engine:

| Strategy | Detected Package | Entity Style | Repository Implementation Pattern |
|---|---|---|---|
| **Plain DB** | `yiisoft/db` | Pure POPO (Plain Old PHP Object) with constructor promotion | Injects `ConnectionInterface`. Uses `(new Query($this->db))->from('table')`, `$this->db->createCommand()`, and `$this->db->transaction()`. |
| **Active Record** | `yiisoft/active-record` | Extends `Yiisoft\ActiveRecord\ActiveRecord` with `public static function tableName()` | Models handle their own SQL via `ActiveQuery`. Repository encapsulates complex finder methods and persists models via `$ar->save()`. Validated outside via DTO. |
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

---

## 5. Layering & Directory Placement Rules

Match the project's architecture style (discovered from `.ai-factory/ARCHITECTURE.md` or existing `src/`):

### Style 1: Vertical Slice (Feature-based, common in modern Yii3 apps)
```
src/
  Order/
    Checkout/
      CheckoutAction.php       # Presentation / HTTP
      CheckoutRequest.php      # Input DTO with #[Rule]
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

---

## 6. Chain Integrity Checklist (No Missing Links)

Every feature implementation plan must satisfy these integrity invariants:
- [ ] **Data layer connected:** If entity persists state → Migration exists + Repository implements Interface.
- [ ] **DI registered:** Every newly introduced interface has a binding in `config/common/di/*.php` or `config/web/di/*.php`.
- [ ] **Route reachable:** Every newly created Action is mounted in `config/common/routes.php` or `config/web/routes.php` with correct HTTP method and typed parameter tokens (`{id:\d+}`).
- [ ] **Console command wired:** Every Console Command is registered in `config/console/params.php`.
- [ ] **Events wired:** Any Domain Event has listeners registered in `config/common/events.php`.
- [ ] **Events post-commit:** All event dispatches with external side-effects (mail, sms, queue) occur outside/after DB transactions.
- [ ] **Input sanitized:** Any user input passes through a DTO validated with `yiisoft/validator` attributes.
- [ ] **Forms protected:** Web forms include CSRF middleware (`yiisoft/csrf`) and token validation.
- [ ] **Action is thin:** Action only coordinates HTTP: Request -> Hydrate DTO -> Validate -> Call Handler/Service -> Build Response.
- [ ] **Response is PSR-7:** Action returns `Psr\Http\Message\ResponseInterface` via `DataResponseFactoryInterface` or `ViewRenderer`.
