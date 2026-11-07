<?php

declare(strict_types=1);

use App\Application\Queue\SendWelcomeEmailHandler;
use App\Application\Queue\SendWelcomeEmailMessage;
use Yiisoft\Definitions\Reference;
use Yiisoft\Queue\AsyncQueueProducer;
use Yiisoft\Queue\Db\Adapter as DbQueueAdapter;
use Yiisoft\Queue\DefaultQueue;
use Yiisoft\Queue\QueueConsumer;

/** @var array $params */

return [
    'yiisoft/queue' => [
        /**
         * Map of message type to typed message class - used by the serializer
         * to reconstruct SendWelcomeEmailMessage instead of a GenericMessage.
         */
        'messages' => [
            SendWelcomeEmailMessage::TYPE => SendWelcomeEmailMessage::class,
        ],

        /**
         * Map of message type to handler resolved lazily by the worker.
         */
        'handlers' => [
            SendWelcomeEmailMessage::TYPE => SendWelcomeEmailHandler::class,
        ],

        /**
         * Broker roles: the default queue channel over the queue-db adapter (pre-wired).
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
