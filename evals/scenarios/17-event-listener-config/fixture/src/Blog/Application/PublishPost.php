<?php

declare(strict_types=1);

namespace App\Blog\Application;

/**
 * Use case under test: marks a post as published.
 * The task adds the domain event emission around it.
 */
final readonly class PublishPost
{
    public function execute(string $postId): void
    {
        // persistence placeholder: the post is marked as published
    }
}
