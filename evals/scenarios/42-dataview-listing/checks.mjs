import { check, ok, fail, read } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));

/** The fixture's manual listing loop signatures, over the all-rows variable the action passes to the view ($products) and its renamed variants ($rows). */
const MANUAL_LOOP = /foreach\s*\(\s*\$(?:products|rows)\s+as\s+\$product\s*\)/;

/** Hand-built table markup anywhere in changed PHP - the widget generates the table itself, so a literal <table> in a widget-based solution is a leftover of the manual listing. */
const MANUAL_TABLE = /<table[\s>]/;

/**
 * DataView widget instantiation: GridView/ListView via the ::widget() static factory.
 * Grounded: references/widget/src/Widget.php:105 `final public static function widget(...): static`
 * (GridView/ListView extend Yiisoft\Widget\Widget); guide usage: http-dataview-widgets.md:54 and :227
 * (`GridView::widget()` / `ListView::widget()`). Short name (after a use import) or fully qualified.
 */
const WIDGET_CALL = /\b(?:GridView|ListView)::\s*widget\s*\(/;

/** The grounded widget classes (references/yii-dataview/src/GridView/GridView.php:54, src/ListView/ListView.php:42): use import or fully-qualified reference. */
const WIDGET_CLASS = /\\?Yiisoft\\Yii\\DataView\\(?:GridView\\GridView|ListView\\ListView)\b/;

/** Widget data-reader wiring (grounded: references/yii-dataview/src/BaseListView.php:243 dataReader(ReadableDataInterface $dataReader): static). */
const DATA_READER_CALL = /->\s*dataReader\s*\(/;

/** Paginator instantiation over the repository data reader (grounded: references/data/src/Paginator/OffsetPaginator.php:68 __construct(ReadableDataInterface $dataReader); KeysetPaginator alongside it). */
const PAGINATOR_NEW = /\bnew\s+\\?(?:Yiisoft\\Data\\Paginator\\)?(?:OffsetPaginator|KeysetPaginator)\s*\(/;

/** Explicit page size (grounded: references/data/src/Paginator/OffsetPaginator.php:109 withPageSize(int $pageSize): static). */
const WITH_PAGE_SIZE = /->\s*withPageSize\s*\(/;

export default [
  check('widget-config-present', 'The listing renders through a grounded data-view widget: GridView::widget()/ListView::widget() in a changed view or action, with the widget class imported or fully qualified in the same file (grounded: references/yii-dataview/src/GridView/GridView.php:54, references/widget/src/Widget.php:105)', ({ changed }) => {
    const hits = php(changed)
      .map((c) => ({ path: c.path, t: read(c.abs) }))
      .filter(({ t }) => WIDGET_CALL.test(t) && WIDGET_CLASS.test(t));
    return hits.length
      ? ok(hits.map((h) => h.path).join(', '))
      : fail('no GridView::widget()/ListView::widget() with a use import or fully-qualified class in changed files');
  }),

  check('data-reader-wired', 'The widget is fed the data source: ->dataReader(...) is called on the widget chain (grounded: references/yii-dataview/src/BaseListView.php:243 dataReader(ReadableDataInterface): static)', ({ changed }) => {
    const hits = php(changed)
      .map((c) => ({ path: c.path, t: read(c.abs) }))
      .filter(({ t }) => DATA_READER_CALL.test(t));
    return hits.length
      ? ok(hits.map((h) => h.path).join(', '))
      : fail('no ->dataReader() call on the widget in changed files');
  }),

  check('data-source-paginated', 'The same repository data source is paginated: an OffsetPaginator/KeysetPaginator wraps the repository data reader (grounded: references/data/src/Paginator/OffsetPaginator.php:68 __construct(ReadableDataInterface))', ({ changed }) => {
    const hits = php(changed)
      .map((c) => ({ path: c.path, t: read(c.abs) }))
      .filter(({ t }) => PAGINATOR_NEW.test(t));
    return hits.length
      ? ok(hits.map((h) => h.path).join(', '))
      : fail('no OffsetPaginator/KeysetPaginator instantiated over the data reader in changed files');
  }),

  check('paginator-page-size-explicit', 'If a paginator wraps the listing, the page size is set explicitly via ->withPageSize() (otherwise the library default of 10 applies silently); vacuously passes when no paginator is used', ({ changed }) => {
    const files = php(changed).map((c) => ({ path: c.path, t: read(c.abs) }));
    const paged = files.filter(({ t }) => PAGINATOR_NEW.test(t));
    if (!paged.length) return ok('no paginator on the listing path - page-size rule not applicable');
    return files.some(({ t }) => WITH_PAGE_SIZE.test(t))
      ? ok(paged.map((b) => b.path).join(', '))
      : fail(`paginator instantiated without ->withPageSize(): ${paged.map((b) => b.path).join(', ')}`);
  }),

  check('no-manual-table-loop', "The fixture's manual listing is gone from all changed PHP files: no `foreach ($products as $product)`-style row loop over the all-rows variable (including renamed variants) and no hand-built <table> markup - rows are produced by the widget, and the manual table must not be relocated into a partial", ({ changed }) => {
    const bad = php(changed)
      .filter((c) => MANUAL_LOOP.test(read(c.abs)) || MANUAL_TABLE.test(read(c.abs)))
      .map((c) => c.path);
    return bad.length
      ? fail(`manual table loop/markup still present: ${bad.join(', ')}`)
      : ok();
  }),

  check('no-yii2', 'No Yii2 constructs or #[Override] in changed PHP files', ({ changed }) => {
    const re = /Yii::\$app|\buse\s+yii\\|#\[Override\]|ActiveForm::begin|->getFlash\(/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('strict-types', 'declare(strict_types=1) in every added PHP file', ({ changed }) => {
    const bad = php(changed).filter((c) => c.added && !/declare\(strict_types=1\);/.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('transcript-mentions', 'The transcript reports the data-view work (GridView/ListView widget, paginator or the removed manual table)', ({ transcript }) =>
    /GridView|ListView|data.?view|widget|paginator/i.test(transcript)
      ? ok()
      : fail('transcript does not mention the data-view widget/paginator work')),
];
