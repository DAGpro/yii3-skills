<?php

declare(strict_types=1);

namespace App\Migration;

use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;

final class M260101000000CreatePost implements RevertibleMigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $b->createTable('post', ['id' => 'pk', 'title' => 'string(255) NOT NULL']);
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropTable('post');
    }
}
