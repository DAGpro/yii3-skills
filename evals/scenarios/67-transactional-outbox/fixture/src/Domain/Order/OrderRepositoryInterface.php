<?php

declare(strict_types=1);

namespace App\Domain\Order;

interface OrderRepositoryInterface
{
    public function save(Order $order): void;
}
