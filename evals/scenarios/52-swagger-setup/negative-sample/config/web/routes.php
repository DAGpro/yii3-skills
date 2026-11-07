<?php

declare(strict_types=1);

use App\Web\Api\OrderViewAction;
use App\Web\Api\OrdersAction;
use App\Web\Docs\DocsAction;
use Yiisoft\Router\Route\Get;

return [
    new Get('/api/orders', action: OrdersAction::class),
    new Get('/api/orders/{id:\d+}', action: OrderViewAction::class),

    // Swagger docs: serve the OpenAPI spec we keep in the repo.
    new Get('/docs', action: DocsAction::class),
];
