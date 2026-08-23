# Yii3 Migrations (yiisoft/db-migration)

## Step 0: Verify Setup

1. `yiisoft/db-migration` must be in composer.json (`composer require yiisoft/db-migration` if not).
2. Migrations namespace must be configured in `config/common/params.php`:
   ```php
   'yiisoft/db-migration' => [
       'newMigrationNamespace' => 'App\\Migration',
       'sourceNamespaces' => ['App\\Migration'],
   ],
   ```
   Default directory: `src/Migration`.
3. A connection must exist: `ConnectionInterface` registered in `config/common/di/db-<driver>.php`
   with DSN/credentials from params.
4. Ask for: table name, columns with types/constraints, indexes, FKs, whether to also generate entity +
   repository (then continue with `yii3-actions` (references/CRUD.md)).

## Step 1: Generate the Migration Class

Class name format: `M<YYMMDDHHMMSS><Name>` — the timestamp prefix is mandatory for ordering.
Example `src/Migration/M251102141707Page.php`:

```php
<?php

declare(strict_types=1);

namespace App\Migration;

use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;

final class M251102141707Page implements RevertibleMigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $column = $b->columnBuilder();

        $b->createTable('page', [
            'id' => $column::uuidPrimaryKey(),
            'title' => $column::string()->notNull(),
            'slug' => $column::string()->notNull()->unique(),
            'text' => $column::text()->notNull(),
            'created_at' => $column::dateTime(),
            'updated_at' => $column::dateTime(),
        ]);
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropTable('page');
    }
}
```

Column builder methods: `primaryKey()`, `uuidPrimaryKey()`, `string()`, `text()`, `integer()`,
`boolean()`, `decimal()`, `dateTime()`, `json()`, ... chained with `->notNull()`, `->unique()`,
`->defaultValue(...)`. Table names in queries use the `{{%table}}` prefix syntax so configured
table prefixes apply.

For altering existing tables:

```php
public function up(MigrationBuilder $b): void
{
    $b->addColumn('page', 'status', 'string NOT NULL DEFAULT \'draft\'');
}

public function down(MigrationBuilder $b): void
{
    $b->dropColumn('page', 'status');
}
```

For UUID primary keys ensure `ramsey/uuid` is installed (`composer require ramsey/uuid`).
Note for MySQL: store UUIDv7 as bytes via `Uuid::uuid7()->getBytes()`.

## Step 2: Apply

```sh
# Docker projects
make yii migrate:create <name>   # optional scaffold helper
make yii migrate:up

# Plain
php yii migrate:up
```

Then confirm `migrate:down` reverts cleanly when testing.

## Step 3: Entity & Repository (optional, on request)

Follow the patterns of the `yii3-actions` (references/CRUD.md) skill:

- Immutable `final readonly class` entity with private constructor + named constructor `create()`.
- Repository with `ConnectionInterface`, methods like `findOneBySlug()`, `findAll()`, `save()`,
  `deleteBySlug()`, hydrating rows into entities.

## Verification Checklist

1. `php -l` on the migration file.
2. Migration applies and reverts without SQL errors against the dev database.
3. Timestamp prefix is unique (no duplicate ordering with existing migrations).
4. `down()` fully reverses everything `up()` created (tables, columns, indexes).
