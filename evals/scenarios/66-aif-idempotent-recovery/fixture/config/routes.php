<?php

declare(strict_types=1);

use Yiisoft\Router\Route;

return [
    Route::get('/api/health')->action([App\HealthAction::class, 'index']),
];
