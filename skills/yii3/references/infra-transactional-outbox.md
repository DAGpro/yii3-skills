# Yii3 Transactional Outbox & Reliable Messaging Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Enterprise implementation guide for atomic database + event/message persistence (**Transactional Outbox**), mutex-guarded relay workers, exponential retry & dead-letter recovery, and idempotent consumer deduplication (**Inbox pattern**) in Yii 3 using `yiisoft/db`, `yiisoft/db-migration`, `yiisoft/json`, `yiisoft/mutex`, `yiisoft/queue`, and `yiisoft/yii-console`.

---

## Table of Contents
- [1. Choosing Post-Commit Dispatch vs Transactional Outbox](#1-choosing-post-commit-dispatch-vs-transactional-outbox)
- [2. Outbox Table Migration (`{{%outbox_messages}}`)](#2-outbox-table-migration-outbox_messages)
- [3. Atomic Domain Write + Outbox Persistence (`ConnectionInterface::transaction()`)](#3-atomic-domain-write--outbox-persistence-connectioninterfacetransaction)
- [4. Mutex-Guarded Outbox Relay Service (`OutboxRelayService`)](#4-mutex-guarded-outbox-relay-service-outboxrelayservice)
- [5. Relay Console Command & Persistent Worker Safety](#5-relay-console-command--persistent-worker-safety)
- [6. Consumer Idempotency (Inbox Table & Deduplication)](#6-consumer-idempotency-inbox-table--deduplication)
- [7. Anti-Pattern Matrix](#7-anti-pattern-matrix)
- [Related Topic Guides](#related-topic-guides)

---

## 1. Choosing Post-Commit Dispatch vs Transactional Outbox

Calling `QueueProducerInterface::push()` or `EventDispatcherInterface::dispatch()` inside an open `$db->transaction()` creates race conditions and phantom side effects if the transaction rolls back. However, even **post-commit dispatch** has a crash window: if the database commit succeeds and the process crashes, restarts, or hits a broker network timeout before `push()` completes, the domain state is committed while the message is lost forever (**dual-write failure**).

Select the reliability tier intentionally based on Execution Mode (`Patch | Feature | Enterprise`):

| Strategy | Guarantee | When to Use |
|---|---|---|
| **Post-Commit Dispatch** ([Events Design §5](core-events-design.md#5-mandatory-post-commit-event-dispatching-rule)) | Best-effort after DB commit; zero extra table/worker overhead | **Feature Mode** defaults: non-critical emails, cache warming, UI activity feeds, local analytics |
| **Transactional Outbox** *(this guide)* | **At-least-once delivery** + zero lost messages across DB commit / broker crashes | **Enterprise Mode**: payments, orders, inventory reservations, webhooks, audit streams, inter-service integration events |

> [!NOTE]
> Yii 3 has no separate `yiisoft/outbox` package. The outbox pattern composes standard first-party components already in the ecosystem: `yiisoft/db` (atomic transaction + `Query` / `CommandInterface`), `yiisoft/db-migration` (reversible schema), `yiisoft/json` (`Json::encode()` / `Json::decode()`), `yiisoft/mutex` (single-flight relay locking), `yiisoft/queue` (downstream worker dispatch), and `yiisoft/yii-console` (`./yii` relay runner).

```
HTTP / Use Case
   └─► $db->transaction(...)
         ├── Write domain row (`{{%orders}}`)
         └── Insert row into `{{%outbox_messages}}` (status = 'pending')
       COMMIT ──► Both commit atomically or both roll back!

Outbox Relay Worker (`./yii outbox:relay`, guarded by MutexFactoryInterface)
   ├── Poll due `'pending'` rows (`available_at <= nowUtc`, `LIMIT batchSize`)
   ├── Dispatch via `QueueProducerInterface::push(new GenericMessage(...))`
   │     (or `EventDispatcherInterface::dispatch(...)`)
   └── Update row `'published'` on success, or increment `attempts` + backoff / `'dead_letter'` on failure

Downstream Consumer (`HandlerInterface`)
   └── Check / insert `(consumer_name, message_id)` in `{{%processed_messages}}` before executing side effects
```

---

## 2. Outbox Table Migration (`{{%outbox_messages}}`)

Create a revertible, transactional migration implementing `RevertibleMigrationInterface` and `TransactionalMigrationInterface` using modern `ColumnBuilder`. Keep `status`, `available_at`, `idempotency_key`, `attempts`, and `dead_letter` metadata explicit so relay workers never scan full JSON payloads during polling.

```php
<?php

declare(strict_types=1);

namespace App\Migration;

use Yiisoft\Db\Constant\IndexType;
use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;
use Yiisoft\Db\Migration\TransactionalMigrationInterface;
use Yiisoft\Db\Schema\Column\ColumnBuilder;

final class M250115120000CreateOutboxMessagesTable implements
    RevertibleMigrationInterface,
    TransactionalMigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $b->createTable('{{%outbox_messages}}', [
            'id' => ColumnBuilder::bigPrimaryKey(),
            'idempotency_key' => ColumnBuilder::string(64)->notNull(),
            'aggregate_type' => ColumnBuilder::string(100)->notNull(),
            'aggregate_id' => ColumnBuilder::string(64)->notNull(),
            'message_type' => ColumnBuilder::string(150)->notNull(),
            'payload' => ColumnBuilder::text()->notNull(),
            'status' => ColumnBuilder::string(24)->notNull()->defaultValue('pending'),
            'attempts' => ColumnBuilder::smallint()->notNull()->defaultValue(0),
            'max_attempts' => ColumnBuilder::smallint()->notNull()->defaultValue(5),
            'available_at' => ColumnBuilder::datetime()->notNull(),
            'locked_at' => ColumnBuilder::datetime()->null(),
            'published_at' => ColumnBuilder::datetime()->null(),
            'last_error' => ColumnBuilder::text()->null(),
            'created_at' => ColumnBuilder::datetime()->notNull(),
        ]);

        $b->createIndex(
            '{{%outbox_messages}}',
            'ux_outbox_messages_idempotency_key',
            'idempotency_key',
            IndexType::UNIQUE,
        );

        $b->createIndex(
            '{{%outbox_messages}}',
            'idx_outbox_messages_poll',
            ['status', 'available_at', 'id'],
        );
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropTable('{{%outbox_messages}}');
    }
}
```

> [!TIP]
> Wire the migration namespace in `config/params.php` under `'yiisoft/db-migration'` (`sourcePaths` or `newMigrationNamespace`) per the [Migrations Configuration Guide](persistence-migrations-operations.md), and run `./yii migrate:up`.

---

## 3. Atomic Domain Write + Outbox Persistence (`ConnectionInterface::transaction()`)

Write both the business record and the outbox row inside the **exact same `ConnectionInterface::transaction()` closure**. Never call `QueueProducerInterface::push()` inside the transaction closure — only serialize the lightweight scalar payload via `Yiisoft\Json\Json::encode()` and insert into `{{%outbox_messages}}`.

### 3.1. Outbox Recorder Contract & DB Writer (Persistence / Infrastructure)

```php
<?php

declare(strict_types=1);

namespace App\Domain\Outbox;

interface OutboxWriterInterface
{
    /**
     * Enqueues a message into the outbox table inside the active transaction.
     *
     * @param array<string, bool|float|int|string|array|null> $payload
     */
    public function append(
        string $idempotencyKey,
        string $aggregateType,
        string $aggregateId,
        string $messageType,
        array $payload,
        int $maxAttempts = 5,
    ): void;
}
```

```php
<?php

declare(strict_types=1);

namespace App\Infrastructure\Outbox;

use DateTimeImmutable;
use DateTimeZone;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Json\Json;
use App\Domain\Outbox\OutboxWriterInterface;

final readonly class DbOutboxWriter implements OutboxWriterInterface
{
    public function __construct(
        private ConnectionInterface $db,
    ) {}

    public function append(
        string $idempotencyKey,
        string $aggregateType,
        string $aggregateId,
        string $messageType,
        array $payload,
        int $maxAttempts = 5,
    ): void {
        $nowUtc = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s');

        $this->db->createCommand()->insert('{{%outbox_messages}}', [
            'idempotency_key' => $idempotencyKey,
            'aggregate_type' => $aggregateType,
            'aggregate_id' => $aggregateId,
            'message_type' => $messageType,
            'payload' => Json::encode($payload),
            'status' => 'pending',
            'attempts' => 0,
            'max_attempts' => $maxAttempts,
            'available_at' => $nowUtc,
            'locked_at' => null,
            'published_at' => null,
            'last_error' => null,
            'created_at' => $nowUtc,
        ])->execute();
    }
}
```

### 3.2. Application Use Case & Thin Presentation Action

The Use Case owns the `$db->transaction()` boundary and records the outbox entry on the same `ConnectionInterface`. The HTTP Action remains a strictly thin transport adapter injecting **only** the input hydrator, response factory, and Use Case (zero repositories, zero `ConnectionInterface`).

```php
<?php

declare(strict_types=1);

namespace App\Application\Order\UseCase;

use App\Domain\Order\Order;
use App\Domain\Order\OrderRepositoryInterface;
use App\Domain\Outbox\OutboxWriterInterface;
use Yiisoft\Db\Connection\ConnectionInterface;

final readonly class PlaceOrderUseCase
{
    public function __construct(
        private ConnectionInterface $db,
        private OrderRepositoryInterface $orders,
        private OutboxWriterInterface $outbox,
    ) {}

    public function execute(PlaceOrderCommand $command): Order
    {
        return $this->db->transaction(function () use ($command): Order {
            $order = Order::create(
                id: $command->orderId,
                userId: $command->userId,
                totalCents: $command->totalCents,
            );

            $this->orders->save($order);

            $this->outbox->append(
                idempotencyKey: 'order.placed:' . $order->id,
                aggregateType: 'order',
                aggregateId: $order->id,
                messageType: 'order.placed',
                payload: [
                    'orderId' => $order->id,
                    'userId' => $order->userId,
                    'totalCents' => $order->totalCents,
                ],
            );

            return $order;
        });
    }
}
```

> [!WARNING]
> **Shared Connection Invariant:** The domain repository (`$orders`) and `DbOutboxWriter` MUST inject the same `ConnectionInterface` service from DI so both `INSERT`/`UPDATE` statements share the exact active database transaction. If the domain insert or repository throws, `$db->transaction()` automatically rolls back both the domain row and the outbox row.

```php
<?php

declare(strict_types=1);

namespace App\Presentation\Http\Order;

use App\Application\Order\UseCase\PlaceOrderCommand;
use App\Application\Order\UseCase\PlaceOrderUseCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Hydrator\HydratorInterface;

final readonly class CreateOrderAction
{
    public function __construct(
        private HydratorInterface $hydrator,
        private PlaceOrderUseCase $useCase,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        /** @var CreateOrderInput $input */
        $input = $this->hydrator->create(CreateOrderInput::class, (array) $request->getParsedBody());
        if (!$input->getValidationResult()->isValid()) {
            return $this->responseFactory->createResponse(
                ['errors' => $input->getValidationResult()->getErrorMessagesIndexedByPath()],
                Status::UNPROCESSABLE_ENTITY,
            );
        }

        $order = $this->useCase->execute(new PlaceOrderCommand(
            orderId: $input->orderId,
            userId: $input->userId,
            totalCents: $input->totalCents,
        ));

        return $this->responseFactory->createResponse(['orderId' => $order->id], Status::CREATED);
    }
}
```

### 3.3. Required DI Binding (`config/common/di/outbox.php`)

```php
<?php

declare(strict_types=1);

use App\Domain\Outbox\OutboxWriterInterface;
use App\Infrastructure\Outbox\DbOutboxWriter;

return [
    OutboxWriterInterface::class => DbOutboxWriter::class,
];
```

---

## 4. Mutex-Guarded Outbox Relay Service (`OutboxRelayService`)

A dedicated relay worker polls `{{%outbox_messages}}` for due `'pending'` rows (`available_at <= nowUtc`), dispatches them to `QueueProducerInterface` (or an internal `EventDispatcherInterface`), and updates each row's delivery status:

1. **Exclusive Relay Lock (`MutexFactoryInterface`):** Acquire a lock (`'outbox_relay'`) before polling so concurrent cron/daemon workers cannot publish duplicate messages simultaneously. Remember the `MutexInterface::acquire(int $timeout = 0): bool` invariant — pass the lock name to `$this->mutexFactory->create('outbox_relay')`, never to `$mutex->acquire()` (see [Queue Mutex Guide §1](infra-queue-mutex.md#1-the-mutexinterfaceacquire-invariant)).
2. **Stale Lock Recovery:** If a prior worker crashed mid-dispatch while holding a row in `'processing'`, reclaim rows whose `locked_at` is older than a stale lease window back to `'pending'`.
3. **Bounded Batching (`limit`):** Poll a fixed batch (e.g. `100`) ordered by `['id' => SORT_ASC]` to prevent OOM and preserve ordering per batch.
4. **Exponential Backoff & Dead-Letter Transition:** On dispatch exception, increment `attempts`. If `attempts >= max_attempts`, transition to `'dead_letter'` with `last_error` so poison messages do not starve healthy rows; otherwise reschedule `available_at` with bounded exponential backoff (`min(300, 5 * (2 ** ($attempts - 1)))` seconds).

```php
<?php

declare(strict_types=1);

namespace App\Infrastructure\Outbox;

use DateInterval;
use DateTimeImmutable;
use DateTimeZone;
use Psr\Log\LoggerInterface;
use Throwable;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Json\Json;
use Yiisoft\Mutex\MutexFactoryInterface;
use Yiisoft\Queue\Message\GenericMessage;
use Yiisoft\Queue\QueueProducerInterface;

use function is_array;
use function min;
use function sprintf;
use function substr;

use const SORT_ASC;

final readonly class OutboxRelayService
{
    private const STATUS_PENDING = 'pending';
    private const STATUS_PROCESSING = 'processing';
    private const STATUS_PUBLISHED = 'published';
    private const STATUS_DEAD_LETTER = 'dead_letter';

    public function __construct(
        private ConnectionInterface $db,
        private QueueProducerInterface $queueProducer,
        private MutexFactoryInterface $mutexFactory,
        private LoggerInterface $logger,
    ) {}

    /**
     * Polls and relays up to $batchSize due outbox messages.
     * Returns number of successfully published messages.
     */
    public function relayPending(int $batchSize = 100, int $lockTimeoutSeconds = 0): int
    {
        $mutex = $this->mutexFactory->create('outbox_relay');
        if (!$mutex->acquire($lockTimeoutSeconds)) {
            $this->logger->info('Outbox relay skipped: another worker holds the relay lock.');
            return 0;
        }

        try {
            $this->reclaimStaleLocks(staleSeconds: 300);
            $rows = $this->fetchDueRows($batchSize);
            $published = 0;

            foreach ($rows as $row) {
                $id = (int) $row['id'];
                if (!$this->claimRow($id)) {
                    continue;
                }

                if ($this->dispatchRow($row)) {
                    $published++;
                }
            }

            return $published;
        } finally {
            $mutex->release();
        }
    }

    private function reclaimStaleLocks(int $staleSeconds): void
    {
        $cutoff = (new DateTimeImmutable('now', new DateTimeZone('UTC')))
            ->sub(new DateInterval(sprintf('PT%dS', $staleSeconds)))
            ->format('Y-m-d H:i:s');

        $this->db->createCommand()->update(
            table: '{{%outbox_messages}}',
            columns: [
                'status' => self::STATUS_PENDING,
                'locked_at' => null,
            ],
            condition: 'status = :status AND locked_at IS NOT NULL AND locked_at <= :cutoff',
            params: [
                ':status' => self::STATUS_PROCESSING,
                ':cutoff' => $cutoff,
            ],
        )->execute();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function fetchDueRows(int $batchSize): array
    {
        $nowUtc = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s');

        /** @var array<int, array<string, mixed>> */
        return $this->db->createQuery()
            ->from('{{%outbox_messages}}')
            ->select(['id', 'idempotency_key', 'aggregate_type', 'aggregate_id', 'message_type', 'payload', 'attempts', 'max_attempts'])
            ->where(['status' => self::STATUS_PENDING])
            ->andWhere('available_at <= :now', [':now' => $nowUtc])
            ->orderBy(['id' => SORT_ASC])
            ->limit($batchSize)
            ->all();
    }

    private function claimRow(int $id): bool
    {
        $nowUtc = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s');

        $affected = $this->db->createCommand()->update(
            table: '{{%outbox_messages}}',
            columns: [
                'status' => self::STATUS_PROCESSING,
                'locked_at' => $nowUtc,
            ],
            condition: [
                'id' => $id,
                'status' => self::STATUS_PENDING,
            ],
        )->execute();

        return $affected === 1;
    }

    /**
     * @param array<string, mixed> $row
     */
    private function dispatchRow(array $row): bool
    {
        $id = (int) $row['id'];
        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));

        try {
            $decoded = Json::decode((string) $row['payload'], asArray: true);
            $payload = is_array($decoded) ? $decoded : ['value' => $decoded];

            $message = (new GenericMessage(
                type: (string) $row['message_type'],
                payload: $payload,
            ))->withMeta([
                'outbox_id' => $id,
                'idempotency_key' => (string) $row['idempotency_key'],
                'aggregate_type' => (string) $row['aggregate_type'],
                'aggregate_id' => (string) $row['aggregate_id'],
            ]);

            $this->queueProducer->push($message);

            $this->db->createCommand()->update(
                table: '{{%outbox_messages}}',
                columns: [
                    'status' => self::STATUS_PUBLISHED,
                    'locked_at' => null,
                    'published_at' => $now->format('Y-m-d H:i:s'),
                    'last_error' => null,
                ],
                condition: ['id' => $id],
            )->execute();

            return true;
        } catch (Throwable $e) {
            $attempts = (int) $row['attempts'] + 1;
            $maxAttempts = (int) $row['max_attempts'];
            $isDeadLetter = $attempts >= $maxAttempts;

            $backoffSeconds = min(300, 5 * (2 ** ($attempts - 1)));
            $nextAvailable = $now->add(new DateInterval(sprintf('PT%dS', $backoffSeconds)));

            $this->db->createCommand()->update(
                table: '{{%outbox_messages}}',
                columns: [
                    'status' => $isDeadLetter ? self::STATUS_DEAD_LETTER : self::STATUS_PENDING,
                    'attempts' => $attempts,
                    'locked_at' => null,
                    'available_at' => $nextAvailable->format('Y-m-d H:i:s'),
                    'last_error' => substr($e->getMessage(), 0, 2000),
                ],
                condition: ['id' => $id],
            )->execute();

            $this->logger->error('Outbox relay dispatch failed for message #{id}: {error}', [
                'id' => $id,
                'attempts' => $attempts,
                'deadLetter' => $isDeadLetter,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }
}
```

> [!NOTE]
> Prefer `Yiisoft\Mutex\Pgsql\PgsqlMutexFactory` (`yiisoft/mutex-pdo-pgsql`), `Yiisoft\Mutex\Mysql\MysqlMutexFactory` (`yiisoft/mutex-pdo-mysql`), or `Yiisoft\Mutex\Redis\RedisMutexFactory` (`yiisoft/mutex-redis`) when multiple container replicas run relays concurrently. Use `Yiisoft\Mutex\File\FileMutexFactory` (`yiisoft/mutex-file`) strictly on single-host deployments or integration tests. See [Queue Mutex Guide §4](infra-queue-mutex.md#4-mutex-driver-packages--di-configuration-recipes-configcommondiphp).

---

## 5. Relay Console Command & Persistent Worker Safety

Expose `OutboxRelayService` through a thin Symfony Console command registered under `'yiisoft/yii-console'['commands']` in `config/console/params.php`. For continuous daemon execution under Supervisor/systemd or RoadRunner, run bounded iterations or reset mutable service state between cycles with `Yiisoft\Di\StateResetter` (see [StateResetter Guide](infra-state-resetter.md)).

### 5.1. Relay Console Command

```php
<?php

declare(strict_types=1);

namespace App\Presentation\Console\Command;

use App\Infrastructure\Outbox\OutboxRelayService;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Yiisoft\Di\StateResetter;
use Yiisoft\Yii\Console\ExitCode;

use function sleep;

#[AsCommand(
    name: 'outbox:relay',
    description: 'Publishes due transactional outbox messages to the message bus.',
)]
final class OutboxRelayCommand extends Command
{
    public function __construct(
        private readonly OutboxRelayService $relay,
        private readonly StateResetter $stateResetter,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('limit', 'l', InputOption::VALUE_REQUIRED, 'Batch size per poll iteration.', 100)
            ->addOption('once', null, InputOption::VALUE_NONE, 'Process one batch and exit immediately.')
            ->addOption('sleep', null, InputOption::VALUE_REQUIRED, 'Seconds to sleep when idle.', 2);
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $limit = max(1, (int) $input->getOption('limit'));
        $sleepSeconds = max(1, (int) $input->getOption('sleep'));
        $once = (bool) $input->getOption('once');

        do {
            $published = $this->relay->relayPending($limit);
            $this->stateResetter->reset();

            if ($once) {
                $io->success("Relayed {$published} outbox message(s).");
                return ExitCode::OK;
            }

            if ($published === 0) {
                sleep($sleepSeconds);
            }
        } while (true);
    }
}
```

### 5.2. Console Command Registration (`config/console/params.php`)

```php
<?php

declare(strict_types=1);

use App\Presentation\Console\Command\OutboxRelayCommand;

return [
    'yiisoft/yii-console' => [
        'commands' => [
            'outbox:relay' => OutboxRelayCommand::class,
        ],
    ],
];
```

Run `./yii outbox:relay --once` from cron/CI or `./yii outbox:relay --limit=100` under Supervisor/systemd. Remember to run `composer yii-config-rebuild` if adding new config files.

---

## 6. Consumer Idempotency (Inbox Table & Deduplication)

Transactional Outbox provides **at-least-once delivery**: if a worker relays a message to the broker and crashes immediately before updating `status = 'published'`, a subsequent relay retry will deliver the same `idempotency_key` a second time. Downstream queue handlers and webhook consumers **must be idempotent**.

Create a small deduplication table (`{{%processed_messages}}`) with a unique key on `(consumer_name, idempotency_key)` and wrap message handling in a database transaction:

```php
<?php

declare(strict_types=1);

namespace App\Migration;

use Yiisoft\Db\Constant\IndexType;
use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;
use Yiisoft\Db\Migration\TransactionalMigrationInterface;
use Yiisoft\Db\Schema\Column\ColumnBuilder;

final class M250115120500CreateProcessedMessagesTable implements
    RevertibleMigrationInterface,
    TransactionalMigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $b->createTable('{{%processed_messages}}', [
            'id' => ColumnBuilder::bigPrimaryKey(),
            'consumer_name' => ColumnBuilder::string(100)->notNull(),
            'idempotency_key' => ColumnBuilder::string(64)->notNull(),
            'processed_at' => ColumnBuilder::datetime()->notNull(),
        ]);

        $b->createIndex(
            '{{%processed_messages}}',
            'ux_processed_messages_consumer_key',
            ['consumer_name', 'idempotency_key'],
            IndexType::UNIQUE,
        );
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropTable('{{%processed_messages}}');
    }
}
```

```php
<?php

declare(strict_types=1);

namespace App\Application\Order\Queue;

use DateTimeImmutable;
use DateTimeZone;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Exception\IntegrityException;
use Yiisoft\Queue\Message\Handler\HandlerInterface;
use Yiisoft\Queue\Message\MessageInterface;

final readonly class OrderPlacedNotificationHandler implements HandlerInterface
{
    public function __construct(
        private ConnectionInterface $db,
        private OrderReceiptMailerInterface $mailer,
    ) {}

    public function handle(MessageInterface $message): void
    {
        $meta = $message->getMeta();
        $idempotencyKey = (string) ($meta['idempotency_key'] ?? '');
        /** @var array{orderId?: string} $payload */
        $payload = (array) $message->getPayload();
        $orderId = (string) ($payload['orderId'] ?? '');

        if ($idempotencyKey === '' || $orderId === '') {
            return;
        }

        $this->db->transaction(function () use ($idempotencyKey, $orderId): void {
            try {
                $this->db->createCommand()->insert('{{%processed_messages}}', [
                    'consumer_name' => self::class,
                    'idempotency_key' => $idempotencyKey,
                    'processed_at' => (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s'),
                ])->execute();
            } catch (IntegrityException) {
                // Duplicate redelivery detected cleanly: skip side effects
                return;
            }

            $this->mailer->sendOrderConfirmation($orderId);
        });
    }
}
```

---

## 7. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| **Pushing to `QueueProducerInterface` inside `$db->transaction()`** | Workers read uncommitted/rolled-back state or execute orphaned jobs on rollback; network failures fail the DB transaction. | Insert into `{{%outbox_messages}}` inside `$db->transaction()` and relay asynchronously via `OutboxRelayService`. |
| **Updating domain DB in one `ConnectionInterface` and outbox in another** | Two connections cannot share an atomic SQL commit; one can succeed while the other fails. | Inject the same `ConnectionInterface` into domain repository/writer inside the single `$db->transaction()` closure. |
| **Running parallel relay cron/workers without `MutexFactoryInterface`** | Multiple workers poll and claim overlapping pending batches or hammer the DB simultaneously. | Guard the relay poll loop with `$this->mutexFactory->create('outbox_relay')->acquire(...)` and `try / finally { $mutex->release(); }`. |
| **Passing lock name directly to `$mutex->acquire('outbox_relay')`** | `MutexInterface::acquire(int $timeout = 0): bool` takes **no lock name** and triggers a `TypeError` under `strict_types=1`. | Call `$this->mutexFactory->create('outbox_relay')->acquire(timeout: 0)`. |
| **Unbounded `SELECT * FROM {{%outbox_messages}}` without `limit()`** | Loads thousands of rows/payloads into worker RAM and exhausts PHP memory limits. | Enforce explicit `->limit($batchSize)` and composite index on `['status', 'available_at', 'id']`. |
| **Retrying permanently failing messages forever without `dead_letter`** | Poison messages block FIFO batches indefinitely and flood logs on every relay tick. | Track `attempts`, `max_attempts`, exponential `available_at` backoff, and move exhausted rows to `'dead_letter'`. |
| **Calling `exit()` or infinite worker loops without `StateResetter`** | Infinite daemons leak stale DB/memory state across batches; `exit()` bypasses shutdown cleanup. | Return `ExitCode::OK`, call `$this->stateResetter->reset()` between relay cycles, and bound memory usage. |
| **Treating outbox delivery as exactly-once without consumer deduplication** | Crashes between broker ACK and DB update cause legitimate at-least-once redeliveries. | Enforce unique `(consumer_name, idempotency_key)` deduplication in `{{%processed_messages}}`. |

---

## Related Topic Guides

- [Events & Listeners Design Guide §5](core-events-design.md#5-mandatory-post-commit-event-dispatching-rule) — Post-commit event dispatching and when to upgrade to Transactional Outbox.
- [Queue & Asynchronous Jobs Guide](infra-queue-jobs.md) — `QueueProducerInterface`, `GenericMessage`, handler registration, and failure pipelines.
- [Queue Mutex & Distributed Concurrency Guide](infra-queue-mutex.md) — `MutexFactoryInterface`, `Synchronizer`, and driver DI recipes (`mutex-file`, `mutex-redis`, `mutex-pdo-pgsql`).
- [Database Connection & Queries Guide](persistence-db-connection-and-queries.md) — `ConnectionInterface::transaction()`, `CommandInterface`, and Query Builder patterns.
- [Migrations Schema Construction Guide](persistence-migrations-schema.md) — `RevertibleMigrationInterface`, `TransactionalMigrationInterface`, and `ColumnBuilder`.
- [Console Commands Guide](infra-commands.md) — `#[AsCommand]`, lazy registration in `config/console/params.php`, and `ExitCode`.
- [Long-Running Worker Safety & StateResetter Guide](infra-state-resetter.md) — Resetting container state inside long-running CLI relays and workers.
