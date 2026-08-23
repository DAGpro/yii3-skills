---
name: yii3-actions
description: >-
  Generate Yii3 handlers (invokable controllers) and supporting files using yiisoft packages:
  single web actions (FormModel + templates), REST API endpoints (input-http typed input,
  data-response JSON, presenters), or a full CRUD module scaffold (DB migration, readonly
  entity, repository over yiisoft/db, actions, views, grouped routes).
  Use when user says "create action", "add controller", "new CRUD", "create CRUD",
  "scaffold feature", "add entity", "generate endpoint", "REST API", "JSON API",
  "api controller", or needs a new web/API/CLI handler for Yii3.
argument-hint: "[action-type] [entity-name]"
allowed-tools: Read Glob Grep Write Edit Bash(php -l *; composer *; curl *; make yii *; php yii *) AskUserQuestion Questions
disable-model-invocation: false
metadata:
  author: DAGpro (https://github.com/DAGpro)
  version: "0.1"
  category: framework-yii3
---

# Yii3 Action Generator

Generate production-ready Yii3 actions using official yiisoft packages.

## Quick Start

```
/yii3-actions create Article   → CreateArticleAction + ArticleForm + route + DI
/yii3-actions list Article     → ListArticlesAction + route
/yii3-actions edit Article     → EditArticleAction + ArticleForm + route
/yii3-actions delete Article   → DeleteArticleAction + route
/yii3-actions download Report  → DownloadReportAction + route
/yii3-actions api Comment     → POST /api/comments JSON endpoint
/yii3-actions crud Post        → migration + entity + repository + actions + views
```

## Workflow

### Step 1: Branch by Task

From `$ARGUMENTS` pick the branch, or ask the user:

| Branch                 | When                                         | Go to                                                                     |
|------------------------|----------------------------------------------|---------------------------------------------------------------------------|
| **Single action**      | one handler is needed (page, form, download) | Step 2                                                                    |
| **Full CRUD scaffold** | whole entity module from scratch             | `references/CRUD.md` first (migration + entity + repository), then Step 2 |
| **REST API endpoint**  | JSON input/output, no server-side templates  | `references/API.md`, then Steps 3–4                                       |

For the **Single action** branch, determine the action type:

| Type       | Description            | HTTP      | Key Packages               |
|------------|------------------------|-----------|----------------------------|
| `list`     | Paginated list         | GET       | yiisoft/data, yii-dataview |
| `view`     | Single entity detail   | GET       | yiisoft/html               |
| `create`   | Form + POST            | GET, POST | form-model, form           |
| `edit`     | Form + POST (existing) | GET, POST | form-model, form           |
| `form`     | Standalone form        | GET, POST | form-model, form, session  |
| `download` | File download          | GET       | response-download          |

…and the target context:

| Context           | Namespace segment              | Route names / URL                                        | Layout                                         | Auth                                                                                            |
|-------------------|--------------------------------|----------------------------------------------------------|------------------------------------------------|-------------------------------------------------------------------------------------------------|
| `front` (default) | `{Namespace}\{Feature}\`       | `{entities}.{action}`, URL `/{entities}/...`             | main site layout                               | as project requires                                                                             |
| `admin`           | `{Namespace}\Admin\{Feature}\` | `admin.{entities}.{action}`, URL `/admin/{entities}/...` | admin layout (e.g. `@views/layouts/admin.php`) | protect group with `Authentication` middleware + RBAC `can()` per `/yii3-auth`; deny by default |
| `api`             | `{Namespace}\Api\{Feature}\`   | `api.{entities}.{action}`                                | none — data-response JSON                      | stateless only: token identity + `Authentication` middleware; never sessions                    |

Context rules apply on top of any type; they change naming, routing, layout and auth wiring —
never the action pattern itself.

### Step 2: Generate Files

Generate **both sides of the feature**:

**A. PHP side** — refer to `references/PATTERNS.md`:

| File            | See in PATTERNS.md                                            |
|-----------------|---------------------------------------------------------------|
| Action Class    | "Complete CRUD" → each action type                            |
| FormModel       | "Complete CRUD with FormModel" → FormModel                    |
| Input DTO (API) | "Input DTO Pattern"; full variant in API.md → "Request Input" |

Ready-made skeletons live in `templates/`: `web-action.php`, `web-form.php`,
`admin-create.php` (admin context example), `form-model.php`.

**B. Presentation side** — see "Presentation Files" below.

### Step 3: Register Route

```php
use Yiisoft\Router\Group;
use Yiisoft\Router\Route;

// {id} below is a REAL route argument consumed via CurrentRoute::getArgument('id');
// {entities} and {Entity} are generation placeholders to replace with actual values.
return [
    Group::create()->routes(
        Route::get('/{entities}')->action(List{Entity}Action::class)->name('{entities}'),
        Route::get('/{entities}/{id}')->action(View{Entity}Action::class)->name('{entities}.view'),
        Route::methods(['GET', 'POST'], '/{entities}/create')->action(Create{Entity}Action::class)->name('{entities}.create'),
        Route::methods(['GET', 'POST'], '/{entities}/{id}/edit')->action(Edit{Entity}Action::class)->name('{entities}.edit'),
        Route::post('/{entities}/{id}/delete')->action(Delete{Entity}Action::class)->name('{entities}.delete'),
    ),
];
```

### Step 4: Register DI

```php
// config/common/di/app.php
return [
    {Entity}RepositoryInterface::class => {Entity}Repository::class,
];
```

## Presentation Files

For every server-rendered action generate the matching template; for a new area also the layout.

### Per action type

| Action            | Template `{action}.php`   | Must contain                                                                                         |
|-------------------|---------------------------|------------------------------------------------------------------------------------------------------|
| `list`            | `list.php`                | GridView or loop over records; pagination links (`OffsetPaginator`); sort links                      |
| `view` / `edit`   | `view.php` / `edit.php`   | escaped entity fields (`Html::encode`); edit/delete controls as POST forms with `->csrf($csrf)`      |
| `create` / `form` | `create.php` / `form.php` | form via `Html::form()->post(...)->csrf($csrf)` + Field widgets; validation errors block (`$errors`) |
| `download`        | — (no template)           | streams response directly                                                                            |

Code examples: `/yii3-view` (references/PATTERNS.md) — HTML Helper forms, widgets, layout rendering;
`/yii3-view` (references/DATAVIEW.md) — GridView tables.

### Layout (when missing)

Create `layouts/{area}.php` (`main.php` for front, `admin.php` for admin) with:
`$this->head()` in `<head>`, `$content` output, registered asset bundle of the area.
Set per-action via `$this->viewRenderer->withLayout('@views/layouts/{area}.php')`, or globally
in DI params. View injections (CSRF, flash) are wired via `/yii3-view`.

### Rules

- Templates contain no business logic — only presentation and escape calls.
- All user data passes through `Html::encode()`; never build HTML by string concatenation.
- Forms always carry CSRF; destructive actions are POST forms with confirmation.
- Flash messages render from `$flash` (`get('success')`, `get('error')`).

## Best Practices (see also references/BEST-PRACTICES.md)

### Action Class Rules

| Rule                      | Description                                 |
|---------------------------|---------------------------------------------|
| `final readonly class`    | All actions must be immutable               |
| `__invoke` only           | Single entry point, no other public methods |
| Constructor injection     | All dependencies via PSR-11 constructor     |
| `declare(strict_types=1)` | Always at file top                          |
| One responsibility        | One action = one use case                   |

### Naming Conventions

| Artifact         | Pattern                                                                 | Examples                                     |
|------------------|-------------------------------------------------------------------------|----------------------------------------------|
| Action class     | `{Verb}{Entity}Action`                                                  | `CreateUserAction`, `ListUsersAction`        |
| FormModel        | `{Entity}Form`                                                          | `UserForm`, `LoginForm`                      |
| Input DTO        | `{Verb}{Entity}Input`                                                   | `CreateUserInput`                            |
| UseCase          | `{Verb}{Entity}`                                                        | `CreateUser`                                 |
| Template file    | `{action}.php`                                                          | `list.php`, `create.php`, `edit.php`         |
| View render path | co-located: `__DIR__ . '/{action}'`, centralized: `{entities}/{action}` | `__DIR__ . '/create'`, `users/create`        |
| Route name       | `{entities}.{action}`                                                   | `users.create`, `users.edit` (list: `users`) |

Placeholders: `{Verb}` = PascalCase action type (`Create`, `List`, `Edit`, `Delete`, `Download`);
`{Entity}` = PascalCase singular (`Article`); `{entities}` = camelCase plural (`articles`);
`{Namespace}` = base namespace detected at Step 0 (`App\`, `App\Slice\`, `App\Module\`).
For `list` actions the entity may take plural form (`ListUsersAction`) when it reads more natural.

### Template Location

Two supported layouts — detect which one the project uses at Step 0 and stay consistent:

1. **Co-located (slice-style, preferred)** — template sits next to its Action class:
   ```
   src/User/Action/
   ├── CreateArticleAction.php
   └── create.php          <- rendered via __DIR__ . '/create'
   ```
2. **Centralized** — all templates under a views root:
   ```
   views/users/
   ├── list.php
   └── create.php          <- rendered via 'users/create'
   ```

References:
- **references/BEST-PRACTICES.md** - error handling, logging levels, security checklist, performance tips, package quick reference, anti-patterns. Load when generating actions.
- **references/API.md** - REST API endpoints: typed request input, data-response, presenters, API route groups with CORS, status codes. Load when the target is a JSON API.
- **references/CRUD.md** - full CRUD scaffold: storage-layer detection, DB migration (yiisoft/db-migration), immutable entity with named constructor, repository over yiisoft/db. Load when scaffolding a whole entity module, not just one action.
- **references/PATTERNS.md** - complete code examples per action type.

Related skills for the presentation side:
- `/yii3-view` - layouts, injections, WebView API, asset bundles; template patterns in its references/PATTERNS.md
- `/yii3-view` — layouts, form widgets, GridView tables with filters, sorting, pagination
