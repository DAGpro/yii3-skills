<?php

declare(strict_types=1);

namespace App\Migration;

use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;

final class M260101010101CreateUsersTable implements RevertibleMigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $b->createTable('users', [
            'id' => 'pk',
            'email' => 'string(255) NOT NULL',
            'name' => 'string(255)',
        ]);
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropTable('users');
    }
}
