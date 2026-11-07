<?php

declare(strict_types=1);

use Yiisoft\Data\Paginator\OffsetPaginator;
use Yiisoft\View\WebView;
use Yiisoft\Yii\DataView\GridView\Column\DataColumn;
use Yiisoft\Yii\DataView\GridView\GridView;

/**
 * @var WebView $this
 * @var OffsetPaginator $paginator
 * @var string $pageTitle
 */

$this->setTitle($pageTitle);
?>

<?= GridView::widget()
    ->dataReader($paginator)
    ->columns(
        new DataColumn(
            property: 'name',
            header: 'Name',
        ),
        new DataColumn(
            property: 'price',
            header: 'Price',
            content: static fn (array $product): string => '$' . number_format((float) $product['price'], 2),
        ),
    )
    ->summaryTemplate('Showing {begin}-{end} of {totalCount} products (Page {currentPage} of {totalPages})')
    ->noResultsText('No products found.')
?>
