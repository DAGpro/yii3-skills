<?php

declare(strict_types=1);

use App\Web\Auth\GithubCallbackAction;
use App\Web\Auth\LoginFormAction;
use App\Web\Dashboard\DashboardAction;
use Yiisoft\Router\Route\Get;

return [
    new Get('/login', action: LoginFormAction::class),
    new Get('/dashboard', action: DashboardAction::class),
    new Get('/auth/callback', action: GithubCallbackAction::class),
];
