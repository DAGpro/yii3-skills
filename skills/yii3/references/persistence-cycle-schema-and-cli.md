# Yii3 Persistence: Cycle Schema Configuration & CLI (`yiisoft/yii-cycle`)

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Practical guide for Cycle ORM Yii3 integration via `yiisoft/yii-cycle`: DBAL driver configuration, multi-provider schema pipeline, production compilation caching, Cycle migrations (`cycle/migrations`, `cycle/schema-migrations-generator`), CLI commands reference, and RBAC storage integration (`yiisoft/rbac-cycle-db`).
>
> Complements the core data modeling guide: [`persistence-cycle-orm.md`](persistence-cycle-orm.md) (entities, relations, behaviors, unit of work, and data readers).

---

## Table of Contents

- [1. DBAL & Connection Configuration in `config/params.php`](#1-dbal--connection-configuration-in-configparamsphp)
- [2. Schema Provider Pipeline & Production Caching](#2-schema-provider-pipeline--production-caching)
- [3. Cycle Migrations Engine vs `yiisoft/db-migration`](#3-cycle-migrations-engine-vs-yiisoftdb-migration)
- [4. Schema & Migration CLI Commands Reference](#4-schema--migration-cli-commands-reference)
- [5. RBAC Storage Integration (`yiisoft/rbac-cycle-db`)](#5-rbac-storage-integration-yiisoftrbac-cycle-db)
- [6. Anti-Pattern Matrix: Cycle Configuration & CLI](#6-anti-pattern-matrix-cycle-configuration--cli)
- [7. Related Guides](#7-related-guides)

---

## 1. DBAL & Connection Configuration in `config/params.php`

All Cycle ORM settings in Yii3 reside under `'yiisoft/yii-cycle'` in `config/params.php`.

The `'dbal'` key configures database connections, drivers, aliases, and query logging:

```php
declare(strict_types=1);

use Cycle\Database\Config\MySQL\TcpConnectionConfig as MySQLTcpConnectionConfig;
use Cycle\Database\Config\MySQLDriverConfig;
use Cycle\Database\Config\Postgres\TcpConnectionConfig as PostgresTcpConnectionConfig;
use Cycle\Database\Config\PostgresDriverConfig;
use Cycle\Database\Config\SQLite\FileConnectionConfig;
use Cycle\Database\Config\SQLiteDriverConfig;
use Cycle\Database\Config\SQLServer\TcpConnectionConfig as SQLServerTcpConnectionConfig;
use Cycle\Database\Config\SQLServerDriverConfig;
use Cycle\ORM\Collection\ArrayCollectionFactory;
use Cycle\ORM\Collection\DoctrineCollectionFactory;
use Psr\Log\LoggerInterface;

return [
    'yiisoft/yii-cycle' => [
        // 1. DBAL Configuration (Databases & Driver Connections)
        'dbal' => [
            // PSR-3 Logger definition or service name for SQL query logging
            'query-logger' => LoggerInterface::class,
            // Name of the default database
            'default' => 'default',
            'aliases' => [],
            'databases' => [
                'default' => ['connection' => 'sqlite'],
            ],
            'connections' => [
                // SQLite (Default)
                'sqlite' => new SQLiteDriverConfig(
                    connection: new FileConnectionConfig(
                        database: '@runtime/database.sqlite',
                    ),
                    queryCache: true,
                ),

                // MySQL / MariaDB Recipe:
                // 'mysql' => new MySQLDriverConfig(
                //     connection: new MySQLTcpConnectionConfig(
                //         database: 'app_db',
                //         host: '127.0.0.1',
                //         port: 3306,
                //         user: 'root',
                //         password: 'secret_password',
                //     ),
                //     queryCache: true,
                // ),

                // PostgreSQL Recipe:
                // 'pgsql' => new PostgresDriverConfig(
                //     connection: new PostgresTcpConnectionConfig(
                //         database: 'app_db',
                //         host: '127.0.0.1',
                //         port: 5432,
                //         user: 'postgres',
                //         password: 'secret_password',
                //     ),
                //     schema: 'public',
                //     queryCache: true,
                // ),

                // SQL Server Recipe:
                // 'sqlsrv' => new SQLServerDriverConfig(
                //     connection: new SQLServerTcpConnectionConfig(
                //         database: 'app_db',
                //         host: '127.0.0.1',
                //         port: 1433,
                //         user: 'sa',
                //         password: 'secret_password',
                //     ),
                //     queryCache: true,
                // ),
            ],
        ],

        // 2. Cycle Migrations Configuration
        'migrations' => [
            'directory' => '@root/migrations',
            'namespace' => 'App\\Migration',
            'table' => 'migration',
            'safe' => false,
            // Additional vendor migration directories (e.g. for yiisoft/rbac-cycle-db):
            // 'vendorDirectories' => [
            //     dirname(__DIR__, 2) . '/vendor/yiisoft/rbac-cycle-db/migrations/items',
            //     dirname(__DIR__, 2) . '/vendor/yiisoft/rbac-cycle-db/migrations/assignments',
            // ],
        ],

        // 3. Collection Factories
        'collections' => [
            'default' => 'doctrine', // 'doctrine' or 'array'
            'factories' => [
                'array' => ArrayCollectionFactory::class,
                'doctrine' => DoctrineCollectionFactory::class,
            ],
        ],

        // 4. Scanned Attributed Entity Directories (aliases supported)
        'entity-paths' => [
            '@src/Domain/Model',
        ],
    ],
];
```

---

## 2. Schema Provider Pipeline & Production Caching

Cycle ORM compiles an in-memory schema describing table layouts, column types, relationships, and typecasting rules.

`MetadataSchemaConveyor` automatically registers **14 standard schema generators** across three internal compilation stages:
- **STAGE_INDEX:** `ResetTables`, `Embeddings`, `Entities`, `TableInheritance`, `MergeColumns`
- **STAGE_RENDER:** `GenerateRelations`, `GenerateModifiers`, `ValidateEntities`, `RenderTables`, `RenderRelations`, `RenderModifiers`, `ForeignKeys`, `MergeIndexes` (appended last by `MetadataSchemaConveyor`)
- **STAGE_POSTPROCESS:** `GenerateTypecast` (`\Cycle\Schema\Generator\GenerateTypecast::class`)

> [!WARNING]
> **Do NOT duplicate built-in generators in `FromConveyorSchemaProvider['generators']`!**
> Built-in generators are already registered by default. Passing them in the `'generators'` array appends them to `STAGE_USERLAND`, causing duplicate table rendering and redundant relation passes.
> Only place development-only generators (such as `\Cycle\Schema\Generator\SyncTables::class` for automatic table schema sync in dev) or custom userland generators into `'generators'`.

In production, dynamically parsing attributes on every HTTP request adds significant latency. Use a multi-provider pipeline:

```php
declare(strict_types=1);

use Cycle\Schema\Provider\FromFilesSchemaProvider;
use Cycle\Schema\Provider\SimpleCacheSchemaProvider;
use Yiisoft\Yii\Cycle\Schema\Provider\FromConveyorSchemaProvider;

return [
    'yiisoft/yii-cycle' => [
        'schema-providers' => [
            // 1. Production: Loads compiled schema instantly from static PHP cache
            FromFilesSchemaProvider::class => [
                'files' => ['@runtime/cycle-schema.php'],
            ],

            // 2. Development: Caches schema in PSR-16 cache between requests
            SimpleCacheSchemaProvider::class => [
                'key' => 'cycle-schema-cache',
            ],

            // 3. Fallback: Rebuilds schema from annotated entity classes
            FromConveyorSchemaProvider::class => [
                'generators' => [
                    // \Cycle\Schema\Generator\SyncTables::class, // Dev-only: sync tables directly
                ],
            ],
        ],
    ],
];
```

During deployment, run `php yii cycle:schema:php runtime/cycle-schema.php` to generate the static cache file.

---

## 3. Cycle Migrations Engine vs `yiisoft/db-migration`

> [!IMPORTANT]
> **Cycle Migrations vs `yiisoft/db-migration`:**
> - `yiisoft/db-migration` is designed for `yiisoft/db` and Active Record, using `MigrationBuilder` and `ColumnBuilder`.
> - `yiisoft/yii-cycle` uses `cycle/migrations` and `cycle/schema-migrations-generator`, working with `Cycle\Migrations\Migration` and `Cycle\Database\Table`.
> - When using Cycle ORM, run `php yii migrate:*` commands managed by `yiisoft/yii-cycle`. Do not mix `yiisoft/db-migration` with Cycle ORM.

### Anatomy of a Cycle Migration Class

A Cycle migration extends `Cycle\Migrations\Migration`:

```php
declare(strict_types=1);

namespace App\Migration;

use Cycle\Database\Table;
use Cycle\Migrations\Migration;

final class M20261030120000CreateUsersTable extends Migration
{
    public function up(): void
    {
        /** @var Table $table */
        $table = $this->database()->table('users');
        $schema = $table->getSchema();

        $schema->string('id', 36)->nullable(false);
        $schema->string('name', 128)->nullable(false);
        $schema->string('email', 255)->nullable(false);
        $schema->boolean('is_active')->defaultValue(true)->nullable(false);
        $schema->datetime('created_at')->nullable(true);
        $schema->datetime('updated_at')->nullable(true);

        $schema->setPrimaryKeys(['id']);
        $schema->index(['email'])->unique();

        $schema->save();
    }

    public function down(): void
    {
        $this->dropTable('users');
    }
}
```

Cycle can also automatically compute the schema diff between your PHP entity attributes and the database, generating migration code via `php yii migrate:generate`.

---

## 4. Schema & Migration CLI Commands Reference

`yiisoft/yii-cycle` automatically registers CLI commands under `'yiisoft/yii-console' => ['commands' => [...]]`:

| CLI Command | Handler Class | Description |
|---|---|---|
| `php yii cycle:schema [role]` | `Yiisoft\Yii\Cycle\Command\Schema\SchemaCommand` | Displays the compiled Cycle schema in the console, optionally filtered by entity role. |
| `php yii cycle:schema:php [file]` | `Yiisoft\Yii\Cycle\Command\Schema\SchemaPhpCommand` | Dumps the compiled schema to a native PHP file for zero-overhead production loading. |
| `php yii cycle:schema:clear` | `Yiisoft\Yii\Cycle\Command\Schema\SchemaClearCommand` | Clears the compiled schema PSR-16 cache. |
| `php yii cycle:schema:rebuild` | `Yiisoft\Yii\Cycle\Command\Schema\SchemaRebuildCommand` | Forces clearing and recompiling schema from entity attributes. |
| `php yii migrate:list` | `Yiisoft\Yii\Cycle\Command\Migration\ListCommand` | Lists all migrations and their execution status (`[pending]`, `[executed]`). |
| `php yii migrate:create <name>` | `Yiisoft\Yii\Cycle\Command\Migration\CreateCommand` | Creates an empty custom migration file skeleton. |
| `php yii migrate:generate` | `Yiisoft\Yii\Cycle\Command\Migration\GenerateCommand` | Computes the diff between entity attributes and live database tables, creating migration code. |
| `php yii migrate:up` | `Yiisoft\Yii\Cycle\Command\Migration\UpCommand` | Executes all pending migrations; emits `BeforeMigrate` and `AfterMigrate` events. |
| `php yii migrate:down` | `Yiisoft\Yii\Cycle\Command\Migration\DownCommand` | Rolls back the last executed migration; emits `BeforeMigrate` and `AfterMigrate` events. |

---

## 5. RBAC Storage Integration (`yiisoft/rbac-cycle-db`)

When building an application with Cycle ORM and role-based access control (`yiisoft/rbac`), use `yiisoft/rbac-cycle-db` instead of `yiisoft/rbac-db`. This ensures RBAC tables share the exact same Cycle DBAL connection pool and migration engine.

### 5.1. Wire RBAC Storage in `config/common/di/rbac.php`

```php
declare(strict_types=1);

use Cycle\Database\DatabaseInterface;
use Cycle\Database\DatabaseManager;
use Yiisoft\Definitions\DynamicReference;
use Yiisoft\Definitions\Reference;
use Yiisoft\Rbac\AssignmentsStorageInterface;
use Yiisoft\Rbac\Cycle\AssignmentsStorage;
use Yiisoft\Rbac\Cycle\ItemsStorage;
use Yiisoft\Rbac\Cycle\TransactionalManagerDecorator;
use Yiisoft\Rbac\ItemsStorageInterface;
use Yiisoft\Rbac\Manager;
use Yiisoft\Rbac\ManagerInterface;

return [
    ItemsStorageInterface::class => [
        'class' => ItemsStorage::class,
        '__construct()' => [
            'database' => DynamicReference::to(static fn (DatabaseManager $db): DatabaseInterface => $db->database()),
            'tableName' => 'yii_rbac_item',
            'childrenTableName' => 'yii_rbac_item_child',
        ],
    ],
    AssignmentsStorageInterface::class => [
        'class' => AssignmentsStorage::class,
        '__construct()' => [
            'database' => DynamicReference::to(static fn (DatabaseManager $db): DatabaseInterface => $db->database()),
            'tableName' => 'yii_rbac_assignment',
        ],
    ],
    ManagerInterface::class => [
        'class' => TransactionalManagerDecorator::class,
        '__construct()' => [
            'manager' => Reference::to(Manager::class),
            'database' => DynamicReference::to(static fn (DatabaseManager $db): DatabaseInterface => $db->database()),
        ],
    ],
];
```

### 5.2. Register Vendor Migrations in `config/common/params.php`

To run the official migrations included with `yiisoft/rbac-cycle-db`. The `dirname(__DIR__, 2)` depth below assumes the file sits two directory levels under the project root (the standard `config/common/params.php` layout); adjust the level for a different location:

```php
return [
    'yiisoft/yii-cycle' => [
        'migrations' => [
            'vendorDirectories' => [
                dirname(__DIR__, 2) . '/vendor/yiisoft/rbac-cycle-db/migrations/items',
                dirname(__DIR__, 2) . '/vendor/yiisoft/rbac-cycle-db/migrations/assignments',
            ],
        ],
    ],
];
```

Then execute `php yii migrate:up`.

---

## 6. Anti-Pattern Matrix: Cycle Configuration & CLI

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| ❌ **Mixing `yiisoft/db-migration` with Cycle** | Active Record and Cycle use different DBAL connections, state trackers, and migration bases. | Use `cycle/migrations` managed by `yiisoft/yii-cycle` (`php yii migrate:*`). |
| ❌ **Duplicating standard generators in `FromConveyorSchemaProvider`** | `MetadataSchemaConveyor` automatically registers the 14 standard generators; re-declaring them renders tables twice. | Leave `'generators' => []` or add only dev-only generators like `SyncTables`. |
| ❌ **Dynamic attribute parsing on every production request** | Heavy reflection over entity directories causes significant response latency. | Compile schema in CI/CD via `php yii cycle:schema:php runtime/cycle-schema.php` and load with `FromFilesSchemaProvider`. |
| ❌ **Using `yiisoft/rbac-db` with Cycle ORM** | Forces maintaining two separate database connection pools (`yiisoft/db` + Cycle DBAL). | Use `yiisoft/rbac-cycle-db` to share the same database connections and migrations. |

---

## 7. Related Guides

- [Cycle ORM Guide](persistence-cycle-orm.md) — Entity definition, relationships, Unit of Work, repositories, and data readers.
- [Active Record Persistence Guide](persistence-active-record.md) — Alternative Active Record persistence engine.
- [Database Migrations Guide](persistence-migrations.md) — General schema migration guidelines.
- [RBAC Storage Guide](infra-rbac-storage.md) — Storage adapters and assignment management for Yii3 RBAC.
