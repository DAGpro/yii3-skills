<?php

declare(strict_types=1);

namespace App\Migration;

use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;

final class M20261109120000_CreateOrderTable implements RevertibleMigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $b->createTable('order', [
            'id' => $b->primaryKey(),
            'status' => $b->string(32)->notNull(),
            'cancel_reason' => $b->string(255)->null(),
        ]);
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropTable('order');
    }
}
