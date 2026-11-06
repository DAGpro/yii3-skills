<?php

declare(strict_types=1);

use App\Web\Blog\PostListAction;
use App\Web\Blog\ShowPostAction;
use Yiisoft\Router\Route\Get;

return [
    new Get('/posts/{id:\d+}', action: ShowPostAction::class),
    new Get('/posts', action: PostListAction::class),
];
