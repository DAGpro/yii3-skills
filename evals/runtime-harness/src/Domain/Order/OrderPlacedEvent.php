<?php

declare(strict_types=1);

namespace App\Domain\Order;

final readonly class OrderPlacedEvent
{
    public function __construct(
        public string $messageId,
        public int $orderId,
        public string $customerEmail,
        public int $amountCents,
    ) {}
}
