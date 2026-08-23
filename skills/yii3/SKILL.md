---
name: yii3
description: >-
  Yii3 (yiisoft packages) project context and coding conventions. Master skill for any work on a Yii3 PHP project:
  app structure, configuration system, DI container, routing, middleware, views, database access.
  Use when working on a Yii3 codebase, reviewing Yii3 code, or before/while using other yii3-* skills.
argument-hint: "[topic]"
allowed-tools: Read Glob Grep Bash(composer *) AskUserQuestion Questions
disable-model-invocation: false
metadata:
  author: DAGpro (https://github.com/DAGpro)
  version: "0.1"
  category: framework-yii3
---

# Yii3 Project Context & Conventions

You are working with **Yii3** — the modern, package-based PHP framework from Yiisoft. Unlike Yii2, there is no
`Yii::$app` service locator, no global state and no magic base classes. Everything is PSR-7/PSR-11 based,
explicitly configured and injected.

Official guide: https://yiisoft.github.io/docs/guide/

---

## Step 0: Detect a Yii3 Project

A project is Yii3 if `composer.json` requires one or more `yiisoft/*` packages such as:

- `yiisoft/app` / `yiisoft/yii-web` / `yiisoft/yii-console` — application kernels
- `yiisoft/di`, `yiisoft/config` — DI container and config plugin
- `yiisoft/router`, `yiisoft/middleware-dispatcher` — routing and middleware
- `yiisoft/db`, `yiisoft/db-migration`, `yiisoft/active-record` — database layer
- `yiisoft/form-model`, `yiisoft/validator`, `yiisoft/input-http` — forms and validation
- `yiisoft/data-response`, `yiisoft/request-body-parser` — JSON API support
- `yiisoft/view`, `yiisoft/yii-view-renderer`, `yiisoft/html` — views
- `yiisoft/cache` (+ cache-apcu/cache-file/cache-memcached/cache-db) — PSR-16 caching
- `yiisoft/user`, `yiisoft/auth`, `yiisoft/rbac*` — authentication and RBAC authorization
- `yiisoft/data`, `yiisoft/yii-dataview` — data readers, pagination, grid views

If the project is NOT Yii3, stop and tell the user this skill set targets Yii3 only.

---

## Step 1: Load Project Context

1. Read `.ai-factory/DESCRIPTION.md` if it exists.
2. Read `.ai-factory/skill-context/yii3/SKILL.md` if it exists — those are project-specific rules
   accumulated by `/aif-evolve`; they override the general rules below.
3. Inspect `composer.json` to learn which yiisoft packages are actually installed.
   **Never generate code that depends on a package that is not in `composer.json`.**
   Suggest `composer require <package>` instead (with `make composer require <package>` if a Makefile exists).

---

## Hard Coding Conventions (from the official guide)

Apply to ALL generated Yii3 code:

1. Every PHP file starts with `declare(strict_types=1);`.
2. Classes that hold no mutable state are `final readonly class` with constructor property promotion:
   ```php
   final readonly class PageRepository
   {
       public function __construct(
           private ConnectionInterface $connection,
       ) {}
   }
   ```
3. Inject dependencies via constructor (mandatory) or action-method parameters (per-request).
   Never reference the container directly inside classes ("service locator is an anti-pattern").
4. Configuration files return plain PHP arrays; use `$params['provider/key']` for parameters.
5. Routes live in `config/common/routes.php`; DI definitions in `config/common/di/*.php`;
   parameters in `config/common/params.php`.
6. Escape all output in templates with `Html::encode()`; type view variables with `@var` docblocks.
7. Mutating endpoints must use POST/PUT/PATCH/DELETE — never GET (deletes via POST form + CSRF).
8. Validation uses `Yiisoft\Validator\Rule\*` attributes on form/input models; cross-field rules use
   class-level `#[Callback(method: 'validateX')]`.

---

## Domain Conventions

- Building blocks: **Entity** (identity by ID) · **Value Object** (immutable, equality by values) ·
  **Aggregate** (access only via root) · **Domain Event** (PSR-14 fact, past tense) · **DTO** ·
  **Service** · **Repository** (interface in domain, implementation in infrastructure).
- Entities, value objects, aggregates and domain events instantiate with `new` — they are NOT
  services; only services/repositories resolve through the DI container.
- Module public API = interfaces, DTOs/value objects, use-case methods, emitted events;
  everything else is private to the module.
- Interface ownership: describes what a module **provides** → define it in that module;
  describes what a module **needs from outside** → define it in the consuming module.

The full pattern map (folder trees per architecture pattern, module layout) lives in
`.ai-factory/ARCHITECTURE.md`; when generating it with `/aif-architecture`, adapt the chosen
pattern to the Yii3 layout described in this skill.

---

## Quick Reference: Key Services

| Need | Service / Class |
|---|---|
| Render a view | `Yiisoft\Yii\View\Renderer\WebViewRenderer::render(__DIR__ . '/template', $vars)` |
| Generate URL | `Yiisoft\Router\UrlGeneratorInterface::generate('route/name', ['id' => 42])` |
| Read route args | `#[RouteArgument('id')] int $id` or `CurrentRoute::getArgument('id')` |
| Current request | Type-hint `ServerRequestInterface` in action |
| Build response | `ResponseFactoryInterface::createResponse(Status::OK)` |
| Form binding | `FormHydrator::populateAndValidate($form, $request->getParsedBody())` |
| CSRF token in view | `$csrf` (Csrf view injection), pass to `Html::form()->csrf($csrf)` |
| DB connection | `Yiisoft\Db\Connection\ConnectionInterface` |
| JSON response | `DataResponseFactoryInterface::createResponse($data)` |
| Cache | `Yiisoft\Cache\CacheInterface::getOrSet($key, $callable, $ttl)` |
| Current user | `Yiisoft\User\CurrentUser::isGuest() / getIdentity() / login() / logout() / can()` |
| Session | `Yiisoft\Session\SessionInterface`; flash via `Yiisoft\Session\Flash\FlashInterface` |
| Pagination | `Yiisoft\Data\Reader\OffsetPaginator` over a `DataReader` |
| Access check | `AccessCheckerInterface::userHasPermission()` (RBAC `ManagerInterface`) |
| Logging | `Psr\Log\LoggerInterface::warning('msg {reason}', ['reason' => ...])` (PSR-3) |
| Events | `Psr\EventDispatcher\EventDispatcherInterface::dispatch(new UserSignedUp(...))` |
| Email | `Yiisoft\Mailer\MailerInterface::send($message)` |
| Outgoing HTTP | `Psr\Http\Client\ClientInterface::sendRequest($request)` (PSR-18) |

---

## Console Entry Point

Console commands run through symfony/console: `./yii <command>` (or `make yii ...` in Docker).
Commands are registered in console params under `'yiisoft/yii-console' => ['commands' => [...]]`.

---

## Related Skills — Task Router

Load the matching skill BEFORE generating code for the task; this master skill supplies only
the shared conventions above.

| Task | Skill |
|---|---|
| Generate action, REST endpoint or CRUD scaffold | `/yii3-actions` |
| Register service, params, config groups, events wiring | `/yii3-di` |
| Migration, repository, transactions, pagination, Active Record | `/yii3-data-layer` |
| Handle form submit, validation rules, uploads, flash/PRG | `/yii3-forms` |
| Layouts, templates, assets, form widgets, GridView tables | `/yii3-view` |
| Send email (templates, attachments, dev stubs) | `/yii3-email` |
| Outgoing HTTP API calls (PSR-18) | `/yii3-http-client` |
| Login/logout, RBAC roles/permissions, password flows | `/yii3-auth` |
| Error pages / JSON errors, log targets and filtering | `/yii3-errors` |
| Write or run tests (Codeception suites) | `/yii3-testing` |
| Security + performance audit before release | `/yii3-hardening` |

---

## Logging Conventions

Inject `Psr\Log\LoggerInterface` where needed; use PSR-3 placeholders, never string interpolation:

```php
$this->logger->debug('{Action} invoked');                     // entry point
$this->logger->info('{Entity} created (id={id})', [...]);     // success
$this->logger->warning('{Action} failed: {error}', [...]);    // recoverable error
$this->logger->error('{Action} exception', [...]);            // unexpected error
```

---

## Anti-Patterns to Avoid

- ❌ Using `Yii::$app` or any service locator (Yii2 pattern) — inject dependencies
- ❌ Business logic in templates or actions — extract to UseCase/service classes
- ❌ Direct SQL in actions — use repositories over `ConnectionInterface`
- ❌ Mutable action classes — use `final readonly class`
- ❌ Missing `declare(strict_types=1);`
- ❌ `float` for money — use integer cents
- ❌ Swallowing exceptions in try/catch without logging or rethrowing
- ❌ Hardcoded URLs — use `UrlGeneratorInterface`
- ❌ Reading `$_GET`/`$_POST`/`$_SERVER` directly — use `ServerRequestInterface`, `CurrentRoute`, FormModels
- ❌ Instantiating services inside actions — get them from the container via injection

---

## Verification Checklist

After generating any Yii3 code:

1. `php -l` passes on every created file.
2. All imported classes exist in `vendor/` (check `composer.json` requirements first).
3. New routes were added to `config/common/routes.php` (or the correct environment file).
4. New services required by constructor injection are registered in `config/common/di/*.php`
   when autowiring is impossible (interface → implementation mapping, scalar constructor args).
5. Templates escape output; forms carry CSRF; mutations are non-GET.
6. Affected Codeception suites pass: `APP_ENV=test vendor/bin/codecept run` (or `make test`).
7. If `composer.json` was touched: `composer validate --strict` passes.
8. If `.php-cs-fixer.php` exists: `vendor/bin/php-cs-fixer fix --dry-run --diff [changed files]` is clean.
