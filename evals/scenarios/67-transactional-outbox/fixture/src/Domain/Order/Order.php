<?php

declare(strict_types=1);

namespace App\Domain\Order;

final readonly class Order
{
    public function __construct(
        public string $id,
        public string $userId,
        public int $totalCents,
    ) {}

    public static function create(string $id, string $userId, int $totalCents): self
    {
        return new self(id: $id, userId: $userId, totalCents: $totalCents);
    }
}
