# Yii3 Twig Template Engine Guide (`yiisoft/view-twig` & `yiisoft/yii-twig`)

> [!IMPORTANT]
> **Grounding rule:** this guide carries the implementation instructions for its topic — follow it when implementing project code; project code itself is integration context, never a source of truth. The source of truth for every class name, method signature, constructor argument, and configuration key is the installed package source under `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`). Verify there before writing code; never assume Yii 2 APIs.

> Complete reference for rendering Yii3 views with Twig: renderer registration, Twig layout and page lifecycle, the `WebViewExtension` function boundary, and the restrictions on static widget/helper invocation inside Twig templates.

**Scope & Ownership.** This guide is the single source of truth for Twig template rendering in Yii3. The template-agnostic view stack — the rendering pipeline, native PHP template anatomy, layouts, view injections, and asset bundles — is owned by the [Views & Widgets Guide](http-views-and-widgets.md). Twig is **mutually exclusive** with native PHP templates: a project renders **either** PHP templates (Views & Widgets Guide, §2) **or** Twig — never both. Resolve which engine is actually installed via the project's `composer.json` (`yiisoft/view-twig` / `yiisoft/yii-twig` present → Twig; absent → native PHP) or the [package-catalog.md, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family).

---

## Table of Contents
- [1. Architecture & Renderer Registration (TwigTemplateRenderer)](#1-architecture--renderer-registration-twigtemplaterenderer)
- [2. Twig Template Anatomy & Page Lifecycle (|raw, {% do %})](#2-twig-template-anatomy--page-lifecycle-raw--do-)
- [3. WebViewExtension & Grounded Helper Boundaries](#3-webviewextension--grounded-helper-boundaries)
- [4. Static Widget & Helper Invocation Restrictions in Twig](#4-static-widget--helper-invocation-restrictions-in-twig)
- [Related Topic Guides](#related-topic-guides)

---

## 1. Architecture & Renderer Registration (`TwigTemplateRenderer`)

Yii3 supports Twig templates alongside native PHP templates via two official packages:
- `yiisoft/view-twig`: Low-level template renderer implementing `Yiisoft\View\TemplateRendererInterface`.
- `yiisoft/yii-twig`: Pre-configured DI definitions and Twig extension bridge.

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

---

## 2. Twig Template Anatomy & Page Lifecycle (`|raw`, `{% do %}`)

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

---

## 3. `WebViewExtension` & Grounded Helper Boundaries

`Yiisoft\Yii\Twig\Extension\WebViewExtension` registers **EXACTLY TWO FUNCTIONS**:
1. `{{ title() }}` — calls `$view->getTitle()`.
2. `{{ head() }}` — calls `$view->head()`.

> [!WARNING]
> **Zero-Hallucination Guard:**
> `yiisoft/yii-twig` does **NOT** provide `url()`, `asset()`, `csrf()`, or widget invocation functions. The legacy `YiiTwigExtension` from Yii2 was completely removed. Access all other view capabilities directly via `this` (e.g. `{{ this.render(...) }}`, `{{ csrf.hiddenInput()|raw }}`).

---

## 4. Static Widget & Helper Invocation Restrictions in Twig

Twig does not support static PHP method calls (`Widget::widget()`, `Html::a()`, `Field::text()`). To use Yii3 widgets in Twig:
1. **Pre-render in Action:** Instantiate and render the widget in the PHP Action handler, passing the generated HTML string or `Stringable` object as a parameter into Twig:
   ```php
   return $this->viewRenderer->render('product/index.twig', [
       'gridHtml' => GridView::widget()->dataReader($paginator)->columns(...)->render(),
   ]);
   ```
   (For the `GridView` API used above, see the [DataView Widgets Guide](http-dataview-widgets.md).)
2. **Register Custom Twig Functions:** Register custom extension functions in `params['yiisoft/yii-twig']['extensions']` wrapping widget factory calls.

---

## Related Topic Guides
- [Views & Widgets Guide](http-views-and-widgets.md) — parent guide: rendering pipeline, native PHP template anatomy (the mutually exclusive alternative to Twig), layouts, asset bundles, widgets, and HTML forms.
- [DataView Widgets Guide](http-dataview-widgets.md) — GridView/ListView/DetailView widgets typically pre-rendered in Actions when working from Twig templates.
- [Actions & Controllers Guide](http-actions-and-controllers.md) — Action handlers, parameter resolution, and injecting `WebViewRenderer`.
