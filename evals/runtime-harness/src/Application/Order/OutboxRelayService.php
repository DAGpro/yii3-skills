<?php

declare(strict_types=1);

namespace App\Application\Order;

use App\Domain\Order\OutboxRepositoryInterface;
use Throwable;
use Yiisoft\Mutex\MutexFactoryInterface;
use Yiisoft\Queue\Message\GenericMessage;
use Yiisoft\Queue\QueueProducerInterface;

use const JSON_THROW_ON_ERROR;

final class OutboxRelayService
{
    public function __construct(
        private readonly OutboxRepositoryInterface $outbox,
        private readonly QueueProducerInterface $queueProducer,
        private readonly MutexFactoryInterface $mutexFactory,
    ) {}

    public function relayPending(int $batchSize = 50): int
    {
        $mutex = $this->mutexFactory->create('outbox-relay');
        if (!$mutex->acquire(1)) {
            return 0;
        }

        $published = 0;
        try {
            $pending = $this->outbox->findPending($batchSize);
            foreach ($pending as $row) {
                $messageId = (string) $row['message_id'];
                $messageType = (string) $row['message_type'];
                /** @var array<string, mixed> $payload */
                $payload = json_decode((string) $row['payload_json'], true, 512, JSON_THROW_ON_ERROR);
                $payload['messageId'] = $messageId;

                try {
                    $this->queueProducer->push(new GenericMessage($messageType, $payload));
                    $this->outbox->markPublished($messageId);
                    $published++;
                } catch (Throwable $e) {
                    $attempts = ((int) $row['attempts']) + 1;
                    $this->outbox->markFailed($messageId, $e->getMessage(), $attempts);
                }
            }
        } finally {
            $mutex->release();
        }

        return $published;
    }
}
