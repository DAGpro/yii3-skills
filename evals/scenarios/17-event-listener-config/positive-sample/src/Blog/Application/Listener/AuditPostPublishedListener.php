<?php

declare(strict_types=1);

namespace App\Blog\Application\Listener;

use App\Blog\Domain\PostPublishedEvent;
use Psr\Log\LoggerInterface;

/**
 * Writes an audit log entry when a post is published.
 */
final readonly class AuditPostPublishedListener
{
    public function __construct(private LoggerInterface $logger) {}

    public function __invoke(PostPublishedEvent $event): void
    {
        $this->logger->info('Post {postId} published', ['postId' => $event->postId]);
    }
}
