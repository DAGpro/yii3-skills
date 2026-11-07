<?php

declare(strict_types=1);

use Yiisoft\View\WebView;

/**
 * @var WebView $this
 * @var string $pageTitle
 * @var array $post
 * @var array $latestPosts
 */

$this->setTitle($pageTitle);
?>

<h1><?= htmlspecialchars($pageTitle, ENT_QUOTES) ?></h1>

<article class="post">
    <h2><?= htmlspecialchars($post['title'], ENT_QUOTES) ?></h2>
    <p><?= htmlspecialchars($post['body'], ENT_QUOTES) ?></p>
</article>

<h3>Latest posts</h3>
<ul class="post-list">
    <?php foreach ($latestPosts as $latest): ?>
        <li><a href="/posts/<?= (int) $latest['id'] ?>"><?= htmlspecialchars($latest['title'], ENT_QUOTES) ?></a></li>
    <?php endforeach; ?>
</ul>
