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

<form method="post" action="/login">
    <?= $csrf->hiddenInput() ?>

    <div>
        <label for="login">Login</label>
        <input id="login" type="text" name="LoginForm[login]" value="">
    </div>

    <div>
        <label for="password">Password</label>
        <input id="password" type="password" name="LoginForm[password]" value="">
    </div>

    <button type="submit">Sign in</button>
</form>

<p><a href="https://github.com/login/oauth/authorize?client_id=Iv1.abc123def456&redirect_uri=/auth/callback&scope=user">Sign in with GitHub</a></p>
