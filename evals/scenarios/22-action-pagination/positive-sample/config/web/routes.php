<?php

declare(strict_types=1);

use App\Web\Blog\ListPostsAction;
use App\Web\Blog\ShowPostAction;
use Yiisoft\Router\Route\Get;

return [
    new Get('/posts/{id:\d+}', action: ShowPostAction::class),
    new Get('/posts', action: ListPostsAction::class),
];
