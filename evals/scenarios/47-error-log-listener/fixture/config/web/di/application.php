<?php

declare(strict_types=1);

use Yiisoft\Definitions\DynamicReference;
use Yiisoft\ErrorHandler\Middleware\ErrorCatcher;
use Yiisoft\Middleware\Dispatcher\MiddlewareDispatcher;
use Yiisoft\Router\Middleware\Router;
use Yiisoft\Yii\Http\Application;

/** @var array $params */

return [
    Application::class => [
        '__construct()' => [
            'dispatcher' => DynamicReference::to([
                'class' => MiddlewareDispatcher::class,
                '__construct()' => [
                    'middlewareDefinitions' => [
                        // Outermost: catches every Throwable escaping the chain below.
                        // NOTE: this app has no PSR-14 dispatcher installed, so the
                        // catcher swallows unhandled errors silently (no event, no log).
                        ErrorCatcher::class,

                        // Router matches the route and invokes the action handler
                        Router::class,
                    ],
                ],
            ]),
        ],
    ],
];
