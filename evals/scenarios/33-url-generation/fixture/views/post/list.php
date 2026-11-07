<?php

declare(strict_types=1);

use App\Blog\Domain\Post;
use Yiisoft\Html\Html;
use Yiisoft\View\WebView;

/**
 * @var WebView $this
 * @var Post[] $posts
 */

$this->setTitle('Posts');
?>

<?= $this->render('./_navbar') ?>

<h1>Posts</h1>

<ul>
    <?php foreach ($posts as $post): ?>
        <li>
            <a href="<?= Html::encode('/posts/' . $post->getId()) ?>"><?= Html::encode($post->getTitle()) ?></a>
        </li>
    <?php endforeach; ?>
</ul>
