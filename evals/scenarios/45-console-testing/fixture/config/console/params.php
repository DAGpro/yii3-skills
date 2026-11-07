<?php

declare(strict_types=1);

use App\Console\PurgeCacheCommand;

return [
    'yiisoft/yii-console' => [
        'commands' => [
            'cache:purge' => PurgeCacheCommand::class,
        ],
    ],
];
