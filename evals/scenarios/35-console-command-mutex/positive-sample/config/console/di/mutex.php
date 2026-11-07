<?php

declare(strict_types=1);

use Yiisoft\Aliases\Aliases;
use Yiisoft\Mutex\File\FileMutexFactory;
use Yiisoft\Mutex\MutexFactoryInterface;
use Yiisoft\Mutex\Synchronizer;

/** @var array $params */

return [
    MutexFactoryInterface::class => [
        'class' => FileMutexFactory::class,
        '__construct()' => [
            // Parameter is strictly named 'mutexPath' (not 'dirPath')
            'mutexPath' => static fn (Aliases $aliases) => $aliases->get('@runtime/mutex'),
            'directoryMode' => 0775,
            'fileMode' => null,
        ],
    ],
    Synchronizer::class => Synchronizer::class,
];
