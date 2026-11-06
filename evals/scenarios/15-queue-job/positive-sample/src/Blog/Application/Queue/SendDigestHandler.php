<?php

declare(strict_types=1);

namespace App\Blog\Application\Queue;

use App\Blog\Application\DigestGenerator;
use InvalidArgumentException;
use Psr\Log\LoggerInterface;
use Yiisoft\Queue\Message\Handler\HandlerInterface;
use Yiisoft\Queue\Message\MessageInterface;

use function sprintf;

/**
 * Worker-side execution unit: pulls fresh state inside the job, never in the message.
 */
final readonly class SendDigestHandler implements HandlerInterface
{
    public function __construct(
        private DigestGenerator $digest,
        private LoggerInterface $logger,
    ) {}

    public function handle(MessageInterface $message): void
    {
        if (!$message instanceof SendDigestMessage) {
            throw new InvalidArgumentException(sprintf('Unexpected message type "%s".', $message->getType()));
        }

        $processed = $this->digest->generateWeeklyDigest();
        $this->logger->info('Weekly digest sent to {count} subscribers.', ['count' => $processed]);
    }
}
