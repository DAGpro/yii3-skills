<?php

declare(strict_types=1);

use App\Web\Blog\PublishPostAction;
use Yiisoft\Router\Route\Post;

return [
    new Post('/posts/{id:\d+}/publish', action: PublishPostAction::class),
];
