<?php

declare(strict_types=1);

namespace App\Application\Order;

use App\Domain\Order\OrderRepositoryInterface;
use App\Domain\Order\OutboxRepositoryInterface;
use RuntimeException;
use Yiisoft\Db\Connection\ConnectionInterface;

final class PlaceOrderUseCase
{
    public const MESSAGE_TYPE_ORDER_PLACED = 'order.placed';

    public function __construct(
        private readonly ConnectionInterface $db,
        private readonly OrderRepositoryInterface $orders,
        private readonly OutboxRepositoryInterface $outbox,
    ) {}

    public function execute(PlaceOrderCommand $command): PlaceOrderResult
    {
        $messageId = 'msg_' . bin2hex(random_bytes(8));

        /** @var PlaceOrderResult */
        return $this->db->transaction(function () use ($command, $messageId): PlaceOrderResult {
            $order = $this->orders->create($command->customerEmail, $command->amountCents);

            if ($command->simulateFailureAfterOrderInsert) {
                throw new RuntimeException('Simulated persistence failure before outbox write.');
            }

            $this->outbox->append(
                messageId: $messageId,
                messageType: self::MESSAGE_TYPE_ORDER_PLACED,
                payload: [
                    'messageId' => $messageId,
                    'orderId' => $order->id,
                    'customerEmail' => $order->customerEmail,
                    'amountCents' => $order->amountCents,
                ],
            );

            return new PlaceOrderResult($order, $messageId);
        });
    }
}
