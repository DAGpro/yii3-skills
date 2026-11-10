<?php

declare(strict_types=1);

namespace App\Infrastructure\Migration;

use Yiisoft\Db\Constant\IndexType;
use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;
use Yiisoft\Db\Migration\TransactionalMigrationInterface;
use Yiisoft\Db\Schema\Column\ColumnBuilder;

final class M250115121000CreateProcessedMessagesTable implements RevertibleMigrationInterface, TransactionalMigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $b->createTable('processed_messages', [
            'id' => ColumnBuilder::primaryKey(),
            'message_id' => ColumnBuilder::string(64)->notNull(),
            'consumer' => ColumnBuilder::string(120)->notNull(),
            'processed_at' => ColumnBuilder::integer()->notNull(),
        ]);
        $b->createIndex('processed_messages', 'uq_processed_message_consumer', ['message_id', 'consumer'], IndexType::UNIQUE);
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropTable('processed_messages');
    }
}
