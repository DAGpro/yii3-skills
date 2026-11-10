<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Application\Order\UseCase\PlaceOrderCommand;
use App\Application\Order\UseCase\PlaceOrderUseCase;
use App\Domain\Order\Order;
use App\Domain\Order\OrderRepositoryInterface;
use App\Infrastructure\Outbox\DbOutboxWriter;
use App\Migration\M250115120000CreateOutboxMessagesTable;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use Yiisoft\Db\Cache\SchemaCache;
use Yiisoft\Db\Migration\Informer\NullMigrationInformer;
use Yiisoft\Db\Migration\Migrator;
use Yiisoft\Db\Sqlite\Connection;
use Yiisoft\Db\Sqlite\Driver;
use Yiisoft\Db\Sqlite\Dsn;

final class OutboxReliabilityTest extends TestCase
{
    public function testOrderAndOutboxCommitAtomically(): void
    {
        $db = new Connection(new Driver(new Dsn('sqlite', 'memory')), new SchemaCache());
        $db->createCommand('CREATE TABLE orders (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, total_cents INTEGER NOT NULL)')->execute();
        (new Migrator($db, new NullMigrationInformer()))->up(new M250115120000CreateOutboxMessagesTable());

        $failingRepo = new class implements OrderRepositoryInterface {
            public function save(Order $order): void
            {
                throw new RuntimeException('Simulated DB error');
            }
        };

        $useCase = new PlaceOrderUseCase($db, $failingRepo, new DbOutboxWriter($db));

        try {
            $useCase->execute(new PlaceOrderCommand('ord-1', 'usr-1', 5000));
            self::fail('Expected RuntimeException');
        } catch (RuntimeException) {
            // Expected rollback
        }

        $count = (int) $db->createQuery()->from('{{%outbox_messages}}')->count();
        self::assertSame(0, $count);
    }
}
