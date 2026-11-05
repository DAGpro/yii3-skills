# Yii3 Views, Layouts & Widgets Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Comprehensive guide for template rendering, XSS protection, layouts, view injections, asset bundles, custom widgets, and HTML forms using `yiisoft/view`, `yiisoft/yii-view-renderer`, `yiisoft/html`, `yiisoft/widget`, `yiisoft/assets`, `yiisoft/yii-widgets`, `yiisoft/form`, and `yiisoft/form-model`. Package-specific material is split out into on-demand child guides owned by this one: the Twig template engine ([Twig Template Engine Guide](http-views-twig.md)), the CSS-framework widget drivers ([Bootstrap 5 Guide](http-views-bootstrap5.md), [Bulma Guide](http-views-bulma.md)), and the DataView widgets ([DataView Widgets Guide](http-dataview-widgets.md)).

This topic is split into two focused guides — load the one that matches the task:

- [Views: Rendering Pipeline, XSS & Layouts](http-views.md) — `WebViewRenderer` pipeline, PHP template anatomy & typing, Twig pointer, mandatory XSS escaping, layouts/page lifecycle/view injections, theming (§1–§5).
- [Widgets, Assets & HTML Form Rendering](http-widgets-and-assets.md) — asset bundles & publishing pipeline, custom/core widgets & CSS-framework drivers, HTML form rendering, DataView pointer (§6–§9).

Read this file for the anti-pattern matrix (§10) and related guides (§11).

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