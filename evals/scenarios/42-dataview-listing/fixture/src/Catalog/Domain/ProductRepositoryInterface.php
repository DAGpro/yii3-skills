<?php

declare(strict_types=1);

namespace App\Catalog\Domain;

use Yiisoft\Data\Reader\DataReaderInterface;

interface ProductRepositoryInterface
{
    /**
     * Data reader over ALL products. Unbounded by design: callers are responsible
     * for bounding the result (paginate it) before exposing it to the response.
     */
    public function findAll(): DataReaderInterface;
}
