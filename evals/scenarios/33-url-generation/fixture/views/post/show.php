<?php

declare(strict_types=1);

use App\Blog\Domain\Post;
use Yiisoft\Html\Html;
use Yiisoft\View\WebView;

/**
 * @var WebView $this
 * @var Post $post
 */

$this->setTitle($post->getTitle());
?>

<?= $this->render('./_navbar') ?>

<h1><?= Html::encode($post->getTitle()) ?></h1>

<p><a href="/posts">Back to all posts</a></p>

<form method="post" action="<?= Html::encode('/posts/' . $post->getId() . '/edit') ?>">
    <label for="post-title">Title</label>
    <input id="post-title" type="text" name="title" value="<?= Html::encodeAttribute($post->getTitle()) ?>">
    <button type="submit">Save</button>
</form>
