<?php

declare(strict_types=1);

use App\Shop\Domain\SearchOrdersRepositoryInterface;
use App\Shop\Infrastructure\SearchOrdersRepository;

return [
    SearchOrdersRepositoryInterface::class => SearchOrdersRepository::class,
];
