<?php

declare(strict_types=1);

use Yiisoft\Html\Html;
use Yiisoft\View\WebView;

/**
 * @var WebView $this
 * @var string $postsUrl
 * @var string $featuredUrl
 */
?>
<nav class="blog-nav">
    <a href="<?= Html::encode($postsUrl) ?>">All posts</a>
    <a href="<?= Html::encode($featuredUrl) ?>">Editor's pick</a>
</nav>
