<?php

declare(strict_types=1);

namespace App\Migration;

use Yiisoft\Db\Constant\IndexType;
use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;
use Yiisoft\Db\Migration\TransactionalMigrationInterface;
use Yiisoft\Db\Schema\Column\ColumnBuilder;

final class M250115120000CreateOutboxMessagesTable implements
    RevertibleMigrationInterface,
    TransactionalMigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $b->createTable('{{%outbox_messages}}', [
            'id' => ColumnBuilder::bigPrimaryKey(),
            'idempotency_key' => ColumnBuilder::string(64)->notNull(),
            'aggregate_type' => ColumnBuilder::string(100)->notNull(),
            'aggregate_id' => ColumnBuilder::string(64)->notNull(),
            'message_type' => ColumnBuilder::string(150)->notNull(),
            'payload' => ColumnBuilder::text()->notNull(),
            'status' => ColumnBuilder::string(24)->notNull()->defaultValue('pending'),
            'attempts' => ColumnBuilder::smallint()->notNull()->defaultValue(0),
            'max_attempts' => ColumnBuilder::smallint()->notNull()->defaultValue(5),
            'available_at' => ColumnBuilder::datetime()->notNull(),
            'locked_at' => ColumnBuilder::datetime()->null(),
            'published_at' => ColumnBuilder::datetime()->null(),
            'last_error' => ColumnBuilder::text()->null(),
            'created_at' => ColumnBuilder::datetime()->notNull(),
        ]);

        $b->createIndex(
            '{{%outbox_messages}}',
            'ux_outbox_messages_idempotency_key',
            'idempotency_key',
            IndexType::UNIQUE,
        );

        $b->createIndex(
            '{{%outbox_messages}}',
            'idx_outbox_messages_poll',
            ['status', 'available_at', 'id'],
        );
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropTable('{{%outbox_messages}}');
    }
}
