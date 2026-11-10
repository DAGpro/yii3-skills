<?php

declare(strict_types=1);

namespace App\Domain\Order;

interface OutboxRepositoryInterface
{
    /**
     * @param array<string, mixed> $payload
     */
    public function append(string $messageId, string $messageType, array $payload): void;

    /**
     * @return list<array<string, mixed>>
     */
    public function findPending(int $limit = 50): array;

    /**
     * @return array<string, mixed>|null
     */
    public function findByMessageId(string $messageId): ?array;

    public function markPublished(string $messageId): void;

    public function markFailed(string $messageId, string $error, int $attempts): void;

    public function markProcessedOnce(string $messageId, string $consumer): bool;

    public function countAll(): int;
}
