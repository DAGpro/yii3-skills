# Yii3 Topic Guides Index

> Master inventory of specialized reference guides for the Yii 3 framework (`yiisoft/*` packages).
>
> **Guide types:** Leaf guides hold concrete recipes and API patterns; entries labeled **split index** organize child guides and host shared module **Anti-Pattern Matrices** audited during verification.

## References

### Core & Architecture
- `references/instructions/core-architecture-alignment.md` — vendor boundaries, layer placement, composition root wiring
- `references/instructions/core-definition-of-done.md` — architecture checks, Production Readiness Gate, report format
- `references/instructions/core-feature-recipes.md` — capability inference, RBAC, persistence strategy, placement, chain integrity
- `references/instructions/core-feature-archetypes.md` — concrete recipes for 7 feature archetypes: state change, query listings, background jobs, HTML forms, CLI, REST CRUD, file upload; decomposition by task scope and architecture pattern
- `references/instructions/core-dependency-protocol.md` — check, install, wire, learn a package
- `references/package-catalog.md` — packages, capability keys, driver choices
- `references/packages/core-utilities.md` — ArrayHelper, StringHelper, Inflector, Json
- `references/packages/core-utilities-niche.md` — VarDumper, Classifier, network utilities, requirements
- `references/packages/core-friendly-exceptions.md` — FriendlyException contract, web & console rendering
- `references/packages/core-di-and-config.md` — split index: DI & config anti-pattern matrix, related guides
- `references/packages/core-di-definitions.md` — definition syntax recipes: bindings, array definitions, references, aliases, closures, db wiring
- `references/packages/core-di-container.md` — container lifecycle, tagging, StateResetter, providers, delegates, Injector/Factory, pitfalls
- `references/packages/core-config-tree.md` — config layers & merge plan, configuration.php, params rules, `$params`/`$config` scope
- `references/packages/core-events-and-listeners.md` — split index: anti-pattern matrix
- `references/packages/core-events-design.md` — PSR-14 architecture, event/listener design, config, post-commit rule
- `references/packages/core-events-reference.md` — framework events catalog, signatures reference, testing
- `references/instructions/core-version-notes.md` — version-gated behavior catalog with `composer.lock` verification
- `references/instructions/core-aif-adapter.md` — AI Factory extension mode (default): workflow lifecycle, durable execution state, cross-session coordination, subagent delegation protocol
- `references/instructions/core-standalone-adapter.md` — standalone fallback mode: plan resolution, architecture pattern self-derivation, Mission State durability, interactive protocol, self-verification loop, final report contract

### HTTP & Presentation
- `references/packages/http-routes.md` — split index: worker-environment caveats, anti-pattern matrix, related guides
- `references/packages/http-routes-definition.md` — route syntax & verb classes, FastRoute patterns, groups, route arguments
- `references/packages/http-routes-url-and-middleware.md` — route middleware ordering, URL generation, file routing
- `references/packages/http-middlewares.md` — split index: PSR-15 pipeline, official middleware catalog, anti-pattern matrix
- `references/packages/http-middlewares-protocol.md` — PSR-15 specification, pipeline architecture, official catalog, registration scopes & pipeline definitions
- `references/packages/http-middlewares-recipes.md` — implementation recipes: correlation ID, API key guards, auth, security headers, error mapping, RBAC
- `references/packages/http-actions-and-controllers.md` — split index: anti-pattern matrix, related guides
- `references/packages/http-actions-core.md` — action principles, route args, DTO hydration, validation, REST responses
- `references/packages/http-actions-concerns.md` — web views, downloads, pagination, auth, sessions, i18n, dispatching
- `references/packages/http-openapi-swagger.md` — split index: anti-patterns, related guides
- `references/packages/http-openapi-setup.md` — architecture, installation, DI params, serving documentation
- `references/packages/http-openapi-endpoints.md` — PHP 8 attributes: global info, security schemes, endpoint actions, CRUD operations, route/query/header parameters
- `references/packages/http-openapi-schemas.md` — DTO schemas & dual validator attributes, file uploads (multipart), RFC 7807 problem details, multi-version API docs
- `references/packages/http-openapi-ui-and-ops.md` — CLI spec generator, Swagger UI customization, env protection & caching
- `references/packages/http-validation-and-forms.md` — split index: decision matrix, anti-pattern matrix, related guides
- `references/packages/http-validation-rules.md` — validator package architecture, core engine, declaring rules
- `references/packages/http-validation-advanced.md` — custom rules, file/image validation, cross-property, messages & i18n
- `references/packages/http-forms-and-hydration.md` — FormModel + FormHydrator, ValidatingHydrator, input-http
- `references/packages/http-validation-custom-rules.md` — custom rules, handlers, DI wiring
- `references/packages/http-views-and-widgets.md` — split index: anti-pattern matrix, related guides, child guides
- `references/packages/http-views.md` — WebViewRenderer pipeline, template anatomy, XSS escaping, layouts, theming
- `references/packages/http-widgets-and-assets.md` — asset bundles, widgets, CSS-framework drivers, HTML form rendering
- `references/packages/http-views-twig.md` — Twig renderer, layouts, `WebViewExtension`
- `references/packages/http-views-bootstrap5.md` — Bootstrap 5 CSS framework widget driver
- `references/packages/http-views-bulma.md` — Bulma CSS framework widget driver
- `references/packages/http-dataview-widgets.md` — GridView, ListView, DetailView
- `references/packages/http-cache-etag.md` — ETag & conditional requests
- `references/packages/http-state.md` — sessions, flash, cookies, CSRF wiring
- `references/packages/http-file-handling.md` — FileHelper, downloads, uploads
- `references/packages/http-i18n-translation.md` — split index: anti-pattern matrix, related guides
- `references/packages/http-i18n-translation-api.md` — package map, translator API, categories, formatters
- `references/packages/http-i18n-storage-and-locale.md` — storage backends, extraction, locale routing & events, testing

### Persistence & Data
- `references/packages/persistence-db.md` — split index: anti-pattern matrix, related guides
- `references/packages/persistence-db-connection-and-queries.md` — Connection, Command, Query Builder, transactions
- `references/packages/persistence-db-readers-and-drivers.md` — pagination & data readers, drivers & DSN, signatures
- `references/packages/persistence-active-record.md` — split index: Active Record architecture, anti-pattern matrix, model & query guide catalog
- `references/packages/persistence-active-record-model.md` — AR repository implementation, hydrator reconstitution, model definition, typed properties, lifecycle events, mutations
- `references/packages/persistence-active-record-queries.md` — ActiveQuery engine, strict where guards, stream processing, grid pagination, sorting, AR testing
- `references/packages/persistence-active-record-relations.md` — relationQuery, hasOne/hasMany, viaTable, eager loading, LazyLoadGuard
- `references/packages/persistence-cycle-orm.md` — Cycle ORM data mapper, entities, relations, behaviors, unit of work
- `references/packages/persistence-cycle-schema-and-cli.md` — DBAL configuration, schema compilation pipeline, Cycle migrations & CLI commands
- `references/packages/persistence-migrations.md` — split index: module-wide anti-pattern matrix, schema vs operations guides
- `references/packages/persistence-migrations-schema.md` — migration contracts, naming conventions, ColumnBuilder schema construction, foreign keys & cross-DBMS portability
- `references/packages/persistence-migrations-alterations.md` — schema alterations & DDL operations, SQLite copy-and-rename workaround, data migrations & streaming seeds
- `references/packages/persistence-migrations-operations.md` — params config, console command catalog, CI automation
- `references/packages/persistence-caching.md` — PSR-16 caching, getOrSet, TagDependency
- `references/packages/persistence-cache-drivers.md` — redis/db/APCu/memcached/wincache drivers

### Infrastructure & Async
- `references/packages/infra-runners-and-runtimes.md` — entry points, runners, runtime selection
- `references/packages/infra-runtime-roadrunner.md` — RoadRunner worker runtime
- `references/packages/infra-runtime-frankenphp.md` — FrankenPHP worker runtime
- `references/packages/infra-state-resetter.md` — long-running worker state safety
- `references/packages/infra-commands.md` — split index: thin console commands, anti-pattern matrix, definition & execution guide catalog
- `references/packages/infra-commands-definition.md` — console command architecture, input arguments & options, argument/option binding, DI wiring, command registration
- `references/packages/infra-commands-execution.md` — SymfonyStyle terminal UX, standard ExitCode constants, friendly exceptions, command testing, built-in ecosystem commands
- `references/packages/infra-queue-jobs.md` — queue jobs, message DTOs, workers, failure pipelines
- `references/packages/infra-queue-brokers.md` — broker adapters (queue-db/redis/amqp, SyncQueue)
- `references/packages/infra-queue-mutex.md` — distributed mutex locks
- `references/packages/infra-transactional-outbox.md` — atomic outbox pattern, mutex-guarded relay workers, backoff & dead-letter recovery, consumer idempotency
- `references/packages/infra-auth-and-rbac.md` — identity, password hashing, RBAC rules, route protection
- `references/packages/infra-auth-session.md` — stateful session authentication, CurrentUser, login/logout lifecycles, CookieLogin, web events
- `references/packages/infra-auth-jwt.md` — JWT authentication
- `references/packages/infra-auth-oauth2.md` — OAuth2/OIDC clients
- `references/packages/infra-rbac-storage.md` — rbac-db, rbac-php, rbac-cycle-db drivers
- `references/packages/infra-mailer.md` — email composition, sending, templating, testing
- `references/packages/infra-mailer-transports.md` — transports & DSN
- `references/packages/infra-mailer-async-queue.md` — async queue sending
- `references/packages/infra-payments.md` — unified payment gateway abstraction (Stripe, PayPal, YooKassa, Robokassa), payment intents, PSR-15 webhooks
- `references/packages/infra-logging.md` — PSR-3 injection, targets, context providers
- `references/packages/infra-error-handling.md` — split index: anti-pattern matrix, related guides
- `references/packages/infra-error-handling-web.md` — ErrorCatcher, exception mapping, renderers, friendly/user exceptions
- `references/packages/infra-error-handling-ops.md` — Sentry monitoring, console error handling, low-level ErrorHandler
- `references/packages/testing-core.md` — test architecture, testing pyramid, PHPUnit 10/11 runners & quality gates, mocking strategies, PHP 8 signatures reference
- `references/packages/testing-unit-recipes.md` — unit testing application use cases, domain validation, test fixtures via factory, container state isolation
- `references/packages/testing-psr-doubles.md` — ready-made PSR test doubles (SimpleEventDispatcher, SimpleLogger, MemorySimpleCache, StaticClock, SimpleContainer, StringStream)
- `references/packages/testing-testo.md` — Testo alternative runner
- `references/packages/testing-codeception.md` — Codeception alternative runner
- `references/packages/testing-infection.md` — mutation testing gate
- `references/packages/testing-console.md` — console command tests
- `references/packages/testing-http.md` — functional HTTP testing & middleware testing
- `references/packages/testing-database.md` — transactional DB testing, SQLite fixtures, repository tests
