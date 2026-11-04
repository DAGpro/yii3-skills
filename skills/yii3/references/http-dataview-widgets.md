# Yii3 DataView Widgets Guide: GridView, ListView & DetailView (`yiisoft/yii-dataview`)

> Complete reference for the `yiisoft/yii-dataview` widget family: `GridView` table rendering and its column catalog, column filtering, `ListView` item lists, `DetailView` single-record display, and the standalone pagination and page-size widgets.

**Scope & Ownership.** This guide is the single source of truth for DataView widgets. The surrounding view stack — the rendering pipeline, template anatomy, layouts, asset bundles, and core widgets — is owned by the [Views & Widgets Guide](http-views-and-widgets.md). The visual styling of the generated markup depends on which CSS-framework driver the project installed (`yiisoft/bootstrap5` or `yiisoft/yii-bulma` — resolve which one via the project's `composer.json` / [package-catalog.md, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family)).

---

## Table of Contents
- [1. GridView Architecture & Table Rendering](#1-gridview-architecture--table-rendering)
- [2. Column Catalog (DataColumn, ActionColumn & ActionButton, CheckboxColumn, RadioColumn, SerialColumn)](#2-column-catalog-datacolumn-actioncolumn--actionbutton-checkboxcolumn-radiocolumn-serialcolumn)
- [3. Column Filtering in GridView (TextInputFilter, DropdownFilter)](#3-column-filtering-in-gridview-textinputfilter-dropdownfilter)
- [4. ListView (Yiisoft\Yii\DataView\ListView\ListView)](#4-listview-yiisoftyiidataviewlistviewlistview)
- [5. DetailView (Yiisoft\Yii\DataView\DetailView\DetailView & DataField)](#5-detailview-yiisoftyiidataviewdetailviewdetailview--datafield)
- [6. Standalone Pagination Widgets & Page Size Controls](#6-standalone-pagination-widgets--page-size-controls)
- [Related Topic Guides](#related-topic-guides)

---

`yiisoft/yii-dataview` separates concerns cleanly:
- `GridView` (table) and `ListView` (item list) render **multiple records** from a `ReadableDataInterface` (`OffsetPaginator`, `KeysetPaginator`) via `dataReader()`.
- `DetailView` renders a **single record** (array or object) passed via `data()`.

## 1. GridView Architecture & Table Rendering

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

## 2. Column Catalog (`DataColumn`, `ActionColumn & ActionButton`, `CheckboxColumn`, `RadioColumn`, `SerialColumn`)

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

## 3. Column Filtering in GridView (`TextInputFilter`, `DropdownFilter`)

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

## 4. ListView (`Yiisoft\Yii\DataView\ListView\ListView`)

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

## 5. DetailView (`Yiisoft\Yii\DataView\DetailView\DetailView` & `DataField`)

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

## 6. Standalone Pagination Widgets & Page Size Controls

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

## Related Topic Guides
- [Views & Widgets Guide](http-views-and-widgets.md) — parent guide: rendering pipeline, PHP templates, XSS escaping, layouts, asset bundles, core widgets, and HTML forms.
- [Bootstrap 5 Guide](http-views-bootstrap5.md) — CSS-framework widget driver styling DataView markup when `yiisoft/bootstrap5` is installed.
- [Bulma Guide](http-views-bulma.md) — CSS-framework widget driver styling DataView markup when `yiisoft/yii-bulma` is installed.
- [Twig Template Engine Guide](http-views-twig.md) — when rendering through Twig, DataView widgets are pre-rendered in the Action and passed as strings.
