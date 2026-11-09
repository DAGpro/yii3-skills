<?php

declare(strict_types=1);

namespace App\Order;

use Yiisoft\Db\Connection\ConnectionInterface;

final class OrderRepository implements OrderRepositoryInterface
{
    public function __construct(
        private ConnectionInterface $db,
    ) {
    }

    public function cancel(string $id, string $reason): void
    {
        $this->db->createCommand(
            'UPDATE "order" SET status = :status, cancel_reason = :reason WHERE id = :id',
            [':status' => 'cancelled', ':reason' => $reason, ':id' => $id]
        )->execute();
    }
}
