<?php

declare(strict_types=1);

use Yiisoft\Bootstrap5\Alert;
use Yiisoft\Bootstrap5\AlertVariant;
use Yiisoft\Bootstrap5\Nav;
use Yiisoft\Bootstrap5\NavLink;
use Yiisoft\Bootstrap5\NavStyle;

?>

<div class="container py-4">
    <?= Alert::widget()
        ->body('System update in progress.', false)
        ->dismissable(true)
        ->variant(AlertVariant::WARNING) ?>

    <?= Nav::widget()
        ->styles(NavStyle::TABS)
        ->fade(true)
        ->items(
            NavLink::tab('Home', '<p>Welcome home!</p>', active: true, encodeContent: false),
            NavLink::tab('Profile', '<p>User profile details.</p>', encodeContent: false),
        ) ?>
</div>
