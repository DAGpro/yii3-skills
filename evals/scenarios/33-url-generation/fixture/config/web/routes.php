<?php

declare(strict_types=1);

use App\Web\Blog\PostListAction;
use App\Web\Blog\ShowPostAction;
use Yiisoft\Router\Route\Get;
use Yiisoft\Router\Route\Post;

return [
    new Get('/posts', action: PostListAction::class),
    new Get('/posts/{id:\d+}', action: ShowPostAction::class),
    new Post('/posts/{id:\d+}/edit', action: ShowPostAction::class),
];
