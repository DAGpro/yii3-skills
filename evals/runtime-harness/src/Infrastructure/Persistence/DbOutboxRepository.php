<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence;

use App\Domain\Order\OutboxRepositoryInterface;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Exception\IntegrityException;
use Yiisoft\Db\Query\Query;

use const JSON_THROW_ON_ERROR;
use const SORT_ASC;

final class DbOutboxRepository implements OutboxRepositoryInterface
{
    public function __construct(
        private readonly ConnectionInterface $db,
    ) {}

    public function append(string $messageId, string $messageType, array $payload): void
    {
        $this->db->createCommand()->insert('outbox_messages', [
            'message_id' => $messageId,
            'message_type' => $messageType,
            'payload_json' => json_encode($payload, JSON_THROW_ON_ERROR),
            'status' => 'pending',
            'attempts' => 0,
            'last_error' => null,
            'created_at' => time(),
            'published_at' => null,
        ])->execute();
    }

    public function findPending(int $limit = 50): array
    {
        return (new Query($this->db))
            ->from('outbox_messages')
            ->where(['status' => 'pending'])
            ->orderBy(['id' => SORT_ASC])
            ->limit($limit)
            ->all();
    }

    public function findByMessageId(string $messageId): ?array
    {
        return (new Query($this->db))
            ->from('outbox_messages')
            ->where(['message_id' => $messageId])
            ->one();
    }

    public function markPublished(string $messageId): void
    {
        $this->db->createCommand()->update(
            'outbox_messages',
            [
                'status' => 'published',
                'last_error' => null,
                'published_at' => time(),
            ],
            ['message_id' => $messageId],
        )->execute();
    }

    public function markFailed(string $messageId, string $error, int $attempts): void
    {
        $status = $attempts >= 5 ? 'dead' : 'pending';
        $this->db->createCommand()->update(
            'outbox_messages',
            [
                'status' => $status,
                'attempts' => $attempts,
                'last_error' => $error,
            ],
            ['message_id' => $messageId],
        )->execute();
    }

    public function markProcessedOnce(string $messageId, string $consumer): bool
    {
        try {
            $this->db->createCommand()->insert('processed_messages', [
                'message_id' => $messageId,
                'consumer' => $consumer,
                'processed_at' => time(),
            ])->execute();
            return true;
        } catch (IntegrityException) {
            return false;
        }
    }

    public function countAll(): int
    {
        return (int) (new Query($this->db))->from('outbox_messages')->count();
    }
}
