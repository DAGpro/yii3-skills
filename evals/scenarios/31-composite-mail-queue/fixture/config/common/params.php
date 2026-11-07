<?php

declare(strict_types=1);

use Yiisoft\Definitions\Reference;
use Yiisoft\Queue\AsyncQueueProducer;
use Yiisoft\Queue\Db\Adapter as DbQueueAdapter;
use Yiisoft\Queue\DefaultQueue;
use Yiisoft\Queue\QueueConsumer;

/** @var array $params */

return [
    'yiisoft/queue' => [
        /**
         * Broker roles: the default queue channel over the queue-db adapter.
         */
        'queues' => [
            DefaultQueue::NAME => [
                'producer' => [
                    'class' => AsyncQueueProducer::class,
                    '__construct()' => [
                        'adapter' => Reference::to(DbQueueAdapter::class),
                    ],
                ],
                'consumer' => [
                    'class' => QueueConsumer::class,
                    '__construct()' => [
                        'adapter' => Reference::to(DbQueueAdapter::class),
                    ],
                ],
            ],
        ],
    ],
];
