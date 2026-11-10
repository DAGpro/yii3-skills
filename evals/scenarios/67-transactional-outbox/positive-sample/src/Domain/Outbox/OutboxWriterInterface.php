<?php

declare(strict_types=1);

namespace App\Domain\Outbox;

interface OutboxWriterInterface
{
    /**
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
