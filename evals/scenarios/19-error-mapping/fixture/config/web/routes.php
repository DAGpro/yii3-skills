<?php

declare(strict_types=1);

use App\Web\Api\SubscribeAction;
use Yiisoft\Router\Route\Post;

return [
    new Post('/api/subscribe/{email}', action: SubscribeAction::class),
];
