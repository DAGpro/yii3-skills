<?php

declare(strict_types=1);

namespace App\Shop\Domain;

/**
 * Domain event: an order has been completed.
 */
final readonly class OrderCompletedEvent
{
    public function __construct(
        public string $orderId,
        public string $customerEmail,
    ) {}
}
