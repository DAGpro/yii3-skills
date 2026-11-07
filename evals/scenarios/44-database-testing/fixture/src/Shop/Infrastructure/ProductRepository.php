<?php

declare(strict_types=1);

namespace App\Shop\Infrastructure;

use App\Shop\Domain\Product;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;

final class ProductRepository
{
    public function __construct(private ConnectionInterface $db) {}

    public function save(Product $product): void
    {
        $this->db->createCommand()->insert('product', [
            'id' => $product->id,
            'name' => $product->name,
            'price_cents' => $product->priceCents,
        ])->execute();
    }

    public function find(int $id): ?Product
    {
        /** @var array{id: int|string, name: string, price_cents: int|string}|null $row */
        $row = (new Query($this->db))
            ->from('product')
            ->where(['id' => $id])
            ->one();

        if ($row === null) {
            return null;
        }

        return new Product(
            id: (int) $row['id'],
            name: (string) $row['name'],
            priceCents: (int) $row['price_cents'],
        );
    }
}
