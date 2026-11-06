<?php

declare(strict_types=1);

namespace App\Blog\Infrastructure;

use App\Blog\Domain\PostRepositoryInterface;

/**
 * Fixture stub for the real SQL-backed repository: every call stands for an
 * expensive database round-trip (full scan + sort), which is why callers cache.
 */
final class DbPostRepository implements PostRepositoryInterface
{
    public function findLatest(int $limit): array
    {
        return [
            ['id' => 3, 'title' => 'Third post', 'createdAt' => '2026-01-03 10:00:00'],
            ['id' => 2, 'title' => 'Second post', 'createdAt' => '2026-01-02 10:00:00'],
            ['id' => 1, 'title' => 'First post', 'createdAt' => '2026-01-01 10:00:00'],
        ];
    }
}
