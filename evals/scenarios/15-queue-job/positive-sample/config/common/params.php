<?php

declare(strict_types=1);

use App\Blog\Application\Queue\SendDigestHandler;
use App\Blog\Application\Queue\SendDigestMessage;
use Yiisoft\Definitions\Reference;
use Yiisoft\Queue\AsyncQueueProducer;
use Yiisoft\Queue\DefaultQueue;
use Yiisoft\Queue\Db\Adapter as DbQueueAdapter;
use Yiisoft\Queue\QueueConsumer;

return [
    'yiisoft/queue' => [
        /**
         * Map of message type to typed message class - used by the serializer
         * to reconstruct SendDigestMessage instead of a GenericMessage.
         */
        'messages' => [
            SendDigestMessage::TYPE => SendDigestMessage::class,
        ],

        /**
         * Map of message type to handler resolved lazily by the worker.
         */
        'handlers' => [
            SendDigestMessage::TYPE => SendDigestHandler::class,
        ],

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
