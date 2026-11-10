<?php

declare(strict_types=1);

use App\Application\Order\OrderPlacedMessageHandler;
use App\Application\Order\OutboxRelayService;
use App\Application\Order\PlaceOrderUseCase;
use App\Domain\Order\EventRecorder;
use App\Domain\Order\OrderPlacedEvent;
use App\Domain\Order\OrderRepositoryInterface;
use App\Domain\Order\OutboxRepositoryInterface;
use App\Infrastructure\Persistence\DbOrderRepository;
use App\Infrastructure\Persistence\DbOutboxRepository;
use App\Presentation\Http\CreateOrderAction;
use HttpSoft\Message\ResponseFactory;
use HttpSoft\Message\ServerRequestFactory;
use HttpSoft\Message\StreamFactory;
use Psr\EventDispatcher\EventDispatcherInterface;
use Psr\EventDispatcher\ListenerProviderInterface;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ServerRequestFactoryInterface;
use Psr\Http\Message\StreamFactoryInterface;
use Psr\Log\LoggerInterface;
use Psr\Log\NullLogger;
use Yiisoft\DataResponse\Middleware\JsonDataResponseMiddleware;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactory;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Db\Cache\SchemaCache;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Migration\Informer\MigrationInformerInterface;
use Yiisoft\Db\Migration\Informer\NullMigrationInformer;
use Yiisoft\Db\Sqlite\Connection as SqliteConnection;
use Yiisoft\Db\Sqlite\Driver as SqliteDriver;
use Yiisoft\Db\Sqlite\Dsn;
use Yiisoft\Definitions\Reference;
use Yiisoft\EventDispatcher\Dispatcher\Dispatcher;
use Yiisoft\EventDispatcher\Provider\ListenerCollection;
use Yiisoft\EventDispatcher\Provider\Provider;
use Yiisoft\Hydrator\AttributeHandling\ResolverFactory\AttributeResolverFactoryInterface;
use Yiisoft\Hydrator\AttributeHandling\ResolverFactory\ContainerAttributeResolverFactory;
use Yiisoft\Hydrator\Hydrator;
use Yiisoft\Hydrator\HydratorInterface;
use Yiisoft\Hydrator\ObjectFactory\ContainerObjectFactory;
use Yiisoft\Hydrator\ObjectFactory\ObjectFactoryInterface;
use Yiisoft\Hydrator\Validator\Attribute\ValidateResolver;
use Yiisoft\Hydrator\Validator\ValidatingHydrator;
use Yiisoft\Middleware\Dispatcher\MiddlewareDispatcher;
use Yiisoft\Middleware\Dispatcher\MiddlewareFactory;
use Yiisoft\Mutex\File\FileMutexFactory;
use Yiisoft\Mutex\MutexFactoryInterface;
use Yiisoft\Queue\Message\Handler\HandlerResolver;
use Yiisoft\Queue\Middleware\Consume\ConsumeMiddlewareDispatcher;
use Yiisoft\Queue\Middleware\Consume\ConsumeMiddlewareFactory;
use Yiisoft\Queue\Middleware\Consume\ConsumeMiddlewareFactoryInterface;
use Yiisoft\Queue\Middleware\FailureHandling\FailureMiddlewareDispatcher;
use Yiisoft\Queue\Middleware\FailureHandling\FailureMiddlewareFactory;
use Yiisoft\Queue\Middleware\FailureHandling\FailureMiddlewareFactoryInterface;
use Yiisoft\Queue\Middleware\Push\PushMiddlewareConfig;
use Yiisoft\Queue\Middleware\Push\PushMiddlewareFactory;
use Yiisoft\Queue\Middleware\Push\PushMiddlewareFactoryInterface;
use Yiisoft\Queue\QueueProducerInterface;
use Yiisoft\Queue\SyncQueueProducer;
use Yiisoft\Queue\Worker\Worker as QueueWorker;
use Yiisoft\Queue\Worker\WorkerInterface;
use Yiisoft\Router\CurrentRoute;
use Yiisoft\Router\FastRoute\UrlMatcher;
use Yiisoft\Router\Middleware\Router;
use Yiisoft\Router\Route\Post;
use Yiisoft\Router\RouteCollection;
use Yiisoft\Router\RouteCollectionInterface;
use Yiisoft\Router\RouteCollector;
use Yiisoft\Router\RouteCollectorInterface;
use Yiisoft\Router\UrlMatcherInterface;
use Yiisoft\Validator\Validator;
use Yiisoft\Validator\ValidatorInterface;

return [
    LoggerInterface::class => NullLogger::class,

    ResponseFactoryInterface::class => ResponseFactory::class,
    StreamFactoryInterface::class => StreamFactory::class,
    ServerRequestFactoryInterface::class => ServerRequestFactory::class,
    DataResponseFactoryInterface::class => DataResponseFactory::class,
    JsonDataResponseMiddleware::class => JsonDataResponseMiddleware::class,

    EventRecorder::class => [
        'class' => EventRecorder::class,
        'reset' => function (): void {
            $this->reset();
        },
    ],

    ListenerCollection::class => static function (EventRecorder $recorder): ListenerCollection {
        return (new ListenerCollection())->add(
            static function (OrderPlacedEvent $event) use ($recorder): void {
                $recorder->record($event);
            },
        );
    },
    ListenerProviderInterface::class => Provider::class,
    EventDispatcherInterface::class => Dispatcher::class,

    ConnectionInterface::class => static function (): ConnectionInterface {
        return new SqliteConnection(
            new SqliteDriver(new Dsn('sqlite', 'memory')),
            new SchemaCache(),
        );
    },
    MigrationInformerInterface::class => NullMigrationInformer::class,

    OrderRepositoryInterface::class => DbOrderRepository::class,
    OutboxRepositoryInterface::class => DbOutboxRepository::class,
    PlaceOrderUseCase::class => PlaceOrderUseCase::class,
    OutboxRelayService::class => OutboxRelayService::class,

    ValidatorInterface::class => Validator::class,
    ValidateResolver::class => ValidateResolver::class,
    AttributeResolverFactoryInterface::class => ContainerAttributeResolverFactory::class,
    ObjectFactoryInterface::class => ContainerObjectFactory::class,
    Hydrator::class => [
        'class' => Hydrator::class,
        '__construct()' => [
            'attributeResolverFactory' => Reference::to(AttributeResolverFactoryInterface::class),
            'objectFactory' => Reference::to(ObjectFactoryInterface::class),
        ],
    ],
    HydratorInterface::class => [
        'class' => ValidatingHydrator::class,
        '__construct()' => [
            'hydrator' => Reference::to(Hydrator::class),
        ],
    ],

    MutexFactoryInterface::class => [
        'class' => FileMutexFactory::class,
        '__construct()' => [
            'mutexPath' => sys_get_temp_dir() . '/yii3-runtime-harness-mutex',
        ],
    ],

    RouteCollectorInterface::class => static function (): RouteCollectorInterface {
        return (new RouteCollector())->addRoute(
            new Post('/orders', name: 'orders.create', action: CreateOrderAction::class),
        );
    },
    RouteCollectionInterface::class => RouteCollection::class,
    UrlMatcherInterface::class => UrlMatcher::class,
    CurrentRoute::class => [
        'reset' => function (): void {
            $this->route = null;
            $this->uri = null;
            $this->arguments = [];
        },
    ],
    MiddlewareFactory::class => MiddlewareFactory::class,
    MiddlewareDispatcher::class => [
        'class' => MiddlewareDispatcher::class,
        '__construct()' => [
            'middlewareDefinitions' => [
                JsonDataResponseMiddleware::class,
                Router::class,
            ],
        ],
    ],

    PushMiddlewareFactoryInterface::class => PushMiddlewareFactory::class,
    ConsumeMiddlewareFactoryInterface::class => ConsumeMiddlewareFactory::class,
    FailureMiddlewareFactoryInterface::class => FailureMiddlewareFactory::class,
    PushMiddlewareConfig::class => PushMiddlewareConfig::class,
    ConsumeMiddlewareDispatcher::class => ConsumeMiddlewareDispatcher::class,
    FailureMiddlewareDispatcher::class => [
        'class' => FailureMiddlewareDispatcher::class,
        '__construct()' => [
            'middlewareDefinitions' => [],
        ],
    ],
    HandlerResolver::class => [
        'class' => HandlerResolver::class,
        '__construct()' => [
            'handlers' => [
                PlaceOrderUseCase::MESSAGE_TYPE_ORDER_PLACED => OrderPlacedMessageHandler::class,
            ],
        ],
    ],
    WorkerInterface::class => QueueWorker::class,
    QueueProducerInterface::class => SyncQueueProducer::class,
];
