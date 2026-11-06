<?php

declare(strict_types=1);

namespace App\Blog\Domain;

use Yiisoft\Data\Reader\DataReaderInterface;

interface PostRepositoryInterface
{
    /**
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array;

    /**
     * Data reader over ALL published posts (newest first). Unbounded by design:
     * callers are responsible for bounding the result (paginate it or apply an
     * explicit limit) before exposing it to a client.
     */
    public function findAll(): DataReaderInterface;
}
