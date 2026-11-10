<?php

declare(strict_types=1);

namespace App\Application\Order;

final readonly class PlaceOrderCommand
{
    public function __construct(
        public string $customerEmail,
        public int $amountCents,
        public bool $simulateFailureAfterOrderInsert = false,
    ) {}
}
