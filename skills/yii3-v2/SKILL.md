---
name: yii3-v2
description: >-
  Use when planning, implementing, fixing, reviewing or verifying Yii3 code (requires yiisoft/* with
  yiisoft/config; no yii2). Provides conventions, package catalog, architecture decomposition, and DI/routing.
  Use when user says "Yii3", "Yii 3", "yiisoft", "create yii3 action", "yii3 endpoint", "add repository", "add
  use case", "add event", "add listener", "add middleware", "send email", "queue job", "worker command", "mutex
  lock", "Yii migration", "render view", "custom widget", "gridview", "list view", "detail view", "asset
  bundle", "validate yii3 form", "validation rules", "custom validator", "form model", "log target", "PSR-3
  logging", "translate messages", "i18n", "flash message", "CSRF", "file upload", "download file", "layered
  architecture", "vertical slices". Not for Yii2.
---

# Yii3 development

## Core rules
1. **Yii3 is not Yii2.** No `Yii::$app`, no `yii\` namespace, no static facades. PSR-based, injected.
2. **Source of Truth & Verification Rule (Single Source of Truth / SSOT):**
   - **Resolution order:** existing project code (`src/`, `config/`) → `vendor/yiisoft/<pkg>/src/` (installed version) → skill reference documentation (`references/conventions.md`, `references/package-catalog.md`, `references/api-signatures.md`, etc.).
   - In target projects, always verify exact method signatures, constructor arguments, and configuration options directly in `vendor/yiisoft/<package>/src/` for installed packages.
   - When generating or refactoring code, if an installed package's method signature or property is unfamiliar or in doubt, **read its source files in `vendor/yiisoft/<package>/src/`** rather than guessing or relying on legacy Yii2 habits.
   - Zero-hallucination policy: never invent method signatures, configuration keys, or assume Yii2 syntax.
3. **Architecture decides placement:** `/aif-architecture` artifact if it exists, otherwise the project's real structure
   (`src/`, `config/` + similar existing features). See `references/architecture-alignment.md`.
4. Every capability goes through `references/dependency-protocol.md` before code is written.

## Workflow per task
0. Resolve architecture: check `.ai-factory/ARCHITECTURE.md` (or configured path), otherwise inspect existing `src/` and `config/`.
1. Check `composer.json` for installed packages; consult `references/package-catalog.md` and `references/feature-recipes.md` for required packages and drivers.
2. For business feature requests, decompose into full artifact graph (Domain, Persistence, Use Case, Presentation, Wiring) via `references/feature-recipes.md`.
3. Install/wire missing packages per `references/dependency-protocol.md`.
4. Place and write code: architecture source first, then `references/conventions.md`.
5. Verify: run project tests and linters (Psalm/PHPStan, Rector, CS-Fixer, PHPUnit). Report added packages and changed config files.

## References (read on demand)

### Core & Architecture
- `references/conventions.md` — layout, config, DI, actions, routes, anti-patterns, SSOT verification rule
- `references/architecture-alignment.md` — where code goes + per-pattern placement tables and dependency rules
- `references/feature-recipes.md` — feature archetypes, decomposition into layers, capability inference, wiring checklist
- `references/dependency-protocol.md` — check, install, wire, learn a package
- `references/package-catalog.md` — packages, capability keys, driver choices
- `references/api-signatures.md` — exact signatures for top 15 Yii3 interfaces and classes
- `references/di-and-config.md` — PSR-11 container, config directory separation, definition syntax recipes, parameter inheritance, and environment overrides
- `references/events-and-listeners.md` — PSR-14 event architecture, immutable domain event DTOs, listener design, event mapping configuration, and post-commit dispatching

### HTTP & Presentation
- `references/routes.md` — FastRoute route syntax, regex parameter constraints, nested groups, middleware ordering, URL generation, and attribute routes
- `references/middlewares.md` — PSR-15 HTTP middleware pipeline, request pre-processing, security post-processing, auth short-circuiting, and official middleware catalog
- `references/actions-and-controllers.md` — package usage recommendations in actions/controllers, HTTP request parsing, DTO hydration, validation, security, data-response, and view rendering
- `references/validation-and-forms.md` — built-in and custom validator rules, skipOnEmpty/when modifiers, message translation, FormModel + FormHydrator, validating hydrator DTOs, and input-http request inputs
- `references/views-and-widgets.md` — view placement (colocated action templates or central views directory), PHP view templates, mandatory XSS escaping, layouts, asset bundles, custom widgets, HTML forms, and DataView widgets (GridView, ListView, DetailView)
- `references/http-state.md` — sessions and session middleware, flash messages, cookie handling with signing/encryption, and CSRF token implementations with middleware wiring
- `references/file-handling.md` — FileHelper filesystem utilities, download responses (sendFile, x-sendfile, byte ranges), and the PSR-7 upload flow with file validation rules
- `references/i18n-translation.md` — translator API and category sources, message formatters, PHP/DB/gettext message storage, message extraction, and locale routing middleware

### Persistence & Data
- `references/persistence-db.md` — low-level yiisoft/db Connection, Command, Query Builder, transactions, and QueryDataReader pagination
- `references/persistence-active-record.md` — yiisoft/active-record models, queries, relations, lifecycle, and LazyLoadGuard N+1 prevention
- `references/persistence-cycle-orm.md` — Cycle ORM integration (yiisoft/yii-cycle, cycle/orm, #[Entity], EntityReader, and schema CLI migrations)
- `references/migrations.md` — database schema DDL migrations, typed column definitions, foreign keys, indexes, reversible migrations, and data seeding
- `references/caching.md` — PSR-16 drivers, getOrSet stampede prevention, TagDependency invalidation, and HTTP/view fragment caching

### Infrastructure, Async & Operations
- `references/commands.md` — thin console commands with Symfony Console, input arguments/options, interactive SymfonyStyle, ExitCode constants, and command registration
- `references/queue-jobs.md` — asynchronous queue jobs, serializable message DTOs, worker handlers, distributed mutex locks, and worker CLI management
- `references/auth-and-rbac.md` — user identity, session/JWT auth, password hashing, RBAC manager, custom rules, and route protection
- `references/mailer.md` — email composition, Symfony Mailer DSN transport, HTML view templating, file attachments, inline CID embeddings, and async queue sending
- `references/logging.md` — PSR-3 logger injection, DI binding for LoggerInterface, categories, placeholders, target catalog (file/db/email/syslog/stream), context providers, and flushing
- `references/error-handling.md` — ErrorCatcher middleware, custom HTML/JSON Problem Details renderers, Friendly Exceptions, and Sentry logging
- `references/testing-core.md` — test architecture, testing pyramid, exclusive runner rule (PHPUnit vs Testo), PSR test doubles (yiisoft/test-support), modern mocking rules, and console command testing
- `references/testing-http.md` — functional HTTP testing with yiisoft/yii-testing, HttpApplicationRunner, isolated PSR-15 middleware testing, session/cookie validation, and ResponseAccessor API
- `references/testing-database.md` — transactional database testing, ephemeral in-memory SQLite (yiisoft/db-sqlite), migration fixtures with MigrationBuilder, and repository integration tests
