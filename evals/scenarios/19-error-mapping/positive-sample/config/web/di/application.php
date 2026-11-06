<?php

declare(strict_types=1);

use Yiisoft\Definitions\DynamicReference;
use Yiisoft\ErrorHandler\Middleware\ErrorCatcher;
use Yiisoft\ErrorHandler\Middleware\ExceptionResponder;
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
                        // 1. Outermost: catches every Throwable escaping the chain below
                        ErrorCatcher::class,

                        // 2. Maps anticipated domain exceptions to HTTP responses; unmapped
                        //    ones are re-thrown and still reach ErrorCatcher
                        ExceptionResponder::class,

                        // 3. Router matches the route and invokes the action handler
                        Router::class,
                    ],
                ],
            ]),
        ],
    ],
];
