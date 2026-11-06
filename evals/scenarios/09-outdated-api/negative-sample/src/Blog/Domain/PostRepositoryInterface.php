<?php

declare(strict_types=1);

namespace App\Blog\Domain;

interface PostRepositoryInterface
{
    public function find(int $id): ?Post;

    public function all(): array;
}
