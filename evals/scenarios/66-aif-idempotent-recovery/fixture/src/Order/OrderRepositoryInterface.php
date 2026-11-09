<?php

declare(strict_types=1);

namespace App\Order;

interface OrderRepositoryInterface
{
    public function cancel(string $id, string $reason): void;
}
