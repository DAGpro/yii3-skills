<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Application\Order\OutboxRelayService;
use App\Application\Order\PlaceOrderCommand;
use App\Application\Order\PlaceOrderUseCase;
use App\Domain\Order\EventRecorder;
use App\Domain\Order\OrderPlacedEvent;
use App\Domain\Order\OrderRepositoryInterface;
use App\Domain\Order\OutboxRepositoryInterface;
use App\Infrastructure\Migration\M250115120000CreateOrdersTable;
use App\Infrastructure\Migration\M250115120500CreateOutboxMessagesTable;
use App\Infrastructure\Migration\M250115121000CreateProcessedMessagesTable;
use PHPUnit\Framework\TestCase;
use Psr\EventDispatcher\EventDispatcherInterface;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestFactoryInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use RuntimeException;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Migration\Informer\NullMigrationInformer;
use Yiisoft\Db\Migration\Migrator;
use Yiisoft\Di\Container;
use Yiisoft\Di\ContainerConfig;
use Yiisoft\Di\StateResetter;
use Yiisoft\Http\Method;
use Yiisoft\Http\Status;
use Yiisoft\Hydrator\HydratorInterface;
use Yiisoft\Middleware\Dispatcher\MiddlewareDispatcher;
use Yiisoft\Mutex\File\FileMutexFactory;
use Yiisoft\Mutex\MutexFactoryInterface;
use Yiisoft\Queue\Message\GenericMessage;
use Yiisoft\Queue\QueueProducerInterface;
use Yiisoft\Router\CurrentRoute;

use const JSON_THROW_ON_ERROR;

final class RuntimeStackTest extends TestCase
{
    private string $mutexDir = '';

    protected function tearDown(): void
    {
        if ($this->mutexDir !== '' && is_dir($this->mutexDir)) {
            $files = glob($this->mutexDir . '/*');
            if (is_array($files)) {
                foreach ($files as $file) {
                    if (is_file($file)) {
                        @unlink($file);
                    }
                }
            }
            @rmdir($this->mutexDir);
        }
    }

    private function createContainer(): Container
    {
        $this->mutexDir = sys_get_temp_dir() . '/yii3-harness-mutex-' . bin2hex(random_bytes(4));
        /** @var array<string, mixed> $definitions */
        $definitions = require __DIR__ . '/../../config/di.php';
        $definitions[MutexFactoryInterface::class] = [
            'class' => FileMutexFactory::class,
            '__construct()' => [
                'mutexPath' => $this->mutexDir,
            ],
        ];

        return new Container(
            ContainerConfig::create()
                ->withDefinitions($definitions)
                ->withValidate(true),
        );
    }

    private function runMigrations(Container $container): Migrator
    {
        $migrator = new Migrator(
            $container->get(ConnectionInterface::class),
            new NullMigrationInformer(),
        );
        $migrator->up(new M250115120000CreateOrdersTable());
        $migrator->up(new M250115120500CreateOutboxMessagesTable());
        $migrator->up(new M250115121000CreateProcessedMessagesTable());
        return $migrator;
    }

    private function createFallbackHandler(Container $container): RequestHandlerInterface
    {
        $responseFactory = $container->get(ResponseFactoryInterface::class);
        return new class ($responseFactory) implements RequestHandlerInterface {
            public function __construct(private readonly ResponseFactoryInterface $responseFactory) {}

            public function handle(ServerRequestInterface $request): ResponseInterface
            {
                return $this->responseFactory->createResponse(Status::NOT_FOUND);
            }
        };
    }

    public function testDiContainerCompilesAndResolvesCoreServices(): void
    {
        $container = $this->createContainer();

        self::assertInstanceOf(MiddlewareDispatcher::class, $container->get(MiddlewareDispatcher::class));
        self::assertInstanceOf(ConnectionInterface::class, $container->get(ConnectionInterface::class));
        self::assertInstanceOf(PlaceOrderUseCase::class, $container->get(PlaceOrderUseCase::class));
        self::assertInstanceOf(OutboxRelayService::class, $container->get(OutboxRelayService::class));
        self::assertInstanceOf(QueueProducerInterface::class, $container->get(QueueProducerInterface::class));
        self::assertInstanceOf(HydratorInterface::class, $container->get(HydratorInterface::class));
        self::assertInstanceOf(EventDispatcherInterface::class, $container->get(EventDispatcherInterface::class));
        self::assertInstanceOf(MutexFactoryInterface::class, $container->get(MutexFactoryInterface::class));
        self::assertInstanceOf(StateResetter::class, $container->get(StateResetter::class));
    }

    public function testDatabaseMigrationsApplyAndRevertSchema(): void
    {
        $container = $this->createContainer();
        $migrator = $this->runMigrations($container);
        $db = $container->get(ConnectionInterface::class);

        self::assertNotNull($db->getTableSchema('orders', true));
        self::assertNotNull($db->getTableSchema('outbox_messages', true));
        self::assertNotNull($db->getTableSchema('processed_messages', true));

        $migrator->down(new M250115121000CreateProcessedMessagesTable());
        self::assertNull($db->getTableSchema('processed_messages', true));
    }

    public function testHttpRouteValidationRejectsInvalidInputWith422And404Fallback(): void
    {
        $container = $this->createContainer();
        $this->runMigrations($container);

        $dispatcher = $container->get(MiddlewareDispatcher::class);
        $requestFactory = $container->get(ServerRequestFactoryInterface::class);
        $fallback = $this->createFallbackHandler($container);

        $notFoundResponse = $dispatcher->dispatch(
            $requestFactory->createServerRequest(Method::GET, '/unknown-endpoint'),
            $fallback,
        );
        self::assertSame(Status::NOT_FOUND, $notFoundResponse->getStatusCode());

        $invalidRequest = $requestFactory
            ->createServerRequest(Method::POST, '/orders')
            ->withParsedBody([
                'customerEmail' => 'x',
                'amountCents' => 0,
            ]);

        $response = $dispatcher->dispatch($invalidRequest, $fallback);
        self::assertSame(Status::UNPROCESSABLE_ENTITY, $response->getStatusCode());
        self::assertStringContainsString('application/json', $response->getHeaderLine('Content-Type'));

        /** @var array<string, mixed> $decoded */
        $decoded = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        self::assertArrayHasKey('errors', $decoded);
        self::assertArrayHasKey('customerEmail', $decoded['errors']);
        self::assertArrayHasKey('amountCents', $decoded['errors']);

        self::assertSame(0, $container->get(OrderRepositoryInterface::class)->countAll());
        self::assertSame(0, $container->get(OutboxRepositoryInterface::class)->countAll());
    }

    public function testHttpRoutePersistsOrderAndOutboxAtomicallyAndReturns201(): void
    {
        $container = $this->createContainer();
        $this->runMigrations($container);

        $dispatcher = $container->get(MiddlewareDispatcher::class);
        $requestFactory = $container->get(ServerRequestFactoryInterface::class);
        $fallback = $this->createFallbackHandler($container);

        $request = $requestFactory
            ->createServerRequest(Method::POST, '/orders')
            ->withParsedBody([
                'customerEmail' => 'buyer@example.com',
                'amountCents' => '4200',
            ]);

        $response = $dispatcher->dispatch($request, $fallback);
        self::assertSame(Status::CREATED, $response->getStatusCode());
        self::assertStringContainsString('application/json', $response->getHeaderLine('Content-Type'));

        /** @var array<string, mixed> $payload */
        $payload = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        self::assertSame('buyer@example.com', $payload['customerEmail']);
        self::assertSame(4200, $payload['amountCents']);
        self::assertSame('placed', $payload['status']);
        self::assertIsInt($payload['orderId']);
        self::assertIsString($payload['outboxMessageId']);

        $outboxRow = $container->get(OutboxRepositoryInterface::class)->findByMessageId((string) $payload['outboxMessageId']);
        self::assertNotNull($outboxRow);
        self::assertSame('pending', $outboxRow['status']);
        self::assertSame(1, $container->get(OrderRepositoryInterface::class)->countAll());
    }

    public function testTransactionRollbackLeavesZeroOrderAndOutboxRowsOnFailure(): void
    {
        $container = $this->createContainer();
        $this->runMigrations($container);

        $useCase = $container->get(PlaceOrderUseCase::class);

        try {
            $useCase->execute(new PlaceOrderCommand(
                customerEmail: 'rollback@example.com',
                amountCents: 1999,
                simulateFailureAfterOrderInsert: true,
            ));
            self::fail('Expected RuntimeException was not thrown.');
        } catch (RuntimeException $e) {
            self::assertStringContainsString('Simulated persistence failure', $e->getMessage());
        }

        self::assertSame(0, $container->get(OrderRepositoryInterface::class)->countAll());
        self::assertSame(0, $container->get(OutboxRepositoryInterface::class)->countAll());
    }

    public function testOutboxRelayWithMutexAndQueueIsIdempotentAndResetsContainerState(): void
    {
        $container = $this->createContainer();
        $this->runMigrations($container);

        $dispatcher = $container->get(MiddlewareDispatcher::class);
        $requestFactory = $container->get(ServerRequestFactoryInterface::class);
        $fallback = $this->createFallbackHandler($container);

        $response = $dispatcher->dispatch(
            $requestFactory
                ->createServerRequest(Method::POST, '/orders')
                ->withParsedBody([
                    'customerEmail' => 'relay@example.com',
                    'amountCents' => 7500,
                ]),
            $fallback,
        );
        self::assertSame(Status::CREATED, $response->getStatusCode());

        /** @var array<string, mixed> $created */
        $created = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        $messageId = (string) $created['outboxMessageId'];

        /** @var OutboxRelayService $relay */
        $relay = $container->get(OutboxRelayService::class);
        self::assertSame(1, $relay->relayPending());
        self::assertSame(0, $relay->relayPending());

        $outboxRow = $container->get(OutboxRepositoryInterface::class)->findByMessageId($messageId);
        self::assertNotNull($outboxRow);
        self::assertSame('published', $outboxRow['status']);
        self::assertNotNull($outboxRow['published_at']);

        /** @var EventRecorder $recorder */
        $recorder = $container->get(EventRecorder::class);
        self::assertCount(1, $recorder->all());
        self::assertInstanceOf(OrderPlacedEvent::class, $recorder->all()[0]);
        self::assertSame($messageId, $recorder->all()[0]->messageId);

        // Simulate duplicate message delivery via SyncQueueProducer: consumer idempotency blocks second side effect
        /** @var QueueProducerInterface $producer */
        $producer = $container->get(QueueProducerInterface::class);
        $producer->push(new GenericMessage(
            PlaceOrderUseCase::MESSAGE_TYPE_ORDER_PLACED,
            [
                'messageId' => $messageId,
                'orderId' => (int) $created['orderId'],
                'customerEmail' => 'relay@example.com',
                'amountCents' => 7500,
            ],
        ));
        self::assertCount(1, $recorder->all());

        /** @var CurrentRoute $currentRoute */
        $currentRoute = $container->get(CurrentRoute::class);
        self::assertSame('orders.create', $currentRoute->getName());

        $container->get(StateResetter::class)->reset();
        self::assertNull($currentRoute->getName());
        self::assertNull($currentRoute->getUri());
        self::assertSame([], $recorder->all());
    }
}
