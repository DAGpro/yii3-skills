<?php

declare(strict_types=1);

namespace App\Shop\Infrastructure;

use App\Shop\Domain\SearchOrdersRepositoryInterface;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;

final readonly class SearchOrdersRepository implements SearchOrdersRepositoryInterface
{
    public function __construct(private ConnectionInterface $db) {}

    public function search(string $term): array
    {
        // The term travels as a bound condition value, never as a literal inside the SQL text.
        return (new Query($this->db))
            ->select(['o.id', 'o.number', 'o.customer_name'])
            ->from('{{%order}} o')
            ->andWhere(['like', 'o.number', $term])
            ->all();
    }
}
