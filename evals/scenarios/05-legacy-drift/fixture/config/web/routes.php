<?php

declare(strict_types=1);

use App\Web\Contact\ContactAction;
use Yiisoft\Router\Route\Get;
use Yiisoft\Router\Route\Post;

return [
    new Get('/', action: \App\Web\HomeAction::class),
    new Post('/contact', action: ContactAction::class),
];
