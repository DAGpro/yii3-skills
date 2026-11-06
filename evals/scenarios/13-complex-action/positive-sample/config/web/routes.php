<?php

declare(strict_types=1);

use App\Web\Blog\SaveSettingsAction;
use App\Web\Blog\ShowPostAction;
use Yiisoft\Router\Route\Post;
use Yiisoft\Router\Route\Get;

return [
    new Get('/posts/{id:\d+}', action: ShowPostAction::class),
    new Post('/settings', action: SaveSettingsAction::class),
];
