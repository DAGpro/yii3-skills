# Yii3 Views, Layouts & Widgets Guide

> Comprehensive guide for template rendering, XSS protection, layouts, view injections, asset bundles, custom widgets, CSS framework drivers, HTML forms, and DataView components using `yiisoft/view`, `yiisoft/yii-view-renderer`, `yiisoft/html`, `yiisoft/widget`, `yiisoft/assets`, `yiisoft/yii-widgets`, `yiisoft/form`, `yiisoft/form-model`, `yiisoft/yii-dataview`, `yiisoft/bootstrap5`, `yiisoft/yii-bulma`, `yiisoft/view-twig`, and `yiisoft/yii-twig`.

---

## Table of Contents
- [1. Action-to-View Rendering Pipeline (WebViewRenderer)](#1-action-to-view-rendering-pipeline-webviewrenderer)
  - [1.1. Single-Action Injection and Deferred PSR-7 Response](#11-single-action-injection-and-deferred-psr-7-response)
  - [1.2. Key WebViewRenderer API Methods](#12-key-webviewrenderer-api-methods)
  - [1.3. Template Placement: Colocation (Style A) vs Centralized (Style B)](#13-template-placement-colocation-style-a-vs-centralized-style-b)
- [2. PHP Template Anatomy & Typing (WebView)](#2-php-template-anatomy--typing-webview)
  - [2.1. Standard PHP Template Anatomy](#21-standard-php-template-anatomy)
  - [2.2. Page Title, Meta Tags & Script Registration API](#22-page-title-meta-tags--script-registration-api)
  - [2.3. Parameter Exchange (setParameter / getParameter / addToParameter / removeParameter)](#23-parameter-exchange-setparameter--getparameter--addtoparameter--removeparameter)
  - [2.4. Application View Theming (Yiisoft\View\Theme)](#24-application-view-theming-yiisoftviewtheme)
  - [2.5. PSR-14 View Lifecycle Events](#25-psr-14-view-lifecycle-events)
- [3. Alternative Template Engine: Twig (yiisoft/view-twig & yiisoft/yii-twig)](#3-alternative-template-engine-twig-yiisoftview-twig--yiisoftyii-twig)
  - [3.1. Architecture & Renderer Registration (TwigTemplateRenderer)](#31-architecture--renderer-registration-twigtemplaterenderer)
  - [3.2. Twig Template Anatomy & Page Lifecycle (|raw, {% do %})](#32-twig-template-anatomy--page-lifecycle-raw--do-)
  - [3.3. WebViewExtension & Grounded Helper Boundaries](#33-webviewextension--grounded-helper-boundaries)
  - [3.4. Static Widget & Helper Invocation Restrictions in Twig](#34-static-widget--helper-invocation-restrictions-in-twig)
- [4. Mandatory XSS Escaping & Safe HTML (Yiisoft\Html\Html)](#4-mandatory-xss-escaping--safe-html-yiisofthtmlhtml)
  - [4.1. Escaping Primitives (Html::encode, encodeAttribute, escapeJavaScriptStringValue)](#41-escaping-primitives-htmlencode-encodeattribute-escapejavascriptstringvalue)
  - [4.2. Tag Builders & NoEncodeStringableInterface](#42-tag-builders--noencodestringableinterface)
  - [4.3. Disabling Tag Builder Escaping (->encode(false))](#43-disabling-tag-builder-escaping--encodefalse)
  - [4.4. Essential HTML Tag Factory Catalog](#44-essential-html-tag-factory-catalog)
  - [4.5. CSS Class, Style & Attribute Manipulation Utilities](#45-css-class-style--attribute-manipulation-utilities)
- [5. Layouts, Page Lifecycle & View Injections](#5-layouts-page-lifecycle--view-injections)
  - [5.1. Main Layout Structure & Lifecycle Sequence](#51-main-layout-structure--lifecycle-sequence)
  - [5.2. View Injections Architecture (The 4 Canonical Contracts)](#52-view-injections-architecture-the-4-canonical-contracts)
  - [5.3. Custom View Injection Implementation (SiteThemeInjection)](#53-custom-view-injection-implementation-sitethemeinjection)
  - [5.4. Layout-Specific Injections (LayoutSpecificInjections)](#54-layout-specific-injections-layoutspecificinjections)
  - [5.5. CSRF Token Object (Csrf) & Injected Security](#55-csrf-token-object-csrf--injected-security)
  - [5.6. Partial View Rendering ($this->render())](#56-partial-view-rendering-this-render)
  - [5.7. Content Blocks (Yiisoft\Yii\Widgets\Block)](#57-content-blocks-yiisoftyiiwidgetsblock)
  - [5.8. Nested Layouts with ContentDecorator](#58-nested-layouts-with-contentdecorator)
- [6. Asset Bundles & Publishing Pipeline (Yiisoft\Assets)](#6-asset-bundles--publishing-pipeline-yiisoftassets)
  - [6.1. Declaring an Asset Bundle (AssetBundle Properties & CDN with SRI)](#61-declaring-an-asset-bundle-assetbundle-properties--cdn-with-sri)
  - [6.2. Registering Asset Bundles (Layout vs Page-Specific)](#62-registering-asset-bundles-layout-vs-page-specific)
  - [6.3. Asset Publishing (AssetPublisher, Symlinks vs Copying)](#63-asset-publishing-assetpublisher-symlinks-vs-copying)
  - [6.4. Directory Hashing & URL Timestamp Cache-Busting (appendTimestamp)](#64-directory-hashing--url-timestamp-cache-busting-appendtimestamp)
  - [6.5. Asset Compilation On-the-Fly (AssetConverter: SCSS, Less, TypeScript)](#65-asset-compilation-on-the-fly-assetconverter-scss-less-typescript)
  - [6.6. Asset Exporting (JsonAssetExporter, WebpackAssetExporter)](#66-asset-exporting-jsonassetexporter-webpackassetexporter)
  - [6.7. Overriding & Disabling Bundles (customizedBundles in params.php)](#67-overriding--disabling-bundles-customizedbundles-in-paramsphp)
- [7. Custom Widgets, Core Widgets & CSS-Framework Drivers](#7-custom-widgets-core-widgets--css-framework-drivers)
  - [7.1. Creating a Custom Widget (Yiisoft\Widget\Widget & Container Pattern)](#71-creating-a-custom-widget-yiisoftwidgetwidget--container-pattern)
  - [7.2. Widget Life Cycle, Factory & Themes (WidgetFactory in 2.2+)](#72-widget-life-cycle-factory--themes-widgetfactory-in-22)
  - [7.3. Built-in Core Widgets (yiisoft/yii-widgets: Breadcrumbs, FragmentCache, Menu, Alert, Dropdown)](#73-built-in-core-widgets-yiisoftyii-widgets-breadcrumbs-fragmentcache-menu-alert-dropdown)
  - [7.4. CSS-Framework Widget Drivers: Bootstrap 5 (yiisoft/bootstrap5)](#74-css-framework-widget-drivers-bootstrap-5-yiisoftbootstrap5)
  - [7.5. CSS-Framework Widget Drivers: Bulma (yiisoft/yii-bulma)](#75-css-framework-widget-drivers-bulma-yiisoftyii-bulma)
  - [7.6. Comparison Matrix: Bootstrap 5 vs Bulma Drivers](#76-comparison-matrix-bootstrap-5-vs-bulma-drivers)
- [8. HTML Form Rendering (yiisoft/html, yiisoft/form-model, yiisoft/form)](#8-html-form-rendering-yiisofthtml-yiisoftform-model-yiisoftform)
  - [8.1. Form Architecture: Tag Builders vs Field Binding](#81-form-architecture-tag-builders-vs-field-binding)
  - [8.2. Form Model Definition for Widgets (FormModel & UI Attributes)](#82-form-model-definition-for-widgets-formmodel--ui-attributes)
  - [8.3. Form Template Example](#83-form-template-example)
  - [8.4. Comprehensive Field Catalog (Yiisoft\FormModel\Field)](#84-comprehensive-field-catalog-yiisoftformmodelfield)
  - [8.5. Automatic Validation Rules Enrichment (ValidationRulesEnricher)](#85-automatic-validation-rules-enrichment-validationrulesenricher)
  - [8.6. Pure Fields (Ad-Hoc Forms Without FormModel)](#86-pure-fields-ad-hoc-forms-without-formmodel)
  - [8.7. Centralized Form Theming (ThemeContainer, ThemePath, params.php)](#87-centralized-form-theming-themecontainer-themepath-paramsphp)
- [9. DataView Widgets: GridView, ListView & DetailView (yiisoft/yii-dataview)](#9-dataview-widgets-gridview-listview--detailview-yiisoftyii-dataview)
  - [9.1. GridView Architecture & Table Rendering](#91-gridview-architecture--table-rendering)
  - [9.2. Column Catalog (DataColumn, ActionColumn & ActionButton, CheckboxColumn, RadioColumn, SerialColumn)](#92-column-catalog-datacolumn-actioncolumn--actionbutton-checkboxcolumn-radiocolumn-serialcolumn)
  - [9.3. Column Filtering in GridView (TextInputFilter, DropdownFilter)](#93-column-filtering-in-gridview-textinputfilter-dropdownfilter)
  - [9.4. ListView (Yiisoft\Yii\DataView\ListView\ListView)](#94-listview-yiisoftyiidataviewlistviewlistview)
  - [9.5. DetailView (Yiisoft\Yii\DataView\DetailView\DetailView & DataField)](#95-detailview-yiisoftyiidataviewdetailviewdetailview--datafield)
  - [9.6. Standalone Pagination Widgets & Page Size Controls](#96-standalone-pagination-widgets--page-size-controls)
- [10. Anti-Pattern Matrix](#10-anti-pattern-matrix)
- [11. Related Topic Guides](#11-related-topic-guides)

---

## 1. Action-to-View Rendering Pipeline (`WebViewRenderer`)

In Yii3, controllers and actions do not have their own internal rendering engine. Views are rendered by injecting `Yiisoft\Yii\View\Renderer\WebViewRenderer` into the Action handler.

> [!TIP]
> For single-action controller structure, dependency injection, and PSR-7 response orchestration, see [Actions & Controllers Guide](http-actions-and-controllers.md).

### 1.1. Single-Action Injection and Deferred PSR-7 Response

`WebViewRenderer::render()` produces a PSR-7 response instance (`Yiisoft\Yii\View\Renderer\ViewResponse`) containing a deferred body stream. The actual template rendering happens only when the response stream is emitted or read, keeping memory usage minimal and allowing header/status modifications prior to output.

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
            // render() returns PSR-7 ResponseInterface; status code is chained on the returned response
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

### 1.2. Key `WebViewRenderer` API Methods

- `render(string $view, array $parameters = []): ResponseInterface` — renders the view wrapped inside the layout (returns PSR-7 `ResponseInterface` with deferred body stream).
- `renderPartial(string $view, array $parameters = []): ResponseInterface` — renders only the view template without the layout.
- `renderAsString(string $view, array $parameters = []): string` — renders view with layout immediately into a string (useful for HTML emails or CLI output).
- `renderPartialAsString(string $view, array $parameters = []): string` — renders view without layout immediately into a string.
- `withLayout(?string $layout): self` — sets or overrides layout for the current render call (`null` disables layout). Immutable.
- `withController(object $controller): self` — sets the controller instance to infer view path prefix (removes `Controller` suffix and kebab-cases the class name via `Inflector::pascalCaseToId()`).
- `withControllerName(string $name): self` — sets the controller name explicitly for view path resolution.
- `withViewPath(string $viewPath): self` — overrides the base directory path for views (supports path aliases).
- `withAddedInjections(object|string ...$injections): self` — appends view injections without clearing existing ones.
- `withInjections(object|string ...$injections): self` — replaces all view injections.
- `withLocale(string $locale): self` — sets locale code for localized view rendering (e.g. `'de_DE'`).
- `withContentType(string $contentType): self` — sets response Content-Type header (default: `text/html`).
- `withEncoding(string $encoding): self` — sets response charset encoding in Content-Type (default: `UTF-8`).

> [!WARNING]
> **CRITICAL: Setting HTTP Status Codes:**
> `WebViewRenderer` does **NOT** have a `withStatus()` method. Calling `$this->viewRenderer->withStatus(404)` throws a fatal `Error: Call to undefined method`. Always chain `->withStatus()` on the returned `ResponseInterface`:
> ```php
> return $this->viewRenderer->render('not-found')->withStatus(Status::NOT_FOUND);
> ```

### 1.3. Template Placement: Colocation (Style A) vs Centralized (Style B)

Two valid placement styles exist. Resolve which one the project uses from the architecture artifact (or the existing `src/` tree) and stay consistent — never mix styles within one project.

**Style A — views colocated with their action (current official `yiisoft/app` template).**
Each page folder contains the action class and its `template.php`. `render()` receives an **absolute path**, and `params['yiisoft/yii-view-renderer']['viewPath']` stays `null` (with `viewPath = null`, relative view paths in `render()` are not available):

```php
declare(strict_types=1);

namespace App\Product\Web\Index;

use App\Domain\Product\ProductRepositoryInterface;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class Action
{
    public function __construct(
        private WebViewRenderer $viewRenderer,
        private ProductRepositoryInterface $repository,
    ) {}

    public function __invoke(): ResponseInterface
    {
        return $this->viewRenderer->render(
            __DIR__ . '/template',
            ['products' => $this->repository->findAll(20, 0)],
        );
    }
}
```

```
src/Product/Web/Index/
├── Action.php
└── template.php      ← the rendered view
```

**Style B — central views directory (classic).** `viewPath` is configured once; `render()` receives a path relative to it:

```php
// config/params.php
return [
    'yiisoft/yii-view-renderer' => [
        'viewPath' => '@views',
        'layout' => '@views/layout/main.php',
    ],
];

// In the Action:
return $this->viewRenderer->render('product/index', ['products' => $products]); // → <viewPath>/product/index.php
```

The layout is independent of both styles and shared by them: configure it once in `params['yiisoft/yii-view-renderer']['layout']` (for example `'@views/layout/main.php'` or `'@src/Shared/Layout/main.php'`).

---

## 2. PHP Template Anatomy & Typing (`WebView`)

View templates in Yii3 are standard PHP scripts executed in the context of `Yiisoft\View\WebView`.
Every template must start with strict typing, IDE annotations, and explicit parameter definitions.

### 2.1. Standard PHP Template Anatomy

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

// Register meta tag (parameter name is $attributes, NOT $options)
$this->registerMeta([
    'name' => 'description',
    'content' => 'Profile information for ' . $user->getName(),
]);

// Set view parameters accessible by layouts and parent views
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

> [!IMPORTANT]
> - `Html::mailto($content, $mail)` returns `Yiisoft\Html\Tag\A`. There is **NO** `Mailto` class in `yiisoft/html`.
> - If `$mail` is omitted, the first parameter `$content` is treated as the recipient email address.
> - With PHP 8 named arguments, the parameters are named `content:`, `mail:`, `attributes:` (never `email:` or `text:`).

### 2.2. Page Title, Meta Tags & Script Registration API

`WebView` provides granular methods for registering page headers, meta tags, and inline/external scripts:

```php
// Title management (accepts string|Stringable, fluent self)
$this->setTitle('User Profile');
$title = $this->getTitle(); // Returns raw unencoded string

// Meta tag registration (first parameter is $attributes, optional key prevents duplicates)
$this->registerMeta(['name' => 'keywords', 'content' => 'profile, account'], 'meta-keywords');

// Object-oriented meta registration
$this->registerMetaTag(Html::meta()->name('robots')->content('noindex, follow'));

// Link tags (<link>)
$this->registerLink(['rel' => 'icon', 'type' => 'image/png', 'href' => '/favicon.png']);
$this->registerLinkTag(Html::link()->toCssFile('/theme.css'));

// Custom inline CSS
// Signature: registerCss(string $css, int $position = self::POSITION_HEAD, array $attributes = [], ?string $key = null): self
// 1. Using named argument (recommended):
$this->registerCss('.user-profile { margin-top: 2rem; }', key: 'user-profile-css');

// 2. Using positional arguments (pass empty array [] for 3rd parameter $attributes if supplying a $key):
$this->registerCss('.user-profile { margin-top: 2rem; }', WebView::POSITION_HEAD, [], 'user-profile-css');

// Custom inline JavaScript
// Signature: registerJs(string $js, int $position = self::POSITION_END, ?string $key = null): self
$this->registerJs('console.log("Profile view loaded");', WebView::POSITION_END);

// Inject global JavaScript variables
$this->registerJsVar('userId', $user->getId(), WebView::POSITION_HEAD);
```

Available script positions (`WebView::POSITION_*`):
- `WebView::POSITION_HEAD = 1` — inside `<head>` via `$this->head()`.
- `WebView::POSITION_BEGIN = 2` — directly after `<body>` via `$this->beginBody()`.
- `WebView::POSITION_END = 3` — directly before `</body>` via `$this->endBody()` (default for files and inline scripts).
- `WebView::POSITION_READY = 4` — executed on `document.addEventListener('DOMContentLoaded', ...)`.
- `WebView::POSITION_LOAD = 5` — executed on `window.addEventListener('load', ...)`.

> [!WARNING]
> **`registerCss` 3rd Parameter is `$attributes` (Array):**
> The signature is `public function registerCss(string $css, int $position = self::POSITION_HEAD, array $attributes = [], ?string $key = null): self`.
> Passing a string key as the 3rd positional argument (`$this->registerCss($css, WebView::POSITION_HEAD, 'custom-key')`) triggers a fatal `TypeError: Argument #3 ($attributes) must be of type array, string given`. Always pass an empty array `[]` for attributes or use the PHP 8 named argument `key: 'custom-key'`. (Unlike `registerCss`, `registerJs` does not have an `$attributes` parameter: `registerJs(string $js, int $position = self::POSITION_END, ?string $key = null)`).

### 2.3. Parameter Exchange (`setParameter` / `getParameter` / `addToParameter` / `removeParameter`)

Templates and layouts communicate bidirectionally using `setParameter()` and `getParameter()`:

```php
// In view template:
$this->setParameter('pageClass', 'dark-theme');
$this->setParameter('sidebarVisible', true);

// Accumulating array parameter values across partials or components:
$this->addToParameter('breadcrumbs', ['label' => 'Products', 'url' => '/products']);
$this->addToParameter('breadcrumbs', ['label' => 'Laptops']);

// Removing a parameter previously set:
$this->removeParameter('unwantedKey');

// In layout (views/layout/main.php):
// Notice: getParameter takes variadic ...$default. If no default is passed and key is missing, throws InvalidArgumentException!
$pageClass = $this->getParameter('pageClass', 'light-theme');
$sidebarVisible = $this->getParameter('sidebarVisible', false);
$breadcrumbs = $this->getParameter('breadcrumbs', []);

// Check if parameter exists:
if ($this->hasParameter('sidebarVisible')) {
    // Parameter was explicitly defined
}
```

### 2.4. Application View Theming (`Yiisoft\View\Theme`)

Theming replaces view templates on the fly by mapping base directory paths to themed directories. Configure themes in `config/params.php`:

```php
declare(strict_types=1);

return [
    'yiisoft/view' => [
        'theme' => [
            'pathMap' => [
                '@views' => [
                    '@themes/christmas',
                    '@themes/default',
                ],
            ],
            'basePath' => '@assets',
            'baseUrl' => '@assetsUrl',
        ],
    ],
];
```

When rendering a view `user/profile`, `Theme::applyTo($file)` searches `@themes/christmas/user/profile.php` first; if it exists on disk, it takes precedence. If missing, it falls back to `@themes/default/user/profile.php`, and lastly to `@views/user/profile.php`.

### 2.5. PSR-14 View Lifecycle Events

`WebView` dispatches 7 PSR-14 events during rendering under `Yiisoft\View\Event\WebView\`: `BeforeRender`, `AfterRender`, `PageBegin`, `Head`, `BodyBegin`, `BodyEnd`, `PageEnd`. The full event table with payload accessors, the stoppable-`BeforeRender` cancellation semantics, and the critical trap — the `Yiisoft\View\Event\View\*` group (plain `View`) and the `Yiisoft\View\Event\WebView\*` group are parallel: a listener registered for the wrong group **silently never fires** — are owned by the [Events & Listeners Guide](core-events-and-listeners.md), section 6.8.

---

## 3. Alternative Template Engine: Twig (`yiisoft/view-twig` & `yiisoft/yii-twig`)

Yii3 supports Twig templates alongside native PHP templates via two official packages:
- `yiisoft/view-twig`: Low-level template renderer implementing `Yiisoft\View\TemplateRendererInterface`.
- `yiisoft/yii-twig`: Pre-configured DI definitions and Twig extension bridge.

### 3.1. Architecture & Renderer Registration (`TwigTemplateRenderer`)

To enable `.twig` templates, register `TwigTemplateRenderer` in `config/params.php`:

```php
declare(strict_types=1);

use Twig\Loader\FilesystemLoader;
use Yiisoft\Definitions\Reference;
use Yiisoft\View\Twig\TwigTemplateRenderer;

return [
    'yiisoft/view' => [
        'renderers' => [
            'twig' => Reference::to(TwigTemplateRenderer::class),
        ],
        // Note: use 'fallbackExtension' in modern yiisoft/view (not 'defaultExtension')
        'fallbackExtension' => 'twig',
    ],
    'yiisoft/yii-twig' => [
        'options' => [
            'cache' => '@runtime/twig/cache',
            'debug' => true,
            'auto_reload' => true,
        ],
        'loader' => [
            'paths' => [
                '@views',
            ],
        ],
    ],
];
```

> [!NOTE]
> `TwigTemplateRenderer::render()` automatically strips `$view->getBasePath()` from the template path so that Twig's `FilesystemLoader` receives relative paths matching its mounted roots. It also wraps rendering in output buffering to prevent exception leakage.

### 3.2. Twig Template Anatomy & Page Lifecycle (`|raw`, `{% do %}`)

In Twig templates, the `WebView` instance is injected into the context under the variable name `this`.

Because page lifecycle methods echo HTML comments and CDATA markers (`<![CDATA[YII-BLOCK-HEAD-...]]>`), you **MUST** apply the `|raw` filter; otherwise, Twig's auto-escaping converts them to `&lt;![CDATA[...`, completely breaking script and stylesheet injection!

**Main Layout in Twig (`views/layout/main.twig`):**
```twig
{{ this.beginPage()|raw }}
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ title() }}</title>
    {{ head() }}
</head>
<body>
{{ this.beginBody()|raw }}

<header class="app-header">
    <h1>{{ applicationParams.name }}</h1>
</header>

<main class="container py-4">
    {{ content|raw }}
</main>

{{ this.endBody()|raw }}
</body>
</html>
{{ this.endPage(true)|raw }}
```

**Executing Void Methods with `{% do %}`:**
```twig
{# Transfer published assets and set page metadata without unwanted string output #}
{% do assetManager.register('App\\Presentation\\Asset\\AppAsset') %}
{% do this.addCssFiles(assetManager.getCssFiles()) %}
{% do this.addJsFiles(assetManager.getJsFiles()) %}
{% do this.setTitle('Products Catalog') %}

<div class="product-page">
    <h2>{{ product.title }}</h2>
    <p>Price: ${{ product.price }}</p>
</div>
```

### 3.3. `WebViewExtension` & Grounded Helper Boundaries

`Yiisoft\Yii\Twig\Extension\WebViewExtension` registers **EXACTLY TWO FUNCTIONS**:
1. `{{ title() }}` — calls `$view->getTitle()`.
2. `{{ head() }}` — calls `$view->head()`.

> [!WARNING]
> **Zero-Hallucination Guard:**
> `yiisoft/yii-twig` does **NOT** provide `url()`, `asset()`, `csrf()`, or widget invocation functions. The legacy `YiiTwigExtension` from Yii2 was completely removed. Access all other view capabilities directly via `this` (e.g. `{{ this.render(...) }}`, `{{ csrf.hiddenInput()|raw }}`).

### 3.4. Static Widget & Helper Invocation Restrictions in Twig

Twig does not support static PHP method calls (`Widget::widget()`, `Html::a()`, `Field::text()`). To use Yii3 widgets in Twig:
1. **Pre-render in Action:** Instantiate and render the widget in the PHP Action handler, passing the generated HTML string or `Stringable` object as a parameter into Twig:
   ```php
   return $this->viewRenderer->render('product/index.twig', [
       'gridHtml' => GridView::widget()->dataReader($paginator)->columns(...)->render(),
   ]);
   ```
2. **Register Custom Twig Functions:** Register custom extension functions in `params['yiisoft/yii-twig']['extensions']` wrapping widget factory calls.

---

## 4. Mandatory XSS Escaping & Safe HTML (`Yiisoft\Html\Html`)

> [!IMPORTANT]
> **CRITICAL SECURITY REQUIREMENT:**
> Never output dynamic string variables or user input directly into raw markup. Always wrap with `Html::encode()`.

```php
// ❌ VULNERABLE TO CROSS-SITE SCRIPTING (XSS)
<h1>Welcome, <?= $user->getName() ?></h1>

// ✅ SECURE
<h1>Welcome, <?= Html::encode($user->getName()) ?></h1>
```

### 4.1. Escaping Primitives (`Html::encode`, `encodeAttribute`, `escapeJavaScriptStringValue`)

`Yiisoft\Html\Html` provides specialized escaping primitives depending on the output context:

1. `Html::encode(mixed $content, bool $doubleEncode = true, string $encoding = 'UTF-8'): string`
   - Uses `htmlspecialchars` with flags `ENT_NOQUOTES | ENT_SUBSTITUTE | ENT_HTML5`.
   - Escapes `&`, `<`, and `>` only.
   - Quotes (`"` and `'`) are intentionally **not** escaped because inside tag bodies (`<p>"Quotes"</p>`) they are valid HTML.
2. `Html::encodeAttribute(mixed $value, bool $doubleEncode = true, string $encoding = 'UTF-8'): string`
   - Uses flags `ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5` and replaces null-bytes.
   - Escapes `&`, `<`, `>`, `"`, `'`, `\0`.
   - Used for quoted HTML attributes: `<input value="<?= Html::encodeAttribute($val) ?>">`.
3. `Html::encodeUnquotedAttribute(mixed $value, bool $doubleEncode = true, string $encoding = 'UTF-8'): string`
   - Escapes tabs, spaces, newlines, equals signs (`=`), and backticks (`` ` ``) for unquoted attribute values.
4. `Html::escapeJavaScriptStringValue(mixed $value): string`
   - Escapes `/`, `"`, `'`, and `\` for safe inlining inside `<script>` blocks.

> [!NOTE]
> `Html::decode()` does **NOT** exist in Yii3. If entity decoding is ever required, use native PHP `htmlspecialchars_decode($string, ENT_QUOTES | ENT_HTML5)`.

### 4.2. Tag Builders & `NoEncodeStringableInterface`

All tag builder methods in `Yiisoft\Html\Html` (`Html::a()`, `Html::div()`, `Html::span()`, `Html::tag()`, etc.) return objects extending `Yiisoft\Html\Tag\Base\Tag` and implementing `NoEncodeStringableInterface`.
Tag builders **automatically escape** their content and attributes when converted to string:

```php
// ✅ CORRECT: Both content and attributes are automatically and safely escaped
<?= Html::a(
    content: $user->getName(),
    url: '/users/' . $user->getId(),
    attributes: ['class' => 'user-link', 'title' => $user->getName()],
) ?>

// ❌ WRONG: Double escaping bug (passing Html::encode() into Html::a() causes &amp;)
<?= Html::a(
    content: Html::encode($user->getName()),
    url: '/users/' . $user->getId(),
) ?>
```

### 4.3. Disabling Tag Builder Escaping (`->encode(false)`)

When nesting trusted HTML inside a tag builder, disable auto-escaping using `->encode(false)`.

> [!WARNING]
> The method `encode(?bool $encode)` has **NO DEFAULT VALUE** in `TagContentTrait`. Calling `->encode()` without arguments throws `ArgumentCountError: Too few arguments`. Pass `false` explicitly:

```php
<?= Html::div(
    content: Html::tag('strong', $user->getName()) . ' (' . Html::encode($user->getEmail()) . ')',
    attributes: ['class' => 'user-badge'],
)->encode(false) ?>
```

Alternatively, wrap trusted strings in `Yiisoft\Html\NoEncode::string('<strong>Trusted</strong>')`.

### 4.4. Essential HTML Tag Factory Catalog

| Method Signature | Return Type | Description |
|---|---|---|
| `Html::a(string\|Stringable\|int\|float\|null $content = '', ?string $url = null, array $attributes = []): A` | `Yiisoft\Html\Tag\A` | Hyperlink (`<a href="...">`) |
| `Html::mailto(string\|Stringable\|int\|float\|null $content, ?string $mail = null, array $attributes = []): A` | `Yiisoft\Html\Tag\A` | Email link (`<a href="mailto:...">`) |
| `Html::img(?string $url = null, ?string $alt = '', array $attributes = []): Img` | `Yiisoft\Html\Tag\Img` | Image tag (`<img src="..." alt="...">`) |
| `Html::div(string\|Stringable\|int\|float\|null $content = '', array $attributes = []): Div` | `Yiisoft\Html\Tag\Div` | Block container `<div>` |
| `Html::span(string\|Stringable\|int\|float\|null $content = '', array $attributes = []): Span` | `Yiisoft\Html\Tag\Span` | Inline container `<span>` |
| `Html::p(string\|Stringable\|int\|float\|null $content = '', array $attributes = []): P` | `Yiisoft\Html\Tag\P` | Paragraph `<p>` |
| `Html::tag(string $name, string\|Stringable\|int\|float\|null $content = '', array $attributes = []): CustomTag` | `Yiisoft\Html\Tag\CustomTag` | Custom tag (auto-detects void tags like `<hr>`, `<br>`) |
| `Html::ul(array $attributes = []): Ul` | `Yiisoft\Html\Tag\Ul` | Unordered list `<ul>` (add items via `->items(Li ...$items)`) |
| `Html::ol(array $attributes = []): Ol` | `Yiisoft\Html\Tag\Ol` | Ordered list `<ol>` |
| `Html::li(string\|Stringable\|int\|float\|null $content = '', array $attributes = []): Li` | `Yiisoft\Html\Tag\Li` | List item `<li>` |
| `Html::form(?string $action = null, ?string $method = null, array $attributes = []): Form` | `Yiisoft\Html\Tag\Form` | Form tag with CSRF support (for file uploads, chain `->enctypeMultipartFormData()`) |

### 4.5. CSS Class, Style & Attribute Manipulation Utilities

`Yiisoft\Html\Html` provides static helper methods to manipulate HTML attributes, CSS classes, inline styles, and generate unique tag IDs:

| Static Helper Method | Signature | Description |
|---|---|---|
| `Html::addCssClass` | `addCssClass(array &$attributes, BackedEnum\|array\|string\|null $class): void` | Appends CSS class(es) to `$attributes['class']`. Avoids duplicate entries. Supports BackedEnum, arrays, and strings. |
| `Html::removeCssClass` | `removeCssClass(array &$attributes, string\|array $class): void` | Removes specified CSS class(es) from `$attributes['class']`. |
| `Html::addCssStyle` | `addCssStyle(array &$attributes, array\|string $style, bool $overwrite = true): void` | Adds or merges CSS style properties into `$attributes['style']`. Set `$overwrite = false` to preserve existing style properties. |
| `Html::removeCssStyle` | `removeCssStyle(array &$attributes, string\|array $properties): void` | Removes specified CSS properties from `$attributes['style']`. |
| `Html::renderTagAttributes` | `renderTagAttributes(array $attributes): string` | Formats an associative array of attributes into an HTML attribute string (e.g. ` id="btn-1" class="btn"`). |
| `Html::generateId` | `generateId(string $prefix = 'i'): string` | Generates a sequential, unique HTML tag identifier (e.g. `'i1'`, `'i2'`). |

```php
use Yiisoft\Html\Html;

$attributes = ['class' => 'btn btn-secondary', 'style' => 'margin: 5px;'];

// Add CSS classes:
Html::addCssClass($attributes, ['btn-lg', 'btn-primary']);
// Result: $attributes['class'] === 'btn btn-secondary btn-lg btn-primary'

// Remove a class:
Html::removeCssClass($attributes, 'btn-secondary');
// Result: $attributes['class'] === 'btn btn-lg btn-primary'

// Add CSS styles:
Html::addCssStyle($attributes, ['display' => 'inline-block', 'margin' => '10px'], overwrite: true);

// Render attributes to string:
$attrString = Html::renderTagAttributes($attributes);

// Generate unique element ID:
$fieldId = Html::generateId('field-'); // 'field-1'
```

---

## 5. Layouts, Page Lifecycle & View Injections

### 5.1. Main Layout Structure & Lifecycle Sequence

Layouts wrap view templates and manage HTML document structure. A Yii3 layout follows a strict lifecycle:

1. Register asset bundles via `$assetManager->register()`.
2. Transfer published assets into `WebView` (`addCssFiles()`, `addJsFiles()`, etc.).
3. `$this->beginPage()` starts page buffering and placeholder interception.
4. `<head>` contains `$this->head()`.
5. `<body>` contains `$this->beginBody()`.
6. `$content` receives the inner view output string.
7. `</body>` contains `$this->endBody()`.
8. `$this->endPage()` cleans the buffer, substitutes script/CSS placeholders, resets state, and echoes final HTML.

```php
<?php

declare(strict_types=1);

use App\Presentation\Asset\AppAsset;
use Yiisoft\Assets\AssetManager;
use Yiisoft\Bootstrap5\Alert;
use Yiisoft\Bootstrap5\AlertVariant;
use Yiisoft\Html\Html;
use Yiisoft\Session\Flash\FlashInterface;
use Yiisoft\View\WebView;
use Yiisoft\Yii\View\Renderer\Csrf;

/**
 * @var WebView $this
 * @var AssetManager $assetManager
 * @var Csrf $csrf
 * @var FlashInterface|null $flash (optionally injected via CommonParametersInjectionInterface)
 * @var string $content
 */

// 1. Register asset bundles for the page
$assetManager->register(AppAsset::class);

// 2. Transfer published assets into WebView state (methods return self)
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

<header class="app-header navbar navbar-expand-lg navbar-dark bg-dark">
    <div class="container">
        <a class="navbar-brand" href="/">My App</a>
    </div>
</header>

<!-- Flash notifications block -->
<?php if (isset($flash)): ?>
<div class="flash-messages container my-3">
    <?php foreach ($flash->getAll() as $type => $messages): ?>
        <?php
        $variant = match ($type) {
            'success' => AlertVariant::SUCCESS,
            'danger', 'error' => AlertVariant::DANGER,
            'warning' => AlertVariant::WARNING,
            default => AlertVariant::INFO,
        };
        ?>
        <?php foreach ($messages as $message): ?>
            <?= Alert::widget()
                ->variant($variant)
                ->body(is_array($message) ? ($message['body'] ?? '') : (string) $message)
                ->dismissable(true) ?>
        <?php endforeach ?>
    <?php endforeach ?>
</div>
<?php endif ?>

<main class="app-main container py-4">
    <!-- View template content is output here -->
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

> [!WARNING]
> Omitting `$this->beginPage()` or `$this->endPage()` prevents asset placeholders (`<![CDATA[YII-BLOCK-HEAD-...]]>`) from being replaced. JavaScript and CSS files will NOT be rendered in the browser output. Furthermore, `$this->endPage()` automatically executes `$this->state->clear()`, preventing memory leaks in persistent worker runtimes (RoadRunner, FrankenPHP).

### 5.2. View Injections Architecture (The 4 Canonical Contracts)

Rather than using global variables or service locators, Yii3 injects cross-cutting data into views and layouts via **View Injections**.
Only 4 official injection interfaces exist under `Yiisoft\Yii\View\Renderer\`:

1. `CommonParametersInjectionInterface`:
   - `public function getCommonParameters(): array;`
   - Parameters are accessible in **both** view templates and layouts.
2. `LayoutParametersInjectionInterface`:
   - `public function getLayoutParameters(): array;`
   - Parameters are accessible **only** in layouts. Does **not** overwrite parameters set by the template via `$this->setParameter()`.
3. `LinkTagsInjectionInterface`:
   - `public function getLinkTags(): array;`
   - Array of `Yiisoft\Html\Tag\Link` objects or attribute arrays registered via `WebView::registerLinkTag()`.
4. `MetaTagsInjectionInterface`:
   - `public function getMetaTags(): array;`
   - Array of `Yiisoft\Html\Tag\Meta` objects or attribute arrays registered via `WebView::registerMetaTag()`.

> [!NOTE]
> `ViewInjectionInterface` and `TitleInjectionInterface` do **NOT** exist in Yii3. Titles are set via `$this->setTitle()` in views or via `LayoutParametersInjectionInterface` returning `['title' => '...']`.

### 5.3. Custom View Injection Implementation (`SiteThemeInjection`)

```php
declare(strict_types=1);

namespace App\Presentation\ViewInjection;

use App\Domain\User\CurrentUser;
use Yiisoft\Html\Html;
use Yiisoft\Yii\View\Renderer\CommonParametersInjectionInterface;
use Yiisoft\Yii\View\Renderer\LayoutParametersInjectionInterface;
use Yiisoft\Yii\View\Renderer\LinkTagsInjectionInterface;
use Yiisoft\Yii\View\Renderer\MetaTagsInjectionInterface;

final readonly class SiteThemeInjection implements
    CommonParametersInjectionInterface,
    LayoutParametersInjectionInterface,
    LinkTagsInjectionInterface,
    MetaTagsInjectionInterface
{
    public function __construct(
        private CurrentUser $currentUser,
        private string $siteName,
    ) {}

    public function getCommonParameters(): array
    {
        return [
            'currentUser' => $this->currentUser,
        ];
    }

    public function getLayoutParameters(): array
    {
        return [
            'siteName' => $this->siteName,
        ];
    }

    public function getLinkTags(): array
    {
        return [
            Html::link()->toCssFile('/css/theme.css'),
            ['rel' => 'icon', 'type' => 'image/png', 'href' => '/favicon.png'],
        ];
    }

    public function getMetaTags(): array
    {
        return [
            'author' => Html::meta()->name('author')->content('Dev Team'),
            'theme-color' => ['name' => 'theme-color', 'content' => '#0d6efd'],
        ];
    }
}
```

Register injections in `config/params.php`:
```php
declare(strict_types=1);

use App\Presentation\ViewInjection\SiteThemeInjection;
use Yiisoft\Definitions\Reference;
use Yiisoft\Yii\View\Renderer\CsrfViewInjection;

return [
    'yiisoft/yii-view-renderer' => [
        'injections' => [
            Reference::to(CsrfViewInjection::class),
            Reference::to(SiteThemeInjection::class),
        ],
    ],
];
```

### 5.4. Layout-Specific Injections (`LayoutSpecificInjections`)

Use `LayoutSpecificInjections` when injections should only trigger for a specific layout (e.g. an admin layout):

```php
declare(strict_types=1);

use App\Presentation\ViewInjection\AdminNavigationInjection;
use Yiisoft\Definitions\Reference;
use Yiisoft\Yii\View\Renderer\LayoutSpecificInjections;

return [
    'yiisoft/yii-view-renderer' => [
        'injections' => [
            new LayoutSpecificInjections(
                '@views/layout/admin.php',
                Reference::to(AdminNavigationInjection::class),
            ),
        ],
    ],
];
```

> [!IMPORTANT]
> **`LayoutSpecificInjections` Constructor Invariants:**
> Constructor signature: `public function __construct(private readonly string $layout, object ...$injections)`
> 1. The first parameter is named `$layout` (not `$layoutFile`).
> 2. Variadic parameters are typed `object ...$injections`. Unlike `WebViewRenderer::withInjections()`, which accepts string class names, `LayoutSpecificInjections` requires instantiated objects or DI definition references (`Reference::to(AdminNavigationInjection::class)`). Passing a raw class string like `AdminNavigationInjection::class` throws a fatal `TypeError: LayoutSpecificInjections::__construct(): Argument #2 must be of type object, string given`.

### 5.5. CSRF Token Object (`Csrf`) & Injected Security

`CsrfViewInjection` is pre-configured in `yiisoft/yii-view-renderer` and automatically injects `$csrf` into all templates and layouts.
`$csrf` is a `Yiisoft\Yii\View\Renderer\Csrf` object implementing `Stringable`:

```php
// In layout or view:
/** @var Yiisoft\Yii\View\Renderer\Csrf $csrf */

// 1. Raw string token:
$token = (string) $csrf;
// or
$token = $csrf->getToken();

// 2. Body parameter name (defaults to '_csrf'):
$paramName = $csrf->getParameterName();

// 3. Header name for AJAX requests (defaults to 'X-CSRF-Token'):
$headerName = $csrf->getHeaderName();

// 4. Ready-to-render hidden input for plain HTML forms:
<?= $csrf->hiddenInput() ?>
```

### 5.6. Partial View Rendering (`$this->render()`)

To split views into reusable partials, call `$this->render()` inside any template or layout:

```php
<div class="user-list">
    <?php foreach ($users as $user): ?>
        <?= $this->render('_user_card', ['user' => $user]) ?>
    <?php endforeach ?>
</div>
```

### 5.7. Content Blocks (`Yiisoft\Yii\Widgets\Block`)

Blocks allow child views to inject markup into designated slots in the layout:

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

> [!WARNING]
> Calling `$this->getBlock('sidebar')` on an undefined block throws `InvalidArgumentException`. Always guard block retrieval with `if ($this->hasBlock('sidebar'))`.

### 5.8. Nested Layouts with `ContentDecorator`

In Yii3, nested layouts (e.g. decorating a 2-column account section with the main site layout) are implemented via `Yiisoft\Yii\Widgets\ContentDecorator` (replacing Yii2's `$this->beginContent()`):

```php
<?php

declare(strict_types=1);

use Yiisoft\View\WebView;
use Yiisoft\Yii\Widgets\ContentDecorator;

/**
 * @var WebView $this
 * @var string $content
 */

ContentDecorator::widget()
    ->view($this)
    ->viewFile('@views/layout/main.php')
    ->parameters(['pageCategory' => 'account'])
    ->begin();
?>

<div class="account-container row">
    <div class="col-md-3">
        <?= $this->render('_account_sidebar') ?>
    </div>
    <div class="col-md-9">
        <?= $content ?>
    </div>
</div>

<?php ContentDecorator::end() ?>
```

---

## 6. Asset Bundles & Publishing Pipeline (`Yiisoft\Assets`)

Asset bundles manage CSS, JavaScript, images, and fonts, publishing web-inaccessible resources to the public web root.

### 6.1. Declaring an Asset Bundle (`AssetBundle` Properties & CDN with SRI)

```php
declare(strict_types=1);

namespace App\Presentation\Asset;

use Yiisoft\Assets\AssetBundle;
use Yiisoft\View\WebView;

final class AppAsset extends AssetBundle
{
    // Public directory where files are published:
    public ?string $basePath = '@assets';
    public ?string $baseUrl = '@assetsUrl';

    // Source directory with non-public source assets:
    public ?string $sourcePath = '@resources/assets';

    // CSS files relative to sourcePath or basePath:
    public array $css = [
        'css/site.css',
    ];

    // JavaScript files:
    public array $js = [
        'js/app.js',
    ];

    // Script insertion position in HTML document:
    public ?int $jsPosition = WebView::POSITION_END;

    // Dependent bundles loaded prior to this bundle:
    public array $depends = [
        \Yiisoft\Bootstrap5\Assets\BootstrapAsset::class,
    ];

    // Directory publishing options passed to AssetPublisher:
    public array $publishOptions = [
        'forceCopy' => false,
    ];
}
```

Full public properties list on `AssetBundle`:
- `$basePath` (`?string`) — destination publication directory path.
- `$baseUrl` (`?string`) — destination publication public URL.
- `$sourcePath` (`?string`) — source asset directory to publish.
- `$cdn` (`bool`) — if `true`, skips local publication and uses external URLs.
- `$css` (`array`) — CSS files (strings or `[url, position, ...options]` tuples).
- `$cssStrings` (`array`) — inline CSS string blocks.
- `$cssOptions` (`array`) — default HTML attributes for `<link rel="stylesheet">`.
- `$cssPosition` (`?int`) — placement position for stylesheets (`WebView::POSITION_HEAD`).
- `$js` (`array`) — JavaScript files.
- `$jsStrings` (`array`) — inline JavaScript code blocks.
- `$jsOptions` (`array`) — default HTML attributes for `<script>`.
- `$jsPosition` (`?int`) — placement position for scripts (`WebView::POSITION_END`).
- `$jsVars` (`array`) — JavaScript variables (`['key' => 'val']`).
- `$depends` (`array`) — list of dependent `AssetBundle` FQCNs.
- `$publishOptions` (`array`) — options for directory copying (`forceCopy`, `beforeCopy`, `afterCopy`, `filter`).
- `$converterOptions` (`array`) — options passed to `AssetConverter` compilers.
- `$export` (`array`) — explicit list of files exported for external bundlers.

#### External CDN Bundle Declaration with Subresource Integrity (SRI)

When loading third-party libraries directly from a Content Delivery Network, set `$cdn = true` to skip local publishing:

```php
declare(strict_types=1);

namespace App\Presentation\Asset;

use Yiisoft\Assets\AssetBundle;
use Yiisoft\View\WebView;

final class BootstrapCdnAsset extends AssetBundle
{
    public bool $cdn = true;
    public ?string $baseUrl = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist';

    public array $css = ['css/bootstrap.min.css'];
    public array $cssOptions = [
        'integrity' => 'sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH',
        'crossorigin' => 'anonymous',
    ];

    public array $js = ['js/bootstrap.bundle.min.js'];
    public array $jsOptions = [
        'integrity' => 'sha384-YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz',
        'crossorigin' => 'anonymous',
        'position' => WebView::POSITION_END,
    ];
}
```

### 6.2. Registering Asset Bundles (Layout vs Page-Specific)

1. **In Layout (Recommended for global application assets):**
   ```php
   $assetManager->register(AppAsset::class);
   ```
2. **In a View (For heavy page-specific libraries like charts or maps):**
   ```php
   /** @var AssetManager $assetManager */
   $assetManager->register(\App\Presentation\Asset\ChartAsset::class);
   ```

### 6.3. Asset Publishing (`AssetPublisher`, Symlinks vs Copying)

`Yiisoft\Assets\AssetPublisher` publishes assets from `$sourcePath` into `$basePath`:

```php
// config/params.php
return [
    'yiisoft/assets' => [
        'assetPublisher' => [
            // Use symlinks in development to reflect CSS/JS changes immediately without copying:
            'linkAssets' => false, // Set true in local dev
            // forceCopy should be strictly false in production for optimal performance:
            'forceCopy' => false,
        ],
    ],
];
```

When `linkAssets => true`, `symlink()` is used instead of recursive file copying.

### 6.4. Directory Hashing & URL Timestamp Cache-Busting (`appendTimestamp`)

Yii3 provides a 2-level cache-busting mechanism:
1. **Directory Hashing:** When publishing directories, `AssetPublisher` computes a directory hash based on path, directory mtime, and file count: `sprintf('%x', crc32($path . '|' . $this->linkAssets))`. Whenever any asset file inside the bundle changes, the published directory name (`@assets/{hash}/`) changes automatically.
2. **File Timestamp Cache-Busting:** For published and static files, enable `appendTimestamp` in `config/params.php`:
   ```php
   'yiisoft/assets' => [
       'assetLoader' => [
           'appendTimestamp' => true,
       ],
   ],
   ```
   This appends `?v=1719283746` (file mtime) to every generated `<link>` and `<script>` tag, ensuring browser caches are busted immediately upon file modification.

### 6.5. Asset Compilation On-the-Fly (`AssetConverter`: SCSS, Less, TypeScript)

`Yiisoft\Assets\AssetConverter` compiles preprocessor assets on the fly. It checks whether the target file is outdated before invoking compilers:

```php
// config/params.php
return [
    'yiisoft/assets' => [
        'assetConverter' => [
            'commands' => [
                'scss' => ['css', '@npm/.bin/sass {options} {from} {to}'],
                'less' => ['css', 'lessc {from} {to} --no-color'],
                'ts' => ['js', 'tsc --out {to} {from}'],
            ],
            'forceConvert' => false, // false in production
        ],
    ],
];
```

### 6.6. Asset Exporting (`JsonAssetExporter`, `WebpackAssetExporter`)

To delegate asset bundling to Vite or Webpack, use `AssetManager::export()`:
- `JsonAssetExporter` — dumps a manifest of all registered bundles and file paths into a JSON file.
- `WebpackAssetExporter` — generates a JavaScript entrypoint with `import '/path/to/file';` statements.

> [!NOTE]
> `AssetManager::getExport()` does **NOT** exist. Exporting is performed via `$assetManager->export(new JsonAssetExporter($targetPath))`.

### 6.7. Overriding & Disabling Bundles (`customizedBundles` in `params.php`)

To replace a third-party asset bundle (e.g. substituting a local package bundle with an external CDN bundle) or to completely disable a bundle, configure `customizedBundles` in `config/params.php`:

```php
declare(strict_types=1);

use App\Presentation\Asset\BootstrapCdnAsset;
use Yiisoft\Bootstrap5\Assets\BootstrapAsset;

return [
    'yiisoft/assets' => [
        'assetManager' => [
            // CRITICAL: The config key is 'customizedBundles', NOT 'bundles'!
            'customizedBundles' => [
                // 1. Substitute local vendor bundle with an external CDN bundle:
                BootstrapAsset::class => [
                    'class' => BootstrapCdnAsset::class,
                ],
                // 2. Completely disable an unwanted bundle by mapping to false:
                \Vendor\Package\UnwantedAsset::class => false,
            ],
        ],
    ],
];
```

> [!WARNING]
> In Yii 2, asset bundle customizations were configured under `'bundles'`. In Yii 3 `yiisoft/assets`, the configuration key is strictly `'customizedBundles'`. Using `'bundles'` has no effect and will be silently ignored by `AssetManager`.

---

## 7. Custom Widgets, Core Widgets & CSS-Framework Drivers

### 7.1. Creating a Custom Widget (`Yiisoft\Widget\Widget` & Container Pattern)

Widgets are reusable, immutable presentation components that implement `NoEncodeStringableInterface`. When cast to string or printed in templates (`<?= MyWidget::widget() ?>`), they invoke `render()`:

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

        return Html::div(
            content: $this->message,
            attributes: ['class' => $classes, 'role' => 'alert'],
        )->render();
    }
}
```

**Invoking the Widget in a View:**
```php
<?= AlertBox::widget()
    ->type('success')
    ->message('User profile updated successfully!') ?>
```

> [!IMPORTANT]
> **Strict Return Type on `render(): string`:**
> Subclasses extending `Yiisoft\Widget\Widget` must declare the exact return type:
> ```php
> abstract public function render(): string;
> ```
> Widening the return type to `string|Stringable` causes a fatal PHP compile-time signature incompatibility error (`Fatal error: Declaration of MyWidget::render(): string|Stringable must be compatible with Yiisoft\Widget\Widget::render(): string`). Always return strictly `string`.

#### Container Widget Pattern with Output Buffering (`begin()` / `end()`)

To create container widgets that wrap dynamic view content between opening and closing tags, override `begin()` with output buffering and capture it in `render()`:

```php
declare(strict_types=1);

namespace App\Presentation\Widget;

use Yiisoft\Html\Html;
use Yiisoft\Widget\Widget;

final class Card extends Widget
{
    private string $header = '';

    public function header(string $header): self
    {
        $new = clone $this;
        $new->header = $header;
        return $new;
    }

    public function begin(): ?string
    {
        parent::begin();
        ob_start();
        return null;
    }

    public function render(): string
    {
        $content = (string) ob_get_clean();

        $html = Html::openTag('div', ['class' => 'card']);
        if ($this->header !== '') {
            $html .= Html::div($this->header, ['class' => 'card-header'])->render();
        }
        $html .= Html::div($content, ['class' => 'card-body'])->render();
        $html .= Html::closeTag('div');

        return $html;
    }
}
```

**Invoking the Container Widget in a View Template:**
```php
<?php
Card::widget()->header('User Profile')->begin();
?>
    <p>This markup is buffered between begin() and end().</p>
    <p>Joined: <?= Html::encode($user->getCreatedAt()->format('Y-m-d')) ?></p>
<?php Card::end(); ?>
```

> [!NOTE]
> `Widget::$stack` internally tracks currently opened widgets. `Widget::end()` pops the top widget off the stack, asserts that the closing class matches the opened class, and calls `render()`. Always call `parent::begin()` inside custom `begin()` implementations to ensure the instance is pushed onto the stack.

### 7.2. Widget Life Cycle, Factory & Themes (`WidgetFactory` in 2.2+)

Widgets are created via the static factory `Widget::widget()`, which delegates to `Yiisoft\Widget\WidgetFactory`.

> [!NOTE]
> **Behavior in `yiisoft/widget` 2.2.0+:**
> - `WidgetFactoryInitializationException` is **deprecated** and no longer thrown.
> - Widgets without required container dependencies instantiate cleanly even without calling `WidgetFactory::initialize()`.
> - If a widget has constructor dependencies that cannot be resolved without a container (e.g. `Block` requires `WebView`, `FragmentCache` requires `CacheInterface`), `WidgetFactory` throws `Yiisoft\Widget\NotInstantiableException`.
> - In standard applications, `WidgetFactory::initialize()` is invoked automatically via `config/bootstrap.php`.

### 7.3. Built-in Core Widgets (`yiisoft/yii-widgets`: Breadcrumbs, FragmentCache, Menu, Alert, Dropdown)

#### 1. `Breadcrumbs`
Renders navigation breadcrumbs with Schema.org JSON-LD support:
```php
<?= \Yiisoft\Yii\Widgets\Breadcrumbs::widget()
    ->attributes(['class' => 'breadcrumb']) // Use attributes(), not options()
    ->homeItem(['label' => 'Home', 'url' => '/']) // homeItem(null) disables home link
    ->items([
        ['label' => 'Catalog', 'url' => '/catalog'],
        'Laptops', // String item renders as active terminal item
    ])
    ->container(true) // Wraps <ul> inside <nav aria-label="breadcrumb">
    ->jsonLd(true) // Generates <script type="application/ld+json"> Schema.org metadata
?>
```

#### 2. `FragmentCache`
Caches template fragments in a PSR-16 cache:
```php
<?php

use Yiisoft\View\Cache\DynamicContent;
use Yiisoft\Yii\Widgets\FragmentCache;

$dynamicClock = new DynamicContent('clock', static fn (): string => date('H:i:s'));

FragmentCache::widget()
    ->id('sidebar-cache')
    ->ttl(3600)
    ->variations('en', 'desktop')
    ->dynamicContents($dynamicClock)
    ->begin();
?>
    <div class="cached-sidebar">
        <h3>Static Navigation</h3>
        <p>Current Time: <?= $dynamicClock->placeholder() ?></p>
    </div>
<?php FragmentCache::end() ?>
```

#### 3. `Menu`
Renders multi-level navigation lists with active-state matching:
```php
<?= \Yiisoft\Yii\Widgets\Menu::widget()
    ->currentPath('/catalog') // Automatically marks matching link as active
    ->activeClass('active') // activeClass(), NOT activeCssClass
    ->items([
        ['label' => 'Home', 'link' => '/'],
        ['label' => 'Catalog', 'link' => '/catalog'],
        ['label' => 'Admin', 'link' => '/admin', 'visible' => $currentUser->isAdmin()],
    ])
?>
```

#### 4. `Alert`
Framework-agnostic alert notification widget supporting custom HTML attributes and classes:
```php
use Yiisoft\Yii\Widgets\Alert;

<?= Alert::widget()
    ->class('notification is-warning') // class() adds CSS classes to root tag
    ->header('Account Notice')
    ->body('Please verify your email address to enable all features.')
    ->buttonLabel('&times;')
    ->buttonClass('delete')
    ->buttonAttributes(['aria-label' => 'close']) ?>
```

#### 5. `Dropdown`
Framework-agnostic dropdown menu widget:
```php
use Yiisoft\Yii\Widgets\Dropdown;

<?= Dropdown::widget()
    ->itemsContainerClass('dropdown-menu')
    ->items([
        ['label' => 'Profile', 'link' => '/profile'],
        ['label' => 'Settings', 'link' => '/settings'],
        '-', // String '-' renders as a divider
        ['label' => 'Logout', 'link' => '/logout'],
    ]) ?>
```

### 7.4. CSS-Framework Widget Drivers: Bootstrap 5 (`yiisoft/bootstrap5`)

`yiisoft/bootstrap5` provides 16 widgets: `Alert`, `Accordion`, `Breadcrumbs`, `Button`, `ButtonGroup`, `ButtonToolbar`, `Carousel`, `Collapse`, `Dropdown`, `Modal`, `Nav`, `NavBar`, `Offcanvas`, `Progress`, `ProgressStack`, `Toast`.

Companion item classes (`AccordionItem`, `BreadcrumbLink`, `CarouselItem`, `DropdownItem`, `NavLink`) are **strictly typed value-object factories**:

```php
use Yiisoft\Bootstrap5\Alert;
use Yiisoft\Bootstrap5\AlertVariant;
use Yiisoft\Bootstrap5\Nav;
use Yiisoft\Bootstrap5\NavLink;
use Yiisoft\Bootstrap5\NavStyle;

// 1. Alert with typed variant enum:
<?= Alert::widget()
    ->body('<strong>Warning!</strong> Check your settings.', false)
    ->dismissable(true) // Parameter is $enabled: bool
    ->variant(AlertVariant::WARNING) ?>

// 2. Tabs assembled via Nav + NavStyle::TABS + NavLink::tab():
<?= Nav::widget()
    ->styles(NavStyle::TABS) // Notice: styles() is plural
    ->fade(true) // Invariant: fade(true) MUST be called strictly AFTER styles(NavStyle::TABS)
    ->items(
        NavLink::tab('Overview', '<p>Overview Content</p>', active: true),
        NavLink::tab('Specifications', '<p>Specs Content</p>'),
    ) ?>
```

> [!WARNING]
> **Strict Invocation Order: `styles()` Before `fade()`:**
> In `Yiisoft\Bootstrap5\Nav`, `fade(bool $enabled)` checks `$this->isTabsOrPills()`. If `->fade(true)` is called before `->styles(NavStyle::TABS)`, `isTabsOrPills()` evaluates to `false`, throwing a fatal `RuntimeException: Fade effect can only be used with tabs or pills.`. Always call `->styles(NavStyle::TABS)` prior to `->fade(true)`. Also note that the method is plural `styles(...)`, not `style(...)`.

### 7.5. CSS-Framework Widget Drivers: Bulma (`yiisoft/yii-bulma`)

`yiisoft/yii-bulma` ships 11 widgets: `Breadcrumbs`, `Dropdown`, `Menu`, `Message`, `Modal`, `ModalCard`, `Nav`, `NavBar`, `Panel`, `ProgressBar`, `Tabs`.
Items are configured using **associative arrays** and styling is driven by **class constants**:

```php
use Yiisoft\Yii\Bulma\ProgressBar;
use Yiisoft\Yii\Bulma\Tabs;

// 1. Progress bar using class constants:
<?= ProgressBar::widget()
    ->value(75)
    ->color(ProgressBar::COLOR_SUCCESS) ?>

// 2. Tabs using associative arrays and style constants:
<?= Tabs::widget()
    ->style(Tabs::STYLE_BOX)
    ->items([
        ['label' => 'Pictures', 'icon' => 'fa-image', 'active' => true],
        ['label' => 'Music', 'icon' => 'fa-music'],
        ['label' => 'Videos', 'icon' => 'fa-film'],
    ]) ?>
```

### 7.6. Comparison Matrix: Bootstrap 5 vs Bulma Drivers

| Feature / Aspect | `yiisoft/bootstrap5` | `yiisoft/yii-bulma` |
|---|---|---|
| **Namespace** | `Yiisoft\Bootstrap5` | `Yiisoft\Yii\Bulma` |
| **Widget Count** | 16 widgets | 11 widgets |
| **Element Items** | Value-object factories: `NavLink::to()`, `DropdownItem::link()`, `BreadcrumbLink::to()` | Associative arrays: `[['label' => ..., 'url' => ..., 'active' => ...]]` |
| **Styling Constants** | Backed Enums: `AlertVariant::DANGER`, `NavStyle::TABS`, `ButtonVariant::PRIMARY` | String Class Constants: `ProgressBar::COLOR_SUCCESS`, `Tabs::STYLE_BOX` |
| **Tabs Widget** | Composed: `Nav` + `styles(NavStyle::TABS)` + `NavLink::tab()` | Dedicated widget: `Yiisoft\Yii\Bulma\Tabs` |
| **Modal Rendering** | Self-contained `->render()` with `triggerButton()` | Buffered pair: `Modal::widget()->begin(); ... Modal::end();` |
| **Form Theming** | `ThemeContainer` with `ThemePath::BOOTSTRAP5_*` | Config in `config/params.php` under `'defaultTheme'` |
| **Asset Bundles** | `BootstrapAsset`, `BootstrapCdnAsset` | `BulmaAsset` + per-widget JS bundles (`DropdownAsset`, `NavBarAsset`) |

---

## 8. HTML Form Rendering (`yiisoft/html`, `yiisoft/form-model`, `yiisoft/form`)

In Yii3, forms are divided into two distinct components:
1. **Form tags:** `Yiisoft\Html\Html::form()` handles `<form>` opening and closing with automatic CSRF token injection.
2. **Form fields:** `Yiisoft\FormModel\Field` binds form models (`FormModelInterface`) to inputs with automatic validation, hints, and error presentation.

### 8.1. Form Architecture: Tag Builders vs Field Binding

- `ActiveForm::begin()` and `Yiisoft\Form\Widget\Form` do **NOT** exist in Yii3.
- Forms are opened via `Html::form($action)->post()->csrf($csrf)->open()`.
- Form fields are generated via static factory methods on `Yiisoft\FormModel\Field`.

### 8.2. Form Model Definition for Widgets (`FormModel` & UI Attributes)

```php
declare(strict_types=1);

namespace App\Presentation\Form;

use Yiisoft\FormModel\Attribute\Hint;
use Yiisoft\FormModel\Attribute\Placeholder;
use Yiisoft\FormModel\Attribute\Safe;
use Yiisoft\FormModel\FormModel;
use Yiisoft\Validator\Label;

final class RegistrationForm extends FormModel
{
    #[Label('Username')]
    #[Placeholder('Choose a unique username')]
    #[Hint('Your public display name on the platform.')]
    private string $username = '';

    #[Label('Email Address')]
    #[Placeholder('you@example.com')]
    private string $email = '';

    #[Label('Password')]
    private string $password = '';

    #[Label('I accept the terms and conditions')]
    private bool $acceptTerms = false;

    #[Safe]
    private ?string $referralCode = null;

    public function getUsername(): string
    {
        return $this->username;
    }

    public function getEmail(): string
    {
        return $this->email;
    }

    public function getPassword(): string
    {
        return $this->password;
    }

    public function isAcceptTerms(): bool
    {
        return $this->acceptTerms;
    }
}
```

> [!NOTE]
> - Labels are declared using `#[Yiisoft\Validator\Label]`. The attribute `Yiisoft\FormModel\Attribute\Label` does **not** exist.
> - Hints (`#[Hint]`), placeholders (`#[Placeholder]`), and safe markers (`#[Safe]`) are provided by `yiisoft/form-model`.
> - For form validation rules (`#[Required]`, `#[Email]`, `RulesProviderInterface`, `getRules()`), validator execution, and hydrator binding, see [Validation & Forms Guide](http-validation-and-forms.md).

### 8.3. Form Template Example

```php
<?php

declare(strict_types=1);

use App\Presentation\Form\RegistrationForm;
use Yiisoft\FormModel\Field;
use Yiisoft\Html\Html;
use Yiisoft\View\WebView;
use Yiisoft\Yii\View\Renderer\Csrf;

/**
 * @var WebView $this
 * @var RegistrationForm $formModel
 * @var Csrf $csrf
 */

$this->setTitle('Create an Account');
?>

<div class="row justify-content-center">
    <div class="col-md-6">
        <!-- 1. Open form with CSRF -->
        <?= Html::form('/auth/register')
            ->post()
            ->csrf($csrf)
            ->open() ?>

            <!-- 2. Error summary -->
            <?= Field::errorSummary($formModel) ?>

            <!-- 3. FormModel Fields -->
            <?= Field::text($formModel, 'username')->autofocus() ?>
            <?= Field::email($formModel, 'email') ?>
            <?= Field::password($formModel, 'password') ?>
            <?= Field::checkbox($formModel, 'acceptTerms') ?>

            <!-- 4. Submit button with HTML attributes -->
            <div class="form-actions mt-3">
                <?= Field::submitButton('Create Account')
                    ->buttonAttributes(['class' => 'btn btn-primary w-100']) ?>
            </div>

        <!-- 5. Close form -->
        <?= Html::form()->close() ?>
    </div>
</div>
```

### 8.4. Comprehensive Field Catalog (`Yiisoft\FormModel\Field`)

Every static factory in `Yiisoft\FormModel\Field` binds to `$formModel` and `$property`:

| Field Factory Method | Generated HTML Tag | Key Configuration Methods |
|---|---|---|
| `Field::text($model, $prop)` | `<input type="text">` | `autofocus()`, `maxlength()`, `placeholder()` |
| `Field::password($model, $prop)` | `<input type="password">` | `maxlength()`, `placeholder()` |
| `Field::hidden($model, $prop)` | `<input type="hidden">` | Outputs input directly without labels or wrappers |
| `Field::textarea($model, $prop)` | `<textarea>` | `rows(5)`, `cols(40)`, `placeholder()` |
| `Field::select($model, $prop)` | `<select>` | `optionsData(['1' => 'One', '2' => 'Two'])`, `prompt('Choose...')`, `multiple()` |
| `Field::checkbox($model, $prop)` | `<input type="checkbox">` | `labelPlacement(CheckboxLabelPlacement::SIDE)`, `uncheckValue('0')` |
| `Field::checkboxList($model, $prop)` | List of `<input type="checkbox">` | `items(['val1' => 'Label 1', 'val2' => 'Label 2'])` (NOT `itemsData`) |
| `Field::radioList($model, $prop)` | List of `<input type="radio">` | `items(['val1' => 'Label 1', 'val2' => 'Label 2'])` |
| `Field::telephone($model, $prop)` | `<input type="tel">` | Method is named `telephone()`, **NOT** `tel()`! |
| `Field::email($model, $prop)` | `<input type="email">` | `placeholder()` |
| `Field::url($model, $prop)` | `<input type="url">` | `placeholder()` |
| `Field::number($model, $prop)` | `<input type="number">` | `min()`, `max()`, `step()` |
| `Field::range($model, $prop)` | `<input type="range">` | `min()`, `max()`, `step()` |
| `Field::date($model, $prop)` | `<input type="date">` | `min()`, `max()` |
| `Field::dateTimeLocal($model, $prop)` | `<input type="datetime-local">`| `min()`, `max()` |
| `Field::time($model, $prop)` | `<input type="time">` | `min()`, `max()` |
| `Field::color($model, $prop)` | `<input type="color">` | Color picker input |
| `Field::file($model, $prop)` | `<input type="file">` | `accept('image/*')`, `multiple()` |
| `Field::submitButton($content)` | `<button type="submit">` | `buttonAttributes(['class' => 'btn btn-primary'])`, `buttonClass()` |
| `Field::errorSummary($model)` | Error summary container | `onlyFirst()`, `onlyProperties('username')`, `header()` |

### 8.5. Automatic Validation Rules Enrichment (`ValidationRulesEnricher`)

`Yiisoft\FormModel\ValidationRulesEnricher` inspects model validation rules and attaches native HTML5 validation attributes:
- `Required` rule -> adds `required` HTML attribute.
- `Length(min: 3, max: 20)` rule -> adds `minlength="3"` and `maxlength="20"`.
- `Regex` rule -> adds `pattern="..."`.
- `Number(min: 0, max: 100)` rule -> adds `min="0"` and `max="100"`.

> [!IMPORTANT]
> **`ValidationRulesEnricher` Runtime Dependency Requirement:**
> In `yiisoft/form`, `$this->validationRulesEnricher` is `null` by default on all field instances. Simply calling `->enrichFromValidationRules()` without configuring an enricher produces **no HTML5 attributes**.
>
> To enable validation rules enrichment globally, register `ValidationRulesEnricher` in `config/params.php` within `ThemeContainer`:
> ```php
> declare(strict_types=1);
>
> use Yiisoft\Definitions\Reference;
> use Yiisoft\FormModel\ValidationRulesEnricher;
>
> return [
>     'yiisoft/form' => [
>         'themes' => [
>             'default' => [
>                 'validationRulesEnricher' => Reference::to(ValidationRulesEnricher::class),
>             ],
>         ],
>         'defaultTheme' => 'default',
>     ],
> ];
> ```
>
> Alternatively, supply the enricher instance directly to the field:
> ```php
> <?= Field::text($formModel, 'username')
>     ->validationRulesEnricher(new \Yiisoft\FormModel\ValidationRulesEnricher())
>     ->enrichFromValidationRules() ?>
> ```

### 8.6. Pure Fields (Ad-Hoc Forms Without `FormModel`)

For quick search bars or query filters not backed by a model, use `Yiisoft\Form\PureField\Field`:

```php
use Yiisoft\Form\PureField\Field;
use Yiisoft\Html\Html;

<?= Html::form('/search')->get()->open() ?>
    <?= Field::text('q', $query)->placeholder('Search...') ?>
    <?= Field::submitButton('Search') ?>
<?= Html::form()->close() ?>
```

### 8.7. Centralized Form Theming (`ThemeContainer`, `ThemePath`, `params.php`)

To automatically apply Bootstrap 5 markup (`.form-control`, `.form-label`, `.is-invalid`, `.invalid-feedback`) without manually setting classes on every field, configure `config/params.php`:

```php
declare(strict_types=1);

use Yiisoft\Form\Theme\ThemePath;

return [
    'yiisoft/form' => [
        'themes' => [
            'bootstrap5-vertical' => require ThemePath::BOOTSTRAP5_VERTICAL,
            'bootstrap5-horizontal' => require ThemePath::BOOTSTRAP5_HORIZONTAL,
        ],
        // CRITICAL: The key is named 'defaultTheme', NOT 'defaultConfig'!
        'defaultTheme' => 'bootstrap5-vertical',
    ],
];
```

> [!WARNING]
> Do NOT use `$params['yiisoft/form']['defaultConfig']`. The bootstrap loader checks `$params['yiisoft/form']['defaultTheme']`. Using `defaultConfig` causes an `Undefined array key "defaultTheme"` error.

---

## 9. DataView Widgets: GridView, ListView & DetailView (`yiisoft/yii-dataview`)

`yiisoft/yii-dataview` separates concerns cleanly:
- `GridView` (table) and `ListView` (item list) render **multiple records** from a `ReadableDataInterface` (`OffsetPaginator`, `KeysetPaginator`) via `dataReader()`.
- `DetailView` renders a **single record** (array or object) passed via `data()`.

### 9.1. GridView Architecture & Table Rendering

```php
<?php

declare(strict_types=1);

use App\Domain\Model\User;
use Stringable;
use Yiisoft\Data\Paginator\OffsetPaginator;
use Yiisoft\Html\Html;
use Yiisoft\View\WebView;
use Yiisoft\Yii\DataView\GridView\Column\ActionButton;
use Yiisoft\Yii\DataView\GridView\Column\ActionColumn;
use Yiisoft\Yii\DataView\GridView\Column\Base\DataContext;
use Yiisoft\Yii\DataView\GridView\Column\DataColumn;
use Yiisoft\Yii\DataView\GridView\Column\SerialColumn;
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
        new SerialColumn(),
        new DataColumn(
            property: 'id',
            header: 'ID',
            withSorting: true, // Default is true
        ),
        new DataColumn(
            property: 'name',
            header: 'Full Name',
            // Returning a Tag object (implements NoEncodeStringableInterface) renders as raw HTML
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
            bodyClass: static fn (User $user): string => $user->isActive() ? 'text-success' : 'text-muted',
            withSorting: false, // Disables sorting for computed column
        ),
        new ActionColumn(
            urlCreator: static fn (string $action, DataContext $context): string => sprintf(
                '/users/%d/%s',
                $context->data->getId(),
                $action,
            ),
            buttons: [
                'view' => new ActionButton(
                    content: 'View',
                    url: static fn (User $user, DataContext $context): string => "/users/{$user->getId()}",
                    class: 'btn btn-sm btn-outline-info',
                ),
                'approve' => new ActionButton(
                    content: 'Approve',
                    url: static fn (User $user, DataContext $context): string => "/users/{$user->getId()}/approve",
                    attributes: ['data-method' => 'post'],
                    class: 'btn btn-sm btn-outline-success',
                ),
            ],
            // Buttons NOT explicitly listed here are HIDDEN by default
            // Notice: visibleButtons closure receives ($data, $key, $index) — it does NOT receive DataContext!
            visibleButtons: [
                'view' => static fn (User $user, mixed $key, int $index): bool => true,
                'approve' => static fn (User $user, mixed $key, int $index): bool => $user->isPending(),
                'delete' => static fn (User $user, mixed $key, int $index): bool => $user->isDeletable(),
            ],
        ),
    )
    ->summaryTemplate('Showing {begin}–{end} of {totalCount} users (Page {currentPage} of {totalPages})')
    ->noResultsText('No users found.')
    ->emptyCell('—')
?>
```

> [!WARNING]
> **Auto-Encoding in `DataColumn`:**
> If `encodeContent` is `null` (default), plain `string` values returned by a `content` callable are automatically encoded via `Html::encode()`. A returned raw HTML string like `'<a href="...">...</a>'` will render as escaped text!
> Always return a Tag object (e.g. `Html::a()`), or set `encodeContent: false` on the column.

### 9.2. Column Catalog (`DataColumn`, `ActionColumn & ActionButton`, `CheckboxColumn`, `RadioColumn`, `SerialColumn`)

1. **`DataColumn`:**
   - Constructor parameters: `property:`, `header:`, `withSorting:` (default `true`; pass `withSorting: false` to disable column header sorting links), `content:`, `bodyClass:`, `filter:`, `encodeContent:`.
   - Parameter name is `property:`, **NOT** `attribute:`.
2. **`ActionColumn` & `ActionButton`:**
   - Displays action buttons (`view`, `update`, `delete`, or custom buttons).
   - `urlCreator` callback signature: `function (string $action, DataContext $context): string`.
   - Buttons can be configured using `Yiisoft\Yii\DataView\GridView\Column\ActionButton`:
     ```php
     new ActionButton(
         content: 'Edit', // Closure|string|Stringable
         url: static fn (User $user, DataContext $context): string => "/users/{$user->getId()}/edit",
         attributes: ['class' => 'btn btn-sm btn-primary'],
         title: 'Edit User',
     )
     ```
   - `visibleButtons` array: buttons not listed default to `false` (hidden).
     > [!WARNING]
     > **`visibleButtons` Callback Signature Invariant:**
     > When a closure is passed in `visibleButtons[$name]`, its signature is:
     > `function (array|object $data, mixed $key, int $index): bool`
     > It does **NOT** receive `DataContext $context`! Typing `fn (User $user, DataContext $context) => ...` passes `$key` (an integer or string) as the second argument, immediately throwing a fatal `TypeError: Argument #2 must be of type DataContext, int given`.
3. **`CheckboxColumn`:**
   - Renders row selection checkboxes for batch actions.
   - Master "select all" checkbox is automatically placed in the header when `$header === null` and `$multiple === true`.
   - Default input name is `'checkbox-selection'`, value is row primary key `$context->key`.
4. **`RadioColumn`:**
   - Renders radio buttons for single row selection. Shared name `'radio-selection'`.
5. **`SerialColumn`:**
   - Renders 1-based sequential row numbers taking paginator offset into account: `$paginator->getOffset() + $index + 1`.

### 9.3. Column Filtering in GridView (`TextInputFilter`, `DropdownFilter`)

Yii3 does **NOT** use Yii2's `filterModel`. Instead, filters are configured directly on each `DataColumn`:

```php
use Yiisoft\Yii\DataView\Filter\Widget\DropdownFilter;
use Yiisoft\Yii\DataView\Filter\Widget\TextInputFilter;
use Yiisoft\Yii\DataView\GridView\Column\DataColumn;

// 1. Standard text filter (<input type="text">):
$nameCol = new DataColumn(
    property: 'name',
    filter: true,
);

// 2. Standard select filter (<select>):
$statusCol = new DataColumn(
    property: 'status',
    filter: [
        'active' => 'Active',
        'blocked' => 'Blocked',
    ],
);

// 3. Customized text filter with placeholder:
$dateCol = new DataColumn(
    property: 'created_at',
    filter: (new TextInputFilter())->attributes(['placeholder' => 'YYYY-MM-DD']),
);

// 4. Customized dropdown filter:
$roleCol = new DataColumn(
    property: 'role',
    filter: DropdownFilter::widget()->optionsData([
        '' => 'All Roles', // Empty string key provides the prompt option label
        'admin' => 'Administrator',
        'editor' => 'Editor',
    ]),
);
```

> [!NOTE]
> Only `TextInputFilter` and `DropdownFilter` exist in `yiisoft/yii-dataview`. `SelectFilter` and `DateFilter` are phantom classes.

> [!WARNING]
> **`DropdownFilter` Has No `prompt()` Method:**
> `DropdownFilter` does **NOT** provide a `prompt()` method. Calling `->prompt('All Roles')` throws a fatal `Error: Call to undefined method Yiisoft\Yii\DataView\Filter\Widget\DropdownFilter::prompt()`. To configure a prompt option, pass an empty string key `'' => 'All Roles'` as the first item in `optionsData()`.

### 9.4. ListView (`Yiisoft\Yii\DataView\ListView\ListView`)

`ListView` renders items via a template closure or view file:

```php
<?php

declare(strict_types=1);

use App\Domain\Product\Product;
use Stringable;
use Yiisoft\Data\Paginator\OffsetPaginator;
use Yiisoft\Html\Html;
use Yiisoft\View\WebView;
use Yiisoft\Yii\DataView\ListView\ListItemContext;
use Yiisoft\Yii\DataView\ListView\ListView;

/**
 * @var WebView $this
 * @var OffsetPaginator $paginator
 */

$this->setTitle('Products Catalog');
?>

<?= ListView::widget()
    ->dataReader($paginator)
    ->listTag('ul')
    ->itemTag('li')
    ->itemAttributes(['class' => 'product-card'])
    ->itemView(static fn (Product $item, ListItemContext $context): string|Stringable => Html::a(
        content: $item->getTitle(),
        url: '/products/' . $item->getId(),
    ) . ' — $' . Html::encode(number_format($item->getPrice(), 2)))
    ->separator(PHP_EOL)
    ->noResultsText('No products found.')
?>
```

> [!IMPORTANT]
> If `itemView` is omitted, calling `render()` throws `LogicException('"itemView" must be set.')`.
> `ListItemContext` provides public readonly properties: `->data`, `->key`, `->index`, `->widget`.

### 9.5. DetailView (`Yiisoft\Yii\DataView\DetailView\DetailView` & `DataField`)

`DetailView` displays attributes of a single record:

```php
<?php

declare(strict_types=1);

use App\Domain\Product\Product;
use Yiisoft\View\WebView;
use Yiisoft\Yii\DataView\DetailView\DataField;
use Yiisoft\Yii\DataView\DetailView\DetailView;
use Yiisoft\Yii\DataView\DetailView\GetValueContext;

/**
 * @var WebView $this
 * @var Product $product
 */

$this->setTitle('Product Details: ' . $product->getTitle());
?>

<?= DetailView::widget()
    ->data($product)
    ->containerTag('dl')
    ->fields(
        // Calling getter on object with private properties:
        new DataField(property: 'getTitle()', label: 'Product Title'),
        new DataField(
            label: 'Formatted Price',
            value: static fn (GetValueContext $context): string
                => '$' . number_format($context->data->getPrice(), 2),
        ),
    )
?>
```

> [!WARNING]
> **Resolution Order in `DetailView::getValue()`:**
> 1. `if ($field->value === null)` -> evaluates `ArrayHelper::getValue($this->data, $property)`.
> 2. `if ($field->value instanceof Closure)` -> calls the closure with `GetValueContext` (`->field`, `->data`).
> 3. Otherwise returns literal value `$field->value`.
>
> **Private Entity Properties Trap:**
> On domain objects with `private` properties, `ArrayHelper::getValue()` reads **public properties only**, or executes methods if the key ends with `()` (e.g. `'getTitle()'`). If `property: 'title'` is passed for an object with `private string $title`, it silently returns `null`! Always use `'getTitle()'` or a `value:` closure.
>
> **`DataField` Validation:**
> `InvalidArgumentException('Either "property" or "value" must be set.')` is thrown **ONLY** when both `$property` and `$value` are `null`. Setting both is valid: `$value` determines the output, and `$property` serves as fallback for the label.

### 9.6. Standalone Pagination Widgets & Page Size Controls

#### Standalone `OffsetPagination` & `KeysetPagination`
While `GridView` and `ListView` render pagination automatically via `{pager}`, you can render pagination independently:

```php
use Yiisoft\Yii\DataView\Pagination\OffsetPagination;

<?= OffsetPagination::widget()
    ->paginator($paginator)
    ->maxNavLinkCount(7)
    ->labelFirst('«')
    ->labelLast('»')
    ->labelPrevious('‹')
    ->labelNext('›')
?>
```

#### Page Size Selection (`SelectPageSize`)
Allow users to switch items per page dynamically:

```php
use Yiisoft\Yii\DataView\PageSize\SelectPageSize;

<?= GridView::widget()
    ->dataReader($paginator)
    ->pageSizeConstraint([10, 25, 50, 100]) // Enables dropdown when count >= 2
    ->pageSizeWidget(SelectPageSize::widget()->addAttributes(['class' => 'form-select form-select-sm']))
    ->pageSizeTemplate('Items per page: {widget}')
?>
```

---

## 10. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| **`ActiveForm::begin()`** | Yii2 legacy class; does not exist in Yii3. | `Html::form('/action')->post()->csrf($token)->open()` + `Field::text($formModel, 'prop')`. |
| **`Yiisoft\Form\Widget\Form`** | Phantom class; doesn't exist in `yiisoft/form` or `yiisoft/form-model`. | Use `Yiisoft\Html\Html::form()->open()` and `Html::form()->close()`. |
| **`Field::widget()->text(...)`** | Incorrect instance invocation on static helper. | Use static factory `Yiisoft\FormModel\Field::text($formModel, 'prop')`. |
| **Calling non-existent `Field::submit()`, `Field::radio()`, `Field::reset()`, `Field::tel()`** | These method names do not exist on `Yiisoft\FormModel\Field` and cause fatal `Call to undefined method` errors. | Use `Field::submitButton()`, `Field::radioList()`, `Field::resetButton()`, and `Field::telephone()`. |
| **`Field::submitButton('Sign In', ['class' => 'btn'])`** | Second parameter is `$config` (DI definitions), not HTML attributes. | Call `Field::submitButton('Sign In')->buttonAttributes(['class' => 'btn btn-primary'])` or `->buttonClass(...)`. |
| **`$params['yiisoft/form']['defaultConfig'] = '...'`** | Bootstrap file reads `'defaultTheme'`. Causes `Undefined array key "defaultTheme"`. | Set `$params['yiisoft/form']['defaultTheme'] = 'bootstrap5-vertical'`. |
| **`WebViewRenderer::withStatus($code)`** | `WebViewRenderer` does not have `withStatus()`; it returns a PSR-7 `ResponseInterface`. | Chain `->withStatus($code)` on the returned response: `$this->viewRenderer->render(...)->withStatus(Status::NOT_FOUND)`. |
| **`WebViewRenderer::withDefaultParameters(...)`** | Phantom method; does not exist on `WebViewRenderer`. | Configure an injection implementing `CommonParametersInjectionInterface` in `injections`. |
| **`GridView::widget()->emptyText('...')`** | Yii2 legacy property; does not exist in `GridView` or `BaseListView`. | Use `->noResultsText('No records found.')` for empty lists, or `->emptyCell('—')` for individual empty cells. |
| **`GridView::widget()->paginator($paginator)`** | Method does not exist on `GridView` or `BaseListView`. | Use `GridView::widget()->dataReader($paginator)` (accepts any `ReadableDataInterface`). |
| **`GridView::widget()->filterModel($searchModel)`** | Yii2 legacy concept; `filterModel` does not exist in Yii3. | Configure filters directly on columns: `new DataColumn(property: 'name', filter: true)`. |
| **`Passing arrays to GridView::columns([['attribute' => 'id']])`** | In Yii3, `columns()` is variadic and accepts `ColumnInterface` instances (`DataColumn`, `ActionColumn`). | Use `GridView::widget()->columns(new DataColumn(property: 'id'), ...)`. |
| **`new DataColumn(attribute: 'name')`** | Constructor parameter is `property`, not `attribute`. Causes PHP Fatal Error with named arguments. | Use `new DataColumn(property: 'name')`. |
| **`GridView::widget()->summary('...')`** | Method does not exist; token `{page}` is from Yii2. | Use `->summaryTemplate('Page {currentPage} of {totalPages}')`. |
| **`Calling $this->getBlock('id') without hasBlock('id')`** | Calling `getBlock()` for an unset block throws `InvalidArgumentException`. | Guard with `if ($this->hasBlock('id'))` before calling `getBlock('id')`. |
| **Missing `$this->beginPage()` / `$this->endPage()`** | Placeholders are not replaced; script/CSS bundles fail to inject into the HTML. | Always wrap layout `<head>` and `<body>` with `beginPage()` / `endPage()`. |
| **Omitting `$assetManager->get*Files()` in Layout** | Registered bundles are never handed over to `WebView` state. | Call `$this->addCssFiles($assetManager->getCssFiles())` and `$this->addJsFiles(...)` in layout. |
| **`$this->setTitle(Html::encode($title))`** | Causes double escaping because layout encodes `<title><?= Html::encode($this->getTitle()) ?></title>`. | Call `$this->setTitle($title)` with raw unencoded string. |
| **`Html::a(text: ...)`** | Parameter name in `Html::a()` is `$content`, not `$text`. Causes PHP Fatal Error in PHP 8. | Use `Html::a(content: ..., url: ..., attributes: ...)`. |
| **`Html::mailto(email: ...)`** | Class `Mailto` doesn't exist; parameter is `$content`, then `$mail`. | Use `Html::mailto($email)` or `Html::mailto($label, $email)`. |
| **`$tag->encode()` without arguments** | `TagContentTrait::encode(?bool $encode)` has no default value. Throws `ArgumentCountError`. | Call `->encode(false)` with explicit boolean. |
| **Wrapping content in `Html::encode()` inside `Html::a()`** | `Html::a()` and tag builders already automatically encode their content. | Pass raw strings directly to `Html::a()`; use `->encode(false)` only when nesting trusted tags. |
| **`use Yiisoft\FormModel\Attribute\Label;`** | Phantom attribute; `yiisoft/form-model` ships only `Hint`, `Placeholder`, and `Safe`. | Use `Yiisoft\Validator\Label` — `FormModel` reads it to resolve property labels via `getPropertyLabel()`. |
| **`content: fn (...) => Html::a(...)->render()` in `DataColumn`** | Plain `string` values returned by `content` callables are HTML-encoded by default (`encodeContent: null`). | Return the tag object directly (`Html::a(...)` implements `NoEncodeStringableInterface`) or add `encodeContent: false`. |
| **`new DataField('title')` on an entity with private properties** | `property` resolves public properties / `'getter()'` keys only — no getter fallback; private-prop entities silently get `null`. | Use `new DataField(property: 'getTitle()', ...)` or a `value:` closure receiving `GetValueContext`. |
| **`Breadcrumbs::widget()->options(['class' => '...'])`** | Method `options()` does not exist on Yii3 Breadcrumbs. | Call `->attributes(['class' => '...'])`. |
| **`FragmentCache::widget()->dynamicPlaceholders(...)`** | Method does not exist in Yii3. | Call `->dynamicContents(DynamicContent ...$dynamicContents)`. |
| **`$this->registerCss($css, WebView::POSITION_HEAD, 'key')`** | 3rd parameter is `array $attributes = []`, 4th is `?string $key`. Passing a string key as 3rd parameter throws fatal `TypeError`. | Pass named argument `key: 'key'` or empty attributes array: `$this->registerCss($css, WebView::POSITION_HEAD, [], 'key')`. |
| **`new LayoutSpecificInjections('layout.php', MyInjection::class)`** | Constructor parameter is `$layout` (not `$layoutFile`), and variadic arguments must be instantiated `object` instances, not class strings. | Use `new LayoutSpecificInjections('@views/layout.php', Reference::to(MyInjection::class))`. |
| **`Nav::widget()->fade(true)->styles(NavStyle::TABS)`** | Method is plural `styles()`. Calling `fade(true)` before `styles(NavStyle::TABS)` throws `RuntimeException: Fade effect can only be used with tabs or pills.`. | Call `styles()` strictly prior to `fade(true)`: `Nav::widget()->styles(NavStyle::TABS)->fade(true)`. |
| **`visibleButtons: ['edit' => fn($user, DataContext $context) => ...]`** | Visibility callback receives `($data, $key, $index)`, NOT `DataContext`. Typehinting `DataContext` throws fatal `TypeError` because `$key` is passed as argument #2. | Use `visibleButtons: ['edit' => fn(User $user, mixed $key, int $index): bool => ...]`. |
| **`DropdownFilter::widget()->prompt('All')`** | `DropdownFilter` has no `prompt()` method; causes fatal `Error: Call to undefined method`. | Provide prompt option via empty string key: `->optionsData(['' => 'All', ...])`. |
| **`Html::form()->post()->enctypeMultipart()`** | Method name does not exist; throws fatal `Error: Call to undefined method`. | Call `Html::form()->post()->enctypeMultipartFormData()`. |
| **`$params['yiisoft/assets']['assetManager']['bundles'] = [...]`** | Yii 2 legacy configuration key; silently ignored by Yii 3 `AssetManager`. | Configure under `$params['yiisoft/assets']['assetManager']['customizedBundles']`. |
| **Calling `->enrichFromValidationRules()` without enricher** | `ValidationRulesEnricher` is `null` by default in `yiisoft/form`; produces no HTML5 attributes. | Register `ValidationRulesEnricher` in `ThemeContainer` under `defaultTheme` or pass to field via `->validationRulesEnricher()`. |
| **Widening `Widget::render()` to `string\|Stringable`** | Base contract requires strictly `abstract public function render(): string;`. Widening causes compile-time fatal error. | Declare return type strictly as `: string`. |
| **Calling repositories or SQL inside Views** | Breaks MVC, makes templates non-cacheable and side-effectful. | Prepare all domain data in Action/Handler and pass into view parameters. |

---

## 11. Related Topic Guides

- [Actions & Controllers Guide](http-actions-and-controllers.md) — Action handlers, parameter resolution, and injecting `WebViewRenderer`.
- [Validation & Forms Guide](http-validation-and-forms.md) — Form models, validation rules, and `FormHydrator`.
- [HTTP State Guide](http-state.md) — Flash messages, session handling, and cookie management.
