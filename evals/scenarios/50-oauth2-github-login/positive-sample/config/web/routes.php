<?php

declare(strict_types=1);

use App\Web\Auth\LoginFormAction;
use App\Web\Dashboard\DashboardAction;
use Yiisoft\Http\Method;
use Yiisoft\Router\Route;
use Yiisoft\Router\Route\Get;
use Yiisoft\Yii\AuthClient\AuthAction;

return [
    new Get('/login', action: LoginFormAction::class),
    new Get('/dashboard', action: DashboardAction::class),

    Route::methods([Method::GET, Method::POST], '/auth/{authclient}')
        ->action(AuthAction::class)
        ->name('auth/auth'),
];
