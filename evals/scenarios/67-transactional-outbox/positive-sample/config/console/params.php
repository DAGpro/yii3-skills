<?php

declare(strict_types=1);

use App\Presentation\Console\Command\OutboxRelayCommand;

return [
    'yiisoft/yii-console' => [
        'commands' => [
            'outbox:relay' => OutboxRelayCommand::class,
        ],
    ],
];
