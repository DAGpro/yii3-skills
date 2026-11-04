<?php

declare(strict_types=1);

use App\Presentation\CreatePostAction;
use App\Presentation\ViewPostAction;
use Yiisoft\Request\Body\RequestBodyParser;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route\Get;
use Yiisoft\Router\Route\Post;

return [
    (new Group('/api/posts'))
        ->routes(
            (new Post(''))
                ->action(CreatePostAction::class)
                ->middleware(RequestBodyParser::class)
                ->name('api/post/create'),
            (new Get('/{id:\d+}'))
                ->action(ViewPostAction::class)
                ->name('api/post/view'),
        ),
];
