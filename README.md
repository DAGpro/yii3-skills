# AI Factory Extension: Yii3 Skills
[AI Factory](https://github.com/lee-to/ai-factory) extension with skills for generating **Yii3** (yiisoft packages) PHP code.

## Installation

```bash
# From a git repository
ai-factory extension add https://github.com/DAGpro/yii3-skills.git
```

Skills-only install without the AI Factory CLI:

```bash
npx skills add DAGpro/yii3-skills --skill '*'
```

## Skills
| Skill              | Purpose                                                                                                                                                                                                         |
|--------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `yii3`             | Master skill: project detection, app structure, config system, coding conventions, logging, anti-patterns                                                                                                       |
| `yii3-actions`     | Generate web actions, REST endpoints or full CRUD scaffold for front/admin contexts: FormModels, presentation templates, routes, DI. References: PATTERNS.md, API.md, CRUD.md, BEST-PRACTICES.md + `templates/` |
| `yii3-di`          | Full wiring: DI definitions, config-plugin groups/layers/providers, params + PSR-14 events wiring (listeners, dispatching)                                                                                      |
| `yii3-data-layer`  | Data workflow: migrations (db-migration), repositories over query builder (yiisoft/db), transactions, pagination, Active Record. References: MIGRATIONS.md, ACTIVE-RECORD.md                                    |
| `yii3-forms`       | User input workflow: hydration via FormHydrator, validation rule catalog, flash/PRG redirects, 422 for APIs, file uploads (File/Image rules, safe storage, downloads)                                           |
| `yii3-email`       | Email workflow: templates + layouts, attachments/embeddings, bulk sends, dev stubs                                                                                                                              |
| `yii3-errors`      | Error pages/JSON errors, renderers per Accept header, ExceptionResponder + PSR-3 log targets, filtering, intervals                                                                                              |
| `yii3-auth`        | Auth + RBAC + passwords: login/logout, roles/permissions, signup/change/reset flows                                                                                                                             |
| `yii3-testing`     | Codeception suites (Unit/Functional/Web/Console), Docker runs, debug panel/toolbar                                                                                                                              |
| `yii3-view`        | Layouts, injections, WebView API, asset bundles, Twig & custom engines, themes, form Field widgets, GridView tables. References: PATTERNS.md, DATAVIEW.md                                                       |
| `yii3-hardening`   | Production audit: security (trusted proxies, CSRF, headers) + performance (opcache, DB indexing, autoloader, profiling)                                                                                         |
| `yii3-http-client` | PSR-18 outgoing requests (Guzzle), DI wiring, MockHandler tests                                                                                                                                                 |


## Extras
- **Testing references**: quality tools checklist (`QUALITY-TOOLS.md`) and E2E guide
  (`END-TO-END.md`) in `skills/yii3-testing/references/`.
- **Testing environment**: full setup reference (codeception.yml, suites, state reset, coverage) in
  `skills/yii3-testing/references/ENVIRONMENT-SETUP.md`.
- **CI template**: GitHub Actions workflow for PHP 8.2–8.4 + Codeception in
  `skills/yii3-testing/references/CI-WORKFLOW.md`.

## Usage in your agent
```
/yii3-actions create Article   Generate action + form + route + DI
/yii3-actions list Article     Generate paginated list action
/yii3-actions crud Category    Scaffold CRUD for the Category entity
/yii3-actions api              Add POST /api/comments JSON endpoint
/yii3-di                                Register PaymentServiceInterface with StripePaymentService
/yii3-di                                Dispatch UserSignedUp and send welcome email
/yii3-data-layer                        Add an orders table with UUID primary key
/yii3-auth                              Add session login and RBAC roles
/yii3-testing                           Write functional tests for the posts CRUD
/yii3-email                           Send a welcome email with HTML template
/yii3-errors                    Custom JSON error responses for API
/yii3-view                              Create an admin layout with shared params
/yii3-data-layer                        Build a report query with joins and aggregation
/yii3-forms                   Add cross-field validation to a date-range filter
/yii3-forms                   Handle avatar upload with File/Image validation
/yii3-hardening                         Audit the app before production deploy
/yii3-hardening                         Speed up the slow dashboard page
/yii3-view                              Render a Bootstrap horizontal signup form
/yii3-view                              Admin table for users with filters and sorting
/yii3-view                              Bundle admin CSS/JS with a CDN Bootstrap
/yii3-di                                Override a vendor package default config
/yii3-di                                Dispatch UserSignedUp and send welcome email
/yii3-http-client                       Call the GitHub releases API from a service
```
The master `yii3` skill loads automatically when working on Yii3 projects and is invoked by the
other skills for shared context.

## License
MIT
