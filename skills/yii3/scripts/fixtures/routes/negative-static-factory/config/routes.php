<?php

declare(strict_types=1);

use Yiisoft\Router\Group;
use Yiisoft\Router\Route;

return [
    (new Group('/api'))
        ->routes(
            Route::get('/posts')->name('post/index'),
            Route::post('/posts')->name('post/create'),
            Group::create('/users')->name('users/'),
        ),
];
