<?php

declare(strict_types=1);

use App\Presentation\ViewPostAction;
use Yiisoft\Router\Route\Get;

return [
    (new Get('/post/<id:\d+>'))
        ->action(ViewPostAction::class)
        ->name('post/view'),
];
