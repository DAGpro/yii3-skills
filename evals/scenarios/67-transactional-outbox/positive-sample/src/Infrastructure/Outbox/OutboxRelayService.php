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
