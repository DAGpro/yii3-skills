<?php

declare(strict_types=1);

use App\Presentation\Http\HealthAction;
use Yiisoft\Router\Route;

return [
    Route::get('/health')->action(HealthAction::class)->name('health'),
];
