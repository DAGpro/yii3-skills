<?php

declare(strict_types=1);

namespace App\Blog\Domain;

interface PostRepositoryInterface
{
    /**
     * @return array<int, array<string, mixed>>
     */
    public function findLatest(int $limit): array;
}
