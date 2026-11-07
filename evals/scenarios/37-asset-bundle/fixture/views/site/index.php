<?php

declare(strict_types=1);

use Yiisoft\Html\Html;
use Yiisoft\View\WebView;

/**
 * @var WebView $this
 * @var string $pageTitle
 */

$this->setTitle($pageTitle);
?>

<h1><?= Html::encode($pageTitle) ?></h1>

<p>Welcome to the site home page.</p>
