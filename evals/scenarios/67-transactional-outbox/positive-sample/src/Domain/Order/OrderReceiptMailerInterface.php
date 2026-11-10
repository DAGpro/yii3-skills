<?php

declare(strict_types=1);

namespace App\Domain\Order;

interface OrderReceiptMailerInterface
{
    public function sendOrderConfirmation(string $orderId): void;
}
