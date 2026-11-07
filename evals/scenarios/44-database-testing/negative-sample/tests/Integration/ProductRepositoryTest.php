<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Shop\Domain\Product;
use App\Shop\Infrastructure\ProductRepository;
use PHPUnit\Framework\TestCase;
use Yiisoft\Db\Mysql\Connection;
use Yiisoft\Db\Mysql\Driver;

final class ProductRepositoryTest extends TestCase
{
    private Connection $db;

    protected function setUp(): void
    {
        $this->db = new Connection(new Driver(
            'mysql:host=db.internal;dbname=shop;charset=utf8mb4',
            'shop',
            'secret',
        ));
    }

    public function testSaveAndFindProduct(): void
    {
        $repository = new ProductRepository($this->db);

        $product = new Product(id: 10, name: 'USB-C Cable', priceCents: 1999);
        $repository->save($product);

        $found = $repository->find(10);
        $this->assertNotNull($found);
        $this->assertSame('USB-C Cable', $found->name);
        $this->assertSame(1999, $found->priceCents);
    }
}
