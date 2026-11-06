<?php

declare(strict_types=1);

use App\Web\Blog\EditPostForm;
use Yiisoft\Html\Html;
use Yiisoft\View\WebView;

/**
 * @var WebView $this
 * @var EditPostForm $form
 * @var string $pageTitle
 */

$this->setTitle($pageTitle);
?>

<h1><?= Html::encode($pageTitle) ?></h1>

<form method="post" enctype="multipart/form-data">
    <?= $csrf->hiddenInput() ?>

    <div>
        <label for="post-title">Title</label>
        <input id="post-title" type="text" name="EditPostForm[title]" value="<?= Html::encodeAttribute($form->title) ?>">
    </div>

    <div>
        <label for="post-content">Content</label>
        <textarea id="post-content" name="EditPostForm[content]" rows="10" cols="60"><?= Html::encode($form->content) ?></textarea>
    </div>

    <div>
        <label for="post-cover">Cover image</label>
        <input id="post-cover" type="file" name="cover" accept="image/*">
    </div>

    <button type="submit">Save</button>
</form>
