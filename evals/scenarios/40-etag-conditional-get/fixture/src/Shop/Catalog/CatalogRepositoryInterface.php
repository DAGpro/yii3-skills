<?php

declare(strict_types=1);

namespace App\Shop\Catalog;

interface CatalogRepositoryInterface
{
    /**
     * Full catalog representation served by the API.
     *
     * @return array<int, array<string, mixed>>
     */
    public function items(): array;

    /**
     * Content version of the catalog: changes if and only if items() changes.
     * A perfect ETag source for conditional GET.
     */
    public function version(): string;
}
