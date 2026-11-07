<?php

declare(strict_types=1);

namespace App\Blog\Infrastructure;

use App\Blog\Domain\Post;
use App\Blog\Domain\PostRepositoryInterface;

/**
 * Storage-backed repository under test; this fixture build ships sample rows.
 */
final class InMemoryPostRepository implements PostRepositoryInterface
{
    public function find(int $id): ?Post
    {
        return $this->rows()[$id] ?? null;
    }

    public function findAll(): array
    {
        return [...array_values($this->rows())];
    }

    /**
     * @return array<int, Post>
     */
    private function rows(): array
    {
        return [
            7 => new Post(7, 'Routing in Yii 3'),
            42 => new Post(42, 'Eval fixtures, grounded'),
        ];
    }
}
