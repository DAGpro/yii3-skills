# Yii3 RBAC Storage Drivers Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Reference guide for persisting RBAC items (roles, permissions) and assignments: relational database storage with `yiisoft/rbac-db`, version-controlled PHP file storage with `yiisoft/rbac-php`, Cycle database storage with `yiisoft/rbac-cycle-db`, and hybrid storage architectures that combine drivers.

**Scope & Ownership:** This guide is the single source of truth for RBAC storage drivers; it was extracted from the [Authentication & RBAC Guide, §8.4–8.7](infra-auth-and-rbac.md#84-relational-database-storage-yiisoftrbac-db). Exactly **one storage driver is installed per project**: `yiisoft/rbac-db` XOR `yiisoft/rbac-php` XOR `yiisoft/rbac-cycle-db` — resolve which driver is installed via the project's `composer.json` or the [Package Catalog, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family). The RBAC manager, dynamic business rules, and the rules container that sit on top of these storages are owned by the [Authentication & RBAC Guide, §8.1–8.3](infra-auth-and-rbac.md#81-rbac-items-roles-permissions-and-managerinterface).

---

## Table of Contents
- [1. Relational Database Storage (`yiisoft/rbac-db`)](#1-relational-database-storage-yiisoftrbac-db)
- [2. PHP File Storage (`yiisoft/rbac-php`)](#2-php-file-storage-yiisoftrbac-php)
- [3. Cycle Database Storage (`yiisoft/rbac-cycle-db`)](#3-cycle-database-storage-yiisoftrbac-cycle-db)
- [4. Hybrid Storage Architectures](#4-hybrid-storage-architectures)
- [5. Anti-Patterns & Common Traps](#5-anti-patterns--common-traps)
- [Related Topic Guides](#related-topic-guides)

---

## 1. Relational Database Storage (`yiisoft/rbac-db`)

`yiisoft/rbac-db` persists RBAC data in relational database tables using `yiisoft/db`.

### Default Database Tables
- `yii_rbac_item`: Stores roles and permissions.
- `yii_rbac_item_child`: Stores parent-child inheritance relationships.
- `yii_rbac_assignment`: Stores user-role bindings.

> [!WARNING]
> Yii 3 table names default to `yii_rbac_*`. The legacy Yii 2 table names (`auth_item`, `auth_assignment`) are **not** used.

### Running Relational Migrations

Run the migrations that ship with the package:

```shell
./yii migrate:up --path=@vendor/yiisoft/rbac-db/migrations/items
./yii migrate:up --path=@vendor/yiisoft/rbac-db/migrations/assignments
```

### DI Configuration for `yiisoft/rbac-db`

In `config/common/di/rbac.php`:

```php
declare(strict_types=1);

use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Definitions\Reference;
use Yiisoft\Rbac\AssignmentsStorageInterface;
use Yiisoft\Rbac\Db\AssignmentsStorage;
use Yiisoft\Rbac\Db\ItemsStorage;
use Yiisoft\Rbac\Db\TransactionalManagerDecorator;
use Yiisoft\Rbac\ItemsStorageInterface;
use Yiisoft\Rbac\Manager;
use Yiisoft\Rbac\ManagerInterface;
use Yiisoft\Rbac\RuleFactoryInterface;

return [
    ItemsStorageInterface::class => [
        'class' => ItemsStorage::class,
        '__construct()' => [
            'database' => Reference::to(ConnectionInterface::class),
            'tableName' => 'yii_rbac_item',
            'childrenTableName' => 'yii_rbac_item_child',
            'namesSeparator' => ',',
        ],
    ],

    AssignmentsStorageInterface::class => [
        'class' => AssignmentsStorage::class,
        '__construct()' => [
            'database' => Reference::to(ConnectionInterface::class),
            'tableName' => 'yii_rbac_assignment',
        ],
    ],

    ManagerInterface::class => [
        'class' => TransactionalManagerDecorator::class,
        '__construct()' => [
            'manager' => static fn (
                ItemsStorageInterface $itemsStorage,
                AssignmentsStorageInterface $assignmentsStorage,
                RuleFactoryInterface $rulesContainer,
            ): ManagerInterface => new Manager(
                itemsStorage: $itemsStorage,
                assignmentsStorage: $assignmentsStorage,
                ruleFactory: $rulesContainer,
                enableDirectPermissions: false,
                includeRolesInAccessChecks: false,
            ),
            'database' => Reference::to(ConnectionInterface::class),
        ],
    ],
];
```

- `TransactionalManagerDecorator` wraps mutating operations (`updateRole()`, `updatePermission()`) inside database transactions, ensuring referential integrity.
- `ItemTreeTraversalFactory` automatically selects recursive Common Table Expressions (CTE) for modern databases (PostgreSQL, SQLite ≥ 3.8.3, MySQL 8+) and falls back to a recursive query strategy for MySQL 5.

## 2. PHP File Storage (`yiisoft/rbac-php`)

`yiisoft/rbac-php` stores items and assignments in version-controlled PHP files:

```php
declare(strict_types=1);

use Yiisoft\Rbac\Manager;
use Yiisoft\Rbac\Permission;
use Yiisoft\Rbac\Php\AssignmentsStorage;
use Yiisoft\Rbac\Php\ConcurrentAssignmentsStorageDecorator;
use Yiisoft\Rbac\Php\ConcurrentItemsStorageDecorator;
use Yiisoft\Rbac\Php\ItemsStorage;
use Yiisoft\Rbac\RuleFactoryInterface;

$directory = __DIR__ . '/../resources/rbac';

$itemsStorage = new ConcurrentItemsStorageDecorator(
    new ItemsStorage($directory . '/items.php')
);

$assignmentsStorage = new ConcurrentAssignmentsStorageDecorator(
    new AssignmentsStorage($directory . '/assignments.php')
);

$manager = new Manager(
    itemsStorage: $itemsStorage,
    assignmentsStorage: $assignmentsStorage,
    ruleFactory: $ruleFactory,
);
```

> [!WARNING]
> **Concurrent write safety:** In PHP-FPM environments where assignments change at runtime, always wrap storages with `ConcurrentItemsStorageDecorator` and `ConcurrentAssignmentsStorageDecorator` to prevent lost updates.

### File Schema Example (`items.php`)

```php
return [
    [
        'name' => 'posts.update',
        'type' => 'permission',
        'description' => 'Update a post',
        'rule_name' => 'is_author',
    ],
    [
        'name' => 'author',
        'type' => 'role',
        'children' => ['posts.update'],
    ],
];
```

## 3. Cycle Database Storage (`yiisoft/rbac-cycle-db`)

`yiisoft/rbac-cycle-db` stores items and assignments via the Cycle Database abstraction layer (`Cycle\Database\DatabaseInterface`):

```php
declare(strict_types=1);

use Cycle\Database\DatabaseInterface;
use Yiisoft\Rbac\Cycle\AssignmentsStorage;
use Yiisoft\Rbac\Cycle\ItemsStorage;
use Yiisoft\Rbac\Cycle\TransactionalManagerDecorator;
use Yiisoft\Rbac\Manager;
use Yiisoft\Rbac\RuleFactoryInterface;

/** @var DatabaseInterface $database */

$manager = new TransactionalManagerDecorator(
    new Manager(
        itemsStorage: new ItemsStorage($database),
        assignmentsStorage: new AssignmentsStorage($database),
        ruleFactory: $ruleFactory,
    ),
    $database,
);
```

Run Cycle migrations via:
```shell
./vendor/bin/cycle-migrate --path=vendor/yiisoft/rbac-cycle-db/migrations/items
./vendor/bin/cycle-migrate --path=vendor/yiisoft/rbac-cycle-db/migrations/assignments
```

## 4. Hybrid Storage Architectures

Because items storage and assignments storage are decoupled interfaces, you can combine drivers:
- **Items in PHP files (`rbac-php`)**: Keep the roles, permissions, and rule bindings in version-controlled PHP files reviewed via pull requests.
- **Assignments in Database (`rbac-db` or `rbac-cycle-db`)**: Manage dynamic user assignments in relational tables.

```php
$manager = new Manager(
    itemsStorage: new ItemsStorage(__DIR__ . '/items.php'), // rbac-php
    assignmentsStorage: new AssignmentsStorage($dbConnection), // rbac-db
    ruleFactory: $ruleFactory,
);
```

## 5. Anti-Patterns & Common Traps

| # | Anti-Pattern | Why It Breaks | Correct Yii3 Approach |
|:---:|---|---|---|
| **1** | Using legacy Yii 2 table names (`auth_*`) | Yii 3 `rbac-db` default tables are `yii_rbac_item`, `yii_rbac_item_child`, and `yii_rbac_assignment`. | Use standard `yii_rbac_*` tables or configure custom table names in storage constructors. |

---

## Related Topic Guides

- [Authentication & RBAC Guide](infra-auth-and-rbac.md) — RBAC manager constructor invariants, dynamic business rules (`RuleInterface`, `RuleContext`, `CompositeRule`), the rules container, and permission checks (`CurrentUser::can()`, `AccessCheckerInterface`).
- [Persistence: Database, Query Builder & Transactions Guide](persistence-db.md) — `yiisoft/db` connection configuration used by `rbac-db`.
- [Persistence: Database Migrations Guide](persistence-migrations.md) — The `./yii migrate:up` migration workflow for the `yii_rbac_*` tables.
- [Persistence: Cycle ORM Guide](persistence-cycle-orm.md) — Cycle database setup used by `rbac-cycle-db`.
- [Dependency Protocol Guide](core-dependency-protocol.md) — DI definition rules for the storage configurations in this guide.
