<?php

declare(strict_types=1);

use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Definitions\Reference;
use Yiisoft\Mutex\File\FileMutexFactory;
use Yiisoft\Mutex\MutexFactoryInterface;
use Yiisoft\Queue\Adapter\AdapterInterface;
use Yiisoft\Queue\Db\Adapter as DbQueueAdapter;
use Yiisoft\Queue\DefaultQueue;
use Yiisoft\Queue\Provider\QueueConsumerProviderInterface;
use Yiisoft\Queue\Provider\QueueFactoryProvider;
use Yiisoft\Queue\Provider\QueueProducerProviderInterface;
use Yiisoft\Queue\QueueConsumerInterface;
use Yiisoft\Queue\QueueProducerInterface;

/** @var array $params */

return [
    // queue-db reserves rows through a mutex so concurrent workers never take one message twice.
    MutexFactoryInterface::class => FileMutexFactory::class,
    FileMutexFactory::class => [
        'class' => FileMutexFactory::class,
        '__construct()' => [
            'mutexPath' => dirname(__DIR__, 3) . '/runtime/mutex',
        ],
    ],

    // Serializer and loop are bound by the yiisoft/queue package config; only the
    // connection, mutex factory and channel are application decisions.
    DbQueueAdapter::class => [
        'class' => DbQueueAdapter::class,
        '__construct()' => [
            'db' => Reference::to(ConnectionInterface::class),
            'mutexFactory' => Reference::to(MutexFactoryInterface::class),
            'channel' => DefaultQueue::NAME,
        ],
    ],
    AdapterInterface::class => Reference::to(DbQueueAdapter::class),

    QueueProducerProviderInterface::class => QueueFactoryProvider::class,
    QueueConsumerProviderInterface::class => QueueFactoryProvider::class,
    QueueFactoryProvider::class => [
        '__construct()' => [
            'definitions' => $params['yiisoft/queue']['queues'] ?? [],
        ],
    ],
    QueueProducerInterface::class => static fn (QueueProducerProviderInterface $provider): QueueProducerInterface
        => $provider->getProducer(DefaultQueue::NAME),
    QueueConsumerInterface::class => static fn (QueueConsumerProviderInterface $provider): QueueConsumerInterface
        => $provider->getConsumer(DefaultQueue::NAME),
];
