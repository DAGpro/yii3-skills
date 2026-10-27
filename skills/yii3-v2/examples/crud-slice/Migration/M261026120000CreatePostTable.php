<?php

declare(strict_types=1);

namespace App\Migration;

use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;
use Yiisoft\Db\Migration\TransactionalMigrationInterface;

/**
 * Creates table `{{%post}}` with indexes.
 */
final class M261026120000CreatePostTable implements RevertibleMigrationInterface, TransactionalMigrationInterface
{
    private const TABLE_NAME = '{{%post}}';

    public function up(MigrationBuilder $b): void
    {
        $columns = $b->columnBuilder();

        $b->createTable(
            table: self::TABLE_NAME,
            columns: [
                'id' => $columns::primaryKey(),
                'title' => $columns::string(255)->notNull(),
                'content' => $columns::text()->notNull(),
                'status' => $columns::string(32)->notNull()->defaultValue('draft'),
                'created_at' => $columns::timestamp()->notNull(),
                'updated_at' => $columns::timestamp()->null(),
            ],
        );

        $b->createIndex(
            table: self::TABLE_NAME,
            name: 'idx_post_status_created_at',
            columns: ['status', 'created_at'],
        );
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropTable(self::TABLE_NAME);
    }
}
