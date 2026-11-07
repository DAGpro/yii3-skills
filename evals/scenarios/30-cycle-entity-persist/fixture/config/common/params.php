<?php

declare(strict_types=1);

use Cycle\Database\Config\SQLite\FileConnectionConfig;
use Cycle\Database\Config\SQLiteDriverConfig;

/** @var array $params */

return [
    'yiisoft/yii-cycle' => [
        // DBAL: connections and the default database (guide: Cycle ORM §4.1).
        'dbal' => [
            'default' => 'default',
            'aliases' => [],
            'databases' => [
                'default' => ['connection' => 'sqlite'],
            ],
            'connections' => [
                'sqlite' => new SQLiteDriverConfig(
                    connection: new FileConnectionConfig(
                        database: '@runtime/database.sqlite',
                    ),
                    queryCache: true,
                ),
            ],
        ],

        // Directories scanned for attributed entities.
        'entity-paths' => [
            '@src/Blog/Domain',
        ],
    ],
];
