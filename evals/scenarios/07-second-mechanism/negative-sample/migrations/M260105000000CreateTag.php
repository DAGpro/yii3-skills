<?php

declare(strict_types=1);

namespace App\Migration;

use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;

final class M260105000000CreateTag implements RevertibleMigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $b->createTable('tag', ['id' => 'pk', 'name' => 'string(64) NOT NULL']);
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropTable('tag');
    }
}
