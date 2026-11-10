<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence;

use App\Domain\Order\Order;
use App\Domain\Order\OrderRepositoryInterface;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;

final class DbOrderRepository implements OrderRepositoryInterface
{
    public function __construct(
        private readonly ConnectionInterface $db,
    ) {}

    public function create(string $customerEmail, int $amountCents): Order
    {
        $pks = $this->db->createCommand()->insertReturningPks('orders', [
            'customer_email' => $customerEmail,
            'amount_cents' => $amountCents,
            'status' => 'placed',
            'created_at' => time(),
        ]);

        return new Order(
            id: (int) $pks['id'],
            customerEmail: $customerEmail,
            amountCents: $amountCents,
            status: 'placed',
        );
    }

    public function findById(int $id): ?Order
    {
        $row = (new Query($this->db))
            ->from('orders')
            ->where(['id' => $id])
            ->one();

        if ($row === null) {
            return null;
        }

        return new Order(
            id: (int) $row['id'],
            customerEmail: (string) $row['customer_email'],
            amountCents: (int) $row['amount_cents'],
            status: (string) $row['status'],
        );
    }

    public function countAll(): int
    {
        return (int) (new Query($this->db))->from('orders')->count();
    }
}
