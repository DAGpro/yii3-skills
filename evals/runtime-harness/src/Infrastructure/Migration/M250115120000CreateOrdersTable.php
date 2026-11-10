<?php

declare(strict_types=1);

namespace App\Infrastructure\Migration;

use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;
use Yiisoft\Db\Migration\TransactionalMigrationInterface;
use Yiisoft\Db\Schema\Column\ColumnBuilder;

final class M250115120000CreateOrdersTable implements RevertibleMigrationInterface, TransactionalMigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $b->createTable('orders', [
            'id' => ColumnBuilder::primaryKey(),
            'customer_email' => ColumnBuilder::string(190)->notNull(),
            'amount_cents' => ColumnBuilder::integer()->notNull(),
            'status' => ColumnBuilder::string(32)->notNull()->defaultValue('placed'),
            'created_at' => ColumnBuilder::integer()->notNull(),
        ]);
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropTable('orders');
    }
}
