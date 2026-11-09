<?php

declare(strict_types=1);

use Yiisoft\Yii\Bulma\ProgressBar;
use Yiisoft\Yii\Bulma\Tabs;

?>

<div class="container py-4">
    <?= ProgressBar::widget()
        ->value(80)
        ->color(ProgressBar::COLOR_SUCCESS) ?>

    <?= Tabs::widget()
        ->style(Tabs::STYLE_BOX)
        ->items([
            ['label' => 'Dashboard', 'active' => true],
            ['label' => 'Settings', 'url' => '/settings'],
        ]) ?>
</div>
