<?php

declare(strict_types=1);

namespace App\Infrastructure\Migration;

use Yiisoft\Db\Constant\IndexType;
use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;
use Yiisoft\Db\Migration\TransactionalMigrationInterface;
use Yiisoft\Db\Schema\Column\ColumnBuilder;

final class M250115120500CreateOutboxMessagesTable implements RevertibleMigrationInterface, TransactionalMigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $b->createTable('outbox_messages', [
            'id' => ColumnBuilder::primaryKey(),
            'message_id' => ColumnBuilder::string(64)->notNull(),
            'message_type' => ColumnBuilder::string(120)->notNull(),
            'payload_json' => ColumnBuilder::text()->notNull(),
            'status' => ColumnBuilder::string(24)->notNull()->defaultValue('pending'),
            'attempts' => ColumnBuilder::integer()->notNull()->defaultValue(0),
            'last_error' => ColumnBuilder::text(),
            'created_at' => ColumnBuilder::integer()->notNull(),
            'published_at' => ColumnBuilder::integer(),
        ]);
        $b->createIndex('outbox_messages', 'uq_outbox_message_id', ['message_id'], IndexType::UNIQUE);
        $b->createIndex('outbox_messages', 'idx_outbox_status_id', ['status', 'id']);
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropTable('outbox_messages');
    }
}
