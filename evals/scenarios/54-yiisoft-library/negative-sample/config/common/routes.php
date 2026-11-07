<?php

use Yiisoft\Router\Route\Get;

return [
    (new Get('/slugify'))->action(App\Web\SlugifyAction::class)->name('slugify'),
];
