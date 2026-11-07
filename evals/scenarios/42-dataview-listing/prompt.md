Our products page is a hand-rolled HTML table built with a foreach loop, and it dumps every row from the repository onto one page.

Rework the listing so it renders through the framework's data-view widget (GridView or ListView from yiisoft/yii-dataview) instead of the manual loop, with the same repository data source behind it and a paginator in front of the data - page size set explicitly, not the library default.

The yiisoft/yii-dataview package is already required in composer.json.
