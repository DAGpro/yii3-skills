<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Shop\Domain\Product;
use App\Shop\Infrastructure\ProductRepository;

final class ProductRepositoryTest extends DatabaseTestCase
{
    private ProductRepository $repository;

    protected function setUp(): void
    {
        parent::setUp();
        $this->repository = new ProductRepository($this->db);
    }

    public function testSaveAndFindProduct(): void
    {
        $product = new Product(id: 10, name: 'USB-C Cable', priceCents: 1999);

        $this->repository->save($product);

        $found = $this->repository->find(10);
        $this->assertNotNull($found);
        $this->assertSame('USB-C Cable', $found->name);
        $this->assertSame(1999, $found->priceCents);
    }

    public function testFindReturnsNullWhenNotFound(): void
    {
        $this->assertNull($this->repository->find(9999));
    }
}
