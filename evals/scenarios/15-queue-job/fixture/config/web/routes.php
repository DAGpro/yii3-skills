<?php

declare(strict_types=1);

use App\Web\Blog\RequestDigestAction;
use Yiisoft\Router\Route\Post;

return [
    new Post('/digest', action: RequestDigestAction::class),
];
