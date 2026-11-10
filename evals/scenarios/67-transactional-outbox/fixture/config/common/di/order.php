<?php

declare(strict_types=1);

use App\Domain\Order\OrderRepositoryInterface;
use App\Infrastructure\Persistence\DbOrderRepository;

return [
    OrderRepositoryInterface::class => DbOrderRepository::class,
];
