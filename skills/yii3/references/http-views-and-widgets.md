# Yii3 Views, Layouts & Widgets Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Comprehensive guide for template rendering, XSS protection, layouts, view injections, asset bundles, custom widgets, and HTML forms using `yiisoft/view`, `yiisoft/yii-view-renderer`, `yiisoft/html`, `yiisoft/widget`, `yiisoft/assets`, `yiisoft/yii-widgets`, `yiisoft/form`, and `yiisoft/form-model`. Package-specific material is split out into on-demand child guides owned by this one: the Twig template engine ([Twig Template Engine Guide](http-views-twig.md)), the CSS-framework widget drivers ([Bootstrap 5 Guide](http-views-bootstrap5.md), [Bulma Guide](http-views-bulma.md)), and the DataView widgets ([DataView Widgets Guide](http-dataview-widgets.md)).

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
- [3. Alternative Template Engine: Twig (yiisoft/view-twig & yiisoft/yii-twig)](#3-alternative-template-engine-twig-yiisoftview-twig--yiisoftyii-twig) — owned by the [Twig Template Engine Guide](http-views-twig.md)
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
  - [7.4. CSS-Framework Widget Drivers: Bootstrap 5 (yiisoft/bootstrap5)](#74-css-framework-widget-drivers-bootstrap-5-yiisoftbootstrap5) — owned by the [Bootstrap 5 Guide](http-views-bootstrap5.md)
  - [7.5. CSS-Framework Widget Drivers: Bulma (yiisoft/yii-bulma)](#75-css-framework-widget-drivers-bulma-yiisoftyii-bulma) — owned by the [Bulma Guide](http-views-bulma.md)
- [8. HTML Form Rendering (yiisoft/html, yiisoft/form-model, yiisoft/form)](#8-html-form-rendering-yiisofthtml-yiisoftform-model-yiisoftform)
  - [8.1. Form Architecture: Tag Builders vs Field Binding](#81-form-architecture-tag-builders-vs-field-binding)
  - [8.2. Form Model Definition for Widgets (FormModel & UI Attributes)](#82-form-model-definition-for-widgets-formmodel--ui-attributes)
  - [8.3. Form Template Example](#83-form-template-example)
  - [8.4. Comprehensive Field Catalog (Yiisoft\FormModel\Field)](#84-comprehensive-field-catalog-yiisoftformmodelfield)
  - [8.5. Automatic Validation Rules Enrichment (ValidationRulesEnricher)](#85-automatic-validation-rules-enrichment-validationrulesenricher)
  - [8.6. Pure Fields (Ad-Hoc Forms Without FormModel)](#86-pure-fields-ad-hoc-forms-without-formmodel)
  - [8.7. Centralized Form Theming (ThemeContainer, ThemePath, params.php)](#87-centralized-form-theming-themecontainer-themepath-paramsphp)
- [9. DataView Widgets: GridView, ListView & DetailView (yiisoft/yii-dataview)](#9-dataview-widgets-gridview-listview--detailview-yiisoftyii-dataview) — owned by the [DataView Widgets Guide](http-dataview-widgets.md)
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
// Inside the action handler ($this->viewRenderer is the injected WebViewRenderer):
// Renders views/user/profile.php wrapped by the configured layout
return $this->viewRenderer->render('user/profile', [
    'user' => $user,
    'pageTitle' => 'User Profile: ' . $user->getName(),
]);
```

> [!TIP]
> **Action Handler Wiring Reference:**
> For the complete reference on injecting `WebViewRenderer` into action handlers, resolving route arguments, handling 404 branches, and chaining `->withStatus()` on the returned response, see the [Actions & Controllers Guide, §3.5](http-actions-and-controllers.md#35-html-web-views--form-models-yiisoftyii-view-renderer-yiisoftform-model).

### 1.2. Key `WebViewRenderer` API Methods

- `render(string $view, array $parameters = []): ResponseInterface` — renders the view wrapped inside the layout (returns PSR-7 `ResponseInterface` with deferred body stream).
- `renderPartial(string $view, array $parameters = []): ResponseInterface` — renders only the view template without the layout.
- `renderAsString(string $view, array $parameters = []): string` — renders view with layout immediately into a string (useful for HTML emails or CLI output).
- `renderPartialAsString(string $view, array $parameters = []): string` — renders view without layout immediately into a string.
- `withLayout(?string $layout): self` — sets or overrides layout for the current render call (`null` disables layout). Immutable. The argument is the **full path or alias to the layout file** (e.g. `'@views/layout/blank.php'`), **not** a bare view name like `'layout/blank'`.
- `withController(object $controller): self` — sets the controller instance to infer view path prefix (removes `Controller` suffix and kebab-cases the class name via `Inflector::pascalCaseToId()`).
- `withControllerName(string $name): self` — sets the controller name explicitly for view path resolution.
- `withViewPath(string $viewPath): self` — overrides the base directory path for views (supports path aliases).
- `withAddedInjections(object|string ...$injections): self` — appends view injections without clearing existing ones.
- `withInjections(object|string ...$injections): self` — replaces all view injections.
- `withLocale(string $locale): self` — sets locale code for localized view rendering (e.g. `'de_DE'`).
- `withContentType(string $contentType): self` — sets response Content-Type header (default: `text/html`).
- `withEncoding(string $encoding): self` — sets response charset encoding in Content-Type (default: `UTF-8`).

> [!TIP]
> **HTTP Status Chaining Reference:**
> For chaining `->withStatus()` on the returned `ResponseInterface` inside action handlers, see the [Actions & Controllers Guide, §3.5](http-actions-and-controllers.md#35-html-web-views--form-models-yiisoftyii-view-renderer-yiisoftform-model).

### 1.3. Template Placement: Colocation (Style A) vs Centralized (Style B)

Two valid placement styles exist. Resolve which one the project uses from the architecture artifact (or the existing `src/` tree) and stay consistent — never mix styles within one project.

**Style A — views colocated with their action (current official `yiisoft/app` template).**
Each page folder contains the action class and its `template.php`. `render()` receives an **absolute path**, and `params['yiisoft/yii-view-renderer']['viewPath']` stays `null` (with `viewPath = null`, relative view paths in `render()` are not available). Given `$products` is passed by the caller/action, the render call is:

```php
return $this->viewRenderer->render(
    __DIR__ . '/template',
    ['products' => $products],
);
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

**Engine selection:** a Yii3 project renders its templates with **either** native PHP templates (§2) **or** Twig — never both. Resolve which engine the project actually uses from its `composer.json`: the presence of `yiisoft/view-twig` / `yiisoft/yii-twig` signals Twig; their absence means native PHP.

> **For the complete reference on** Twig rendering — renderer registration (`TwigTemplateRenderer` in `config/params.php`), the Twig layout/page lifecycle (`|raw`, `{% do %}`), the `WebViewExtension` two-function boundary, and the static widget/helper invocation restrictions — **see the** [Twig Template Engine Guide, §1–§4](http-views-twig.md), which owns this topic.

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
use Yiisoft\Html\Html;
use Yiisoft\Session\Flash\FlashInterface;
use Yiisoft\View\WebView;
use Yiisoft\Yii\View\Renderer\Csrf;
use Yiisoft\Yii\Widgets\Alert;

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

<header class="app-header">
    <div class="container">
        <a class="app-brand" href="/">My App</a>
    </div>
</header>

<!-- Flash notifications block (uses the framework-agnostic Yiisoft\Yii\Widgets\Alert) -->
<?php if (isset($flash)): ?>
<div class="flash-messages">
    <?php foreach ($flash->getAll() as $type => $messages): ?>
        <?php foreach ($messages as $message): ?>
            <?= Alert::widget()
                ->class('flash flash-' . $type) // style these classes with the CSS framework your project uses
                ->body(is_array($message) ? ($message['body'] ?? '') : (string) $message) ?>
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

> **For the Bootstrap 5 flavored flash-message variant** — `Yiisoft\Bootstrap5\Alert` with the `AlertVariant` enum mapping — **see the** [Bootstrap 5 Guide, §3](http-views-bootstrap5.md#3-flash-messages-with-bootstrap-alerts), which owns it.

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

    // Dependent bundles loaded prior to this bundle
    // (a shared application base bundle, or a vendor bundle such as a CSS framework asset):
    public array $depends = [
        \App\Presentation\Asset\BaseAsset::class,
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

final class ThirdPartyCdnAsset extends AssetBundle
{
    public bool $cdn = true;
    public ?string $baseUrl = 'https://cdn.example.com/npm/some-library@1.2.3/dist';

    public array $css = ['some-library.min.css'];
    public array $cssOptions = [
        'integrity' => 'sha384-<base64 SRI hash published for the pinned css artifact>',
        'crossorigin' => 'anonymous',
    ];

    public array $js = ['some-library.bundle.min.js'];
    public array $jsOptions = [
        'integrity' => 'sha384-<base64 SRI hash published for the pinned js artifact>',
        'crossorigin' => 'anonymous',
        'position' => WebView::POSITION_END,
    ];
}
```

> **For a concrete CSS-framework CDN bundle** — `BootstrapCdnAsset` pinning Bootstrap with its SRI hashes, plus the `BootstrapAsset` dependency wiring — **see the** [Bootstrap 5 Guide, §4](http-views-bootstrap5.md#4-asset-bundles-bootstrapasset--cdn-with-sri).

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

use App\Presentation\Asset\ThirdPartyCdnAsset;

return [
    'yiisoft/assets' => [
        'assetManager' => [
            // CRITICAL: The config key is 'customizedBundles', NOT 'bundles'!
            'customizedBundles' => [
                // 1. Substitute local vendor bundle with an external CDN bundle:
                \Vendor\Package\SomeLibraryAsset::class => [
                    'class' => ThirdPartyCdnAsset::class,
                ],
                // 2. Completely disable an unwanted bundle by mapping to false:
                \Vendor\Package\UnwantedAsset::class => false,
            ],
        ],
    ],
];
```

> **For the concrete CSS-framework recipe** — swapping `yiisoft/bootstrap5`'s local `BootstrapAsset` for its CDN variant — **see the** [Bootstrap 5 Guide, §5](http-views-bootstrap5.md#5-overriding-the-bootstrap-bundle-customizedbundles).

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

**Driver selection — pick exactly ONE:** `yiisoft/bootstrap5` and `yiisoft/yii-bulma` are mutually exclusive widget kits covering the same job (alerts, navigation, modals, progress, tabs). Resolve which driver the project actually installed via its `composer.json` or the [package-catalog.md, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family), and never mix widgets from both drivers in one project.

> **For the complete reference on** the Bootstrap 5 driver — the 16-widget catalog, value-object item factories and backed-enum styling constants, flash-message alerts, `BootstrapAsset`/`BootstrapCdnAsset` bundles with SRI, the `customizedBundles` override recipe, and the `ThemePath::BOOTSTRAP5_*` form-theme presets — **see the** [Bootstrap 5 Guide](http-views-bootstrap5.md), which owns this topic.

### 7.5. CSS-Framework Widget Drivers: Bulma (`yiisoft/yii-bulma`)

> **For the complete reference on** the Bulma driver — the 11-widget catalog, associative-array item configuration, string class-constant styling, and the `BulmaAsset` + per-widget JS bundles — **see the** [Bulma Guide](http-views-bulma.md), which owns this topic.

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

For widget rendering, only the **UI attributes** on the model properties matter — they directly drive the label, placeholder, and hint output of the `Field::*` factories documented in §8.3 and §8.4:

```php
final class RegistrationForm extends FormModel
{
    #[Label('Username')]
    #[Placeholder('Choose a unique username')]
    #[Hint('Your public display name on the platform.')]
    private string $username = '';

    #[Label('Email Address')]
    #[Placeholder('you@example.com')]
    private string $email = '';
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

Field markup (container, label, input, hint, and error classes; the field template) is centralized in named themes instead of being set manually on every field. Each theme is an array of `Theme` constructor arguments (`containerClass`, `labelClass`, `inputClass`, `hintClass`, `errorClass`, `validClass`, `invalidClass`, `template`, `fieldConfigs`, ...). Themes are registered in `config/params.php` under `'yiisoft/form' => ['themes' => [...]]`, and the theme applied by default is named in `defaultTheme`:

```php
declare(strict_types=1);

return [
    'yiisoft/form' => [
        'themes' => [
            // Your own theme: an array of Theme constructor arguments.
            // CSS-framework preset bundles register their ready-made themes here as well.
            'app' => [
                'containerClass' => 'field',
                'labelClass' => 'field-label',
                'inputClass' => 'field-input',
                'hintClass' => 'field-hint',
                'errorClass' => 'field-error',
            ],
        ],
        // CRITICAL: The key is named 'defaultTheme', NOT 'defaultConfig'!
        'defaultTheme' => 'app',
    ],
];
```

> [!WARNING]
> Do NOT use `$params['yiisoft/form']['defaultConfig']`. The bootstrap loader checks `$params['yiisoft/form']['defaultTheme']`. Using `defaultConfig` causes an `Undefined array key "defaultTheme"` error.

> **For the ready-made CSS-framework presets** — `ThemePath::BOOTSTRAP5_VERTICAL` / `ThemePath::BOOTSTRAP5_HORIZONTAL` registered as `bootstrap5-vertical` / `bootstrap5-horizontal` — **see the** [Bootstrap 5 Guide, §6](http-views-bootstrap5.md#6-form-theming-presets-themecontainer-themepath).

---

## 9. DataView Widgets: GridView, ListView & DetailView (`yiisoft/yii-dataview`)

> **For the complete reference on** DataView widgets — `GridView` architecture and table rendering, the column catalog (`DataColumn`, `ActionColumn`/`ActionButton`, `CheckboxColumn`, `RadioColumn`, `SerialColumn`), column filtering (`TextInputFilter`, `DropdownFilter`), `ListView`, `DetailView`/`DataField`, and the standalone pagination/page-size widgets — **see the** [DataView Widgets Guide, §1–§6](http-dataview-widgets.md), which owns this topic.

---

## 10. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| **`ActiveForm::begin()`** | Yii2 legacy class; does not exist in Yii3. | `Html::form('/action')->post()->csrf($token)->open()` + `Field::text($formModel, 'prop')`. |
| **`Yiisoft\Form\Widget\Form`** | Phantom class; doesn't exist in `yiisoft/form` or `yiisoft/form-model`. | Use `Yiisoft\Html\Html::form()->open()` and `Html::form()->close()`. |
| **`Field::widget()->text(...)`** | Incorrect instance invocation on static helper. | Use static factory `Yiisoft\FormModel\Field::text($formModel, 'prop')`. |
| **Calling non-existent `Field::submit()`, `Field::radio()`, `Field::reset()`, `Field::tel()`** | These method names do not exist on `Yiisoft\FormModel\Field` and cause fatal `Call to undefined method` errors. | Use `Field::submitButton()`, `Field::radioList()`, `Field::resetButton()`, and `Field::telephone()`. |
| **`Field::submitButton('Sign In', ['class' => 'btn'])`** | Second parameter is `$config` (DI definitions), not HTML attributes. | Call `Field::submitButton('Sign In')->buttonAttributes(['class' => 'btn btn-primary'])` or `->buttonClass(...)`. |
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
| **`visibleButtons: ['edit' => fn($user, DataContext $context) => ...]`** | Visibility callback receives `($data, $key, $index)`, NOT `DataContext`. Typehinting `DataContext` throws fatal `TypeError` because `$key` is passed as argument #2. | Use `visibleButtons: ['edit' => fn(User $user, mixed $key, int $index): bool => ...]`. |
| **`DropdownFilter::widget()->prompt('All')`** | `DropdownFilter` has no `prompt()` method; causes fatal `Error: Call to undefined method`. | Provide prompt option via empty string key: `->optionsData(['' => 'All', ...])`. |
| **`Html::form()->post()->enctypeMultipart()`** | Method name does not exist; throws fatal `Error: Call to undefined method`. | Call `Html::form()->post()->enctypeMultipartFormData()`. |
| **`$params['yiisoft/assets']['assetManager']['bundles'] = [...]`** | Yii 2 legacy configuration key; silently ignored by Yii 3 `AssetManager`. | Configure under `$params['yiisoft/assets']['assetManager']['customizedBundles']`. |
| **Calling `->enrichFromValidationRules()` without enricher** | `ValidationRulesEnricher` is `null` by default in `yiisoft/form`; produces no HTML5 attributes. | Register `ValidationRulesEnricher` in `ThemeContainer` under `defaultTheme` or pass to field via `->validationRulesEnricher()`. |
| **Widening `Widget::render()` to `string\|Stringable`** | Base contract requires strictly `abstract public function render(): string;`. Widening causes compile-time fatal error. | Declare return type strictly as `: string`. |
| **Calling repositories or SQL inside Views** | Breaks MVC, makes templates non-cacheable and side-effectful. | Prepare all domain data in Action/Handler and pass into view parameters. |

---

## 11. Related Topic Guides

Child guides owned and split out of this one:
- [Twig Template Engine Guide](http-views-twig.md) — `yiisoft/view-twig` / `yiisoft/yii-twig` rendering: renderer registration, Twig layout lifecycle, extension boundaries (mutually exclusive with native PHP templates).
- [Bootstrap 5 Guide](http-views-bootstrap5.md) — `yiisoft/bootstrap5` widget driver, flash-message alerts, Bootstrap asset bundles, and `ThemePath::BOOTSTRAP5_*` form-theme presets.
- [Bulma Guide](http-views-bulma.md) — `yiisoft/yii-bulma` widget driver with associative-array items and class-constant styling.
- [DataView Widgets Guide](http-dataview-widgets.md) — `yiisoft/yii-dataview`: GridView, ListView, DetailView, column filtering, and pagination widgets.

Neighboring guides:
- [Actions & Controllers Guide](http-actions-and-controllers.md) — Action handlers, parameter resolution, and injecting `WebViewRenderer`.
- [Validation & Forms Guide](http-validation-and-forms.md) — Form models, validation rules, and `FormHydrator`.
- [HTTP State Guide](http-state.md) — Flash messages, session handling, and cookie management.
