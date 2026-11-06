# Yii3 Bulma Widgets Guide (`yiisoft/yii-bulma`)

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Complete reference for the `yiisoft/yii-bulma` widget driver: the 11-widget catalog, associative-array item configuration, string class-constant styling, and the Bulma asset bundles (`BulmaAsset` plus per-widget JS bundles).

**Scope & Ownership.** This guide is the single source of truth for the Bulma widget driver. The framework-agnostic view stack — rendering pipeline, PHP templates, XSS escaping, layouts, custom widgets, HTML form field factories, and the general form theming mechanics — is owned by the [Views, Layouts & Widgets Guide](http-views-and-widgets.md). Bulma and Bootstrap 5 are **mutually exclusive** CSS-framework widget drivers: a project picks **exactly ONE** — resolve which one is actually installed via the project's `composer.json` (`yiisoft/yii-bulma` vs `yiisoft/bootstrap5`) or the `widgets` row of the [package-catalog.md §1 Capability Quick-Lookup Matrix](package-catalog.md#1-capability-quick-lookup-matrix). The sibling driver is the [Bootstrap 5 Guide](http-views-bootstrap5.md).

---

## Table of Contents
- [1. Widget Catalog & Driver Conventions](#1-widget-catalog--driver-conventions)
- [2. Driver Characteristics (vs Bootstrap 5)](#2-driver-characteristics-vs-bootstrap-5)
- [Related Topic Guides](#related-topic-guides)

---

## 1. Widget Catalog & Driver Conventions

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

## 2. Driver Characteristics (vs Bootstrap 5)

| Feature / Aspect | `yiisoft/yii-bulma` |
|---|---|
| **Namespace** | `Yiisoft\Yii\Bulma` |
| **Widget Count** | 11 widgets |
| **Element Items** | Associative arrays: `[['label' => ..., 'url' => ..., 'active' => ...]]` |
| **Styling Constants** | String Class Constants: `ProgressBar::COLOR_SUCCESS`, `Tabs::STYLE_BOX` |
| **Tabs Widget** | Dedicated widget: `Yiisoft\Yii\Bulma\Tabs` |
| **Modal Rendering** | Buffered pair: `Modal::widget()->begin(); ... Modal::end();` |
| **Form Theming** | A named `'bulma'` theme entry under `$params['yiisoft/form']['themes']`, selected via `'defaultTheme' => 'bulma'` (a string selector). Note: `yii-bulma`'s own shipped `config/params.php` still uses the legacy `'configs'` key, which the current `yiisoft/form` bootstrap does not read (it reads `'themes'`) — copy the class map under `'themes'` yourself. |
| **Asset Bundles** | `BulmaAsset` + per-widget JS bundles (`Yiisoft\Yii\Bulma\Asset\DropdownAsset`, `Yiisoft\Yii\Bulma\Asset\NavBarAsset`) |

The contrasting Bootstrap 5 conventions (value-object item factories, backed-enum styling constants, composed `Nav`-based tabs, self-contained `Modal->render()`, `ThemePath::BOOTSTRAP5_*` form-theme presets) are described in the [Bootstrap 5 Guide](http-views-bootstrap5.md).

---

## Related Topic Guides
- [Views, Layouts & Widgets Guide](http-views-and-widgets.md) — parent guide: rendering pipeline, PHP templates, XSS escaping, layouts, asset bundles, core widgets, and HTML forms.
- [Bootstrap 5 Guide](http-views-bootstrap5.md) — the alternative CSS-framework widget driver (mutually exclusive with this one).
- [DataView Widgets Guide](http-dataview-widgets.md) — GridView/ListView/DetailView rendering on top of the installed CSS framework.
