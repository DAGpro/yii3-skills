<?php

declare(strict_types=1);

namespace App\Migration;

use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;

final class M260105000000CreatePostView implements RevertibleMigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $b->createTable('post_view', ['id' => 'pk', 'post_id' => 'integer NOT NULL']);
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropTable('post_view');
    }
}
