# Yii3 Views, Layouts & Widgets Guide

> Practical guide for template rendering, XSS protection, layouts, asset bundles, custom widgets, forms, and data grids using `yiisoft/view`, `yiisoft/yii-view-renderer`, `yiisoft/html`, `yiisoft/widget`, `yiisoft/assets`, `yiisoft/yii-widgets`, `yiisoft/form`, `yiisoft/form-model`, and `yiisoft/yii-dataview`.
>
> **Source of Truth & Verification Rule for AI Models:**
> In projects using this extension, always verify exact method signatures, constructor arguments, and options directly in `vendor/yiisoft/<package>/src/` for installed packages.
> When generating code, if an installed package's method signature or property is unfamiliar or in doubt, **read its source files in `vendor/yiisoft/<package>/src/`** rather than guessing or relying on Yii2 habits.

---

## Table of Contents
- [1. Action-to-View Rendering Pipeline (WebViewRenderer)](#1-action-to-view-rendering-pipeline-webviewrenderer)
- [2. PHP Template Anatomy & Typing (WebView)](#2-php-template-anatomy--typing-webview)
- [3. Mandatory XSS Escaping & Safe HTML (Yiisoft\Html\Html)](#3-mandatory-xss-escaping--safe-html-yiisofthtmlhtml)
- [4. Layouts, Page Lifecycle & Partials](#4-layouts-page-lifecycle--partials)
- [5. Asset Bundles (Yiisoft\Assets\AssetBundle)](#5-asset-bundles-yiisoftassetsassetbundle)
- [6. Custom Widgets & Built-in Widgets](#6-custom-widgets--built-in-widgets)
- [7. HTML Form Rendering (yiisoft/html, yiisoft/form-model, yiisoft/form)](#7-html-form-rendering-yiisofthtml-yiisoftform-model-yiisoftform)
- [8. DataView & GridView (yiisoft/yii-dataview)](#8-dataview--gridview-yiisoftyii-dataview)
- [9. Anti-Pattern Matrix](#9-anti-pattern-matrix)

---

## 1. Action-to-View Rendering Pipeline (`WebViewRenderer`)

In Yii3, controllers and actions do not have their own internal rendering engine. Views are rendered by injecting `Yiisoft\Yii\View\Renderer\WebViewRenderer` into the Action handler.

```php
declare(strict_types=1);

namespace App\Presentation\Action\User;

use App\Domain\User\UserRepositoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class ViewUserAction
{
    public function __construct(
        private CurrentRoute $currentRoute,
        private UserRepositoryInterface $userRepository,
        private WebViewRenderer $viewRenderer,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $id = (int) $this->currentRoute->getArgument('id');
        $user = $this->userRepository->findById($id);

        if ($user === null) {
            // render() returns PSR-7 ResponseInterface; status code is chained on the response
            return $this->viewRenderer
                ->render('user/not-found', ['id' => $id])
                ->withStatus(Status::NOT_FOUND);
        }

        // Renders views/user/profile.php wrapped by the configured layout
        return $this->viewRenderer->render('user/profile', [
            'user' => $user,
            'pageTitle' => 'User Profile: ' . $user->getName(),
        ]);
    }
}
```

### Key `WebViewRenderer` Methods:
- `render(string $view, array $parameters = []): ResponseInterface` — renders the view wrapped inside the layout (returns PSR-7 `ResponseInterface` with deferred body stream).
- `renderPartial(string $view, array $parameters = []): ResponseInterface` — renders only the view template without the layout.
- `renderAsString(string $view, array $parameters = []): string` — renders view with layout immediately into a string.
- `renderPartialAsString(string $view, array $parameters = []): string` — renders view without layout immediately into a string.
- `withLayout(?string $layout): self` — sets or overrides layout for the current render call (`null` disables layout).
- `withController(object $controller): self` — sets the controller instance to infer view path.
- `withControllerName(string $name): self` — sets the controller name for view path resolution.
- `withViewPath(string $viewPath): self` — overrides the base directory path for views.
- `withAddedInjections(object|string ...$injections): self` — appends view injections.
- `withInjections(object|string ...$injections): self` — replaces all view injections.
- `withLocale(string $locale): self` — sets locale code for localized view rendering.
- `withContentType(string $contentType): self` — sets response Content-Type header (default: `text/html`).
- `withEncoding(string $encoding): self` — sets response charset encoding (default: `UTF-8`).

> ⚠️ **CRITICAL: Setting HTTP Status Codes:**
> `WebViewRenderer` does **NOT** have a `withStatus()` method. The `render()` and `renderPartial()` methods return a PSR-7 `ResponseInterface` (specifically `Yiisoft\Yii\View\Renderer\ViewResponse`), so custom HTTP status codes must be chained on the returned response:
> ```php
> return $this->viewRenderer->render('not-found')->withStatus(Status::NOT_FOUND);
> ```

---

## 2. PHP Template Anatomy & Typing (`WebView`)

View templates in Yii3 are standard PHP scripts executed in the context of `Yiisoft\View\WebView`.
Every template must start with strict typing, IDE annotations, and explicit parameter definitions.

### Standard View Template (`views/user/profile.php`)
```php
<?php

declare(strict_types=1);

use App\Domain\Model\User;
use Yiisoft\Html\Html;
use Yiisoft\View\WebView;

/**
 * @var WebView $this
 * @var User $user
 * @var string $pageTitle
 */

// Set page title (do NOT encode here; the layout encodes it when rendering <title>)
$this->setTitle($pageTitle);

// Register meta tag
$this->registerMeta([
    'name' => 'description',
    'content' => 'Profile information for ' . $user->getName(),
]);

// Set a view parameter accessible by layouts and parent views
$this->setParameter('activeNav', 'users');
$this->setParameter('breadcrumbs', [
    ['label' => 'Users', 'url' => '/users'],
    $user->getName(),
]);
?>

<div class="user-profile">
    <h1><?= Html::encode($user->getName()) ?></h1>
    <p>Email: <?= Html::mailto($user->getEmail()) ?></p>
    <p>Joined: <?= Html::encode($user->getCreatedAt()->format('Y-m-d')) ?></p>
</div>
```

---

## 3. Mandatory XSS Escaping & Safe HTML (`Yiisoft\Html\Html`)

> ⚠️ **CRITICAL SECURITY REQUIREMENT:**
> Never output dynamic string variables or user input directly into raw markup. Always wrap with `Html::encode()`.

```php
// ❌ WRONG (Vulnerable to Cross-Site Scripting XSS)
<h1>Welcome, <?= $user->getName() ?></h1>

// ✅ CORRECT
<h1>Welcome, <?= Html::encode($user->getName()) ?></h1>
```

### Tag Builders & Automatic Attribute/Content Escaping
All tag builder methods in `Yiisoft\Html\Html` (`Html::a()`, `Html::div()`, `Html::span()`, `Html::tag()`, etc.) return tag objects implementing `Stringable` that **automatically escape** both their content and HTML attributes.

```php
// ✅ CORRECT: Content and attributes are automatically safely escaped by Html::a()
<?= Html::a(
    content: $user->getName(),
    url: '/users/' . $user->getId(),
    attributes: ['class' => 'user-link', 'title' => $user->getName()],
) ?>

// ❌ WRONG (Double escaping bug: passing Html::encode() into Html::a() causes &amp;)
<?= Html::a(
    content: Html::encode($user->getName()),
    url: '/users/' . $user->getId(),
    attributes: ['title' => Html::encode($user->getName())],
) ?>

// Rendering HTML inside a tag builder without double escaping:
<?= Html::div(
    content: Html::tag('strong', $user->getName()) . ' (' . Html::encode($user->getEmail()) . ')',
    attributes: ['class' => 'user-badge'],
)->encode(false) ?>
```

---

## 4. Layouts, Page Lifecycle & Partials

### 4.1. Main Layout (`views/layout/main.php`)
Layouts wrap the rendered view output. In Yii3, the layout has a strict lifecycle:

1. Assets are registered with `AssetManager`.
2. Asset files and inline scripts/styles are transferred to `WebView` (`addCssFiles()`, `addJsFiles()`, etc.).
3. `$this->beginPage()` starts page buffering and placeholder interception.
4. `<head>` contains `$this->head()`.
5. `<body>` contains `$this->beginBody()`.
6. `$content` receives the inner view string.
7. `</body>` contains `$this->endBody()`.
8. `$this->endPage()` cleans the buffer, substitutes script/CSS placeholders, and sends output.

```php
<?php

declare(strict_types=1);

use App\Presentation\Asset\AppAsset;
use Yiisoft\Assets\AssetManager;
use Yiisoft\Html\Html;
use Yiisoft\View\WebView;

/**
 * @var WebView $this
 * @var AssetManager $assetManager
 * @var string $content
 */

// 1. Register asset bundles for the page
$assetManager->register(AppAsset::class);

// 2. Transfer published assets and scripts into the WebView state
$this->addCssFiles($assetManager->getCssFiles());
$this->addCssStrings($assetManager->getCssStrings());
$this->addJsFiles($assetManager->getJsFiles());
$this->addJsStrings($assetManager->getJsStrings());
$this->addJsVars($assetManager->getJsVars());

// 3. Begin page buffering (MANDATORY for placeholder substitution)
$this->beginPage();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= Html::encode($this->getTitle()) ?></title>
    <?php $this->head() ?>
</head>
<body>
<?php $this->beginBody() ?>

<header class="app-header">
    <nav class="navbar navbar-expand-lg">
        <a class="navbar-brand" href="/">My App</a>
    </nav>
</header>

<main class="app-main container py-4">
    <!-- View content is injected here -->
    <?= $content ?>
</main>

<footer class="app-footer text-center py-3">
    <p>&copy; <?= date('Y') ?> My Yii3 App</p>
</footer>

<?php $this->endBody() ?>
</body>
</html>
<?php $this->endPage() ?>
```

> ⚠️ **CRITICAL LIFECYCLE WARNING:**
> Omitting `$this->beginPage()` or `$this->endPage()` prevents asset placeholders (`<![CDATA[YII-BLOCK-HEAD-...]]>`) from being replaced. JavaScript and CSS files from asset bundles will NOT be injected into the HTML.

> 💡 **Where Layout and View Parameters Come From:**
> In Yii3 with `yiisoft/yii-view-renderer`, common parameters and security tokens are injected via View Injections rather than global state:
> - `$csrf` is injected automatically into all views by `Yiisoft\Yii\View\Renderer\CsrfViewInjection` (implements `CommonParametersInjectionInterface`). It supplies a `Yiisoft\Yii\View\Renderer\Csrf` object implementing `Stringable`.
> - Custom global parameters and layout parameters are injected by implementing `CommonParametersInjectionInterface` or `LayoutParametersInjectionInterface` registered in `params['yiisoft/yii-view-renderer']['injections']`.
> - Template-level parameters can also be stored and shared across views and layouts using `$this->setParameter('key', $value)` and `$this->getParameter('key', $defaultValue)`.

### 4.2. Partial View Rendering
To break down complex templates, render partials using `$this->render()`:

```php
<div class="user-list">
    <?php foreach ($users as $user): ?>
        <?= $this->render('_user_card', ['user' => $user]) ?>
    <?php endforeach ?>
</div>
```

### 4.3. Layout Content Blocks (`Yiisoft\Yii\Widgets\Block`)
Use `Block` when a child view needs to inject markup into a specific placeholder in the layout (e.g. sidebar, modal, or script section):

**In child view (`views/user/profile.php`):**
```php
<?php

use Yiisoft\Yii\Widgets\Block;

Block::widget()->id('sidebar')->begin();
?>
    <div class="user-stats">
        <h3>User Stats</h3>
        <p>Posts: <?= $user->getPostCount() ?></p>
    </div>
<?php Block::end() ?>
```

**In layout (`views/layout/main.php`):**
```php
<aside class="app-sidebar">
    <?php if ($this->hasBlock('sidebar')): ?>
        <?= $this->getBlock('sidebar') ?>
    <?php else: ?>
        <p>Default sidebar content</p>
    <?php endif ?>
</aside>
```

> ⚠️ **HIDDEN TRAP: Calling `getBlock()` on Undefined Blocks:**
> If a block ID was not registered by a child view, calling `$this->getBlock('sidebar')` directly throws `InvalidArgumentException`. Always guard block retrieval with `if ($this->hasBlock('sidebar'))`.

---

## 5. Asset Bundles (`Yiisoft\Assets\AssetBundle`)

Asset bundles manage CSS, JavaScript, and asset dependencies without manual `<link>` and `<script>` tags in views.

### Declaring an Asset Bundle (`src/Presentation/Asset/AppAsset.php`)
```php
declare(strict_types=1);

namespace App\Presentation\Asset;

use Yiisoft\Assets\AssetBundle;
use Yiisoft\View\WebView;

final class AppAsset extends AssetBundle
{
    public ?string $basePath = '@assets';
    public ?string $baseUrl = '@assetsUrl';
    public ?string $sourcePath = '@resources/assets';

    public array $css = [
        'css/site.css',
    ];

    public array $js = [
        'js/app.js',
    ];

    // Optional: position of scripts in HTML output
    public ?int $jsPosition = WebView::POSITION_END;

    public array $depends = [
        // Dependent bundles loaded prior to this bundle
        BootstrapAsset::class,
    ];
}
```

### Registering Asset Bundles
1. **In Layout (Recommended for global assets):**
   ```php
   $assetManager->register(AppAsset::class);
   ```
2. **In a View (For page-specific assets):**
   ```php
   /** @var AssetManager $assetManager */
   $assetManager->register(\App\Presentation\Asset\ChartAsset::class);
   ```

---

## 6. Custom Widgets & Built-in Widgets

### 6.1. Creating a Custom Widget (`Yiisoft\Widget\Widget`)
Widgets are reusable presentation components. In Yii3, widgets are immutable objects returning HTML strings:

```php
declare(strict_types=1);

namespace App\Presentation\Widget;

use Yiisoft\Html\Html;
use Yiisoft\Widget\Widget;

final class AlertBox extends Widget
{
    private string $type = 'info';
    private string $message = '';
    private bool $dismissible = true;

    public function type(string $type): self
    {
        $new = clone $this;
        $new->type = $type;
        return $new;
    }

    public function message(string $message): self
    {
        $new = clone $this;
        $new->message = $message;
        return $new;
    }

    public function dismissible(bool $dismissible = true): self
    {
        $new = clone $this;
        $new->dismissible = $dismissible;
        return $new;
    }

    public function render(): string
    {
        if ($this->message === '') {
            return '';
        }

        $classes = 'alert alert-' . $this->type;
        if ($this->dismissible) {
            $classes .= ' alert-dismissible fade show';
        }

        // Html::div automatically encodes content and attributes
        return Html::div(
            content: $this->message,
            attributes: ['class' => $classes, 'role' => 'alert'],
        )->render();
    }
}
```

### Invoking a Widget in a View
Because `Widget` implements `NoEncodeStringableInterface`, `render()` is called automatically on string conversion:

```php
<?= AlertBox::widget()
    ->type('success')
    ->message('User profile updated successfully!') ?>
```

> ⚠️ **HIDDEN TRAP: `WidgetFactory` Must Be Initialized:**
> `Widget::widget()` — for custom widgets and every built-in `yiisoft/yii-widgets` widget (`Block`, `Breadcrumbs`, `Menu`, `FragmentCache`) — resolves instances through `Yiisoft\Widget\WidgetFactory`, which throws `WidgetFactoryInitializationException` if `WidgetFactory::initialize()` was never called. Call it once during application bootstrap (typically in `config/common/bootstrap.php`):
> ```php
> use Yiisoft\Widget\WidgetFactory;
>
> WidgetFactory::initialize();
> ```
> The method accepts an optional DI container (`?ContainerInterface $container`), widget definitions, themes, and default-theme arguments — see `Yiisoft\Widget\WidgetFactory::initialize()`.

### 6.2. Built-in Core Widgets (`yiisoft/yii-widgets`)

| Widget | Purpose | Example Usage |
|---|---|---|
| `Breadcrumbs` | Breadcrumb navigation links | `<?= Breadcrumbs::widget()->items($this->getParameter('breadcrumbs', [])) ?>` |
| `Block` | Captures output block for layout | `Block::widget()->id('name')->begin(); ... Block::end();` |
| `FragmentCache` | Caches output of a template fragment | `FragmentCache::widget()->id('key')->ttl(3600)->begin(); ... FragmentCache::end();` |
| `Menu` | Navigation menus | `<?= Menu::widget()->items([['label' => 'Home', 'link' => '/']]) ?>` |

---

## 7. HTML Form Rendering (`yiisoft/html`, `yiisoft/form-model`, `yiisoft/form`)

In Yii3, forms are composed of two parts:
1. Form tags: `Yiisoft\Html\Html::form()` provides `<form>` opening and closing tags with automatic CSRF token injection.
2. Form fields: `Yiisoft\FormModel\Field` binds form models (`FormModelInterface`) to input widgets with validation styling and hints.

> [!TIP]
> For the CSRF middleware itself, token implementations, session/cookie state, and flash messages, see
> `references/http-state.md`; for form hydration and validation flow, see `references/validation-and-forms.md`.

### Form Model Definition (`src/Presentation/Form/LoginForm.php`)
```php
declare(strict_types=1);

namespace App\Presentation\Form;

use Yiisoft\FormModel\Attribute\Hint;
use Yiisoft\FormModel\Attribute\Placeholder;
use Yiisoft\FormModel\FormModel;
use Yiisoft\Validator\Label;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\RulesProviderInterface;

final class LoginForm extends FormModel implements RulesProviderInterface
{
    #[Label('Username or Email')]
    #[Placeholder('Enter username or email')]
    private string $login = '';

    #[Label('Password')]
    private string $password = '';

    #[Label('Remember Me')]
    #[Hint('Keep me logged in on this device')]
    private bool $rememberMe = false;

    public function getLogin(): string
    {
        return $this->login;
    }

    public function getPassword(): string
    {
        return $this->password;
    }

    public function isRememberMe(): bool
    {
        return $this->rememberMe;
    }

    public function getRules(): array
    {
        return [
            'login' => [new Required()],
            'password' => [new Required(), new Length(min: 8)],
        ];
    }
}
```

### Form Template (`views/auth/login.php`)
```php
<?php

declare(strict_types=1);

use App\Presentation\Form\LoginForm;
use Yiisoft\FormModel\Field;
use Yiisoft\Html\Html;
use Yiisoft\View\WebView;
use Yiisoft\Yii\View\Renderer\Csrf;

/**
 * @var WebView $this
 * @var LoginForm $formModel
 * @var Csrf|string $csrf
 */

$this->setTitle('Sign In');
?>

<div class="row justify-content-center">
    <div class="col-md-6">
        <!-- 1. Form tag opened with action, method and CSRF protection -->
        <?= Html::form('/auth/login')
            ->post()
            ->csrf($csrf)
            ->open() ?>

            <!-- 2. Display model-level error summary if validation fails -->
            <?= Field::errorSummary($formModel) ?>

            <!-- 3. FormModel Fields bound directly to model properties -->
            <?= Field::text($formModel, 'login')
                ->label('Username or Email')
                ->autofocus() ?>

            <?= Field::password($formModel, 'password')
                ->label('Password') ?>

            <?= Field::checkbox($formModel, 'rememberMe')
                ->label('Remember Me') ?>

            <div class="form-actions mt-3">
                <?= Field::submitButton('Sign In')
                    ->buttonAttributes(['class' => 'btn btn-primary w-100']) ?>
            </div>

        <!-- 4. Form tag closed -->
        <?= Html::form()->close() ?>
    </div>
</div>
```

### Pure Fields (Without a FormModel)
For ad-hoc search boxes or filters not bound to a `FormModel`, use `Yiisoft\Form\PureField\Field`:

```php
<?php

declare(strict_types=1);

use Yiisoft\Form\PureField\Field;
use Yiisoft\Html\Html;

/**
 * @var string $query
 */
?>

<?= Html::form('/search')->get()->open() ?>
    <?= Field::text('q')
        ->value($query)
        ->placeholder('Search catalog...') ?>
    <?= Field::submitButton('Search') ?>
<?= Html::form()->close() ?>
```

### 7.3. Form Theming with Bootstrap 5 (`yiisoft/form`)
By default, fields render plain semantic HTML tags without framework-specific classes. To automatically apply Bootstrap 5 markup (`.form-control`, `.form-label`, `.is-invalid`, `.text-danger`) without manually adding classes to every field, initialize `ThemeContainer`:

```php
declare(strict_types=1);

use Yiisoft\Form\Theme\ThemeContainer;
use Yiisoft\Form\Theme\ThemePath;

// Typically in config/common/bootstrap.php or config/web/bootstrap.php:
ThemeContainer::initialize(
    configs: [
        'vertical' => require ThemePath::BOOTSTRAP5_VERTICAL,
        'horizontal' => require ThemePath::BOOTSTRAP5_HORIZONTAL,
    ],
    defaultConfig: 'vertical',
);
```

With `ThemeContainer` initialized, `Field::text($formModel, 'login')` automatically renders complete Bootstrap 5 wrapper divs, labels, inputs, hints, and error blocks.

---

## 8. DataView & GridView (`yiisoft/yii-dataview`)

`GridView` renders tabular data from a `ReadableDataInterface` (such as `OffsetPaginator` or `KeysetPaginator`).
Columns are passed as variadic `ColumnInterface` instances (`DataColumn`, `ActionColumn`, `CheckboxColumn`, etc.).

```php
<?php

declare(strict_types=1);

use App\Domain\Model\User;
use Stringable;
use Yiisoft\Data\Paginator\OffsetPaginator;
use Yiisoft\Html\Html;
use Yiisoft\View\WebView;
use Yiisoft\Yii\DataView\GridView\Column\ActionColumn;
use Yiisoft\Yii\DataView\GridView\Column\Base\DataContext;
use Yiisoft\Yii\DataView\GridView\Column\DataColumn;
use Yiisoft\Yii\DataView\GridView\GridView;

/**
 * @var WebView $this
 * @var OffsetPaginator $paginator
 */

$this->setTitle('Users Management');
?>

<?= GridView::widget()
    ->dataReader($paginator)
    ->columns(
        new DataColumn(
            property: 'id',
            header: 'ID',
            withSorting: true,
        ),
        new DataColumn(
            property: 'name',
            header: 'Full Name',
            // Tag objects implement NoEncodeStringableInterface and are output as raw HTML
            content: static fn (User $user, DataContext $context): Stringable => Html::a(
                content: $user->getName(),
                url: '/users/' . $user->getId(),
            ),
        ),
        new DataColumn(
            property: 'email',
            header: 'Email',
            content: static fn (User $user): Stringable => Html::mailto($user->getEmail()),
        ),
        new DataColumn(
            property: 'status',
            header: 'Status',
            bodyClass: static fn (User $user, DataContext $context): string => $user->isActive() ? 'text-success' : 'text-muted',
        ),
        new ActionColumn(
            urlCreator: static fn (string $action, DataContext $context): string => sprintf(
                '/users/%d/%s',
                $context->data->getId(),
                $action,
            ),
            // Buttons not listed here are HIDDEN by default
            visibleButtons: [
                'view' => static fn (User $user, mixed $key, int $index): bool => true,
                'update' => static fn (User $user, mixed $key, int $index): bool => true,
                'delete' => static fn (User $user, mixed $key, int $index): bool => $user->isDeletable(),
            ],
        ),
    )
    ->summaryTemplate('Showing {begin}–{end} of {totalCount} users (Page {currentPage} of {totalPages})')
    ->noResultsText('No users found.')
?>
```

> ⚠️ **HIDDEN TRAP: `content` Callables Are Auto-Encoded:**
> By default (`encodeContent: null`), a plain `string` returned by a `content` callable is passed through `Html::encode()` before output — a returned raw HTML string like `'<a href="...">...</a>'` will be displayed as escaped text, not rendered (verified in `DataColumnTest::dataEncodeContent`). Two safe options:
> - **Return a tag object** (`Html::a(...)`, `Html::mailto(...)`, `Html::tag(...)`) without `->render()` — tag objects implement `NoEncodeStringableInterface` and are output as raw HTML automatically (recommended).
> - **Return a raw HTML string** only together with the explicit `encodeContent: false` constructor parameter.
> Plain text content needs no manual `Html::encode()` — returning an already-escaped string causes double encoding.

### Key GridView API Differences from Yii2:
- **FQCN:** `Yiisoft\Yii\DataView\GridView\GridView` (under `GridView\` sub-namespace).
- **Data binding:** `->dataReader($paginator)` — takes any `ReadableDataInterface`. `->paginator()` does NOT exist.
- **Columns:** `->columns(ColumnInterface ...$columns)` — variadic objects (`new DataColumn(...)`), NOT nested configuration arrays.
- **Model property:** `DataColumn(property: 'name')` — uses `property`, NOT `attribute`.
- **Empty table text:** `->noResultsText('No users found.')` — replaces Yii2's `emptyText`. `emptyCell()` sets content for empty individual cells.
- **Summary:** `->summaryTemplate(...)` — uses `{currentPage}`, `{totalPages}`, `{begin}`, `{end}`, `{count}`, `{totalCount}` tokens.

### 8.1. Column Filtering in GridView
Yii3 does **NOT** use Yii2's `filterModel`. Instead, filtering is configured directly per column via the `filter:` parameter on `DataColumn`:

```php
<?php

declare(strict_types=1);

use Yiisoft\Yii\DataView\Filter\Widget\DropdownFilter;
use Yiisoft\Yii\DataView\Filter\Widget\TextInputFilter;
use Yiisoft\Yii\DataView\GridView\Column\DataColumn;

// 1. Text input filter (boolean true renders standard <input type="text">)
$nameColumn = new DataColumn(
    property: 'name',
    header: 'Full Name',
    filter: true,
);

// 2. Dropdown filter options array (renders <select>)
$statusColumn = new DataColumn(
    property: 'status',
    header: 'Status',
    filter: [
        'active' => 'Active',
        'pending' => 'Pending',
        'banned' => 'Banned',
    ],
);

// 3. Custom TextInputFilter widget with custom attributes
$createdColumn = new DataColumn(
    property: 'created_at',
    header: 'Created At',
    filter: (new TextInputFilter())->attributes(['placeholder' => 'YYYY-MM-DD']),
);

// 4. Custom DropdownFilter widget with optionsData
$roleColumn = new DataColumn(
    property: 'role',
    header: 'Role',
    filter: (new DropdownFilter())->optionsData([
        'admin' => 'Administrator',
        'editor' => 'Editor',
        'user' => 'Registered User',
    ]),
);
```

---

## 9. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| **`ActiveForm::begin()`** | Yii2 legacy class; does not exist in Yii3. | `Html::form('/action')->post()->csrf($token)->open()` + `Field::text($formModel, 'prop')`. |
| **`Yiisoft\Form\Widget\Form`** | Phantom class; doesn't exist in `yiisoft/form` or `yiisoft/form-model`. | Use `Yiisoft\Html\Html::form()->open()` and `Html::form()->close()`. |
| **`Field::widget()->text(...)`** | Incorrect instance invocation on static factory. | Use static factory `Yiisoft\FormModel\Field::text($formModel, 'prop')`. |
| **`Field::submitButton('Sign In', ['class' => 'btn'])`** | Second parameter is `$config` (definitions array), not HTML attributes; `SubmitButton` has no `class` setter. | Call `Field::submitButton('Sign In')->buttonAttributes(['class' => 'btn btn-primary'])` or `->buttonClass('btn', 'btn-primary')`. |
| **`WebViewRenderer::withStatus($code)`** | `WebViewRenderer` does not have `withStatus()`; it returns a PSR-7 `ResponseInterface`. | Chain `->withStatus($code)` on the returned response: `$this->viewRenderer->render(...)->withStatus(Status::NOT_FOUND)`. |
| **`WebViewRenderer::withDefaultParameters(...)`** | Phantom method; does not exist on `WebViewRenderer`. | Configure an injection implementing `CommonParametersInjectionInterface` in `injections`, or set parameters on `WebView` via `$this->setParameters(...)`. |
| **`GridView::widget()->emptyText('...')`** | Yii2 legacy property; does not exist in `GridView` or `BaseListView`. | Use `->noResultsText('No records found.')` for empty lists, or `->emptyCell('...')` for empty cell contents. |
| **`GridView::widget()->paginator($paginator)`** | Method does not exist on `GridView` or `BaseListView`. | Use `GridView::widget()->dataReader($paginator)` (accepts any `ReadableDataInterface`). |
| **`GridView::widget()->filterModel($searchModel)`** | Yii2 legacy concept; `filterModel` does not exist in Yii3. | Configure filters directly on columns: `new DataColumn(property: 'name', filter: true)`. |
| **`Passing arrays to GridView::columns([['attribute' => 'id']])`** | In Yii3, `columns()` is variadic and accepts `ColumnInterface` instances (`DataColumn`, `ActionColumn`). | Use `GridView::widget()->columns(new DataColumn(property: 'id'), ...)`. |
| **`new DataColumn(attribute: 'name')`** | Constructor parameter is `property`, not `attribute`. Causes PHP Fatal Error with named arguments. | Use `new DataColumn(property: 'name')`. |
| **`GridView::widget()->summary('...')`** | Method does not exist; token `{page}` is from Yii2. | Use `->summaryTemplate('Page {currentPage} of {totalPages}')`. |
| **`Calling $this->getBlock('id') without hasBlock('id')`** | Calling `getBlock()` for an unset block throws `InvalidArgumentException`. | Guard with `if ($this->hasBlock('id'))` before calling `getBlock('id')`. |
| **Missing `$this->beginPage()` / `$this->endPage()`** | Placeholders are not replaced; script/CSS bundles fail to inject into the HTML. | Always wrap `<head>` and `<body>` with `beginPage()` / `endPage()`. |
| **Omitting `$assetManager->get*Files()` in Layout** | Registered bundles are never handed over to `WebView` state. | Call `$this->addCssFiles($assetManager->getCssFiles())` and `$this->addJsFiles(...)` in layout. |
| **`$this->setTitle(Html::encode($title))`** | Causes double escaping because layout encodes `<title><?= Html::encode($this->getTitle()) ?></title>`. | Call `$this->setTitle($title)` with raw unencoded string. |
| **`Html::a(text: ...)`** | Parameter name in `Html::a()` is `$content`, not `$text`. Causes PHP Fatal Error in PHP 8. | Use `Html::a(content: ..., url: ..., attributes: ...)`. |
| **Wrapping content in `Html::encode()` inside `Html::a()`** | `Html::a()` and tag builders already automatically encode their content. | Pass raw strings directly to `Html::a()`; use `->encode(false)` only when nesting trusted tags. |
| **`use Yiisoft\FormModel\Attribute\Label;`** | Phantom attribute; `yiisoft/form-model` ships only `Hint` and `Placeholder` attributes under `Attribute\`. | Use `Yiisoft\Validator\Label` — `FormModel` reads it to resolve property labels via `getPropertyLabel()`. |
| **`content: fn (...) => Html::a(...)->render()` in `DataColumn`** | Plain `string` values returned by `content` callables are HTML-encoded by default (`encodeContent: null`); raw HTML renders as escaped text. | Return the tag object directly (`Html::a(...)` — it implements `NoEncodeStringableInterface`) or add `encodeContent: false`. |
| **`content: fn (...) => Html::encode($data->getX())` in `DataColumn`** | Double encoding: GridView already encodes plain-string content itself. | Return the raw string (auto-encoded), or a tag object when trusted HTML is intended. |
| **Manually adding Bootstrap CSS to every field** | Tedious, error-prone, violates DRY. | Initialize `ThemeContainer::initialize(configs: ['vertical' => require ThemePath::BOOTSTRAP5_VERTICAL])`. |
| **Calling repositories or SQL inside Views** | Breaks MVC, makes templates non-cacheable and side-effectful. | Prepare all domain data in Action/Handler and pass into view parameters. |
