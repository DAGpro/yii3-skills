# Yii3 Bootstrap 5 Guide: Widgets, Assets & Form Theming (`yiisoft/bootstrap5`)

> Complete reference for the `yiisoft/bootstrap5` package: the 16-widget driver catalog with its value-object item factories and backed-enum styling constants, Bootstrap-flavored flash messages, the `BootstrapAsset` / `BootstrapCdnAsset` bundles with SRI, the `customizedBundles` override recipe, and the `ThemePath::BOOTSTRAP5_*` form-theme presets.

**Scope & Ownership.** This guide is the single source of truth for the Bootstrap 5 widget driver and its Bootstrap-specific integrations (asset bundles, form theming presets, flash-message alerts). The framework-agnostic view stack — rendering pipeline, PHP templates, XSS escaping, layouts, custom widgets, HTML form field factories, and the general `ThemeContainer` mechanics — is owned by the [Views & Widgets Guide](http-views-and-widgets.md). Bootstrap 5 and Bulma are **mutually exclusive** CSS-framework widget drivers: a project picks **exactly ONE** — resolve which one is actually installed via the project's `composer.json` (`yiisoft/bootstrap5` vs `yiisoft/yii-bulma`) or the [package-catalog.md, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family). The sibling driver is the [Bulma Guide](http-views-bulma.md).

---

## Table of Contents
- [1. Widget Catalog & Driver Conventions](#1-widget-catalog--driver-conventions)
- [2. Driver Characteristics (vs Bulma)](#2-driver-characteristics-vs-bulma)
- [3. Flash Messages with Bootstrap Alerts](#3-flash-messages-with-bootstrap-alerts)
- [4. Asset Bundles: BootstrapAsset & CDN with SRI](#4-asset-bundles-bootstrapasset--cdn-with-sri)
- [5. Overriding the Bootstrap Bundle (customizedBundles)](#5-overriding-the-bootstrap-bundle-customizedbundles)
- [6. Form Theming Presets (ThemeContainer, ThemePath)](#6-form-theming-presets-themecontainer-themepath)
- [7. Bootstrap-Specific Anti-Patterns](#7-bootstrap-specific-anti-patterns)
- [Related Topic Guides](#related-topic-guides)

---

## 1. Widget Catalog & Driver Conventions

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

## 2. Driver Characteristics (vs Bulma)

| Feature / Aspect | `yiisoft/bootstrap5` |
|---|---|
| **Namespace** | `Yiisoft\Bootstrap5` |
| **Widget Count** | 16 widgets |
| **Element Items** | Value-object factories: `NavLink::to()`, `DropdownItem::link()`, `BreadcrumbLink::to()` |
| **Styling Constants** | Backed Enums: `AlertVariant::DANGER`, `NavStyle::TABS`, `ButtonVariant::PRIMARY` |
| **Tabs Widget** | Composed: `Nav` + `styles(NavStyle::TABS)` + `NavLink::tab()` |
| **Modal Rendering** | Self-contained `->render()` with `triggerButton()` |
| **Form Theming** | `ThemeContainer` with `ThemePath::BOOTSTRAP5_*` (section 6 of this guide) |
| **Asset Bundles** | `BootstrapAsset`, `BootstrapCdnAsset` (section 4 of this guide) |

The contrasting Bulma conventions (associative-array items, string class constants, dedicated `Tabs` widget, buffered `Modal` begin/end pair) are described in the [Bulma Guide](http-views-bulma.md).

## 3. Flash Messages with Bootstrap Alerts

The layout lifecycle sequence itself (registering bundles, `beginPage()`/`head()`/`beginBody()`/`endBody()`/`endPage()`) is owned by the [Views & Widgets Guide, §5.1](http-views-and-widgets.md#51-main-layout-structure--lifecycle-sequence). The Bootstrap-flavored flash-message block uses the typed `Yiisoft\Bootstrap5\Alert` widget with the `AlertVariant` enum:

Layout file imports:

```php
use Yiisoft\Bootstrap5\Alert;
use Yiisoft\Bootstrap5\AlertVariant;
use Yiisoft\Session\Flash\FlashInterface;
```

Flash notifications block:

```php
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
```

## 4. Asset Bundles: BootstrapAsset & CDN with SRI

The package ships two asset bundles under `Yiisoft\Bootstrap5\Assets\`: `BootstrapAsset` (locally published files) and `BootstrapCdnAsset` (CDN URLs with integrity attributes pre-configured). The general `AssetBundle` property reference and publishing pipeline are owned by the [Views & Widgets Guide, §6.1](http-views-and-widgets.md#61-declaring-an-asset-bundle-assetbundle-properties--cdn-with-sri).

**Dependency on the Bootstrap bundle.** Application bundles typically declare `BootstrapAsset` as a dependency:

```php
// Dependent bundles loaded prior to this bundle (inside your AppAsset):
public array $depends = [
    \Yiisoft\Bootstrap5\Assets\BootstrapAsset::class,
];
```

**External CDN Bundle Declaration with Subresource Integrity (SRI).** A hand-rolled CDN bundle pinning Bootstrap with explicit `integrity`/`crossorigin` attributes (the technique; the package ships a pre-configured equivalent, `Yiisoft\Bootstrap5\Assets\BootstrapCdnAsset`):

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

## 5. Overriding the Bootstrap Bundle (customizedBundles)

To substitute the local `BootstrapAsset` with an external CDN bundle — or to disable any unwanted third-party bundle — configure `customizedBundles` in `config/params.php` (the full override mechanics and the `customizedBundles` vs `'bundles'` trap are owned by the [Views & Widgets Guide, §6.7](http-views-and-widgets.md#67-overriding--disabling-bundles-customizedbundles-in-paramsphp)):

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

## 6. Form Theming Presets (ThemeContainer, ThemePath)

To automatically apply Bootstrap 5 markup (`.form-control`, `.form-label`, `.is-invalid`, `.invalid-feedback`) without manually setting classes on every field, register the shipped `ThemePath` presets in `config/params.php`:

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

The general theming mechanics — registering custom themes as `Theme` constructor argument arrays and the `ThemeContainer` lifecycle — are owned by the [Views & Widgets Guide, §8.7](http-views-and-widgets.md#87-centralized-form-theming-themecontainer-themepath-paramsphp).

## 7. Bootstrap-Specific Anti-Patterns

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| **`$params['yiisoft/form']['defaultConfig'] = '...'`** | Bootstrap file reads `'defaultTheme'`. Causes `Undefined array key "defaultTheme"`. | Set `$params['yiisoft/form']['defaultTheme'] = 'bootstrap5-vertical'`. |
| **`Nav::widget()->fade(true)->styles(NavStyle::TABS)`** | Method is plural `styles()`. Calling `fade(true)` before `styles(NavStyle::TABS)` throws `RuntimeException: Fade effect can only be used with tabs or pills.`. | Call `styles()` strictly prior to `fade(true)`: `Nav::widget()->styles(NavStyle::TABS)->fade(true)`. |

---

## Related Topic Guides
- [Views & Widgets Guide](http-views-and-widgets.md) — parent guide: rendering pipeline, PHP templates, XSS escaping, layouts, asset bundle properties (§6.1), bundle overrides (§6.7), form field factories, and ThemeContainer mechanics (§8.7).
- [Bulma Guide](http-views-bulma.md) — the alternative CSS-framework widget driver (mutually exclusive with this one).
- [DataView Widgets Guide](http-dataview-widgets.md) — GridView/ListView/DetailView rendering on top of the installed CSS framework.
- [Validation & Forms Guide](http-validation-and-forms.md) — form models, validation rules, and `FormHydrator`.
