<?php

declare(strict_types=1);

use Yiisoft\Html\Html;
use Yiisoft\View\WebView;

/**
 * @var WebView $this
 * @var string $pageTitle
 * @var string $tableHtml
 * @var int $page
 * @var int $totalPages
 */

$this->setTitle($pageTitle);
?>

<h1><?= Html::encode($pageTitle) ?></h1>

<?= $tableHtml ?>

<?php if ($totalPages > 1): ?>
    <nav class="pagination">
        <?php for ($p = 1; $p <= $totalPages; $p++): ?>
            <?php if ($p === $page): ?>
                <strong><?= $p ?></strong>
            <?php else: ?>
                <a href="/products?page=<?= $p ?>"><?= $p ?></a>
            <?php endif ?>
        <?php endfor ?>
    </nav>
<?php endif ?>
