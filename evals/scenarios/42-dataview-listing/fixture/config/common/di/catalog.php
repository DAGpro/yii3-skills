<?php

declare(strict_types=1);

use App\Catalog\Domain\ProductRepositoryInterface;
use App\Catalog\Infrastructure\InMemoryProductRepository;

return [
    ProductRepositoryInterface::class => InMemoryProductRepository::class,
];
