<?php

declare(strict_types=1);

use App\Web\Contact\ContactAction;
use App\Web\Subscribe\SubscribeAction;
use Yiisoft\Router\Route\Get;
use Yiisoft\Router\Route\Post;

return [
    new Get('/', action: \App\Web\HomeAction::class),
    new Post('/contact', action: ContactAction::class),
    new Post('/subscribe', action: SubscribeAction::class),
];
