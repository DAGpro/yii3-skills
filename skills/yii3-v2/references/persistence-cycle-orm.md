# Yii3 Persistence: Cycle ORM Guide

> Practical guide for Cycle ORM Data Mapper persistence, PHP 8 entity attributes (`cycle/annotated`), Unit of Work (`cycle/orm`), Yii3 DI bridge (`yiisoft/yii-cycle`), CLI schema migrations, and paginated data readers (`yiisoft/data-cycle`).
>
> Persistence details belong strictly to the Infrastructure Layer; Cycle ORM entities can serve as Domain Entities or be mapped through dedicated Infrastructure Repositories.

---

## Table of Contents
- [1. Data Mapper Architecture & Clean Boundaries](#1-data-mapper-architecture--clean-boundaries)
  - [1.1. Data Mapper vs Active Record](#11-data-mapper-vs-active-record)
  - [1.2. Architecture Layout](#12-architecture-layout)
- [2. Entity Definition with PHP 8 Attributes (`cycle/annotated`)](#2-entity-definition-with-php-8-attributes-cycleannotated)
  - [2.1. Basic Entity & Column Types](#21-basic-entity--column-types)
  - [2.2. Relational Attributes (`HasOne`, `HasMany`, `BelongsTo`, `ManyToMany`)](#22-relational-attributes-hasone-hasmany-belongsto-manytomany)
- [3. Repositories & Unit of Work (`cycle/orm`)](#3-repositories--unit-of-work-cycleorm)
  - [3.1. Unit of Work: The Mandatory `run()` Rule](#31-unit-of-work-the-mandatory-run-rule)
  - [3.2. Concrete Cycle Repository Implementation (`CycleUserRepository.php`)](#32-concrete-cycle-repository-implementation-cycleuserrepositoryphp)
  - [3.3. Eager Loading Relational Data with `load()`](#33-eager-loading-relational-data-with-load)
- [4. Yii3 Integration & CLI Commands (`yiisoft/yii-cycle`)](#4-yii3-integration--cli-commands-yiisoftyii-cycle)
  - [4.1. Configuration in `params.php`](#41-configuration-in-paramsphp)
  - [4.2. Schema & Migration CLI Commands](#42-schema--migration-cli-commands)
- [5. Paginated Queries & Data Readers (`yiisoft/data-cycle`)](#5-paginated-queries--data-readers-yiisoftdata-cycle)
  - [5.1. `EntityReader` with Filters & Sorting](#51-entityreader-with-filters--sorting)
  - [5.2. Batch Writes with `EntityWriter`](#52-batch-writes-with-entitywriter)
- [6. PHP 8 Named Arguments & Signatures Reference](#6-php-8-named-arguments--signatures-reference)
- [7. Anti-Pattern Matrix: Cycle ORM](#7-anti-pattern-matrix-cycle-orm)
- [8. Related Topic Guides](#8-related-topic-guides)

---

## 1. Data Mapper Architecture & Clean Boundaries

### 1.1. Data Mapper vs Active Record

Cycle ORM implements the **Data Mapper** pattern. Unlike Active Record:
- **No Database Coupling in Entities:** Entities do not extend framework base classes and have no awareness of database connections or SQL queries.
- **Unit of Work:** Mutations are staged via `EntityManagerInterface::persist()` and executed atomically when `run()` is called.
- **Pure Domain Entities:** Domain entities can be annotated directly with PHP 8 attributes (`#[Entity]`, `#[Column]`) or kept completely pure using custom schema providers.

### 1.2. Architecture Layout

```text
src/
├── Domain/
│   ├── Model/
│   │   ├── User.php                    # Domain Entity (annotated with Cycle #[Entity])
│   │   └── Order.php                   # Relational Domain Entity
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

    public function getId(): string { return $this->id; }
    public function getName(): string { return $this->name; }
    public function getEmail(): string { return $this->email; }
    public function isActive(): bool { return $this->isActive; }
    public function getCreatedAt(): ?DateTimeImmutable { return $this->createdAt; }
    public function getUpdatedAt(): ?DateTimeImmutable { return $this->updatedAt; }

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

### 2.2. Relational Attributes (`HasOne`, `HasMany`, `BelongsTo`, `ManyToMany`)

Relations are defined using attributes from `Cycle\Annotated\Annotation\Relation`:

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

    /** 1:N Relation */
    #[HasMany(target: Order::class)]
    private Collection $orders;

    public function __construct(string $id)
    {
        $this->id = $id;
        $this->orders = new ArrayCollection();
    }

    public function getProfile(): ?Profile { return $this->profile; }
    public function setProfile(?Profile $profile): void { $this->profile = $profile; }

    /** @return Collection<array-key, Order> */
    public function getOrders(): Collection { return $this->orders; }
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
}
```

---

## 3. Repositories & Unit of Work (`cycle/orm`)

### 3.1. Unit of Work: The Mandatory `run()` Rule

> [!CRITICAL]
> **Staging vs Execution:**
> In Cycle ORM, `$entityManager->persist($entity)` and `$entityManager->delete($entity)` **only stage operations** in memory.
> Nothing is written or deleted in the database until **`$entityManager->run()`** is explicitly called!
> Forgetting `->run()` results in silent data loss where no SQL queries are executed and no exceptions are thrown.

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
$select = (new Select($this->orm, User::class))
    ->load('profile')
    ->load('orders')
    ->where('status', '=', 'active');

$users = $select->fetchAll();
```

---

## 4. Yii3 Integration & CLI Commands (`yiisoft/yii-cycle`)

### 4.1. Configuration in `params.php`

In Yii3 applications, Cycle ORM configuration is declared in `config/params.php`:

```php
return [
    'yiisoft/yii-cycle' => [
        // Entity scanning directories
        'entity-paths' => [
            '@src/Domain/Model',
        ],
        // Schema cache & compilation providers
        'schema-providers' => [
            \Yiisoft\Yii\Cycle\Schema\Provider\FromConveyorSchemaProvider::class => [
                'generators' => [
                    \Cycle\Schema\Generator\ResetTables::class,
                    \Cycle\Annotated\Embeddings::class,
                    \Cycle\Annotated\Entities::class,
                    \Cycle\Annotated\MergeColumns::class,
                    \Cycle\Annotated\MergeIndexes::class,
                    \Cycle\Schema\Generator\GenerateRelations::class,
                    \Cycle\Schema\Generator\ValidateEntities::class,
                    \Cycle\Schema\Generator\RenderTables::class,
                    \Cycle\Schema\Generator\RenderRelations::class,
                    \Cycle\Schema\Generator\ForeignKeys::class,
                    \Cycle\Annotated\TableInheritance::class,
                    \Cycle\Schema\Generator\Typecast::class,
                ],
            ],
        ],
    ],
];
```

### 4.2. Schema & Migration CLI Commands

`yiisoft/yii-cycle` registers console commands for schema inspection and automated migrations:

| Command | Purpose |
|---|---|
| `php yii cycle:schema` | Displays the current compiled Cycle schema in the terminal. |
| `php yii cycle:schema:php [file]` | Dumps the compiled schema to a native PHP file for zero-overhead production performance. |
| `php yii cycle:schema:clear` | Clears the compiled schema cache. |
| `php yii cycle:schema:rebuild` | Forces a complete rebuild of the schema from entity attributes. |
| `php yii migrate:generate` | **Diff Generation:** Automatically generates a migration file based on the diff between entity attributes and current database structure. |
| `php yii migrate:up` | Executes all pending migrations. |
| `php yii migrate:down` | Rolls back the last executed migration. |
| `php yii migrate:list` | Lists all migrations and their execution status. |
| `php yii migrate:create <name>` | Creates an empty custom migration file. |

---

## 5. Paginated Queries & Data Readers (`yiisoft/data-cycle`)

### 5.1. `EntityReader` with Filters & Sorting

`Yiisoft\Data\Cycle\Reader\EntityReader` wraps `Cycle\ORM\Select` and connects it with `yiisoft/data` filters and `OffsetPaginator`:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\Cycle;

use App\Domain\Model\User;
use Cycle\ORM\ORMInterface;
use Cycle\ORM\Select;
use Yiisoft\Data\Cycle\Reader\EntityReader;
use Yiisoft\Data\Paginator\OffsetPaginator;
use Yiisoft\Data\Reader\Filter\All;
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

        // Apply filters
        if ($search !== null && $search !== '') {
            $reader = $reader->withFilter(
                new Like('name', $search),
            );
        }

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

### 5.2. Batch Writes with `EntityWriter`

For writing or deleting collections of entities in a single atomic Unit of Work pass:

```php
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
        // Automatically calls persist() on each entity followed by a single run()
        $this->writer->write($users);
    }

    /**
     * @param iterable<User> $users
     */
    public function purgeUsers(iterable $users): void
    {
        // Automatically calls delete() on each entity followed by a single run()
        $this->writer->delete($users);
    }
}
```

---

## 6. PHP 8 Named Arguments & Signatures Reference

```php
declare(strict_types=1);

use App\Domain\Model\User;
use Cycle\ORM\EntityManagerInterface;
use Cycle\ORM\ORMInterface;
use Cycle\ORM\Select;
use Yiisoft\Data\Cycle\Reader\EntityReader;
use Yiisoft\Data\Cycle\Writer\EntityWriter;
use Yiisoft\Data\Paginator\OffsetPaginator;
use Yiisoft\Data\Reader\Filter\Equals;

// Creating a Select query for an entity
$select = new Select(
    orm: $orm,
    role: User::class,
);

// Eager loading relations on Select
$select->load(
    relation: 'orders',
    params: ['load' => function ($query) { /* custom constraints */ }],
);

// Staging changes on EntityManagerInterface
$entityManager->persist(
    entity: $user,
    cascade: true,
);

$entityManager->delete(
    entity: $user,
    cascade: false,
);

// Committing staged Unit of Work operations
$entityManager->run();

// EntityReader wrapping Select
$reader = (new EntityReader(query: $select))
    ->withFilter(filter: new Equals(field: 'email', value: $email))
    ->withLimit(limit: 50);

// OffsetPaginator wrapping EntityReader
$paginator = (new OffsetPaginator(dataReader: $reader))
    ->withPageSize(pageSize: 20)
    ->withCurrentPage(page: 1);

// EntityWriter batch operations
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
| ❌ **Guessing `cycle/orm` methods from memory** | `cycle/orm` is an external package (not `yiisoft/*`); hallucinating non-existent methods results in fatal PHP errors. | Verify all `Cycle\ORM\*` methods in `vendor/cycle/orm/src/` or use the `yiisoft/data-cycle` bridges (`EntityReader`, `EntityWriter`). |
| ❌ **Mixing Active Record and Cycle ORM in same model** | Causes dual unit-of-work conflicts, caching issues, and severe architectural confusion. | Choose **one** persistence paradigm per bounded context (Clean DDD DataMapper via Cycle ORM or CRUD via AR). |
| ❌ **Executing Cycle queries directly inside HTTP Actions** | Breaks the Presentation/Infrastructure boundary, making actions un-testable. | Inject Domain Repositories or Application Use Cases into Action constructors. |
| ❌ **Hardcoding table names without entity attributes** | Schema generator cannot resolve column definitions or foreign keys. | Always use `#[Entity(table: '...')]` and `#[Column(...)]` attributes on mapped classes. |
| ❌ **Running `migrate:up` in production without dumping schema** | Dynamic attribute parsing and schema compilation on every request incurs high latency overhead. | Run `php yii cycle:schema:php` during deployment to compile schema into a static PHP cache. |

---

## 8. Related Topic Guides

- [Database Persistence Guide](persistence-db.md) — Low-level `yiisoft/db` Connection, Query Builder, Transactions, and Data Readers.
- [Active Record Persistence Guide](persistence-active-record.md) — Active Record models, relations, lifecycle, and LazyLoadGuard.
- [Database Migrations Guide](migrations.md) — Schema DDL, ColumnBuilder, foreign keys, and migration CLI commands.
- [Testing Database Guide](testing-database.md) — Ephemeral in-memory SQLite, test fixtures, and transactional rollbacks.
- [Actions & Controllers Guide](actions-and-controllers.md) — Consuming repositories inside Use Cases and Presentation Actions.
- [Caching Guide](caching.md) — Query caching and cache invalidation strategies for repositories.
