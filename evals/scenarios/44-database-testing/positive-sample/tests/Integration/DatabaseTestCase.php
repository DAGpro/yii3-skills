<?php

declare(strict_types=1);

namespace App\Tests\Integration;

use App\Migration\M260101010101CreateProductTable;
use PHPUnit\Framework\TestCase;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Migration\Informer\NullMigrationInformer;
use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Sqlite\Connection;
use Yiisoft\Db\Sqlite\Driver;

abstract class DatabaseTestCase extends TestCase
{
    protected ConnectionInterface $db;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Establish SQLite in-memory connection
        $this->db = new Connection(new Driver('sqlite::memory:'));

        // 2. Instantiate MigrationBuilder with NullMigrationInformer
        $informer = new NullMigrationInformer();
        $builder = new MigrationBuilder(db: $this->db, informer: $informer);

        // 3. Execute migration DDL schema
        (new M260101010101CreateProductTable())->up($builder);

        // 4. Begin transaction for test isolation
        $this->db->beginTransaction();
    }

    protected function tearDown(): void
    {
        // 5. Rollback test mutations to keep database pristine
        if ($this->db->getTransaction() !== null) {
            $this->db->getTransaction()->rollBack();
        }

        $this->db->close();
        parent::tearDown();
    }
}
