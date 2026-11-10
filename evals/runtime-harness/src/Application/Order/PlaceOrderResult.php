<?php

declare(strict_types=1);

namespace App\Application\Order;

use App\Domain\Order\Order;

final readonly class PlaceOrderResult
{
    public function __construct(
        public Order $order,
        public string $outboxMessageId,
    ) {}
}
