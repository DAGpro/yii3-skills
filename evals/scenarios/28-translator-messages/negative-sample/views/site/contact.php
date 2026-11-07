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

<h1>Свяжитесь с нами</h1>

<p>Мы ответим вам в ближайшее время.</p>

<form method="post">
    <label for="contact-email">Адрес электронной почты</label>
    <input id="contact-email" type="text" name="email">

    <button type="submit">Отправить сообщение</button>
</form>
