# Yii3 Feature Decomposition Recipes

> **Grounding:** APIs in `vendor/yiisoft/<pkg>/src/`, patterns in this guide, conventions in architecture artifact (SKILL.md Core rule 2).

> Architectural decomposition rules, business capability inference, RBAC authorization, persistence strategy selection, vertical-slice vs layered placement, and chain integrity verification in Yii3 applications.

This guide provides architectural decomposition rules and cross-cutting invariants. For concrete, step-by-step code recipes across the 7 feature archetypes, load the dedicated archetype guide:

- [Feature Archetype Recipes](core-feature-archetypes.md) — Detailed implementation recipes for Archetypes A through G: state change, query listings, background jobs, HTML forms, CLI commands, REST CRUD, and file uploads (§1).

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
  - Stage 2 [Domain / Model & Repository Boundary]: <pending | skipped — reason>
  - Stage 3 [Repository / Persistence Implementation]: <pending | skipped — reason>
  - Stage 4 [Use Case & Domain Events]: <pending | skipped — reason>
  - Stage 5 [Input DTO & Action / Command]: <pending | skipped — reason>
  - Stage 6 [Config Audit & Wiring Gate]: pending
  - Stage 7 [Tests & Quality Gate]: pending
```

As each stage completes, verify its per-step wiring gate immediately and record the transition (`Stage N complete: <artifacts> | Wiring gate: pass`).

### 6.3. Chain Integrity Invariants

- [ ] **Mission State complete:** All active stages in the Mission State tracker completed with passing wiring gates.
- [ ] **Data layer connected:** If entity persists state → Migration exists + Repository implements Interface.
- [ ] **DI registered:** Every newly introduced interface has a binding per the project's config style (`config/common/di/*.php`, `config/web/di/*.php`, or a `ServiceProviderInterface` — see [Configuration Architecture & Parameters, §2.6](core-config-tree.md#26-choosing-how-to-organize-application-configs)).
- [ ] **Route reachable:** Every newly created Action is mounted per the project's routing style (`config/common/routes.php` default — no `routes-web` group in canonical template — with correct HTTP method and typed parameter tokens `{id:\d+}`, or active `FileRouter` path; see [Routing Guide, §1](http-routes-definition.md#choosing-how-to-route-http-requests)).
- [ ] **Console command wired:** Every Console Command is registered in `config/console/params.php`.
- [ ] **Events wired:** Any Domain Event has listeners mapped in the events config group selected by `eventsConfigGroup` (or active `ListenerCollection` when using `yiisoft/event-dispatcher` directly — see [Events & Listeners Guide, §4](core-events-design.md#4-event-configuration-yiisoftconfig--yiisoftyii-event)).
- [ ] **Events post-commit:** All event dispatches with external side-effects (mail, sms, queue) occur outside/after DB transactions (see [Events & Listeners Guide, §5](core-events-design.md#5-mandatory-post-commit-event-dispatching-rule)).
- [ ] **Input sanitized:** Any user input passes through a DTO/FormModel validated with `yiisoft/validator` rules/attributes (or explicit validator calls for ad-hoc scalar checks).
- [ ] **Forms protected:** Web forms are covered by the active CSRF middleware `Yiisoft\Csrf\CsrfTokenMiddleware` (with `SessionMiddleware` before it) and token validation.
- [ ] **Action is thin:** Action only coordinates HTTP: Request -> Hydrate DTO -> Validate -> Call Handler/Service -> Build Response.
- [ ] **Response is PSR-7:** Action returns `Psr\Http\Message\ResponseInterface` via `ResponseFactory\DataResponseFactoryInterface` (including self-contained `JsonResponseFactory`), `WebViewRenderer` (`ViewRenderer` alias is deprecated), or PSR-17 `ResponseFactoryInterface`.

---

## 7. Verified Pitfalls & Deprecations

Deprecation-sensitive and error-prone APIs, verified against installed package sources. Check the installed versions under `vendor/` before generating code.

| # | Pitfall | Guidance | Anchor |
|---|---|---|---|
| 1 | `ViewRenderer` deprecated | `Yiisoft\Yii\View\Renderer\ViewRenderer` is `@deprecated` since yii-view-renderer 7.4.0 — use `WebViewRenderer` (`render(...): ResponseInterface`; the deprecated `ViewRenderer::render(string $view, array $parameters = [])` returns the legacy `DataResponse`). Layout defaults to none when unset. Full signature surface: inspect the installed sources under `vendor/yiisoft/yii-view-renderer/src/` | `vendor/yiisoft/yii-view-renderer/src/ViewRenderer.php`, `src/WebViewRenderer.php` |
| 2 | Legacy data-response surface | Root-namespace `DataResponseFactoryInterface`, `DataResponse`, and the formatter middleware are `@deprecated` — use `Yiisoft\DataResponse\ResponseFactory\*` factories: `createResponse(mixed $data = null, int $code = Status::OK, string $reasonPhrase = '')` has no `$headers` parameter (chain `->withHeader()` afterwards). `JsonResponseFactory` is self-contained for JSON APIs | `vendor/yiisoft/data-response/src/` |
| 3 | CSRF class rename | `Yiisoft\Csrf\CsrfMiddleware` is `@deprecated` (since csrf 2.2.0) — use `Yiisoft\Csrf\CsrfTokenMiddleware`: token read from the `_csrf` body param or `X-CSRF-Token` header, safe methods (GET/HEAD/OPTIONS) skipped, failure responds `422`. `SessionMiddleware` must precede it in the stack. Behavior details: [Middlewares Guide, §3.2](http-middlewares-protocol.md#32-csrf-middleware-behavior) | `vendor/yiisoft/csrf/src/CsrfTokenMiddleware.php` |
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
| 14 | No Yii base console command | Extend `Symfony\Component\Console\Command\Command` (no `Yiisoft\Yii\Console\Command` base class exists); exit-code conventions: [Console Commands Guide, §6](infra-commands-execution.md#6-standard-exit-codes-yiisoftyiiconsoleexitcode) | `vendor/yiisoft/yii-console/src/Command/` |
| 15 | Upload contract is PSR-7 | `UploadedFileInterface` comes from `psr/http-message` (NOT `yiisoft/http`, which only ships header/status/method classes); `moveTo()` and temp-file semantics are PSR-7 contract — verify against `vendor/psr/http-message/` | `vendor/yiisoft/validator/src/Rule/File.php` |
| 16 | Active Record `tableName()` | Non-static instance method (`public function tableName(): string`); overriding is optional (`{{%snake_case}}` derived from the class short name). A stale `public static` docblock example inside the package's `ActiveRecord.php` must not be copied. `save()` returns `void` | `vendor/yiisoft/active-record/src/` |
| 17 | Dispatch is synchronous | PSR-14 listeners run inline before `dispatch()` returns (no outbox/deferral) — this is why the post-commit invariant in §4 matters | `vendor/yiisoft/event-dispatcher/src/Dispatcher/Dispatcher.php` |
| 18 | form-model strict fill | Only properties carrying validation rules are populated from request data by default — `#[Safe]` opts a property out. Hydration & mass-assignment details: [Validation & Forms Guide, §8.2](http-forms-and-hydration.md#82-formhydrator-population-getpost-scoping-and-mass-assignment-protection) | `vendor/yiisoft/form-model/src/FormHydrator.php` |
| 19 | Views are not auto-escaped | Template output is NOT escaped automatically — escape with `Html::encode()`. Escaping catalog: [Views & Widgets Guide, §4](http-views.md#4-mandatory-xss-escaping--safe-html-yiisofthtmlhtml) | `vendor/yiisoft/view/` (docs: use-in-web-environment) |
| 20 | Event config fails late | Config-format errors throw at build time, but bad listener definitions pass config build and fail at dispatch — run `ListenerConfigurationChecker::check()` in development (timing details: [Events & Listeners Guide, §4.3](core-events-design.md#43-verifying-event-configurations-ahead-of-time)) | `vendor/yiisoft/yii-event/src/ListenerConfigurationChecker.php` |
