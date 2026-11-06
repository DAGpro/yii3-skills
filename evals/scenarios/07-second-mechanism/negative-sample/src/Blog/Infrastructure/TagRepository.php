<?php

declare(strict_types=1);

namespace App\Blog\Infrastructure;

use App\Blog\Domain\TagRepositoryInterface;
use Yiisoft\Db\Connection\ConnectionInterface;

final readonly class TagRepository implements TagRepositoryInterface
{
    public function __construct(private ConnectionInterface $db) {}

    public function all(): array
    {
        return $this->db->createCommand('SELECT * FROM tag')->queryAll();
    }
}
