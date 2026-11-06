<?php

declare(strict_types=1);

namespace App\Blog\Infrastructure;

use App\Blog\Domain\PostRepositoryInterface;
use Yiisoft\Data\Db\QueryDataReader;
use Yiisoft\Data\Reader\DataReaderInterface;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;

final readonly class DbPostRepository implements PostRepositoryInterface
{
    public function __construct(private ConnectionInterface $db) {}

    public function find(int $id): ?array
    {
        /** @var array<string, mixed>|null $row */
        $row = (new Query($this->db))
            ->from('{{%post}}')
            ->where(['id' => $id, 'status' => 'published'])
            ->one();

        return $row;
    }

    public function findAll(): DataReaderInterface
    {
        return new QueryDataReader(
            (new Query($this->db))
                ->from('{{%post}}')
                ->where(['status' => 'published'])
                ->orderBy(['created_at' => SORT_DESC])
        );
    }
}
