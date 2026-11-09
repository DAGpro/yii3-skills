<?php

declare(strict_types=1);

use App\Order\OrderRepositoryInterface;
use App\Order\OrderRepository;

return [
    OrderRepositoryInterface::class => OrderRepository::class,
];
