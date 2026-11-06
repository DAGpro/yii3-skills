<?php

declare(strict_types=1);

use App\Web\Blog\AddCommentAction;
use App\Web\Blog\ShowPostAction;
use Yiisoft\Router\Route\Get;
use Yiisoft\Router\Route\Post;

return [
    new Get('/posts/{id:\d+}', action: ShowPostAction::class),
    new Post('/posts/{id:\d+}/comments', action: AddCommentAction::class),
];
