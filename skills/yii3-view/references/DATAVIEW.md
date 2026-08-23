# GridView Deep-Dive (yiisoft/yii-dataview)

Full patterns for sortable, filterable, paginated admin tables. Inline basics live in the
"Data Tables (GridView)" section of SKILL.md.

## Step 0: Verify Setup

1. `composer require yiisoft/data yiisoft/yii-dataview` if absent.
2. Repository must expose a `DataReaderInterface` (`yiisoft/data`) — usually a DB query
   wrapped as a reader. See `/yii3-actions` (references/CRUD.md) for the repository layer.
3. Ask for: columns, filterable/sortable fields, row actions.

## List Action with DataReader + Paginator

```php
<?php

declare(strict_types=1);

namespace App\Web\User;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Data\Reader\Sort;
use Yiisoft\Data\Reader\OffsetPaginator;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class ListAction
{
    public function __construct(
        private UserRepositoryInterface $userRepository,
        private WebViewRenderer $viewRenderer,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $page = max(1, (int) ($request->getQueryParams()['page'] ?? 1));

        $sort = Sort::only(['id', 'name', 'email', 'status'])
            ->withOrder(['name' => 'asc']);

        $reader = $this->userRepository->getDataReader()->withSort($sort);

        $paginator = (new OffsetPaginator($reader))
            ->withPageSize(20)
            ->withCurrentPage($page);

        return $this->viewRenderer->render(__DIR__ . '/list', [
            'paginator' => $paginator,
        ]);
    }
}
```

`OffsetPaginator` reads lazily — only the current page hits the storage.
Whitelist sortable fields via `Sort::only([...])` to prevent arbitrary column sorting.

## Full GridView Template

```php
<?php

declare(strict_types=1);

use App\Web\User\User;
use Yiisoft\Data\Reader\ReadableDataInterface;
use Yiisoft\Yii\DataView\GridView\GridView;
use Yiisoft\Yii\DataView\GridView\Column\DataColumn;
use Yiisoft\Yii\DataView\GridView\Column\ActionColumn;
use Yiisoft\Yii\DataView\GridView\Column\SerialColumn;

/**
 * @var ReadableDataInterface $dataReader
 * @var Yiisoft\Router\UrlGeneratorInterface $urlGenerator
 */
?>

<?= GridView::widget()
    ->dataReader($dataReader)
    ->id('users-grid')
    ->addTableClass('table', 'table-striped')
    ->columns(
        new SerialColumn(),
        new DataColumn(property: 'id'),
        new DataColumn(property: 'name', header: 'Name'),
        new DataColumn(property: 'email', header: 'Email'),
        new DataColumn(
            property: 'status',
            header: 'Status',
            content: static fn (object $row): string => $row['status'] === 'active' ? 'Active' : 'Inactive',
        ),
        new ActionColumn(
            urlCreator: static fn (string $action): string => $urlGenerator->generate("user/{$action}"),
        ),
    )
?>
```

Column types:

| Column           | Purpose                                       |
|------------------|-----------------------------------------------|
| `SerialColumn`   | row numbers                                   |
| `DataColumn`     | one field; supports custom `content` renderer |
| `ActionColumn`   | view/update/delete links per row              |
| `CheckboxColumn` | selection checkboxes for bulk actions         |

## Filters

Per-column filtering with validation rules from `yiisoft/validator`:

```php
use Yiisoft\Validator\Rule\In;
use Yiisoft\Validator\Rule\Length;

new DataColumn(property: 'name', header: 'Name',
    filter: true,                                  // text input
    filterValidation: new Length(max: 50),
),
new DataColumn(property: 'status',
    filter: ['active' => 'Active', 'inactive' => 'Inactive'],   // dropdown
    filterValidation: new In(['active', 'inactive']),
),
```

Filter values arrive as query params — read them in the action and apply to the reader/query
(`$reader->withFilter(...)` using `yiisoft/data` operators like `Equals`, `GreaterThan`).

## Sorting UX & Pagination Controls

```php
GridView::widget()
    // ...
    ->keepPageOnSort(true)
    ->multiSort()
    ->sortableHeaderAscAppend(' &uarr;')
    ->sortableHeaderDescAppend(' &darr;')
```

Add pagination links below the grid using `$urlGenerator->generateFromCurrent(['page' => $n])`.

## Row Actions

- Delete must be POST via a small form inside `ActionColumn` button customization or a dedicated
  delete route — never GET.
- Protect actions with auth middleware per `/yii3-auth`.
- Bulk actions from `CheckboxColumn`: submit selected keys to a POST endpoint that validates each id.

## htmx Grids

For partial reloads of just the grid (sorting/filtering without full page reload), wire
`hx-boost` attributes on the grid controls (sortable links, filter form, pagination links)
targeting the grid container id, and return only the fragment when the `HX-Request` header
is present (add `Vary: HX-Request`).

## Verification Checklist

1. Sorting toggles asc/desc and keeps page (`keepPageOnSort`).
2. Filters constrain results; invalid filter values are rejected by validation, not SQL errors.
3. Page beyond the last shows empty result gracefully (or 404 per project convention).
4. `php -l`; functional test covers list render + one filter case (see `/yii3-testing`).
