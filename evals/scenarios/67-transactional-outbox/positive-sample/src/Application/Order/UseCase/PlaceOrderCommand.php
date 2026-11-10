<?php

declare(strict_types=1);

namespace App\Application\Order\UseCase;

final readonly class PlaceOrderCommand
{
    public function __construct(
        public string $orderId,
        public string $userId,
        public int $totalCents,
    ) {}
}
