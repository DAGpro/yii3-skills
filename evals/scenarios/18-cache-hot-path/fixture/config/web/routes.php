<?php

declare(strict_types=1);

use App\Web\Blog\LatestPostsAction;
use Yiisoft\Router\Route\Get;

return [
    new Get('/posts/latest', action: LatestPostsAction::class),
];
