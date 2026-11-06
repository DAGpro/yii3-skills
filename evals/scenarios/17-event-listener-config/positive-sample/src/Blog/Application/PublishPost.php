<?php

declare(strict_types=1);

namespace App\Blog\Application;

use App\Blog\Domain\PostPublishedEvent;
use Psr\EventDispatcher\EventDispatcherInterface;

/**
 * Use case under test: marks a post as published and dispatches the domain event.
 */
final readonly class PublishPost
{
    public function __construct(private EventDispatcherInterface $eventDispatcher) {}

    public function execute(string $postId): void
    {
        // persistence placeholder: the post is marked as published

        $this->eventDispatcher->dispatch(new PostPublishedEvent($postId));
    }
}
