<?php

declare(strict_types=1);

use App\Web\NotFound\NotFoundHandler;
use App\Web\Middleware\RequestIdMiddleware;
use Yiisoft\Definitions\DynamicReference;
use Yiisoft\Definitions\Reference;
use Yiisoft\ErrorHandler\Middleware\ErrorCatcher;
use Yiisoft\Middleware\Dispatcher\MiddlewareDispatcher;
use Yiisoft\RequestProvider\RequestCatcherMiddleware;
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
                        // 1. Outermost: catch any uncaught Throwable and render an error response
                        ErrorCatcher::class,

                        // 2. Store the current request into RequestProviderInterface for DI services
                        RequestCatcherMiddleware::class,

                        // 3. Assign a request id attribute and echo it back as a response header
                        RequestIdMiddleware::class,

                        // 4. Router matches the route and invokes the action
                        Router::class,
                    ],
                ],
            ]),
            'fallbackHandler' => Reference::to(NotFoundHandler::class),
        ],
    ],
];
