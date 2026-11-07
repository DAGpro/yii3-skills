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

<p>We will get back to you soon.</p>

<form method="post">
    <label for="contact-email">Email address</label>
    <input id="contact-email" type="text" name="email">

    <button type="submit">Send message</button>
</form>
