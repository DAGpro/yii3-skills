<?php

declare(strict_types=1);

use App\Web\Blog\PostListAction;
use App\Web\Blog\ShowPostAction;
use Yiisoft\Router\Route;

return [
    Route::get('/posts/{id:\d+}')->action(ShowPostAction::class),
    Route::get('/posts')->action(PostListAction::class),
];
