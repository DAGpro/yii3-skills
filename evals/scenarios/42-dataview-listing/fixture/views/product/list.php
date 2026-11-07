<?php

declare(strict_types=1);

use Yiisoft\Html\Html;
use Yiisoft\View\WebView;

/**
 * @var WebView $this
 * @var string $pageTitle
 * @var iterable<array<string, mixed>> $products
 */

$this->setTitle($pageTitle);
?>

<h1><?= Html::encode($pageTitle) ?></h1>

<table>
    <thead>
        <tr><th>Name</th><th>Price</th></tr>
    </thead>
    <tbody>
    <?php foreach ($products as $product): ?>
        <tr>
            <td><?= Html::encode((string) $product['name']) ?></td>
            <td><?= Html::encode(number_format((float) $product['price'], 2)) ?></td>
        </tr>
    <?php endforeach ?>
    </tbody>
</table>
