<?php

declare(strict_types=1);

namespace App\Application\Order\Queue;

use App\Domain\Order\OrderReceiptMailerInterface;
use DateTimeImmutable;
use DateTimeZone;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Exception\IntegrityException;
use Yiisoft\Queue\Message\Handler\HandlerInterface;
use Yiisoft\Queue\Message\MessageInterface;

final readonly class OrderPlacedNotificationHandler implements HandlerInterface
{
    public function __construct(
        private ConnectionInterface $db,
        private OrderReceiptMailerInterface $mailer,
    ) {}

    public function handle(MessageInterface $message): void
    {
        $meta = $message->getMeta();
        $idempotencyKey = (string) ($meta['idempotency_key'] ?? '');
        /** @var array{orderId?: string} $payload */
        $payload = (array) $message->getPayload();
        $orderId = (string) ($payload['orderId'] ?? '');

        if ($idempotencyKey === '' || $orderId === '') {
            return;
        }

        $this->db->transaction(function () use ($idempotencyKey, $orderId): void {
            try {
                $this->db->createCommand()->insert('{{%processed_messages}}', [
                    'consumer_name' => self::class,
                    'idempotency_key' => $idempotencyKey,
                    'processed_at' => (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s'),
                ])->execute();
            } catch (IntegrityException) {
                return;
            }

            $this->mailer->sendOrderConfirmation($orderId);
        });
    }
}
