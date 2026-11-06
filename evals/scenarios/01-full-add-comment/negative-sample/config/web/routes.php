<?php

use App\Web\Blog\AddCommentAction;
use Yiisoft\Router\Route;

return [
    Route::post('/posts/{id}/comments', AddCommentAction::class),
];
