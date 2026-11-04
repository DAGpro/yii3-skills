<?php

declare(strict_types=1);

use Yiisoft\Router\Route\Get;

return [
    (new Get('/site/index'))
        ->action('site/index')
        ->name('site/index'),
];
