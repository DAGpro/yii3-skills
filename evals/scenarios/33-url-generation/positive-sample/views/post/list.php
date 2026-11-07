<?php

declare(strict_types=1);

use App\Blog\Domain\Post;
use Yiisoft\Html\Html;
use Yiisoft\View\WebView;

/**
 * @var WebView $this
 * @var Post[] $posts
 * @var array<int, string> $postUrls
 * @var string $postsUrl
 * @var string $featuredUrl
 */

$this->setTitle('Posts');
?>

<?= $this->render('./_navbar', ['postsUrl' => $postsUrl, 'featuredUrl' => $featuredUrl]) ?>

<h1>Posts</h1>

<ul>
    <?php foreach ($posts as $post): ?>
        <li>
            <a href="<?= Html::encode($postUrls[$post->getId()]) ?>"><?= Html::encode($post->getTitle()) ?></a>
        </li>
    <?php endforeach; ?>
</ul>
