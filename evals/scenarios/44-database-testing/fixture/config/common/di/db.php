<?php

declare(strict_types=1);

use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Mysql\Connection;
use Yiisoft\Db\Mysql\Driver;

/**
 * Shared dev/staging database. The `db.internal` host only resolves inside
 * the company network - it does NOT exist on developer machines or CI.
 */
return [
    ConnectionInterface::class => static fn (): Connection => new Connection(new Driver(
        'mysql:host=db.internal;dbname=shop;charset=utf8mb4',
        'shop',
        'secret',
    )),
];
