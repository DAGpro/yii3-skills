<?php

declare(strict_types=1);

namespace App\Application\Order;

use App\Domain\Order\OrderPlacedEvent;
use App\Domain\Order\OutboxRepositoryInterface;
use Psr\EventDispatcher\EventDispatcherInterface;
use Yiisoft\Queue\Message\Handler\HandlerInterface;
use Yiisoft\Queue\Message\MessageInterface;

final class OrderPlacedMessageHandler implements HandlerInterface
{
    public function __construct(
        private readonly OutboxRepositoryInterface $outbox,
        private readonly EventDispatcherInterface $eventDispatcher,
    ) {}

    public function handle(MessageInterface $message): void
    {
        $payload = $message->getPayload();
        if (!is_array($payload)) {
            return;
        }

        $messageId = (string) ($payload['messageId'] ?? '');
        if ($messageId === '') {
            return;
        }

        if (!$this->outbox->markProcessedOnce($messageId, self::class)) {
            return;
        }

        $this->eventDispatcher->dispatch(new OrderPlacedEvent(
            messageId: $messageId,
            orderId: (int) ($payload['orderId'] ?? 0),
            customerEmail: (string) ($payload['customerEmail'] ?? ''),
            amountCents: (int) ($payload['amountCents'] ?? 0),
        ));
    }
}
