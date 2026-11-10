<?php

declare(strict_types=1);

use App\Application\Order\Queue\OrderPlacedNotificationHandler;

return [
    'yiisoft/db-migration' => [
        'newMigrationNamespace' => 'App\\Migration',
        'sourceNamespaces' => ['App\\Migration'],
    ],
    'yiisoft/queue' => [
        'handlers' => [
            'order.placed' => OrderPlacedNotificationHandler::class,
        ],
    ],
];
