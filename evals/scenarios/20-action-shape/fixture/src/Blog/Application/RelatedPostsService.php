<?php

declare(strict_types=1);

namespace App\Blog\Application;

/**
 * Use case under test is already implemented; the task is the HTTP action on top of it.
 */
final readonly class RelatedPostsService
{
    /**
     * @return list<array{id: int, title: string, author: string}>
     */
    public function findRelated(int $postId): array
    {
        return [];
    }
}
