# Yii3 Packages Reference

> Source: [yiisoft.github.io](https://yiisoft.github.io) · [Packagist](https://packagist.org/packages/yiisoft/) · [API 3.0](https://www.yiiframework.com/doc/api/3.0)
>
> **Source code:** In target projects, inspect `vendor/yiisoft/<package>/src/` for class interfaces, method signatures,
> and usage patterns before generating code (in authoring context, use `references/<package>/src/`).


## Use this catalog to:

1. **Select packages** — find which `yiisoft/*` packages are relevant for a given architectural concern
   (e.g. forms, routing, persistence).
2. **Understand layering** — see which packages belong to which architectural layer and their
    compatibility rules (Section 17).
3. **Study source** — examine `references/<package>/src/` for exact class interfaces and signatures.


## 1. Container & DI

| Package | Description |
|---|---|
| `yiisoft/di` | PSR-11 dependency injection container. Core of Yii3's service resolution |
| `yiisoft/factory` | Factory for creating objects with automatic dependency resolution |
| `yiisoft/definitions` | Definition syntax for the DI container (class, function, reference, value) |
| `yiisoft/injector` | PSR-11 injector — calls callable, automatically resolving arguments from the container |
| `yiisoft/proxy` | Generates proxy classes for lazy loading and AOP |
| `yiisoft/config` | Composer plugin + library for merging configs from packages and the application |

**Key concepts:**
- Configuration via PHP arrays in `config/common/`, `config/params/`
- Definitions: arrays with `class` and `args` keys
- Autowiring by type hints
- Config groups: `common`, `params`, `routes`

---

## 2. HTTP & Routing

| Package | Description |
|---|---|
| `yiisoft/router` | Router — maps URLs to handlers |
| `yiisoft/router-fastroute` | FastRoute adapter for high-performance routing |
| `yiisoft/router-composer-attribute-collector` | Collects routes from PHP attributes via Composer |
| `yiisoft/middleware-dispatcher` | PSR-15 middleware dispatcher |
| `yiisoft/http-middleware` | Collection of PSR-15 middleware for HTTP functions |
| `yiisoft/yii-middleware` | Yii-specific middleware (session, routing, etc.) |
| `yiisoft/http` | HTTP constants: methods, status codes, header names |
| `yiisoft/yii-http` | PSR-7 HTTP application — processes incoming requests |
| `yiisoft/request-body-parser` | Middleware for parsing request bodies (JSON, XML, form-data) |
| `yiisoft/request-provider` | PSR-7 request provider |
| `yiisoft/response-download` | Factory for download responses |
| `yiisoft/psr-emitter` | PSR-7 response emitter |
| `yiisoft/cookies` | Convenient cookie handling via PSR-7 |
| `yiisoft/session` | Sessions, PSR-15 session middleware, flash messages |
| `yiisoft/rate-limiter` | Rate-limiting middleware |
| `yiisoft/proxy-middleware` | Proxy middleware wrapping handlers |
| `yiisoft/file-router` | Convention-based file router |

**Key concepts:**
- Routes via PHP attributes or arrays
- Middleware — PSR-15 processing chains
- Route argument reading and URL generation — `yiisoft/router`

---

## 3. Application Runners

| Package | Description |
|---|---|
| `yiisoft/yii-runner` | Base application runner |
| `yiisoft/yii-runner-http` | HTTP (web) application runner |
| `yiisoft/yii-runner-console` | Console application runner |
| `yiisoft/yii-runner-frankenphp` | Runner for FrankenPHP (worker mode) |
| `yiisoft/yii-runner-roadrunner` | Runner for RoadRunner |
| `yiisoft/yii-console` | Console application infrastructure: commands, built-ins, symfony-event bridge |

**Entry points:**
- Web: `public/index.php` → `yii-runner-http`
- Console: `yii` → `yii-runner-console` + `yii-console`

---

## 4. Database & ORM

| Package | Description |
|---|---|
| `yiisoft/db` | Database abstraction layer and query builder |
| `yiisoft/active-record` | Active Record pattern implementation |
| `yiisoft/db-migration` | Migration system |
| `yiisoft/db-mysql` | MySQL / MariaDB driver |
| `yiisoft/db-pgsql` | PostgreSQL driver |
| `yiisoft/db-sqlite` | SQLite driver (use for tests) |
| `yiisoft/db-mssql` | Microsoft SQL Server driver |
| `yiisoft/db-oracle` | Oracle driver |
| `yiisoft/yii-cycle` | Cycle ORM integration (alternative to Active Record) |
| `cycle/annotated` | Annotated-entity mapping attributes (`#[Entity]`, `#[Column]`, relations) for Cycle ORM — config layer over `cycle/orm` (no clone in `references/`; grounded on the persistence-cycle-orm guide) |

**Key concepts:**
- Database connection and SQL execution — `yiisoft/db`
- Query building and Active Record — `yiisoft/db`, `yiisoft/active-record`
- Migrations via `./yii migrate` — `yiisoft/db-migration`

---

## 5. Data Abstractions

| Package | Description |
|---|---|
| `yiisoft/data` | Data abstractions: readers, pagination |
| `yiisoft/data-db` | Data adapter for databases |
| `yiisoft/data-cycle` | Data adapter for Cycle ORM |
| `yiisoft/data-response` | Automatic data-to-PSR-7 response conversion |
| `yiisoft/yii-dataview` | Data display widgets (grid and list views) |

**Key concepts:**
- Data readers and pagination — `yiisoft/data`, `yiisoft/data-db`, `yiisoft/data-cycle`
- Automatic data-to-response conversion for JSON APIs — `yiisoft/data-response`
- Data display widgets — `yiisoft/yii-dataview`

---

## 6. Cache

| Package | Description |
|---|---|
| `yiisoft/cache` | PSR-16 caching abstraction |
| `yiisoft/cache-apcu` | APCu storage |
| `yiisoft/cache-file` | File storage |
| `yiisoft/cache-db` | Database storage |
| `yiisoft/cache-memcached` | Memcached storage |
| `yiisoft/cache-redis` | Redis storage |
| `yiisoft/cache-wincache` | WinCache storage |

**Usage:**
```php
$cache->getOrSet('key', fn() => expensiveCalculation(), 3600);
```

---

## 7. Security & Auth

| Package | Description |
|---|---|
| `yiisoft/security` | Security utilities: password hashing, token generation |
| `yiisoft/csrf` | CSRF protection: token generation, validation, middleware |
| `yiisoft/access` | Access checker interface |
| `yiisoft/auth` | Authentication middleware with pluggable identity repositories |
| `yiisoft/auth-jwt` | JWT-based authentication: token generation and validation |
| `yiisoft/user` | User identity: current user state, login/logout persistence |
| `yiisoft/rbac` | Role-Based Access Control: roles, permissions, rule evaluation |
| `yiisoft/rbac-db` | RBAC storage in database |
| `yiisoft/rbac-php` | RBAC storage in PHP files |
| `yiisoft/rbac-cycle-db` | RBAC storage via Cycle ORM |
| `yiisoft/rbac-rules-container` | Container for RBAC rules |
| `yiisoft/yii-auth-client` | External authentication via OAuth 1.0/2.0 (Google, GitHub, etc.) |

**Key concepts:**
- Current user (guest or authenticated): login, logout, permission checks — `yiisoft/user`, `yiisoft/access`
- Roles, permissions, rule evaluation — `yiisoft/rbac`
- Token-based authentication for APIs — `yiisoft/auth-jwt`
- Password hashing, CSRF, session-backed auth — `yiisoft/security`, `yiisoft/csrf`, `yiisoft/session`

---

## 8. Forms & Validation

| Package | Description |
|---|---|
| `yiisoft/form-model` | Form model base class with hydration and validation support |
| `yiisoft/form` | HTML form builder with widget-based rendering |
| `yiisoft/input-http` | Maps PSR-7 request data to typed PHP DTOs via attributes |
| `yiisoft/validator` | Validation rules and custom validators |
| `yiisoft/hydrator` | Creates and populates typed objects from arrays |
| `yiisoft/hydrator-validator` | Validation-aware hydrator that populates then validates |

**Key concepts:**
- Validation rules via PHP attributes or arrays
- Populating and validating form models — `yiisoft/hydrator-validator`
- Form Model vs. DTO for input handling

---

## 9. Views & Rendering

| Package | Description |
|---|---|
| `yiisoft/view` | Template rendering engine |
| `yiisoft/yii-view-renderer` | PSR-7 compatible view renderer |
| `yiisoft/html` | HTML generation with automatic escaping |
| `yiisoft/widget` | Base widget class |
| `yiisoft/yii-widgets` | Core Yii widget collection |
| `yiisoft/assets` | Asset bundle management |
| `yiisoft/bootstrap5` | Bootstrap 5 widgets |
| `yiisoft/yii-bulma` | Bulma CSS widgets |
| `yiisoft/view-twig` | Twig template engine support |
| `yiisoft/yii-twig` | Twig integration with Yii view renderer |

**Key concepts:**
- Templates: `*.php` files with `@var` docblocks
- Mandatory output escaping — `yiisoft/html`
- Layouts — shared wrapper for pages
- Asset bundles for CSS/JS

---

## 10. Internationalization (i18n)

| Package | Description |
|---|---|
| `yiisoft/i18n` | Internationalization: date/number/currency formatting |
| `yiisoft/translator` | Message translation |
| `yiisoft/translator-extractor` | Extracts translatable messages from source code |
| `yiisoft/translator-message-db` | Database-backed translation storage |
| `yiisoft/translator-message-gettext` | Gettext-based translation storage |
| `yiisoft/translator-message-php` | PHP arrays translation storage |
| `yiisoft/i18n-message-gettext` | Gettext message source for i18n |
| `yiisoft/i18n-message-php` | PHP arrays message source for i18n |

**Usage:**
```php
$translator->translate('Hello, {name}!', ['name' => $user->getName()], 'app');
```

---

## 11. Logging

| Package | Description |
|---|---|
| `yiisoft/log` | PSR-3 logging library with targets |
| `yiisoft/log-target-file` | File log target |
| `yiisoft/log-target-db` | Database log target |
| `yiisoft/log-target-email` | Email log target |
| `yiisoft/log-target-syslog` | Syslog target |

**Key concepts:**
- Inject the PSR-3 logger interface provided by `yiisoft/log`
- PSR-3 placeholders: `'{action} failed: {error}'`
- Levels: debug, info, warning, error, critical, alert, emergency

---

## 12. Dev Tools & Debug

| Package | Description |
|---|---|
| `yiisoft/error-handler` | Error handling with developer-friendly pages |
| `yiisoft/friendly-exception` | Friendly exception interface for end users |
| `yiisoft/yii-debug` | Debug panel |
| `yiisoft/yii-debug-api` | Debug panel API |
| `yiisoft/yii-debug-viewer` | Debug information viewer |
| `yiisoft/yii-dev-tool` | Development utilities |
| `yiisoft/yii-gii` | Code generator (models, CRUD, controllers) |
| `yiisoft/profiler` | Performance profiler |
| `yiisoft/yii-sentry` | Sentry error monitoring integration |
| `yiisoft/code-style` | PHP CS Fixer rules for Yiisoft packages |
| `yiisoft/yii-swagger` | OpenAPI/Swagger JSON + UI for API documentation |

---

## 13. Messaging & Async

| Package | Description |
|---|---|
| `yiisoft/event-dispatcher` | PSR-14 event dispatch: dispatchers, providers, listener collections |
| `yiisoft/yii-event` | Event-map wiring: listener factories, listener configuration checks |
| `yiisoft/queue` | Framework-agnostic job queue: queue and job contracts |
| `yiisoft/queue-amqp` | AMQP transport (RabbitMQ) |
| `yiisoft/queue-db` | Database transport |
| `yiisoft/queue-redis` | Redis transport |
| `yiisoft/mutex` | Distributed locking abstraction |
| `yiisoft/mutex-file` | File-based mutex driver |
| `yiisoft/mutex-pdo-mysql` | MySQL PDO mutex driver |
| `yiisoft/mutex-pdo-pgsql` | PostgreSQL PDO mutex driver |
| `yiisoft/mutex-pdo-oracle` | Oracle PDO mutex driver |
| `yiisoft/mutex-redis` | Redis mutex driver |
| `yiisoft/mailer` | Mail sending abstraction: mailer and message contracts, file transport for dev |
| `yiisoft/mailer-symfony` | Symfony Mailer transport for `yiisoft/mailer` |

---

## 14. Testing

Yii3 support packages (require-dev):

| Package | Description |
|---|---|
| `yiisoft/test-support` | Ready-made PSR test doubles for unit tests: stand-ins for logging, container, events, cache, and clock so code under test runs without real infrastructure |
| `yiisoft/yii-testing` | Application-level testing: boots the app in-process, sends HTTP requests, inspects responses, swaps services for a single test; requires `phpunit/phpunit` |
| `yiisoft/factory` | Object factory with automatic dependency resolution — also used to assemble test fixtures (shared with §1) |

Non-yiisoft test runners and harnesses (require-dev):

| Package | Description |
|---|---|
| `phpunit/phpunit` | De-facto unit test runner; hard dependency of `yiisoft/yii-testing` |
| `codeception/codeception` | BDD-style suite runner used by the app templates (unit/functional/web/console suites, Cest classes) |
| `codeception/module-asserts`, `codeception/module-cli`, `codeception/module-phpbrowser` | Codeception modules for assertions, console, and browser suites (see the target app's `require-dev`) |
| `testo/testo` | Independent lightweight testing framework (plugins/middleware core); **mutually exclusive with `phpunit/phpunit`** — pick either Testo or PHPUnit, never both as the project runner |
| `infection/infection` | Mutation testing on top of the chosen runner (not a runner itself); measures how well the suite kills mutants; require-dev, needs Xdebug/phpdbg/pcov; many `yiisoft/*` packages ship `infection.json.dist` |
| `roave/infection-static-analysis-plugin` | Infection + static analysis wrapper used as the `mutation` script across most `yiisoft/*` packages |
| `testo/bridge-infection` | Adapter that wires Infection to the Testo runner — only on the Testo path (PHPUnit/Codeception need no bridge) |
| `php-testo/bridge-mockery` | Adapter that wires Mockery to the Testo runner — registers `MockeryPlugin` in `testo.php` for automated teardown (PHPUnit/Codeception need no bridge; no clone in `references/`, grounded on the testing-core guide) |

**Key concepts:**
- **Runner choice is exclusive:** `testo/testo` **or** `phpunit/phpunit` — installing both as the primary runner is forbidden; choose one per project and keep every suite on it.
  - PHPUnit path → `phpunit/phpunit` + `yiisoft/yii-testing`; Codeception suites (`codeception/codeception` + modules) sit on this path because the app templates wire `codeception.yml` against PHPUnit.
  - Testo path → `testo/testo` only; do **not** install `phpunit/phpunit`, and therefore do **not** install `yiisoft/yii-testing` (it requires PHPUnit). Test doubles still come from `yiisoft/test-support`.
- **Infection is orthogonal to the runner choice:** add `infection/infection` (optionally `roave/infection-static-analysis-plugin`) on either path; on the Testo path also add `testo/bridge-infection`. It never replaces the runner.
- There is no `yiisoft/testo` package — the real vendor is `testo/testo` (do not `composer require yiisoft/testo`).
- Install testing packages as `require-dev` only in the target application.
- Unit tests: inject `yiisoft/test-support` doubles instead of real backends; assert on collected log messages, recorded cache actions, or triggered events.
- Functional / HTTP tests (PHPUnit path): extend the base test case from `yiisoft/yii-testing`, issue requests through its tester, read status/body/headers from the response accessor, and mock individual services per test.
- Functional / suite tests (Codeception path): Cest classes per suite (`unit`, `functional`, `web`, `console`) as in the app templates; config lives in `codeception.yml` and `tests/<Suite>.suite.yml`.
- Fixtures and object graphs: build entities with `yiisoft/factory` rather than hand-wiring constructors.
- Ephemeral database for tests: `yiisoft/db-sqlite` (see §4); keep the production driver out of CI when a file database is enough.
- Pair with `yiisoft/yii-gii` / `yiisoft/code-style` only as `require-dev` tooling (§12), never in production installs.

---

## 15. Utilities

| Package | Description |
|---|---|
| `yiisoft/aliases` | Named path/URL alias storage |
| `yiisoft/arrays` | Array manipulation helpers |
| `yiisoft/files` | File and directory utilities |
| `yiisoft/json` | JSON encoding/decoding |
| `yiisoft/strings` | String manipulation helpers |
| `yiisoft/var-dumper` | Enhanced var_dump with syntax highlighting |
| `yiisoft/network-utilities` | Network utilities (IP, URL, etc.) |
| `yiisoft/classifier` | Filesystem traversal for class discovery |
| `yiisoft/requirements` | PHP system requirements checker |

---

## 16. Package Compatibility Matrix

Compatibility facts below are orientation-level.

### 16.1 Works together with

| Package | Works together with |
|---|---|
| `yiisoft/di` | All packages (container for everything) |
| `yiisoft/config` | di, aliases, all packages with configuration |
| `yiisoft/router` | router-fastroute, router-composer-attribute-collector, file-router, yii-middleware, yii-http, http-middleware |
| `yiisoft/yii-http` | router, middleware-dispatcher, view, yii-view-renderer, data-response, error-handler, input-http |
| `yiisoft/db` | active-record, db-migration, exactly one db-* driver, data-db, cache-db, queue-db, rbac-db, log-target-db, translator-message-db |
| `yiisoft/active-record` | db, one db-* driver, validator, event-dispatcher |
| `yiisoft/yii-cycle` | data-cycle, db, one db-* driver, db-migration, rbac-cycle-db |
| `yiisoft/validator` | form-model, hydrator-validator, input-http, yii-gii |
| `yiisoft/form-model` | validator, hydrator, hydrator-validator, html, view, csrf, input-http |
| `yiisoft/view` | yii-view-renderer, html, widget, yii-widgets, assets, yii-twig (with view-twig), translator |
| `yiisoft/html` | view, form, widget, yii-widgets, bootstrap5, yii-bulma |
| `yiisoft/widget` | yii-widgets, bootstrap5, yii-bulma, yii-dataview |
| `yiisoft/auth` | user, session, security, rbac, access, auth-jwt |
| `yiisoft/user` | auth, session, access, rbac |
| `yiisoft/rbac` | access, user, exactly one of rbac-db / rbac-php / rbac-cycle-db, rbac-rules-container |
| `yiisoft/mailer` | mailer-symfony, view, translator, queue |
| `yiisoft/queue` | exactly one of queue-redis / queue-db / queue-amqp, log, event-dispatcher, mailer, mutex |
| `yiisoft/log` | exactly one or more log-target-*, error-handler, yii-sentry, translator |
| `yiisoft/event-dispatcher` | yii-event, all packages with events (auth, active-record, queue, error-handler, mailer) |
| `yiisoft/cache` | exactly one or more cache-* stores, data-db / repository layer, yii-dataview, rate-limiter (via shared backends) |
| `yiisoft/translator` | i18n, view, mailer, error-handler, exactly one translator-message-* reader, translator-extractor (dev) |
| `yiisoft/error-handler` | friendly-exception, yii-debug, yii-sentry, log, yii-http |
| `yiisoft/security` | auth, auth-jwt, csrf, session, user |
| `yiisoft/csrf` | form-model, form, session, yii-middleware, http-middleware |
| `yiisoft/session` | auth, user, csrf, yii-middleware, cookies |
| `yiisoft/input-http` | yii-http, form-model, hydrator, hydrator-validator, validator |
| `yiisoft/data-response` | yii-http, yii-swagger, data, data-db / data-cycle, API controllers |
| `yiisoft/mutex` | exactly one mutex-* driver; pairs with queue and scheduler-style workloads |
| `yiisoft/rate-limiter` | yiisoft/cache or cache-* storage for counters; sits in the middleware stack |
| `yiisoft/yii-runner-http` | yii-http, error-handler, config; web entry point (§3) |
| `yiisoft/yii-runner-console` | yii-console, config; console entry point (§3) |

### 16.2 PHP version and PSR interop

- Target PHP: **8.2+** for generated applications. Most cloned packages declare `8.1 - 8.5` or
  `8.0 - 8.5` in `composer.json`; always let Composer resolve — do not pin ranges by hand.
- PSR pairs commonly required together:

  | Concern | Interface package | Yii3 implementation |
  |---|---|---|
  | Container | `psr/container` | `yiisoft/di`, `yiisoft/injector`, `yiisoft/factory` |
  | HTTP messages | `psr/http-message`, `psr/http-factory` | `yiisoft/http`, `yiisoft/yii-http`, `yiisoft/cookies`, `yiisoft/session` |
  | Middleware | `psr/http-server-middleware` | `yiisoft/middleware-dispatcher`, `yiisoft/http-middleware`, `yiisoft/yii-middleware` |
  | Events | `psr/event-dispatcher` | `yiisoft/event-dispatcher`, `yiisoft/yii-event` |
  | Logging | `psr/log` | `yiisoft/log`, `yiisoft/log-target-*`, `yiisoft/test-support` (test double) |
  | Cache | `psr/simple-cache` | `yiisoft/cache`, `yiisoft/cache-*`, `yiisoft/test-support` (test double) |
  | Clock | `psr/clock` | `yiisoft/test-support` (test double) |

- `psr/*` packages arrive transitively; declare them only when you reference the interface directly
  in application code.

### 16.3 Driver and storage selection (pick one per family)

Each abstraction needs **exactly one** primary driver/storage unless the table says "one or more":

| Abstraction | Choose one (or noted otherwise) |
|---|---|
| Database | `yiisoft/db-mysql` \| `yiisoft/db-pgsql` \| `yiisoft/db-sqlite` \| `yiisoft/db-mssql` \| `yiisoft/db-oracle` |
| ORM path | `yiisoft/active-record` **or** `yiisoft/yii-cycle` (+ `yiisoft/data-cycle`) — not both for the same data |
| Cache store | `yiisoft/cache-file` \| `yiisoft/cache-redis` \| `yiisoft/cache-db` \| `yiisoft/cache-apcu` \| `yiisoft/cache-memcached` \| `yiisoft/cache-wincache` |
| Queue transport | `yiisoft/queue-db` \| `yiisoft/queue-redis` \| `yiisoft/queue-amqp` |
| Mutex driver | `yiisoft/mutex-file` \| `yiisoft/mutex-pdo-mysql` \| `yiisoft/mutex-pdo-pgsql` \| `yiisoft/mutex-pdo-oracle` \| `yiisoft/mutex-redis` |
| RBAC storage | `yiisoft/rbac-db` \| `yiisoft/rbac-php` \| `yiisoft/rbac-cycle-db` |
| Log target | `yiisoft/log-target-file` \| `yiisoft/log-target-db` \| `yiisoft/log-target-email` \| `yiisoft/log-target-syslog` (multiple allowed) |
| Translation reader | `yiisoft/translator-message-php` \| `yiisoft/translator-message-db` \| `yiisoft/translator-message-gettext` |
| Mail transport | `yiisoft/mailer-symfony` (production) / file transport built into `yiisoft/mailer` (dev) |
| CSS widget kit | `yiisoft/bootstrap5` **or** `yiisoft/yii-bulma` (both possible, pick a primary) |
| Template engine | native PHP via `yiisoft/view` **or** Twig via `yiisoft/view-twig` + `yiisoft/yii-twig` |
| App runner | `yiisoft/yii-runner-http` (web) and/or `yiisoft/yii-runner-console` (CLI); worker modes: `yiisoft/yii-runner-frankenphp` \| `yiisoft/yii-runner-roadrunner` |

Mismatch symptoms: Composer conflicts on the chosen driver, two competing services of the same
family in DI, or an abstraction with no driver registered (fails at first use).

### 16.4 Environment recommendations

| Environment | Recommended set |
|---|---|
| Production web | web core (§ feature table) + one db driver + error-handler/log-target + session/csrf as needed |
| Production workers | runner-frankenphp or runner-roadrunner + queue + mutex + log |
| CI / tests | `yiisoft/db-sqlite` for the database, `yiisoft/test-support`, one runner only — `phpunit/phpunit` (+ `yiisoft/yii-testing`, Codeception if the template uses it) **or** `testo/testo`, never both; optional mutation gate: `infection/infection` (+ `testo/bridge-infection` on the Testo path); `yiisoft/cache-file` or in-memory cache |
| Local development | `yiisoft/yii-debug`, `yiisoft/yii-debug-viewer`, `yiisoft/yii-gii`, `yiisoft/code-style`, mailer file transport, `yiisoft/cache-file` |

### 16.5 Not installable as named

Some names commonly suggested by models do not exist as `yiisoft/*` packages — verify against the
phantom list in `skills/yii3/references/package-catalog.md` §3 before adding them to `composer require`:

- CORS is covered by `yiisoft/http-middleware` and `yiisoft/yii-middleware` (there is no separate CORS package).
- Outgoing HTTP has no `yiisoft/*` client wrapper — use a PSR-18 client such as `guzzlehttp/guzzle`.

---

## 17. Architectural Layering

> **Canonical full copy:** `skills/yii3/references/architecture-alignment.md` — section
> "Pattern placement tables (aif-architecture)" — edit there and keep this stub pointing to it.
> The deliverable reference carries: pattern → folder structure (Layered; Structured Modules ×2;
> Explicit Architecture ×3; Microservices), package categories → placement per pattern, dependency
> rules per pattern, universal dependency rules, and the responsibility → package categories reference.

---

## 18. Application Templates

Installable application templates (clones exist in `references/`; the guides treat them as the
canonical project layouts when resolving placement and config structure):

| Package | Description |
|---|---|
| `yiisoft/app` | Yii3 web application template — the official skeleton the guides use as the canonical config/layout example |
| `yiisoft/app-api` | Yii3 API project template |
| `yiisoft/app-console` | Template for console application |
| `yiisoft/requirements` | PHP system requirements checker (see §15) |

---

## Configuring Packages in the Target Application

The skill generates Yii3 code that may depend on `yiisoft/*` packages. Before generating an artifact,
make sure the required packages are installed in the **target application** — the project where the
generated code will run, not this repository.

### How to install

```sh
# from the target application root
composer require yiisoft/<package>

# dev-only tools
composer require --dev yiisoft/<package>
```

Rules:
- Install only what the generated artifact actually uses — never the whole stack.
- Do not pin versions; let Composer resolve compatible ones.
- Check `vendor/yiisoft/<package>/composer.json` to confirm the package has no extra undeclared
  dependencies beyond those in the category tables above.
- If Composer reports a conflict, show the conflict and re-resolve with a minimal set.

### Feature → minimal package set

| Generated feature | Packages to install |
|---|---|
| Web app core | `yiisoft/di yiisoft/config yiisoft/router yiisoft/router-fastroute yiisoft/middleware-dispatcher yiisoft/yii-http` |
| Database (ActiveRecord) | `yiisoft/db yiisoft/db-migration yiisoft/db-mysql yiisoft/aliases` |
| Database (Cycle ORM) | `yiisoft/yii-cycle yiisoft/data-cycle yiisoft/db yiisoft/db-migration` |
| Forms + validation | `yiisoft/form-model yiisoft/validator yiisoft/hydrator yiisoft/hydrator-validator yiisoft/input-http` |
| Cache | `yiisoft/cache yiisoft/cache-file` OR `yiisoft/cache-redis` |
| Auth + RBAC | `yiisoft/user yiisoft/auth yiisoft/session yiisoft/rbac yiisoft/rbac-db` OR `yiisoft/rbac-php` |
| Views | `yiisoft/view yiisoft/yii-view-renderer yiisoft/html yiisoft/form yiisoft/assets yiisoft/bootstrap5` |
| Email | `yiisoft/mailer yiisoft/mailer-symfony` |
| Error handling | `yiisoft/error-handler yiisoft/friendly-exception` |
| Dev tools (require-dev) | `yiisoft/yii-debug yiisoft/yii-debug-viewer yiisoft/test-support yiisoft/yii-testing yiisoft/yii-gii yiisoft/code-style` + runner: `phpunit/phpunit` (or Codeception per template) **or** `testo/testo` — exclusive; optional: `infection/infection` |

---

*Updated: 2026-10-28*
