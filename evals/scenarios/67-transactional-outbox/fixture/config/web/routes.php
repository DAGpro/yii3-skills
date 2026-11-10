<?php

declare(strict_types=1);

use App\Presentation\Http\Order\CreateOrderAction;
use Yiisoft\Router\Route;

return [
    Route::post('/api/orders')->action(CreateOrderAction::class)->name('orders/create'),
];
