---
name: yii3-view
description: >-
  Work with views in Yii3: yiisoft/view + yii-view-renderer, layouts, view injections
  (CommonParametersInjectionInterface), WebView API (setTitle, registerMeta, registerJs/Css),
  asset bundles (yiisoft/assets): CDN/SRI, publishing, SCSS/TS converter, template engines (Twig via
  yiisoft/view-twig, custom TemplateRendererInterface), themes; server-rendered HTML forms with
  yiisoft/form Field widgets (text/email/select/checkbox..., Bootstrap 5 themes, ErrorSummary);
  data tables with yiisoft/yii-dataview GridView (columns, filters with validation, sorting,
  pagination). Use when user says "create layout", "add meta tag", "register css/js",
  "view injection", "asset bundle", "cdn", "twig", "template engine", "theme", "form widget",
  "render form", "bootstrap form", "Field::", "dropdown", "add table", "grid", "admin list with
  sorting/filtering", "dataview" in a Yii3 project.
argument-hint: "[view feature description]"
allowed-tools: Read Glob Grep Write Edit Bash(php -l *; composer *) AskUserQuestion Questions
disable-model-invocation: false
metadata:
  author: DAGpro (https://github.com/DAGpro)
  version: "0.1"
  category: framework-yii3
---

# Yii3 Views, Layouts & Assets

Work with the view layer: templates, layouts, shared parameters via injections,
`WebView` API and asset bundles.

## Step 0: Analyze

1. Load context per `yii3` master skill.
2. Requires `yiisoft/view` + `yiisoft/yii-view-renderer`.
3. Detect layout location (`src/Web/Shared/Layout/Main/layout.php` in app template) and
   existing injections in `config/common/params.php` under `'yiisoft/yii-view' => ['injections' => [...]]`.

## Rendering

Actions render through `WebViewRenderer`; the template file sits next to the action:

```php
return $this->viewRenderer->render(__DIR__ . '/template', [
    'post' => $post,
]);
```

Template conventions:

```php
<?php

use App\Web\Post\Post;
use Yiisoft\Html\Html;

/**
 * @var Yiisoft\View\WebView $this
 * @var Post $post
 */
?>

<h1><?= Html::encode($post->title) ?></h1>
```

Always `Html::encode()` output; always declare `@var` for every variable.

## Layout

A layout wraps rendered content. In app templates the main layout receives `$content`
and application params:

```php
<?php

use App\Shared\ApplicationParams;
use Yiisoft\Html\Html;

/**
 * @var Yiisoft\View\WebView $this
 * @var string $content
 * @var ApplicationParams $applicationParams
 */

$this->setTitle($applicationParams->name);
?>
<?php $this->beginPage() ?>
<!DOCTYPE html>
<html lang="<?= Html::encode($this->getLocale()) ?>">
<head>
    <meta charset="<?= Html::encode($applicationParams->charset) ?>">
    <?php $this->head() ?>
    <title><?= Html::encode($this->getTitle()) ?></title>
</head>
<body>
<?php $this->beginBody() ?>
<?= $content ?>
<?php $this->endBody() ?>
</body>
</html>
<?php $this->endPage() ?>
```

## WebView API

```php
$this->setTitle('Post — My App');                    // page title
$this->setMetaTags(['description' => '...']);        // or:
$this->registerMeta(['name' => 'description', 'content' => '...']);
$this->registerJs('/js/app.js', position: \Yiisoft\View\WebView::POSITION_END);
$this->registerCss('.alert { color: red; }');
$this->registerJsFile('/js/chart.js', ['position' => \Yiisoft\View\WebView::POSITION_END]);
```

## View Injections (shared parameters)

Provide variables available in all layouts/templates via
`Yiisoft\Yii\View\Renderer\CommonParametersInjectionInterface`. Built-ins: `ContentViewInjection`
(`$content`), `CsrfViewInjection` (`$csrf`), `LayoutViewInjection`.

Custom injection:

```php
<?php

declare(strict_types=1);

namespace App\ViewInjection;

use App\User\CurrentUser;
use Yiisoft\Yii\View\Renderer\CommonParametersInjectionInterface;

final readonly class UserViewInjection implements CommonParametersInjectionInterface
{
    public function __construct(
        private CurrentUser $user,
    ) {}

    public function getCommonParameters(): array
    {
        return [
            'identity' => $this->user->getIdentity(),
            'isGuest' => $this->user->isGuest(),
        ];
    }
}
```

Register in `config/common/params.php`:

```php
'yiisoft/yii-view' => [
    'injections' => [
        Reference::to(ContentViewInjection::class),
        Reference::to(CsrfViewInjection::class),
        Reference::to(LayoutViewInjection::class),
        Reference::to(UserViewInjection::class),
    ],
],
```

### Layout-specific injections

Inject only into one layout via `LayoutSpecificInjections`:

```php
DynamicReference::to(static function (ContainerInterface $container) {
    return new LayoutSpecificInjections('@layout/cart', new CartViewInjection($container->get(Cart::class)));
}),
```

## Asset Bundles

Ship/register CSS+JS via `yiisoft/assets`:

```php
<?php

declare(strict_types=1);

namespace App\Asset;

use Yiisoft\Assets\AssetBundle;

final class AppAsset extends AssetBundle
{
    public ?string $basePath = '@assets';
    public ?string $baseUrl = '@assetsUrl';
    public ?string $sourcePath = __DIR__ . '/../../assets';

    public array $css = ['app.css'];
    public array $js = ['app.js'];
    public array $depends = []; // other bundles first
}
```

Register in a layout/injection/action: `$assetManager->register(AppAsset::class);`
`$sourcePath` = files shipped with code; `$basePath/$baseUrl` = published target.


### CDN & Publishing

CDN-only bundle (`$cdn = true` skips local checks; absolute URLs in `$css`/`$js`; add SRI):

```php
final class BootstrapCdnAsset extends AssetBundle
{
    public bool $cdn = true;

    public array $css = ['https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css'];

    public array $cssOptions = [
        'integrity' => 'sha384-...',
        'crossorigin' => 'anonymous',
    ];
}
```

Vendor package assets: set `$sourcePath` to the non-public directory - published automatically
to `$basePath`. Manual publish: `$assetManager->publish($path)` / `getPublishedUrl($path)`.

If assets do not appear, check in order: file exists -> paths correct -> published ->
layout calls `head()`/`beginBody()`/`endBody()`.

### Asset Converter (SCSS / TypeScript)

```php
// config/web/params.php
'yiisoft/assets' => [
    'converter' => [
        'commands' => [
            'scss' => ['sass', '{from}', '{to}', '--style=compressed'],
            'ts' => ['tsc', '{from}', '--outFile', '{to}'],
        ],
    ],
],
```

List sources directly in `$css`/`$js` (`'main.scss'`) and they are converted on the fly.

## Template Engines (Twig & custom)

Default renderer is PHP; Twig and community engines (e.g.
[Blade](https://github.com/lee-to/yii-blade)) are pluggable.

### Twig

```sh
composer require yiisoft/view-twig
```

Render `.twig` templates exactly like PHP ones:

```php
return $this->viewRenderer->render('about.twig', ['user' => $user, 'posts' => $posts]);
```

```twig
{# @var user \App\Entity\User #}
<h1>{{ user.name }}</h1>            {# auto-escaped #}

{% for post in posts %}
    <time>{{ post.publishedAt|date('F j, Y') }}</time>
{% endfor %}

<a href="{{ path('user.profile', {'id': user.id}) }}">Profile</a>
```

- Auto-escaping is on; bypass with `|raw` only for trusted HTML.
- Inheritance: `{% extends "layout/main.twig" %}` + `{% block %}`s.
- Document variables with `{# @var ... #}` for IDE support.

### Custom Renderer

Implement `Yiisoft\View\TemplateRendererInterface`, register by extension:

```php
// DI config
'yiisoft/view' => [
    'renderers' => [
        'md' => Reference::to(App\View\MarkdownRenderer::class),
    ],
],
```

Afterwards any `help.md` file renders through it automatically.

Choosing: PHP = performance/flexibility; Twig = stricter separation, designer-friendly,
inheritance; custom = specialized formats. Keep logic out of templates regardless of engine.

## Localized Templates

For locale-specific markup place `de/template.php` next to `template.php` — resolved automatically
with a fallback chain. Per-render: `$viewRenderer->withRenderLocale('de-DE')`.

## Themes (path mapping)

Override view locations without touching actions:

```php
// config/web/params.php
'yiisoft/view' => [
    'theme' => [
        'pathMap' => ['@views' => '@vendor/vendor/blog/views'],
        'basePath' => '@vendor/vendor/blog/assets',
        'baseUrl' => '@assetsUrl/vendor-blog',
    ],
],
```

Never set theme config inside a vendor package's own config — document it for applications instead.

## Form Widgets (yiisoft/form)

Server-side HTML form generation. Complements `yiisoft/form-model` (FormModel classes +
`FormHydrator` — round-trip logic in `/yii3-forms`): the model holds data/validation,
widgets render it.

### Setup & Themes

```sh
composer require yiisoft/form
```

```php
use Yiisoft\Form\ThemeContainer;
use Yiisoft\Form\ThemePath;

ThemeContainer::initialize(
    config: [
        'vertical' => require ThemePath::BOOTSTRAP5_VERTICAL,
        'horizontal' => require ThemePath::BOOTSTRAP5_HORIZONTAL,
    ],
    defaultConfig: 'vertical',
);
```

Per-call override: `Field::text('x', theme: 'horizontal')`.

### Field Helper

```php
use Yiisoft\Form\PureField\Field;

echo Field::text('firstName')->label('First Name')->autofocus();
echo Field::select('sex')->optionsData(['m' => 'Male', 'f' => 'Female'])->prompt('—');
echo Field::number('age')->hint('Please enter your age.');
echo Field::submitButton('Submit')->buttonClass('primary');
```

Available types: `Checkbox`, `CheckboxList`, `Color`, `Date`, `DateTimeLocal`, `Email`, `File`,
`Hidden`, `Image`, `Number`, `Password`, `RadioList`, `Range`, `Select`, `Telephone`, `Text`,
`Textarea`, `Time`, `Url`; buttons: `Button`, `ResetButton`, `SubmitButton`; groups:
`ButtonGroup`, `Fieldset`; plus `ErrorSummary` for a validation error block.

Common modifiers: `->label()`, `->hint()`, `->placeholder()`, `->value()`, `->required()`,
`->autofocus()`, `->disabled()`, `->readonly()`, `->inputClass()` / `->addClass()`.
Prefer labels/hints from FormModel attributes (`Label`, `Hint`) when shared across pages.

### Template Integration

```php
/**
 * @var \App\Web\Auth\Form\LoginForm $form
 */
use Yiisoft\Form\PureField\Field;
use Yiisoft\Html\Html;

<?= Html::form()->post($urlGenerator->generate('login')) ?>
    <?= Field::email('email')->label('Email') ?>
    <?= Field::password('password')->label('Password') ?>
    <?= Field::errorSummary($form) ?>
    <?= Field::csrf($csrf) ?>
    <?= Field::submitButton('Sign in') ?>
</form>
```

Rules of thumb:
- The `<form>` tag comes from `Html::form()` with method/action/CSRF (`CsrfViewInjection`).
- Field names must match FormModel property names so hydration works.
- Errors render automatically when the model was populated+validated by `FormHydrator`
  before re-rendering.
- Do not mix manual `Html::textInput()` and Field widgets in one project — pick one style.

## Data Tables (GridView, yiisoft/yii-dataview)

Render sortable, filterable, paginated admin tables backed by `yiisoft/data` readers.

Setup: `composer require yiisoft/data yiisoft/yii-dataview`; the repository exposes a
`DataReaderInterface`. Minimal wiring in the list action:

```php
$sort = Sort::only(['id', 'name', 'email'])->withOrder(['name' => 'asc']);   // whitelist sort fields
$reader = $this->userRepository->getDataReader()->withSort($sort);
$paginator = (new OffsetPaginator($reader))->withPageSize(20)->withCurrentPage($page);
```

Template:

```php
<?= GridView::widget()
    ->dataReader($dataReader)
    ->addTableClass('table', 'table-striped')
    ->columns(
        new SerialColumn(),
        new DataColumn(property: 'name', header: 'Name', filter: true),
        new DataColumn(property: 'status', content: static fn (object $row): string => ucfirst($row['status'])),
        new ActionColumn(urlCreator: static fn (string $action): string => $urlGenerator->generate("user/{$action}")),
    )
?>
```

Column types: `SerialColumn` (row numbers), `DataColumn` (field; custom `content` renderer;
`filter:` input/dropdown with `filterValidation:` rules), `ActionColumn` (row links),
`CheckboxColumn` (bulk selection). Row deletes are POST forms; protect actions with auth middleware.

Full patterns — filters with validation, multi-sort UX, bulk actions, htmx grids:
**references/DATAVIEW.md**.

## Related Skills

- `/yii3-actions` — action + template generation flow (template markup lives here)
- `/yii3-forms` — hydration/validation around the forms rendered here

## References

- **references/PATTERNS.md** — template-side code examples: HTML Helper forms, custom widgets
  (yiisoft/widget), rendering with layout from actions. Load when generating or editing templates.
- **references/DATAVIEW.md** — GridView deep-dive: list action with paginator, full column/filter
  examples, multi-sort, bulk actions, htmx grids. Load when building admin tables.
