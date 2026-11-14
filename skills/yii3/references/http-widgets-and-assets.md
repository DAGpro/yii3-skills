# Yii3 Widgets, Assets & HTML Form Rendering

> **Grounding:** APIs in `vendor/yiisoft/<pkg>/src/`, patterns in this guide, conventions in architecture artifact (SKILL.md Core rule 2).

> Part of the [Views, Layouts & Widgets Guide](http-views-and-widgets.md) split — the anti-pattern matrix, related guides, and the child guides (Twig, Bootstrap 5, Bulma, DataView) live there.

## Table of Contents

- [6. Asset Bundles & Publishing Pipeline (`Yiisoft\Assets`)](#6-asset-bundles--publishing-pipeline-yiisoftassets)
  - [6.1. Declaring an Asset Bundle (`AssetBundle` Properties & CDN with SRI)](#61-declaring-an-asset-bundle-assetbundle-properties--cdn-with-sri)
  - [6.2. Registering Asset Bundles (Layout vs Page-Specific)](#62-registering-asset-bundles-layout-vs-page-specific)
  - [6.3. Asset Publishing (`AssetPublisher`, Symlinks vs Copying)](#63-asset-publishing-assetpublisher-symlinks-vs-copying)
  - [6.4. Directory Hashing & URL Timestamp Cache-Busting (`appendTimestamp`)](#64-directory-hashing--url-timestamp-cache-busting-appendtimestamp)
  - [6.5. Asset Compilation On-the-Fly (`AssetConverter`: SCSS, Less, TypeScript)](#65-asset-compilation-on-the-fly-assetconverter-scss-less-typescript)
  - [6.6. Asset Exporting (`JsonAssetExporter`, `WebpackAssetExporter`)](#66-asset-exporting-jsonassetexporter-webpackassetexporter)
  - [6.7. Overriding & Disabling Bundles (`customizedBundles` in `params.php`)](#67-overriding--disabling-bundles-customizedbundles-in-paramsphp)
- [7. Custom Widgets, Core Widgets & CSS-Framework Drivers](#7-custom-widgets-core-widgets--css-framework-drivers)
  - [7.1. Creating a Custom Widget (`Yiisoft\Widget\Widget` & Container Pattern)](#71-creating-a-custom-widget-yiisoftwidgetwidget--container-pattern)
  - [7.2. Widget Life Cycle, Factory & Themes (`WidgetFactory` in 2.2+)](#72-widget-life-cycle-factory--themes-widgetfactory-in-22)
  - [7.3. Built-in Core Widgets (`yiisoft/yii-widgets`: Breadcrumbs, FragmentCache, Menu, Alert, Dropdown)](#73-built-in-core-widgets-yiisoftyii-widgets-breadcrumbs-fragmentcache-menu-alert-dropdown)
  - [7.4. CSS-Framework Widget Drivers: Bootstrap 5 (`yiisoft/bootstrap5`)](#74-css-framework-widget-drivers-bootstrap-5-yiisoftbootstrap5)
  - [7.5. CSS-Framework Widget Drivers: Bulma (`yiisoft/yii-bulma`)](#75-css-framework-widget-drivers-bulma-yiisoftyii-bulma)
- [8. HTML Form Rendering (`yiisoft/html`, `yiisoft/form-model`, `yiisoft/form`)](#8-html-form-rendering-yiisofthtml-yiisoftform-model-yiisoftform)
  - [8.1. Form Architecture: Tag Builders vs Field Binding](#81-form-architecture-tag-builders-vs-field-binding)
    - [Choosing Form Field Rendering Approach](#choosing-form-field-rendering-approach)
  - [8.2. Form Model Definition for Widgets (`FormModel` & UI Attributes)](#82-form-model-definition-for-widgets-formmodel--ui-attributes)
  - [8.3. Form Template Example](#83-form-template-example)
  - [8.4. Comprehensive Field Catalog (`Yiisoft\FormModel\Field`)](#84-comprehensive-field-catalog-yiisoftformmodelfield)
  - [8.5. Automatic Validation Rules Enrichment (`ValidationRulesEnricher`)](#85-automatic-validation-rules-enrichment-validationrulesenricher)
  - [8.6. Pure Fields (Ad-Hoc Forms Without `FormModel`)](#86-pure-fields-ad-hoc-forms-without-formmodel)
  - [8.7. Centralized Form Theming (`ThemeContainer`, `ThemePath`, `params.php`)](#87-centralized-form-theming-themecontainer-themepath-paramsphp)
- [9. DataView Widgets: GridView, ListView & DetailView (`yiisoft/yii-dataview`)](#9-dataview-widgets-gridview-listview--detailview-yiisoftyii-dataview)

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
    ];
    // Script placement is the dedicated $jsPosition property (not a 'position' key in $jsOptions):
    public ?int $jsPosition = WebView::POSITION_END;
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
                // 1. Substitute local vendor bundle with an external CDN bundle —
                //    an AssetBundle instance value is used as-is:
                \Vendor\Package\SomeLibraryAsset::class => new ThirdPartyCdnAsset(),
                // 1b. Or override properties on the ORIGINAL bundle class: the array is applied as
                //     property assignments to a new SomeLibraryAsset(). There is NO 'class'-key class
                //     substitution — a 'class' key would only create a deprecated dynamic property
                //     and the CDN swap would never happen:
                // \Vendor\Package\SomeLibraryAsset::class => [
                //     'cdn' => true,
                //     'css' => ['some-library.min.css'],
                //     'js' => ['some-library.bundle.min.js'],
                // ],
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

declare(strict_types=1);

use Yiisoft\Html\Html;

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
    ->container(true) // Wraps <ul> inside <nav>; the aria-label only appears with ->containerAttributes(['aria-label' => 'breadcrumb'])
    ->jsonLd(true) // Generates <script type="application/ld+json"> Schema.org metadata
?>
```

#### 2. `FragmentCache`
Caches template fragments in a PSR-16 cache:
```php
<?php

declare(strict_types=1);

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

#### Choosing Form Field Rendering Approach

When rendering form controls in Yii 3 templates, choose the strategy matching the form's data contract:

| Form Control Strategy | Mechanism & Syntax | Choose when… | Safety & Bound Features |
|---|---|---|---|
| **1. Model Widget (`Field::*`)** *(canonical SSOT)* | `Field::text($form, 'name')` | Web forms backed by `FormModelInterface` (CRUD, login, register, settings). | **Full automation:** extracts value, derives scoped name (`FormName[prop]`), binds `#[Label]`, `#[Hint]`, error messages, `is-invalid` class, theme wrappers, and HTML5 validation attributes. |
| **2. Pure Field (`PureField::*`)** | `PureField::text('q', $query)` | Ad-hoc forms without a model: quick search bars, simple GET query filters. | Renders standard field wrapper, label, and input without requiring a `FormModel` class. |
| **3. Tag Helper (`Html::textInput`)** | `Html::textInput('q', $query)` | Bare HTML inputs without container/label/hint/error wrappers or theme decoration. | Produces bare `<input>`. Does NOT bind model errors or attributes. |
| **4. Plain HTML (`<input>`)** | `<input name="q" value="<?= Html::encode($q) ?>">` | Highly specialized custom frontend markup bypassing framework theming. | **Manual overhead:** requires manual attribute encoding, CSRF tokens, and error handling. Forbidden for `FormModel`. |

**Comparison: Form field rendering options:**

```php
// ✅ 1. Canonical: Field widget automatically binds FormModel, errors, labels, hints & theme:
<?= Field::text($formModel, 'name')->autofocus() ?>

// ✅ 2. Model-less: PureField renders standard theme wrappers for simple ad-hoc GET forms:
<?= \Yiisoft\Form\PureField\Field::text('q', $query)->placeholder('Search...') ?>

// ❌ 3. Anti-pattern: Hand-rolling FormModel inputs via plain HTML or tag helpers loses validation:
<div class="mb-3">
    <label for="contact-name" class="form-label">Name</label>
    <input type="text" id="contact-name" name="ContactForm[name]" value="<?= Html::encode($formModel->name) ?>" class="form-control">
</div>
```

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
> To enable validation rules enrichment globally, register the enricher **instance** in `config/params.php` within a theme config under `ThemeContainer`:
> ```php
> declare(strict_types=1);
>
> use Yiisoft\FormModel\ValidationRulesEnricher;
>
> return [
>     'yiisoft/form' => [
>         'themes' => [
>             'default' => [
>                 'validationRulesEnricher' => new ValidationRulesEnricher(),
>             ],
>         ],
>         'defaultTheme' => 'default',
>     ],
> ];
> ```
>
> Theme config arrays bypass DI: `ThemeContainer::getTheme()` builds the theme via `new Theme(...$config)` with a
> `?ValidationRulesEnricherInterface` typed constructor parameter — a `Reference::to(...)` object would throw a
> `TypeError` on the first theme use.
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
