<?php

declare(strict_types=1);

use App\Shop\Catalog\CatalogRepository;
use App\Shop\Catalog\CatalogRepositoryInterface;

return [
    CatalogRepositoryInterface::class => CatalogRepository::class,
];
