<?php

declare(strict_types=1);

use Psr\Log\LoggerInterface;
use Yiisoft\Definitions\ReferencesArray;
use Yiisoft\Log\Logger;
use Yiisoft\Log\Target\File\FileTarget;

/**
 * yiisoft/log ships no DI config and nothing binds LoggerInterface for you -
 * the application owns this binding. FileTarget itself is registered as a
 * service by yiisoft/log-target-file's shipped config/di.php; the log file
 * path comes from the 'yiisoft/log-target-file' params (config/common/params.php).
 */
return [
    LoggerInterface::class => [
        'class' => Logger::class,
        '__construct()' => [
            'targets' => ReferencesArray::from([
                FileTarget::class,
            ]),
        ],
    ],
];
