<?php

declare(strict_types=1);

use Yiisoft\Html\Html;
use Yiisoft\View\WebView;

/**
 * @var WebView $this
 * @var string $pageTitle
 * @var string $introText
 * @var string $pageLocale
 */

$this->setTitle($pageTitle);
?>

<div lang="<?= Html::encodeAttribute($pageLocale) ?>">
    <h1><?= Html::encode($pageTitle) ?></h1>
    <p><?= Html::encode($introText) ?></p>
    <p class="locale-note"><?= Html::encode($pageLocale) ?></p>
</div>
