<?php

declare(strict_types=1);

namespace App\Blog\Application;

use App\Blog\Domain\PostRepositoryInterface;

/**
 * HOT PATH: called on every GET /posts/latest request and currently hits the
 * database through the repository on each call.
 */
final readonly class LatestPostsService
{
    public function __construct(private PostRepositoryInterface $posts) {}

    /**
     * @return array<int, array<string, mixed>>
     */
    public function latestPosts(int $limit = 10): array
    {
        return $this->posts->findLatest($limit);
    }
}
