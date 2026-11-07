<?php

declare(strict_types=1);

use App\User\Console\ListUsersCommand;

return [
    'yiisoft/yii-console' => [
        'commands' => [
            'user:list' => ListUsersCommand::class,
        ],
    ],
];
