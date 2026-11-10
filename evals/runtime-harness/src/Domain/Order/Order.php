<?php

declare(strict_types=1);

namespace App\Domain\Order;

final readonly class Order
{
    public function __construct(
        public int $id,
        public string $customerEmail,
        public int $amountCents,
        public string $status,
    ) {}
}
