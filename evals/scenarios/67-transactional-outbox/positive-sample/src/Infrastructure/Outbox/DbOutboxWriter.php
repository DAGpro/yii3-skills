<?php

declare(strict_types=1);

namespace App\Infrastructure\Outbox;

use App\Domain\Outbox\OutboxWriterInterface;
use DateTimeImmutable;
use DateTimeZone;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Json\Json;

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
