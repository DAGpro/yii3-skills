<?php

declare(strict_types=1);

use App\Infrastructure\Error\Listener\LogApplicationErrorListener;
use Yiisoft\ErrorHandler\Event\ApplicationError;

return [
    ApplicationError::class => [
        LogApplicationErrorListener::class,
    ],
];
