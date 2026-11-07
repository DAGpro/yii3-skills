<?php

declare(strict_types=1);

namespace App\Shop\Infrastructure;

use App\Shop\Domain\SearchOrdersRepositoryInterface;
use Yiisoft\Db\Connection\ConnectionInterface;

final readonly class SearchOrdersRepository implements SearchOrdersRepositoryInterface
{
    public function __construct(private ConnectionInterface $db) {}

    public function search(string $term): array
    {
        // The user term is pasted straight into the SQL string (known bug: breaks out of the LIKE literal).
        $sql = "SELECT o.id, o.number, o.customer_name FROM {{%order}} o WHERE o.number LIKE '%" . $term . "%'";

        return $this->db->createCommand($sql)->queryAll();
    }
}
