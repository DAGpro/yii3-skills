<?php

declare(strict_types=1);

namespace App\Shop\Catalog;

/**
 * Fixture use case: the catalog data is stubbed in memory, but the version()
 * contract is real - it changes only when the catalog data changes.
 */
final class CatalogRepository implements CatalogRepositoryInterface
{
    private const CATALOG = [
        ['sku' => 'SHOP-BASE', 'title' => 'Shop Basics', 'price' => 19.9],
        ['sku' => 'SHOP-PRO', 'title' => 'Professional Shop', 'price' => 29.9],
        ['sku' => 'SHOP-RECIPES', 'title' => 'Shop Recipes', 'price' => 24.5],
    ];

    public function items(): array
    {
        return self::CATALOG;
    }

    public function version(): string
    {
        return sha1((string) json_encode(self::CATALOG));
    }
}
