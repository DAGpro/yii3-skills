<?php

declare(strict_types=1);

return [
    'yiisoft/db-migration' => [
        // Target namespace for newly generated migrations
        'newMigrationNamespace' => 'App\\Migration',

        // Path MUST be left empty when namespaced migrations are used
        'newMigrationPath' => '',

        // Application namespaces scanned for migrations
        'sourceNamespaces' => [
            'App\\Migration',
        ],
    ],
];
