<?php

declare(strict_types=1);

use Yiisoft\Db\Migration\MigrationBuilder;

final class M20261108000001CreateNewsletterSubscribers
{
    public function up(MigrationBuilder $b): void
    {
        $b->createTable('newsletter_subscribers', [
            'id' => $b->primaryKey(),
            'email' => $b->string(255)->notNull(),
        ]);
    }

    public function down(MigrationBuilder $b): void
    {
        // empty down() - irreversible
    }
}

