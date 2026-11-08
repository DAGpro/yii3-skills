<?php

declare(strict_types=1);

use App\Newsletter\Presentation\SubscribeAction;
use Yiisoft\Router\Route\Post;

return [
    new Post('/newsletter/subscribe', SubscribeAction::class),
];

