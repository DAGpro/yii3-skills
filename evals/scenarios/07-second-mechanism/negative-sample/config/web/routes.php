<?php

declare(strict_types=1);

use App\Web\Blog\ShowPostAction;
use App\Web\Blog\TagListAction;
use Yiisoft\Router\Route\Get;

return [
    new Get('/posts/{id:\d+}', action: ShowPostAction::class),
    new Get('/tags', action: TagListAction::class),
];
