<?php

declare(strict_types=1);

namespace App\Blog\Infrastructure;

use App\Blog\Domain\Post;
use App\Blog\Domain\PostRepositoryInterface;

/**
 * Fixture stub: the persistence layer itself is out of scope for this
 * scenario — the class only makes the DI binding in config/common/di/blog.php
 * resolvable.
 */
final class DbPostRepository implements PostRepositoryInterface
{
    public function find(int $id): ?Post
    {
        return null;
    }
}
