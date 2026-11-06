<?php

declare(strict_types=1);

namespace App\Migration;

use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;

final class M260105000000CreateComment implements RevertibleMigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $b->createTable('comment', ['id' => 'pk', 'post_id' => 'integer NOT NULL', 'body' => 'text NOT NULL']);
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropTable('comment');
    }
}
