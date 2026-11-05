# Yii3 Views: Rendering Pipeline, XSS & Layouts

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Part of the [Views, Layouts & Widgets Guide](http-views-and-widgets.md) split — the anti-pattern matrix, related guides, and the child guides (Twig, Bootstrap 5, Bulma, DataView) live there.

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
> For the complete reference on injecting `WebViewRenderer` into action handlers, resolving route arguments, handling 404 branches, and chaining `->withStatus()` on the returned response, see the [Actions & Controllers Guide, §3.5](http-actions-concerns.md#35-html-web-views--form-models-yiisoftyii-view-renderer-yiisoftform-model).

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
> For chaining `->withStatus()` on the returned `ResponseInterface` inside action handlers, see the [Actions & Controllers Guide, §3.5](http-actions-concerns.md#35-html-web-views--form-models-yiisoftyii-view-renderer-yiisoftform-model).

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
