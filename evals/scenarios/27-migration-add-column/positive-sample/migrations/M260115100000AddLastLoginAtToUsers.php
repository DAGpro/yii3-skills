<?php

declare(strict_types=1);

namespace App\Migration;

use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;

final class M260115100000AddLastLoginAtToUsers implements RevertibleMigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $columns = $b->columnBuilder();

        $b->addColumn(
            table: 'users',
            column: 'last_login_at',
            type: $columns::timestamp()->null(),
        );
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropColumn(table: 'users', column: 'last_login_at');
    }
}
