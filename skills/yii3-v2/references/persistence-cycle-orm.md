# Yii3 Persistence: Cycle ORM Guide

> Practical guide for Cycle ORM Data Mapper persistence, PHP 8 entity attributes (`cycle/annotated`), Unit of Work (`cycle/orm`), DBAL & connection management (`cycle/database`), CLI schema migrations (`cycle/migrations`, `cycle/schema-migrations-generator`), Yii3 DI bridge (`yiisoft/yii-cycle`), paginated data readers and batch writers (`yiisoft/data-cycle`), entity behaviors (`cycle/entity-behavior`), and RBAC storage integration (`yiisoft/rbac-cycle-db`).
>
> Persistence details belong strictly to the Infrastructure Layer; Cycle ORM entities can serve as Domain Entities (POPO) or be mapped through dedicated Infrastructure Repositories.

---

## Table of Contents
- [1. Data Mapper Architecture & Clean Boundaries](#1-data-mapper-architecture--clean-boundaries)
  - [1.1. Data Mapper vs Active Record](#11-data-mapper-vs-active-record)
  - [1.2. Architecture Layout (Clean DDD)](#12-architecture-layout-clean-ddd)
- [2. Entity Definition with PHP 8 Attributes (`cycle/annotated`)](#2-entity-definition-with-php-8-attributes-cycleannotated)
  - [2.1. Basic Entity & Column Types](#21-basic-entity--column-types)
  - [2.2. Relational Attributes (`HasOne`, `HasMany`, `BelongsTo`, `ManyToMany`) & Collection Factories](#22-relational-attributes-hasone-hasmany-belongsto-manytomany--collection-factories)
  - [2.3. Automatic Entity Behaviors (`cycle/entity-behavior`)](#23-automatic-entity-behaviors-cycleentity-behavior)
- [3. Repositories, Unit of Work & Transactions (`cycle/orm`, `cycle/database`)](#3-repositories-unit-of-work--transactions-cycleorm-cycledatabase)
  - [3.1. Unit of Work: The Mandatory `run()` Rule](#31-unit-of-work-the-mandatory-run-rule)
  - [3.2. Concrete Cycle Repository Implementation (`CycleUserRepository.php`)](#32-concrete-cycle-repository-implementation-cycleuserrepositoryphp)
  - [3.3. Eager Loading Relational Data with `load()`](#33-eager-loading-relational-data-with-load)
  - [3.4. Atomic Transactions & Unit of Work](#34-atomic-transactions--unit-of-work)
  - [3.5. Long-Running Worker Reset (`$entityManager->clean()`) in RoadRunner & FrankenPHP](#35-long-running-worker-reset-entitymanagerclean-in-roadrunner--frankenphp)
- [4. Yii3 Integration, Configuration & CLI (`yiisoft/yii-cycle`)](#4-yii3-integration-configuration--cli-yiisoftyii-cycle)
  - [4.1. DBAL & Connection Configuration in `config/params.php`](#41-dbal--connection-configuration-in-configparamsphp)
  - [4.2. Schema Provider Pipeline & Production Caching](#42-schema-provider-pipeline--production-caching)
  - [4.3. Cycle Migrations Engine vs `yiisoft/db-migration`](#43-cycle-migrations-engine-vs-yiisoftdb-migration)
  - [4.4. Schema & Migration CLI Commands Reference](#44-schema--migration-cli-commands-reference)
  - [4.5. RBAC Storage Integration (`yiisoft/rbac-cycle-db`)](#45-rbac-storage-integration-yiisoftrbac-cycle-db)
- [5. Paginated Queries & Data Operations (`yiisoft/data-cycle`)](#5-paginated-queries--data-operations-yiisoftdata-cycle)
  - [5.1. `EntityReader` with Filters (`AndX`, `Equals`, `Like`), Sorting & Pagination](#51-entityreader-with-filters-andx-equals-like-sorting--pagination)
  - [5.2. Batch Writes & Deletions with `EntityWriter`](#52-batch-writes--deletions-with-entitywriter)
- [6. PHP 8 Named Arguments & Signatures Reference](#6-php-8-named-arguments--signatures-reference)
- [7. Anti-Pattern Matrix: Cycle ORM](#7-anti-pattern-matrix-cycle-orm)
- [8. Related Topic Guides](#8-related-topic-guides)

---

## 1. Data Mapper Architecture & Clean Boundaries

### 1.1. Data Mapper vs Active Record

Cycle ORM implements the **Data Mapper** pattern. Unlike Active Record:
- **No Database Coupling in Entities:** Entities do not extend framework base classes and have no awareness of database connections, SQL queries, or persistence state.
- **Unit of Work:** Mutations are staged in memory via `EntityManagerInterface::persist()` or `EntityManagerInterface::delete()` and executed atomically when `run()` is called.
- **Pure Domain Entities:** Domain entities can be annotated directly with PHP 8 attributes (`#[Entity]`, `#[Column]`) or kept completely pure using custom schema providers (e.g., compiled PHP or XML/YAML mapping definitions).

### 1.2. Architecture Layout (Clean DDD)

In clean DDD or layered architectures, domain entities and repository contracts remain independent of framework plumbing:

```text
src/
├── Domain/
│   ├── Model/
│   │   ├── User.php                    # Domain Entity (annotated with Cycle #[Entity])
│   │   ├── Order.php                   # Relational Domain Entity
│   │   └── UserId.php                  # Value Object (Identifier)
│   └── Repository/
│       └── UserRepositoryInterface.php # Pure Domain Repository contract
└── Infrastructure/
    └── Persistence/
        └── Cycle/
            ├── CycleUserRepository.php # Implements UserRepositoryInterface via Cycle ORM
            └── CycleUserGridQuery.php  # HTTP Grid query via Yiisoft\Data\Cycle\Reader\EntityReader
```

---

## 2. Entity Definition with PHP 8 Attributes (`cycle/annotated`)

> [!NOTE]
> Mapping attributes belong to the external package `cycle/annotated` (`Cycle\Annotated\Annotation\*`), while runtime classes (`Select`, `EntityManager`) belong to `cycle/orm`. Always check exact attribute arguments in `vendor/cycle/annotated/src/`.

### 2.1. Basic Entity & Column Types

Entities use standard PHP 8 typed properties. The `#[Entity]` attribute defines table mapping and optional custom repository bindings:

```php
declare(strict_types=1);

namespace App\Domain\Model;

use Cycle\Annotated\Annotation\Column;
use Cycle\Annotated\Annotation\Entity;
use DateTimeImmutable;

#[Entity(table: 'users')]
class User
{
    #[Column(type: 'string(36)', primary: true)]
    private string $id;

    #[Column(type: 'string(128)')]
    private string $name;

    #[Column(type: 'string(255)', unique: true)]
    private string $email;

    #[Column(type: 'boolean', default: true)]
    private bool $isActive = true;

    #[Column(type: 'datetime', nullable: true)]
    private ?DateTimeImmutable $createdAt = null;

    #[Column(type: 'datetime', nullable: true)]
    private ?DateTimeImmutable $updatedAt = null;

    public function __construct(string $id, string $name, string $email)
    {
        $this->id = $id;
        $this->name = $name;
        $this->email = mb_strtolower($email);
        $this->createdAt = new DateTimeImmutable();
        $this->updatedAt = new DateTimeImmutable();
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getEmail(): string
    {
        return $this->email;
    }

    public function isActive(): bool
    {
        return $this->isActive;
    }

    public function getCreatedAt(): ?DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): ?DateTimeImmutable
    {
        return $this->updatedAt;
    }

    public function rename(string $newName): void
    {
        $this->name = $newName;
        $this->updatedAt = new DateTimeImmutable();
    }

    public function changeEmail(string $newEmail): void
    {
        $this->email = mb_strtolower($newEmail);
        $this->updatedAt = new DateTimeImmutable();
    }
}
```

### 2.2. Relational Attributes (`HasOne`, `HasMany`, `BelongsTo`, `ManyToMany`) & Collection Factories

Relations are defined using attributes from `Cycle\Annotated\Annotation\Relation`.

> [!IMPORTANT]
> **Collection Factory Configuration:**
> `yiisoft/yii-cycle` defaults to native PHP arrays (`'collections' => ['default' => 'array']`).
> If you type relation properties as `Doctrine\Common\Collections\Collection`, you **must** configure the Doctrine collection factory in `config/params.php`:
> ```php
> 'collections' => [
>     'default' => 'doctrine',
>     'factories' => [
>         'array' => \Cycle\ORM\Collection\ArrayCollectionFactory::class,
>         'doctrine' => \Cycle\ORM\Collection\DoctrineCollectionFactory::class,
>     ],
> ],
> ```
> If using arrays (the default), type the property as `array $orders = []` instead of `Collection`.

Here is an example configured for Doctrine Collections:

```php
declare(strict_types=1);

namespace App\Domain\Model;

use Cycle\Annotated\Annotation\Column;
use Cycle\Annotated\Annotation\Entity;
use Cycle\Annotated\Annotation\Relation\BelongsTo;
use Cycle\Annotated\Annotation\Relation\HasMany;
use Cycle\Annotated\Annotation\Relation\HasOne;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;

#[Entity(table: 'users')]
class User
{
    #[Column(type: 'string(36)', primary: true)]
    private string $id;

    /** 1:1 Relation */
    #[HasOne(target: Profile::class)]
    private ?Profile $profile = null;

    /**
     * 1:N Relation
     * @var Collection<array-key, Order>
     */
    #[HasMany(target: Order::class)]
    private Collection $orders;

    public function __construct(string $id)
    {
        $this->id = $id;
        $this->orders = new ArrayCollection();
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getProfile(): ?Profile
    {
        return $this->profile;
    }

    public function setProfile(?Profile $profile): void
    {
        $this->profile = $profile;
    }

    /**
     * @return Collection<array-key, Order>
     */
    public function getOrders(): Collection
    {
        return $this->orders;
    }
}

#[Entity(table: 'orders')]
class Order
{
    #[Column(type: 'string(36)', primary: true)]
    private string $id;

    #[Column(type: 'string(36)')]
    private string $userId;

    /** Inverse N:1 Relation */
    #[BelongsTo(target: User::class, innerKey: 'userId')]
    private ?User $user = null;

    public function __construct(string $id, User $user)
    {
        $this->id = $id;
        $this->user = $user;
        $this->userId = $user->getId();
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getUser(): ?User
    {
        return $this->user;
    }
}
```

### 2.3. Automatic Entity Behaviors (`cycle/entity-behavior`)

The `cycle/entity-behavior` package provides attributes that automate common lifecycle concerns such as creation timestamps, update timestamps, and soft deletes.

When `cycle/entity-behavior` is installed (`composer require cycle/entity-behavior`), `yiisoft/yii-cycle` automatically registers `BehaviorsHandler` in `Cycle\ORM\ORM` via its DI container definition (`class_exists(BehaviorsHandler::class) ? new BehaviorsHandler($schema, $container) : null`), requiring zero manual wiring.

```php
declare(strict_types=1);

namespace App\Domain\Model;

use Cycle\Annotated\Annotation\Column;
use Cycle\Annotated\Annotation\Entity;
use Cycle\ORM\Entity\Behavior\CreatedAt;
use Cycle\ORM\Entity\Behavior\SoftDelete;
use Cycle\ORM\Entity\Behavior\UpdatedAt;
use DateTimeImmutable;

#[Entity(table: 'articles')]
#[CreatedAt(field: 'createdAt', column: 'created_at')]
#[UpdatedAt(field: 'updatedAt', column: 'updated_at')]
#[SoftDelete(field: 'deletedAt', column: 'deleted_at')]
class Article
{
    #[Column(type: 'primary')]
    private int $id;

    #[Column(type: 'string(255)')]
    private string $title;

    #[Column(type: 'datetime')]
    private DateTimeImmutable $createdAt;

    #[Column(type: 'datetime', nullable: true)]
    private ?DateTimeImmutable $updatedAt = null;

    #[Column(type: 'datetime', nullable: true)]
    private ?DateTimeImmutable $deletedAt = null;

    public function __construct(string $title)
    {
        $this->title = $title;
    }

    public function getId(): int
    {
        return $this->id;
    }

    public function getTitle(): string
    {
        return $this->title;
    }

    public function getCreatedAt(): DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): ?DateTimeImmutable
    {
        return $this->updatedAt;
    }

    public function getDeletedAt(): ?DateTimeImmutable
    {
        return $this->deletedAt;
    }
}
```

---

## 3. Repositories, Unit of Work & Transactions (`cycle/orm`, `cycle/database`)

### 3.1. Unit of Work: The Mandatory `run()` Rule

> [!CRITICAL]
> **Staging vs Execution:**
> In Cycle ORM, `$entityManager->persist($entity)` and `$entityManager->delete($entity)` **only stage operations** in memory.
> Nothing is written or deleted in the database until **`$entityManager->run()`** is explicitly called!
> Forgetting `->run()` results in silent data loss: no SQL queries execute, and no exceptions are thrown.

### 3.2. Concrete Cycle Repository Implementation (`CycleUserRepository.php`)

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\Cycle;

use App\Domain\Model\User;
use App\Domain\Model\UserId;
use App\Domain\Repository\UserRepositoryInterface;
use Cycle\ORM\EntityManagerInterface;
use Cycle\ORM\ORMInterface;
use Cycle\ORM\Select;
use Yiisoft\Data\Cycle\Reader\EntityReader;
use Yiisoft\Data\Reader\Filter\Equals;

final readonly class CycleUserRepository implements UserRepositoryInterface
{
    public function __construct(
        private ORMInterface $orm,
        private EntityManagerInterface $entityManager,
    ) {}

    public function findById(UserId $id): ?User
    {
        $select = new Select($this->orm, User::class);

        /** @var User|null $user */
        $user = (new EntityReader($select))
            ->withFilter(new Equals('id', $id->value))
            ->readOne();

        return $user;
    }

    public function findByEmail(string $email): ?User
    {
        $select = new Select($this->orm, User::class);

        /** @var User|null $user */
        $user = (new EntityReader($select))
            ->withFilter(new Equals('email', mb_strtolower($email)))
            ->readOne();

        return $user;
    }

    public function save(User $user): void
    {
        $this->entityManager->persist($user);
        $this->entityManager->run(); // Executes the staged Unit of Work
    }

    public function delete(User $user): void
    {
        $this->entityManager->delete($user);
        $this->entityManager->run(); // Executes the staged Unit of Work
    }
}
```

### 3.3. Eager Loading Relational Data with `load()`

To prevent N+1 query loops when fetching entities with relations, use `load()` on `Cycle\ORM\Select`:

```php
declare(strict_types=1);

use App\Domain\Model\User;
use Cycle\ORM\ORMInterface;
use Cycle\ORM\Select;

/** @var ORMInterface $orm */
$select = (new Select($orm, User::class))
    ->load('profile')
    ->load(
        relation: 'orders',
        load: ['load' => static function (Select\QueryBuilder $query): void {
            $query->where('status', '=', 'completed');
        }],
    )
    ->where('isActive', '=', true);

/** @var User[] $users */
$users = $select->fetchAll();
```

> [!NOTE]
> When using PHP 8 named arguments with `Select::load()`, the relation name parameter is `relation:` and the options array parameter is named **`load:`** (not `params:`).

### 3.4. Atomic Transactions & Unit of Work

When an operation spans multiple repository calls, external writes, or complex aggregate updates, execute the Unit of Work inside a DBAL closure transaction via `Cycle\Database\DatabaseManager`:

```php
declare(strict_types=1);

namespace App\Application\UseCase;

use App\Domain\Model\Order;
use App\Domain\Model\User;
use Cycle\Database\DatabaseManager;
use Cycle\ORM\EntityManagerInterface;
use Throwable;

final readonly class PlaceOrderUseCase
{
    public function __construct(
        private DatabaseManager $dbal,
        private EntityManagerInterface $entityManager,
    ) {}

    /**
     * @throws Throwable
     */
    public function execute(User $user, Order $order): void
    {
        // Executes in an atomic DBAL transaction on the default database
        $this->dbal->database()->transaction(function () use ($user, $order): void {
            $this->entityManager->persist($user);
            $this->entityManager->persist($order);
            $this->entityManager->run();
        });
    }
}
```

### 3.5. Long-Running Worker Reset (`$entityManager->clean()`) in RoadRunner & FrankenPHP

In daemonized worker runtimes (RoadRunner, FrankenPHP, Swoole), PHP worker processes survive across multiple HTTP requests. Over time, `EntityManager` retains hydrated entities in memory within its Identity Map (Heap).

If not reset between requests:
- Memory consumption grows continuously (memory leak).
- Stale or mutated entities from a previous user's request can leak into subsequent requests.

`yiisoft/yii-cycle` automatically registers a reset handler in `config/di.php`:

```php
EntityManager::class => [
    'reset' => function () {
        $this->clean();
    },
],
```

If you manage an `EntityManager` instance outside the standard container lifecycle (for example, inside custom queue workers or long-running CLI daemon loops), always invoke `$entityManager->clean()` manually at the end of each iteration:

```php
declare(strict_types=1);

use Cycle\ORM\EntityManagerInterface;

/** @var EntityManagerInterface $entityManager */
try {
    // Process job / task
    $entityManager->persist($entity);
    $entityManager->run();
} finally {
    // Clear the Identity Map and reset staged state for the next job
    $entityManager->clean();
}
```

---

## 4. Yii3 Integration, Configuration & CLI (`yiisoft/yii-cycle`)

### 4.1. DBAL & Connection Configuration in `config/params.php`

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

### 4.2. Schema Provider Pipeline & Production Caching

Cycle ORM compiles an in-memory schema describing table layouts, column types, relationships, and typecasting rules.

`MetadataSchemaConveyor` automatically registers **14 standard schema generators** across three internal compilation stages:
- **STAGE_INDEX:** `ResetTables`, `Embeddings`, `Entities`, `TableInheritance`, `MergeColumns`
- **STAGE_RENDER:** `MergeIndexes`, `GenerateRelations`, `GenerateModifiers`, `ValidateEntities`, `RenderTables`, `RenderRelations`, `RenderModifiers`, `ForeignKeys`
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

### 4.3. Cycle Migrations Engine vs `yiisoft/db-migration`

> [!IMPORTANT]
> **Cycle Migrations vs `yiisoft/db-migration`:**
> - `yiisoft/db-migration` is designed for `yiisoft/db` and Active Record, using `MigrationBuilder` and `ColumnBuilder`.
> - `yiisoft/yii-cycle` uses `cycle/migrations` and `cycle/schema-migrations-generator`, working with `Cycle\Migrations\Migration` and `Cycle\Database\Table`.
> - When using Cycle ORM, run `php yii migrate:*` commands managed by `yiisoft/yii-cycle`. Do not mix `yiisoft/db-migration` with Cycle ORM.

#### Anatomy of a Cycle Migration Class

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

### 4.4. Schema & Migration CLI Commands Reference

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

### 4.5. RBAC Storage Integration (`yiisoft/rbac-cycle-db`)

When building an application with Cycle ORM and role-based access control (`yiisoft/rbac`), use `yiisoft/rbac-cycle-db` instead of `yiisoft/rbac-db`. This ensures RBAC tables share the exact same Cycle DBAL connection pool and migration engine.

#### 1. Wire RBAC Storage in `config/common/di/rbac.php`

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

#### 2. Register Vendor Migrations in `config/params.php`

To run the official migrations included with `yiisoft/rbac-cycle-db`:

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

## 5. Paginated Queries & Data Operations (`yiisoft/data-cycle`)

### 5.1. `EntityReader` with Filters (`AndX`, `Equals`, `Like`), Sorting & Pagination

`Yiisoft\Data\Cycle\Reader\EntityReader` wraps `Cycle\ORM\Select` and connects it with `yiisoft/data` filters and `OffsetPaginator`:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\Cycle;

use App\Domain\Model\User;
use Cycle\ORM\ORMInterface;
use Cycle\ORM\Select;
use Yiisoft\Data\Cycle\Reader\EntityReader;
use Yiisoft\Data\Paginator\OffsetPaginator;
use Yiisoft\Data\Reader\Filter\AndX;
use Yiisoft\Data\Reader\Filter\Equals;
use Yiisoft\Data\Reader\Filter\Like;
use Yiisoft\Data\Reader\Sort;

final readonly class CycleUserGridQuery
{
    public function __construct(
        private ORMInterface $orm,
    ) {}

    public function getPaginator(int $page = 1, int $pageSize = 20, ?string $search = null): OffsetPaginator
    {
        /** @var Select<User> $select */
        $select = new Select($this->orm, User::class);

        $reader = new EntityReader($select);

        // Apply filters: combine search and active status with AndX
        $filters = [new Equals('isActive', true)];
        if ($search !== null && $search !== '') {
            $filters[] = new Like('name', $search);
        }
        $reader = $reader->withFilter(new AndX(...$filters));

        // Apply sorting
        $reader = $reader->withSort(
            Sort::only(['id', 'name', 'createdAt'])
                ->withOrderString('-createdAt'),
        );

        // Wrap in OffsetPaginator for API or GridView widgets
        return (new OffsetPaginator($reader))
            ->withPageSize($pageSize)
            ->withCurrentPage($page);
    }
}
```

### 5.2. Batch Writes & Deletions with `EntityWriter`

`Yiisoft\Data\Cycle\Writer\EntityWriter` writes or deletes collections of entities in a single atomic Unit of Work pass:

```php
declare(strict_types=1);

namespace App\Application\Service;

use App\Domain\Model\User;
use Yiisoft\Data\Cycle\Writer\EntityWriter;

final readonly class UserBatchService
{
    public function __construct(
        private EntityWriter $writer,
    ) {}

    /**
     * @param iterable<User> $users
     */
    public function importUsers(iterable $users): void
    {
        // Calls persist() on each entity followed by a single transactional run()
        $this->writer->write($users);
    }

    /**
     * @param iterable<User> $users
     */
    public function purgeUsers(iterable $users): void
    {
        // Calls delete() on each entity followed by a single transactional run()
        $this->writer->delete($users);
    }
}
```

---

## 6. PHP 8 Named Arguments & Signatures Reference

```php
declare(strict_types=1);

use App\Domain\Model\User;
use Cycle\Database\DatabaseManager;
use Cycle\ORM\EntityManagerInterface;
use Cycle\ORM\ORMInterface;
use Cycle\ORM\Select;
use Yiisoft\Data\Cycle\Reader\EntityReader;
use Yiisoft\Data\Cycle\Writer\EntityWriter;
use Yiisoft\Data\Paginator\OffsetPaginator;
use Yiisoft\Data\Reader\Filter\AndX;
use Yiisoft\Data\Reader\Filter\Equals;
use Yiisoft\Data\Reader\Filter\Like;

/** @var ORMInterface $orm */
/** @var EntityManagerInterface $entityManager */
/** @var DatabaseManager $dbal */
/** @var User $user */
/** @var User $user1 */
/** @var User $user2 */
/** @var User $oldUser */

// 1. Creating a Select query for an entity
$select = new Select(
    orm: $orm,
    role: User::class,
);

// 2. Eager loading relations on Select (parameter is named `load:`, NOT `params:`)
$select->load(
    relation: 'orders',
    load: ['load' => static function (Select\QueryBuilder $query): void {
        $query->where('status', '=', 'completed');
    }],
);

// 3. Staging changes on EntityManagerInterface
$entityManager->persist(
    entity: $user,
    cascade: true,
);

$entityManager->delete(
    entity: $user,
    cascade: false,
);

// 4. Committing staged Unit of Work operations
$entityManager->run();

// 5. Resetting Unit of Work state (clears Identity Map in daemonized workers)
$entityManager->clean();

// 6. DBAL Transactions
$dbal->database()->transaction(static function () use ($entityManager, $user): void {
    $entityManager->persist($user);
    $entityManager->run();
});

// 7. EntityReader wrapping Select with AndX filter and limit
$reader = (new EntityReader(query: $select))
    ->withFilter(filter: new AndX(
        new Equals(field: 'isActive', value: true),
        new Like(field: 'email', value: '@example.com'),
    ))
    ->withLimit(limit: 50);

// 8. OffsetPaginator wrapping EntityReader
$paginator = (new OffsetPaginator(dataReader: $reader))
    ->withPageSize(pageSize: 20)
    ->withCurrentPage(page: 1);

// 9. EntityWriter batch operations
$writer = new EntityWriter(entityManager: $entityManager);
$writer->write(items: [$user1, $user2]);
$writer->delete(items: [$oldUser]);
```

---

## 7. Anti-Pattern Matrix: Cycle ORM

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| ❌ **Calling `persist()` without `run()`** | Cycle ORM is a Unit of Work engine; `persist()` only stages changes in memory. Without `run()`, no SQL is executed and changes are lost silently. | Always call `$entityManager->run()` after staging operations with `persist()` or `delete()`. |
| ❌ **Using Active Record methods on Cycle entities (`$user->save()`, `tableName()`)** | Cycle entities are pure Data Mapper objects; they do not have `save()`, `delete()`, or static AR methods. | Use `$entityManager->persist($entity)` and `$entityManager->run()`, or configure `#[Entity(table: '...')]`. |
| ❌ **Guessing `cycle/orm` methods from memory** | `cycle/orm` is an external package; hallucinating non-existent methods results in fatal PHP errors. | Verify all `Cycle\ORM\*` methods in `vendor/cycle/orm/src/` or use the `yiisoft/data-cycle` bridges (`EntityReader`, `EntityWriter`). |
| ❌ **Mixing Active Record and Cycle ORM in same model** | Causes dual unit-of-work conflicts, caching issues, and severe architectural confusion. | Choose **one** persistence paradigm per bounded context (Clean DDD Data Mapper via Cycle ORM or CRUD via AR). |
| ❌ **Executing Cycle queries directly inside HTTP Actions** | Breaks the Presentation/Infrastructure boundary, making actions un-testable. | Inject Domain Repositories or Application Use Cases into Action constructors. |
| ❌ **Hardcoding table names without entity attributes** | Schema generator cannot resolve column definitions or foreign keys. | Always use `#[Entity(table: '...')]` and `#[Column(...)]` attributes on mapped classes. |
| ❌ **Running in production without dumping schema** | Dynamic attribute parsing and reflection on every request incurs high latency overhead. | Run `php yii cycle:schema:php` during deployment to compile schema into a static PHP cache (`FromFilesSchemaProvider`). |
| ❌ **Forgetting `$entityManager->clean()` in long-running workers** | In RoadRunner / FrankenPHP / worker loops, the Identity Map retains entities across requests, leaking memory and dirty state. | Ensure container `reset` handler is active or invoke `$entityManager->clean()` between worker loop iterations. |
| ❌ **Redeclaring built-in generators in `FromConveyorSchemaProvider`** | The 14 standard generators (`ResetTables`, `Entities`, `RenderTables`, `ForeignKeys`, `GenerateTypecast`, etc.) are already built-in. Listing them in `generators` duplicates execution passes. | Keep `FromConveyorSchemaProvider` clean; only declare dev-only (`SyncTables::class`) or custom generators in `'generators'`. |
| ❌ **Using `yiisoft/db-migration` with Cycle ORM** | `yiisoft/db-migration` is for `yiisoft/db` Active Record; it does not share connection pools or schema metadata with Cycle DBAL. | Use Cycle migrations (`cycle/migrations`, `php yii migrate:*` provided by `yiisoft/yii-cycle`). |

---

## 8. Related Topic Guides

- [Database Persistence Guide](persistence-db.md) — Low-level `yiisoft/db` Connection, Query Builder, Transactions, and Data Readers.
- [Active Record Persistence Guide](persistence-active-record.md) — Active Record models, relations, lifecycle, and LazyLoadGuard.
- [Database Migrations Guide](migrations.md) — Schema DDL, ColumnBuilder, foreign keys, and migration CLI commands for `yiisoft/db`.
- [Testing Database Guide](testing-database.md) — Ephemeral in-memory SQLite, test fixtures, and transactional rollbacks.
- [Actions & Controllers Guide](actions-and-controllers.md) — Consuming repositories inside Use Cases and Presentation Actions.
- [Caching Guide](caching.md) — Query caching and cache invalidation strategies for repositories.
- [Auth & RBAC Guide](auth-and-rbac.md) — RBAC manager, permission checks, and `yiisoft/rbac-cycle-db` integration.
- [Runners & Runtimes Guide](runners-and-runtimes.md) — RoadRunner & FrankenPHP workers, StateResetter, and long-running process safety.
