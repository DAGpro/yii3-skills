<?php

declare(strict_types=1);

use Yiisoft\Csrf\CsrfTokenMiddleware;
use Yiisoft\Definitions\DynamicReference;
use Yiisoft\Definitions\Reference;
use Yiisoft\ErrorHandler\Middleware\ErrorCatcher;
use Yiisoft\Middleware\Dispatcher\MiddlewareDispatcher;
use Yiisoft\RequestProvider\RequestCatcherMiddleware;
use Yiisoft\Router\Middleware\Router;
use Yiisoft\Session\SessionMiddleware;
use Yiisoft\Yii\Http\Application;

/** @var array $params */

return [
    Application::class => [
        '__construct()' => [
            'dispatcher' => DynamicReference::to([
                'class' => MiddlewareDispatcher::class,
                '__construct()' => [
                    'middlewareDefinitions' => [
                        // 1. Outermost: catch any uncaught Throwable and render an error response
                        ErrorCatcher::class,

                        // 2. Session lifecycle management (start/commit/discard) - must precede CSRF:
                        //    the synchronizer CSRF token lives in the session
                        SessionMiddleware::class,

                        // 3. CSRF protection for mutating requests (POST form submission)
                        CsrfTokenMiddleware::class,

                        // 4. Store the current request into RequestProviderInterface for DI services
                        RequestCatcherMiddleware::class,

                        // 5. Router matches the route and invokes the action
                        Router::class,
                    ],
                ],
            ]),
        ],
    ],
];
