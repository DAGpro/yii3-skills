<?php

declare(strict_types=1);

namespace App\Migration;

use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;

final class M260115100000AddLastLoginAtToUsers implements RevertibleMigrationInterface
{
    private const TABLE_NAME = 'users';

    public function up(MigrationBuilder $b): void
    {
        $columns = $b->columnBuilder();

        $b->addColumn(
            table: self::TABLE_NAME,
            column: 'last_login_at',
            type: $columns::timestamp()->null(),
        );
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropColumn(table: self::TABLE_NAME, column: 'last_login_at');
    }
}
