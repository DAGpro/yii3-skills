<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence;

use App\Domain\Order\Order;
use App\Domain\Order\OrderRepositoryInterface;
use Yiisoft\Db\Connection\ConnectionInterface;

final readonly class DbOrderRepository implements OrderRepositoryInterface
{
    public function __construct(
        private ConnectionInterface $db,
    ) {}

    public function save(Order $order): void
    {
        $this->db->createCommand()->insert('{{%orders}}', [
            'id' => $order->id,
            'user_id' => $order->userId,
            'total_cents' => $order->totalCents,
        ])->execute();
    }
}
