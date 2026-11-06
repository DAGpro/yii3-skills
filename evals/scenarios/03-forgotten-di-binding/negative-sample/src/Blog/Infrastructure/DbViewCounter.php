<?php

declare(strict_types=1);

namespace App\Blog\Infrastructure;

use App\Blog\Domain\ViewCounterInterface;
use Yiisoft\Db\Connection\ConnectionInterface;

final readonly class DbViewCounter implements ViewCounterInterface
{
    public function __construct(private ConnectionInterface $db) {}

    public function increment(int $postId): void
    {
        $this->db->createCommand()->insert('post_view', ['post_id' => $postId])->execute();
    }
}
