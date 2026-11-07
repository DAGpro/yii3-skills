<?php

declare(strict_types=1);

use App\Web\Blog\CreateTagAction;
use Yiisoft\Router\Route\Post;

return [
    new Post('/tags', action: CreateTagAction::class),
];
