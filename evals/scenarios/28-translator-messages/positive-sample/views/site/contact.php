<?php

declare(strict_types=1);

use Yiisoft\Html\Html;
use Yiisoft\Translator\TranslatorInterface;
use Yiisoft\View\WebView;

/**
 * @var WebView $this
 * @var string $pageTitle
 * @var TranslatorInterface $translator
 */

$this->setTitle($pageTitle);
?>

<h1><?= Html::encode($pageTitle) ?></h1>

<p><?= Html::encode($translator->translate('We will get back to you soon.')) ?></p>

<form method="post">
    <label for="contact-email"><?= Html::encode($translator->translate('Email address')) ?></label>
    <input id="contact-email" type="text" name="email">

    <button type="submit"><?= Html::encode($translator->translate('Send message')) ?></button>
</form>
