<?php

declare(strict_types=1);

use App\Presentation\ViewPostAction;
use Yiisoft\Router\Route\Get;

return [
    (new Get('/posts'))
        ->action(ViewPostAction::class)
        ->name('post/view'),
    (new Get('/posts/archive'))
        ->action(ViewPostAction::class)
        ->name('post/view'),
];
