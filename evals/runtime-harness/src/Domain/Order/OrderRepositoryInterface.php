<?php

declare(strict_types=1);

namespace App\Domain\Order;

interface OrderRepositoryInterface
{
    public function create(string $customerEmail, int $amountCents): Order;

    public function findById(int $id): ?Order;

    public function countAll(): int;
}
