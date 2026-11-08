<?php

declare(strict_types=1);

use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\ReversibleMigrationInterface;

final class M20261108000001CreateNewsletterSubscribers implements ReversibleMigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $b->createTable('newsletter_subscribers', [
            'id' => $b->primaryKey(),
            'email' => $b->string(255)->notNull()->unique(),
            'created_at' => $b->integer()->notNull(),
        ]);
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropTable('newsletter_subscribers');
    }
}

