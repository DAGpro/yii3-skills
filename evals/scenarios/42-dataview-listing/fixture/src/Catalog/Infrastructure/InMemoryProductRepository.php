<?php

declare(strict_types=1);

namespace App\Catalog\Infrastructure;

use App\Catalog\Domain\ProductRepositoryInterface;
use Yiisoft\Data\Reader\DataReaderInterface;
use Yiisoft\Data\Reader\Iterable\IterableDataReader;

/**
 * In-memory catalog. The rows are served through a data reader so callers can
 * paginate/filter them like any database-backed reader.
 */
final readonly class InMemoryProductRepository implements ProductRepositoryInterface
{
    /**
     * @var list<array<string, mixed>>
     */
    private array $products;

    public function __construct()
    {
        $this->products = [
            ['name' => 'Cordless drill', 'price' => 89.9],
            ['name' => 'Claw hammer', 'price' => 12.5],
            ['name' => 'Screwdriver set', 'price' => 24.0],
            ['name' => 'Adjustable wrench', 'price' => 15.75],
            ['name' => 'Circular saw', 'price' => 129.0],
            ['name' => 'Spirit level', 'price' => 18.4],
            ['name' => 'Tape measure', 'price' => 9.99],
            ['name' => 'Utility knife', 'price' => 7.25],
            ['name' => 'Pliers', 'price' => 13.6],
            ['name' => 'Stud finder', 'price' => 32.0],
            ['name' => 'Work gloves', 'price' => 6.5],
            ['name' => 'Safety goggles', 'price' => 11.2],
            ['name' => 'Extension cord', 'price' => 21.9],
            ['name' => 'Tool belt', 'price' => 27.35],
            ['name' => 'Flashlight', 'price' => 16.8],
        ];
    }

    public function findAll(): DataReaderInterface
    {
        return new IterableDataReader($this->products);
    }
}
