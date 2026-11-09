<?php

declare(strict_types=1);

use App\Order\CancelOrderAction;
use Yiisoft\Router\Route;

return [
    Route::get('/api/health')->action([App\HealthAction::class, 'index']),
    Route::post('/api/orders/{id}/cancel')->action(CancelOrderAction::class),
];
