<?php

declare(strict_types=1);

namespace App\Application\Order\UseCase;

use App\Domain\Order\Order;
use App\Domain\Order\OrderRepositoryInterface;
use App\Domain\Outbox\OutboxWriterInterface;
use Yiisoft\Db\Connection\ConnectionInterface;

final readonly class PlaceOrderUseCase
{
    public function __construct(
        private ConnectionInterface $db,
        private OrderRepositoryInterface $orders,
        private OutboxWriterInterface $outbox,
    ) {}

    public function execute(PlaceOrderCommand $command): Order
    {
        return $this->db->transaction(function () use ($command): Order {
            $order = Order::create(
                id: $command->orderId,
                userId: $command->userId,
                totalCents: $command->totalCents,
            );

            $this->orders->save($order);

            $this->outbox->append(
                idempotencyKey: 'order.placed:' . $order->id,
                aggregateType: 'order',
                aggregateId: $order->id,
                messageType: 'order.placed',
                payload: [
                    'orderId' => $order->id,
                    'userId' => $order->userId,
                    'totalCents' => $order->totalCents,
                ],
            );

            return $order;
        });
    }
}
