---
name: yii3
description: >-
  Use when planning, implementing, fixing, reviewing or verifying code in a Yii3 project (composer.json requires yiisoft/* packages
  with yiisoft/config or config-plugin; no yiisoft/yii2). Provides Yii3 conventions, package catalog, architecture-aware feature
  decomposition into actions/use-cases/repositories, and DI/routing wiring rules. Use when user says "Yii3", "Yii 3", "yiisoft",
  "create feature", "add action", "new endpoint", "add repository", "add use case", "add event", "add listener", "add middleware", "send email", "queue job", "worker command", "mutex lock", "Yii migration", "render view", "custom widget", "gridview", "asset bundle", "validate input", "validation rules", "custom validator", "form model",
  "log message", "log target", "PSR-3 logging", "translate messages", "i18n", "locale", "session", "cookie",
  "flash message", "CSRF", "file upload", "download file". Not for Yii2.
---

# Yii3 development

## Core rules
1. **Yii3 is not Yii2.** No `Yii::$app`, no `yii\` namespace, no static facades. PSR-based, injected.
2. **Source of truth order:** existing project code → `vendor/yiisoft/<pkg>/src` (installed version) → skill documentation (`references/package-catalog.md`, etc.).
   Never invent method signatures or assume Yii2 syntax.
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
- `references/architecture-alignment.md` — where code goes
- `references/feature-recipes.md` — feature archetypes, decomposition into layers, capability inference, wiring checklist
- `references/dependency-protocol.md` — check, install, wire, learn a package
- `references/package-catalog.md` — packages, capability keys, driver choices
- `references/api-signatures.md` — exact signatures for top 15 Yii3 interfaces and classes
- `references/actions-and-controllers.md` — package usage recommendations in actions/controllers, HTTP request parsing, DTO hydration, validation, security, data-response, and view rendering
- `references/validation-and-forms.md` — built-in and custom validator rules, skipOnEmpty/when modifiers, message translation, FormModel + FormHydrator, validating hydrator DTOs, and input-http request inputs
- `references/di-and-config.md` — PSR-11 container, config directory separation, definition syntax recipes, parameter inheritance, and environment overrides
- `references/repositories-and-persistence.md` — repository pattern, Query Builder, Active Record, Cycle ORM, transaction boundaries, and paginated data readers
- `references/events-and-listeners.md` — PSR-14 event architecture, immutable domain event DTOs, listener design, event mapping configuration, and post-commit dispatching
- `references/commands.md` — thin console commands with Symfony Console, input arguments/options, interactive SymfonyStyle, ExitCode constants, and command registration
- `references/routes.md` — FastRoute route syntax, regex parameter constraints, nested groups, middleware ordering, URL generation, and attribute routes
- `references/middlewares.md` — PSR-15 HTTP middleware pipeline, request pre-processing, security post-processing, auth short-circuiting, and official middleware catalog
- `references/http-state.md` — sessions and session middleware, flash messages, cookie handling with signing/encryption, and CSRF token implementations with middleware wiring
- `references/migrations.md` — database schema DDL migrations, typed column definitions, foreign keys, indexes, reversible migrations, and data seeding
- `references/views-and-widgets.md` — PHP view templates, mandatory XSS escaping, layouts, asset bundles, custom widgets, HTML forms, and DataView/GridView
- `references/file-handling.md` — FileHelper filesystem utilities, download responses (sendFile, x-sendfile, byte ranges), and the PSR-7 upload flow with file validation rules
- `references/queue-jobs.md` — asynchronous queue jobs, serializable message DTOs, worker handlers, distributed mutex locks, and worker CLI management
- `references/auth-and-rbac.md` — user identity, session/JWT auth, password hashing, RBAC manager, custom rules, and route protection
- `references/mailer.md` — email composition, Symfony Mailer DSN transport, HTML view templating, file attachments, inline CID embeddings, and async queue sending
- `references/i18n-translation.md` — translator API and category sources, message formatters, PHP/DB/gettext message storage, message extraction, and locale routing middleware
- `references/error-handling.md` — ErrorCatcher middleware, custom HTML/JSON Problem Details renderers, Friendly Exceptions, and Sentry logging
- `references/logging.md` — PSR-3 logger injection, DI binding for LoggerInterface, categories, placeholders, target catalog (file/db/email/syslog/stream), context providers, and flushing
- `references/caching.md` — PSR-16 drivers, getOrSet stampede prevention, TagDependency invalidation, and HTTP/view fragment caching
- `references/testing.md` — testing pyramid, exclusive runner rule (PHPUnit vs Testo), PSR test doubles, functional HTTP testing, and ephemeral SQLite setup
- `references/conventions.md` — layout, config, DI, actions, routes, anti-patterns
