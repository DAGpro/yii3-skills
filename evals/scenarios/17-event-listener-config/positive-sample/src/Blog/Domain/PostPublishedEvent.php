<?php

declare(strict_types=1);

namespace App\Blog\Domain;

/**
 * Domain event: a post has been published.
 */
final readonly class PostPublishedEvent
{
    public function __construct(
        public string $postId,
    ) {}
}
