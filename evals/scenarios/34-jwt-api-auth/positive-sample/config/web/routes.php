<?php

declare(strict_types=1);

use App\Web\Api\OrderViewAction;
use App\Web\Api\OrdersAction;
use Yiisoft\Auth\Middleware\Authentication;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route\Get;

return [
    // Authentication middleware verifies the Bearer JWT (JwtMethod authenticator) before
    // any /api route runs; unauthenticated calls are rejected with a 401 challenge.
    (new Group('/api'))
        ->middleware(Authentication::class)
        ->routes(
            new Get('/orders', action: OrdersAction::class),
            new Get('/orders/{id:\d+}', action: OrderViewAction::class),
        ),
];
