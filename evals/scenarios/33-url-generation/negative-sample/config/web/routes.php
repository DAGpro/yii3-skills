<?php

declare(strict_types=1);

use App\Web\Blog\PostListAction;
use App\Web\Blog\ShowPostAction;
use Yiisoft\Router\Route\Get;
use Yiisoft\Router\Route\Post;

return [
    new Get('/posts', name: 'post/index', action: PostListAction::class),
    new Get('/posts/{id:\d+}', name: 'post/view', action: ShowPostAction::class),
    new Post('/posts/{id:\d+}/edit', name: 'post/edit', action: ShowPostAction::class),
];
