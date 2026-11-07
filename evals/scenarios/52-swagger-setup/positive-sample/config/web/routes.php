<?php

declare(strict_types=1);

use App\Web\Api\OrderViewAction;
use App\Web\Api\OrdersAction;
use Yiisoft\DataResponse\Middleware\JsonDataResponseMiddleware;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route\Get;
use Yiisoft\Yii\Swagger\Action\SwaggerJson;
use Yiisoft\Yii\Swagger\Action\SwaggerUi;

return [
    new Get('/api/orders', action: OrdersAction::class),
    new Get('/api/orders/{id:\d+}', action: OrderViewAction::class),

    // Swagger docs (guide §4.1): the UI handler points at the JSON route via withJsonUrl,
    // and the JSON route carries JsonDataResponseMiddleware so the DataStream is emitted as JSON.
    (new Group('/docs'))->routes(
        (new Get(''))
            ->action(static fn (SwaggerUi $swaggerUi): SwaggerUi => $swaggerUi->withJsonUrl('/docs/json'))
            ->name('docs.ui'),
        (new Get('/json'))
            ->middleware(JsonDataResponseMiddleware::class)
            ->action(SwaggerJson::class)
            ->name('docs.json'),
    ),
];
