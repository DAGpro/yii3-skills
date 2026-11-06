<?php

declare(strict_types=1);

namespace App\Blog\Application;

use App\Blog\Domain\Post;

/**
 * Domain use case under test: publishing is already handled here; the task is the
 * email notification that goes out to the post author as part of this flow.
 */
final readonly class PostPublisher
{
    public function publish(Post $post): void
    {
        // Marks the post published (persistence omitted in the fixture).
    }
}
