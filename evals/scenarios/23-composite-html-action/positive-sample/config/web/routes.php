<?php

declare(strict_types=1);

use App\Web\Blog\EditPostAction;
use App\Web\Blog\ShowPostAction;
use Yiisoft\Router\Route\Get;
use Yiisoft\Router\Route\Post;

return [
    new Get('/posts/{id:\d+}', action: ShowPostAction::class),
    new Get('/posts/{id:\d+}/edit', name: 'post/edit', action: EditPostAction::class),
    new Post('/posts/{id:\d+}/edit', action: EditPostAction::class),
];
