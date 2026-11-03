# Canonical Yii 3 CRUD Vertical Slice

> Minimal, production-grade reference implementation of a complete vertical feature slice in Yii 3.
> Designed as an immediate template for AI models and developers when generating or refactoring domain features.

---

## Contents (Table of Contents)
- [1. Overview & Architecture](#1-overview--architecture)
- [2. Directory Layout](#2-directory-layout)
- [3. Layer Contracts & Responsibilities](#3-layer-contracts--responsibilities)
  - [3.1. Migration Layer](#31-migration-layer-migration)
  - [3.2. Domain Layer](#32-domain-layer-domain)
  - [3.3. Persistence Layer](#33-persistence-layer-persistence)
  - [3.4. Presentation Layer](#34-presentation-layer-presentation)
  - [3.5. Configuration Layer](#35-configuration-layer-config)
- [4. Replication Protocol for AI Agents](#4-replication-protocol-for-ai-agents)

---

## 1. Overview & Architecture

This slice demonstrates the **Explicit Architecture / Vertical Slice** pattern applied to Yii 3:
- **Clean Architecture Boundaries:** Domain models and repository interfaces have **zero** dependencies on HTTP, database drivers, or framework internals.
- **Thin Actions:** Action classes handle HTTP orchestration only (request extraction, DTO hydration, validation, and PSR-7 response composition). They never execute SQL queries or manage transactions directly.
- **Strict Typing:** Every file enforces `declare(strict_types=1);` with explicit parameter and return types.
- **PSR-7 & PSR-11 Standards:** Strict compliance with PSR-7 HTTP messages and PSR-11 container abstractions.
- **Zero Yii 2 Constructs:** No static facades (`Yii::$app`), no `yii\*` namespaces, and no ActiveForm magic.

---

## 2. Directory Layout

```text
examples/crud-slice/
├── README.md                                 # This reference guide & replication protocol
├── Migration/
│   └── M261026120000CreatePostTable.php      # Reversible DDL migration with ColumnBuilder
├── Domain/
│   ├── Post.php                              # Pure domain entity with business invariants
│   └── PostRepositoryInterface.php           # Domain persistence contract
├── Persistence/
│   └── DbPostRepository.php                  # Infrastructure repository using yiisoft/db
├── Presentation/
│   ├── CreatePostDto.php                     # Input DTO with #[Required] & #[Length] rules
│   ├── CreatePostAction.php                  # Invokable thin POST action (HTTP 201/422)
│   └── ViewPostAction.php                    # Invokable thin GET action with CurrentRoute (HTTP 200/404)
└── Config/
    ├── di.php                                # Interface-to-implementation DI mapping
    └── routes.php                            # Modern route group with dedicated verb classes
```

---

## 3. Layer Contracts & Responsibilities

### 3.1. Migration Layer (`Migration/`)
- **File:** `M261026120000CreatePostTable.php`
- **Interfaces:** Implements `RevertibleMigrationInterface` and `TransactionalMigrationInterface`.
- **Naming:** Follows the strict Yii 3 regex `/^(M(\d{12}).*)\.php$/s` (`M<YYMMDDHHMMSS><Name>.php`).
- **Column Definition:** Uses modern `$b->columnBuilder()` methods (`primaryKey()`, `string()`, `text()`, `timestamp()`) rather than raw string definitions.

### 3.2. Domain Layer (`Domain/`)
- **Files:** `Post.php`, `PostRepositoryInterface.php`
- **Purity Rule:** Contains **no imports** from `Yiisoft\Db\*`, `Psr\Http\*`, or external libraries.
- **Entity Invariants:** Encapsulates state through getters and explicit mutating methods (`update()`, `publish()`, `archive()`).
- **Repository Interface:** Declares storage-agnostic domain contracts (`findById()`, `findAll()`, `save()`, `delete()`).

### 3.3. Persistence Layer (`Persistence/`)
- **File:** `DbPostRepository.php`
- **Contract:** Implements `PostRepositoryInterface`.
- **Dependencies:** Injects `Yiisoft\Db\Connection\ConnectionInterface`.
- **Querying:** Uses `Yiisoft\Db\Query\Query` and prepared statement commands (`insert()`, `update()`, `delete()`).
- **Hydration:** Explicit private `hydrate()` method mapping raw database rows into pure `Post` entity instances.

### 3.4. Presentation Layer (`Presentation/`)
- **Input DTO (`CreatePostDto.php`):**
  - Uses `Yiisoft\Validator\Rule\Required`, `Length`, and `StringValue` PHP 8 attributes.
- **Create Action (`CreatePostAction.php`):**
  - Injects `HydratorInterface`, `ValidatorInterface`, `DataResponseFactoryInterface`, and `PostRepositoryInterface`.
  - Converts parsed body into strongly-typed DTO via `$hydrator->create(CreatePostDto::class, $data)`.
  - Validates input; on failure returns HTTP 422 (`Status::UNPROCESSABLE_ENTITY`) with indexed errors.
  - On success creates domain entity, persists it via repository, and returns HTTP 201 (`Status::CREATED`).
- **View Action (`ViewPostAction.php`):**
  - Injects `CurrentRoute`, `DataResponseFactoryInterface`, and `PostRepositoryInterface`.
  - Reads route argument via `$currentRoute->getArgument('id')`.
  - Returns HTTP 404 (`Status::NOT_FOUND`) if entity does not exist, or HTTP 200 (`Status::OK`) with entity data.

### 3.5. Configuration Layer (`Config/`)
- **DI (`di.php`):**
  - Returns mapping: `PostRepositoryInterface::class => DbPostRepository::class`.
- **Routes (`routes.php`):**
  - Instantiates modern `Group` and dedicated HTTP verb classes (`Get`, `Post`).
  - Attaches `RequestBodyParser` middleware for JSON body parsing on POST endpoints.
  - Assigns unique route names (`api/post/create`, `api/post/view`).

---

## 4. Replication Protocol for AI Agents

When asked to create a new Yii 3 feature (e.g. `User`, `Product`, `Order`), follow these steps:
1. Copy the structure of this slice to the project's target feature folder (adjusting namespaces to match target `composer.json` PSR-4 root, e.g. `App\Feature\Product\...`).
2. Generate the migration class with 12-digit timestamp and matching column definitions.
3. Write the pure domain entity and repository interface.
4. Implement the repository using `ConnectionInterface` and `Query`.
5. Create the input DTO with PHP 8 validator attributes.
6. Create thin single-action invokable classes returning `ResponseInterface`.
7. Register the repository in `config/common/di/*.php` and routes in `config/common/routes.php`.
8. Verify actions with `php scripts/verify-actions.php` and DI with `php scripts/check-di-syntax.php`.
