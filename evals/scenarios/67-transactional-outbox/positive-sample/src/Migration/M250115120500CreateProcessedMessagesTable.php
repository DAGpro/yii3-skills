<?php

declare(strict_types=1);

namespace App\Migration;

use Yiisoft\Db\Constant\IndexType;
use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;
use Yiisoft\Db\Migration\TransactionalMigrationInterface;
use Yiisoft\Db\Schema\Column\ColumnBuilder;

final class M250115120500CreateProcessedMessagesTable implements
    RevertibleMigrationInterface,
    TransactionalMigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $b->createTable('{{%processed_messages}}', [
            'id' => ColumnBuilder::bigPrimaryKey(),
            'consumer_name' => ColumnBuilder::string(100)->notNull(),
            'idempotency_key' => ColumnBuilder::string(64)->notNull(),
            'processed_at' => ColumnBuilder::datetime()->notNull(),
        ]);

        $b->createIndex(
            '{{%processed_messages}}',
            'ux_processed_messages_consumer_key',
            ['consumer_name', 'idempotency_key'],
            IndexType::UNIQUE,
        );
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropTable('{{%processed_messages}}');
    }
}
