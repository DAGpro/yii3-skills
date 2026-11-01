# Dependency Protocol

> **Mandatory Architectural & Dependency Verification Protocol**
> This reference is an operational execution gate for AI agents working in Yii 3 projects. Before generating, installing, configuring, or refactoring any code or package, the agent **MUST** follow this protocol sequentially.
> It prevents version drift, broken container graphs, package hallucinations, and supply-chain corruption.

---

## Operational Inputs & Purpose

Every dependency decision begins with two canonical inputs:
1. **Required Capability:** The specific functional requirement needed for the task (identified from [Package Catalog](package-catalog.md)).
2. **Project Manifest:** The target project's root `composer.json`, `composer.lock`, and configuration directory layout (`config/`).

```
                +----------------------------------------+
                | Required Capability & composer.json    |
                +----------------------------------------+
                                    |
                                    v
                        [ 1. Check Requirements ]
                           /                 \
        Already installed /                   \ Missing
                         v                     v
               [ 4. Verify Wiring ]    [ 2. Decide Who Decides ]
                                               |
                                               v
                                      [ 3. Install Safely ]
                                               |
                                               v
                                      [ 4. Verify Wiring ]
                                               |
                                               v
                                    [ 5. Learn API from src ]
                                               |
                                               v
                                    [ 6. Write Code & Verify ]
```

---

## 1. Check Requirements

Before issuing any command or proposing modifications:

1. **Check for Existing Installation:**
   - Inspect `composer.json` (`require` and `require-dev` blocks).
   - If the package is already listed, **skip installation entirely** and proceed directly to [4. Verify Wiring](#4-verify-wiring).
2. **Handle Missing Packages:**
   - If the capability is not present, look up the canonical package name in [Package Catalog](package-catalog.md).
   - Never invent or assume package names. Proceed to [2. Decide Who Decides](#2-decide-who-decides).
3. **Select Exactly One Driver for Interchangeable Subsystems:**
   - When a capability provides multiple driver backends, you must resolve to **strictly one driver** that matches the target infrastructure.
   - Forcing multiple implementations into the DI container leads to ambiguous service resolution or container compilation failure.

### Infrastructure Driver Matrix

| Subsystem | Core Interface / Abstraction | Available Implementations | Selection Rule |
| :--- | :--- | :--- | :--- |
| **Database** | `Yiisoft\Db\Connection\ConnectionInterface` | `yiisoft/db-mysql`, `yiisoft/db-pgsql`, `yiisoft/db-sqlite`, `yiisoft/db-mssql`, `yiisoft/db-oracle` | **Strictly one primary connection.** Detect from environment DSN, Docker service, or existing DB configs. |
| **Cache** | `Psr\SimpleCache\CacheInterface` | `yiisoft/cache-file`, `yiisoft/cache-redis`, `yiisoft/cache-db`, `yiisoft/cache-apcu`, `yiisoft/cache-memcached`, `yiisoft/cache-wincache` | **Strictly one cache backend.** File cache is safe default; Redis/DB if infrastructure is provisioned. |
| **Log Targets** | `Yiisoft\Log\Target` (aggregated by `Yiisoft\Log\Logger`) | `yiisoft/log-target-file`, `yiisoft/log-target-db`, `yiisoft/log-target-email`, `yiisoft/log-target-syslog` | **Multiple targets allowed.** `Yiisoft\Log\Logger` accepts an array of targets via `ReferencesArray::from([...])`. |
| **RBAC Items** | `Yiisoft\Rbac\ItemsStorageInterface` | `yiisoft/rbac-php`, `yiisoft/rbac-db`, `yiisoft/rbac-cycle-db` | **Strictly one items storage.** Hybrid mode allowed (PHP file for items, DB for assignments). |
| **RBAC Assignments** | `Yiisoft\Rbac\AssignmentsStorageInterface` | `yiisoft/rbac-php`, `yiisoft/rbac-db`, `yiisoft/rbac-cycle-db` | **Strictly one assignments storage.** Matches user persistence model. |

### Four-Step Heuristic for Resolving Existing Drivers

When entering an existing codebase, detect the provisioned driver without guessing:

1. **Step 1: Check `composer.json`:** Look for installed driver packages in `require` (e.g. `yiisoft/db-pgsql` vs `yiisoft/db-mysql`).
2. **Step 2: Check DI Container Definitions:** Inspect `config/common/di/db.php`, `config/common/di/cache.php`, and `config/common/di/rbac.php` to see which concrete class implements the interface.
3. **Step 3: Check Configuration Parameters:** Inspect `config/**/params.php` for driver-specific keys such as `yiisoft/db-mysql`, `yiisoft/cache-file`, or `yiisoft/db-migration`.
4. **Step 4: Check Environment & Infrastructure Files:** Inspect `.env` or `.env.example` for DSN prefixes (`mysql:`, `pgsql:`, `sqlite:`) and `docker-compose.yml` for database images (e.g., `postgres:16-alpine`, `mysql:8.0`, `redis:7`).

> [!IMPORTANT]
> If the driver cannot be identified via the heuristic:
> - In **interactive mode**, pause and ask the user to specify their target database or backend.
> - In **autonomous mode (`HANDOFF_MODE=1`)**, follow the autonomous decision rules in Section 2.

### Unknown Capabilities

If the required capability is not listed in [Package Catalog](package-catalog.md):
1. Search Packagist specifically within the official organization: `https://github.com/yiisoft`.
2. Verify the package is actively maintained and compatible with PHP 8.2+.
3. If no official `yiisoft/*` package exists and a third-party package must be selected, **explicitly disclose** the non-Yii dependency to the user with architectural rationale.

---

## 2. Decide Who Decides

To balance agent autonomy with architectural stability, clear boundaries govern when an agent may install dependencies autonomously versus when it must request confirmation.

### Autonomy Boundaries

```
                      Is it a yiisoft/* package?
                             /           \
                           YES            NO
                           /               \
            Has architectural impact?     MUST ASK USER
             (ORM, DB engine, template)   (or BLOCKED in HANDOFF_MODE)
                   /             \
                 YES              NO
                 /                 \
           MUST ASK USER       AUTONOMOUS INSTALL
           (or use default)     (Strings, Validator, HTML...)
```

- **Autonomous Installation (No Confirmation Needed):**
  Pure library packages from `yiisoft/*` with zero infrastructural impact, no database migrations, and no global state alterations.
  - Examples: `yiisoft/strings`, `yiisoft/arrays`, `yiisoft/html`, `yiisoft/validator`, `yiisoft/security`, `yiisoft/friendly-exception`, `yiisoft/network-utilities`.
- **Mandatory User Confirmation (Interactive Mode):**
  - Any non-`yiisoft/*` third-party vendor package (e.g., `league/*`, `symfony/*`, `ramsey/uuid`).
  - Core architectural decisions:
    - Choice of persistence paradigm (Active Record vs Cycle ORM vs Plain DB).
    - Database engine choice (PostgreSQL vs MySQL vs SQLite).
    - Template engine selection (Yii View PHP templates vs Twig).
    - Asynchronous queue broker (Redis vs AMQP vs Beanstalkd).

### Persistence Paradigm Branches

The three persistence architectures in Yii 3 are mutually distinct and cannot be mixed arbitrarily:

| Paradigm | Component Stack | Entity Design | Data Manipulation Pattern |
| :--- | :--- | :--- | :--- |
| **Active Record** | `yiisoft/db`<br>`yiisoft/db-<driver>`<br>`yiisoft/active-record`<br>`yiisoft/db-migration`<br>`yiisoft/data-db`<br>`yiisoft/rbac-db` | Domain models extend `Yiisoft\ActiveRecord\ActiveRecord`. | `$user = new User();`<br>`$user->name = 'Alice';`<br>`$user->save();` |
| **Cycle ORM** | `yiisoft/yii-cycle`<br>`cycle/orm`<br>`cycle/annotated`<br>`cycle/migrations`<br>`yiisoft/data-cycle`<br>`yiisoft/rbac-cycle-db` | Plain PHP classes with attributes `#[Entity]`, `#[Column]`. | `$em->persist($user);`<br>`$em->run();` |
| **Plain DB** | `yiisoft/db`<br>`yiisoft/db-<driver>`<br>`yiisoft/db-migration`<br>`yiisoft/data-db`<br>`yiisoft/rbac-db` | Plain PHP DTOs or arrays; queries written via query builder. | `$db->createCommand(...)`<br>`$query->from('user')->all();` |

### Autonomous Mode Invariants (`HANDOFF_MODE=1`)

When executing in an unattended pipeline or autonomous runner (`HANDOFF_MODE=1`):
1. **Never Prompt:** Do not emit interactive clarification prompts.
2. **Follow Existing Stack:** Adopt whatever architecture is already present in `composer.json` and `config/`.
3. **Empty Project Default:** If the target project is completely uninitialized and has no established persistence paradigm, default to **`yiisoft/db` + `yiisoft/active-record` with SQLite or MySQL** (matching `.env`), and log the choice in the execution report.
4. **Halt on Ambiguity:** If an unresolvable conflict occurs or a mandatory third-party selection cannot be deduced, immediately mark the task status as `blocked` with an explicit reason.

### Phantom Package Registry & Trap Catalog

Never install obsolete, renamed, or imaginary packages. Consult this verification table:

| Forbidden / Hallucinated Package | Actual Status | Canonical Replacement |
| :--- | :--- | :--- |
| ❌ **yiisoft/composer-config-plugin** | **Obsolete.** Legacy plugin replaced in Yii 3. | `yiisoft/config` |
| ❌ **yiisoft/testo** | **Incorrect vendor.** | `testo/testo` (in `require-dev`) |
| ❌ **yiisoft/yii-web** | **Monolith abolished.** Split into modular packages. | `yiisoft/yii-http`, `yiisoft/router`, `yiisoft/middleware-dispatcher`, `yiisoft/yii-runner-http` |
| ❌ **yiisoft/active-record-cycle** | **Non-existent.** Active Record and Cycle are distinct ORMs. | Use either `yiisoft/active-record` OR `yiisoft/yii-cycle`. |
| ❌ **yiisoft/cache-cycle** | **Non-existent.** | Use `yiisoft/cache-db` or `yiisoft/cache-redis`. |
| ❌ **yiisoft/cors** | **Non-existent.** Built into middleware package. | `yiisoft/http-middleware` (includes `Cors` middleware). |
| ❌ **yiisoft/http-client** | **Non-existent in Yii 3.** | Use standard PSR-18 client: `guzzlehttp/guzzle` or `symfony/http-client`. |
| ❌ **yiisoft/rbac-rules** | **Incorrect package name.** | `yiisoft/rbac-rules-container` |

---

## 3. Install Safely

### Invocation Channels

Always invoke Composer using the workflow established in the target project. Preserving the runtime environment ensures native C-extensions (`ext-pdo`, `ext-intl`, `ext-mbstring`, `ext-redis`) match:
- **Makefile (Preferred if present):** `make composer req="yiisoft/cache-file"`
- **Docker Compose (Containerized):** `docker compose exec app composer require yiisoft/cache-file`
- **Host CLI (Standard):** `composer require yiisoft/cache-file`

### Supply Chain Security & Forbidden Flags

Dependencies must be installed with standard, production-safe semantic constraints:
```bash
composer require yiisoft/cache-file
```

> [!CAUTION]
> **Strictly Forbidden Actions:**
> - ❌ **NEVER run `composer update` without package arguments.** An unconstrained update can cause unexpected transitive major version upgrades across the entire lockfile.
> - ❌ **NEVER pass `--ignore-platform-reqs` or `--ignore-platform-req=...`.** Bypassing platform requirements masks missing PHP extensions and results in fatal runtime crashes.
> - ❌ **NEVER specify `dev-master` or `@dev` constraints.** All packages must resolve to tagged releases unless the target repository explicitly specifies development branches.
> - ❌ **NEVER add arbitrary third-party `repositories` to `composer.json`** without explicit architectural authorization.
> - ❌ **NEVER place runtime or persistence packages in `require-dev`.** The `--dev` flag is strictly reserved for testing tools (`phpunit/phpunit`), linters (`vimeo/psalm`, `phpstan/phpstan`), and code fixers.

### Composer Plugin Trust (`config.allow-plugins`)

Yii 3 applications rely on Composer plugins during build and autoload dumping. These must be explicitly trusted in the project's `composer.json`:

```json
{
    "config": {
        "allow-plugins": {
            "yiisoft/config": true,
            "olvlvl/composer-attribute-collector": true
        }
    }
}
```

> [!IMPORTANT]
> **Attribute Routing Collector Trap:**
> When attribute routing is used via `yiisoft/router-composer-attribute-collector`, the package itself is a regular library (`"type": "library"`). The underlying Composer plugin that scans classes and dumps attributes is `olvlvl/composer-attribute-collector`.
> Adding `"yiisoft/router-composer-attribute-collector": true` to `allow-plugins` does nothing. The trusted entry **MUST** be `"olvlvl/composer-attribute-collector": true`.
>
> If Composer prompts to trust an unknown plugin:
> - In **interactive mode**, request user authorization.
> - In **autonomous mode (`HANDOFF_MODE=1`)**, do not approve unknown plugins silently; transition task to `blocked`.

### Version Conflict Diagnostics

When a package fails to resolve against the project's lockfile, never force it with `--with-all-dependencies` if it causes unexpected downgrades. Diagnose the collision using Composer's introspection commands:
```bash
# Check why a package is currently installed and what depends on it
composer why yiisoft/db

# Check why a specific new version cannot be installed
composer why-not yiisoft/db ^2.0
```
Report the blocking dependency and the version mismatch in your task summary.

### Offline / Sandbox Fallback Protocol

If the execution environment lacks network access or Composer cannot reach external mirrors:
1. Do not crash or abort the task silently.
2. Record the exact `composer require <package>` command in the implementation summary under `Pending Manual Installation Steps`.
3. Implement the application code strictly against the documented vendor interfaces.
4. Mark the task verification status as `unverified (offline environment)`.

---

## 4. Verify Wiring

Once installed, dependencies must be properly integrated into the application's configuration and dependency injection container.

### Package Architecture Classification

Yii 3 packages fall into two distinct structural categories:

```
                          Package Installed
                                 |
                 Does composer.json have extra.config-plugin?
                                 |
                    +------------+------------+
                    |                         |
                   YES                        NO
                    v                         v
           [ Category A ]              [ Category B ]
           Auto-Configured             Pure Library
           Merged into .merge-plan     NEVER in .merge-plan
           (router, view, db...)       (db-mysql, cache-redis...)
                    |                         |
                    v                         v
           Verify in .merge-plan       Write manual DI definition
                                       in config/common/di/*.php
```

#### Category A: Auto-Configured Packages (With `extra.config-plugin`)
- **Packages:** `yiisoft/router`, `yiisoft/view`, `yiisoft/db`, `yiisoft/active-record`, `yiisoft/yii-cycle`, `yiisoft/cache-file`, `yiisoft/log-target-file`, `yiisoft/rbac-rules-container`, `yiisoft/yii-console`.
- **Behavior:** These packages declare their configuration files in `composer.json` under `extra.config-plugin`. The `yiisoft/config` plugin automatically scans them and merges them into `config/.merge-plan.php`.
- **Verification:** Inspect `config/.merge-plan.php` and verify the package name is present in the respective configuration group (e.g. `params`, `di-web`, `di-console`).

> [!NOTE]
> **`yiisoft/di` itself is NOT a Category A package:** its `composer.json` has no `extra.config-plugin` key. It is a pure library — the PSR-11 container implementation that **consumes** the configuration merged by `yiisoft/config` — and therefore never appears in `config/.merge-plan.php` under its own name.

#### Category B: Pure Libraries (WITHOUT `extra.config-plugin`)
- **Packages:** Database drivers (`yiisoft/db-mysql`, `yiisoft/db-pgsql`, `yiisoft/db-sqlite`, `yiisoft/db-mssql`, `yiisoft/db-oracle`), cache backends (`yiisoft/cache-redis`, `yiisoft/cache-db`), log targets (`yiisoft/log-target-db`), RBAC storages (`yiisoft/rbac-php`, `yiisoft/rbac-db`).
- **Behavior:** These packages **DO NOT** contain `extra.config-plugin`. They provide pure classes and interfaces without shipping default configuration files.

> [!WARNING]
> **CRITICAL ARCHITECTURAL PITFALL — Database Drivers and `.merge-plan.php`:**
> Database driver packages (`yiisoft/db-mysql`, `yiisoft/db-pgsql`, `yiisoft/db-sqlite`) **NEVER APPEAR IN `config/.merge-plan.php`**!
> Expecting them in `.merge-plan.php` is a false failure alarm.
> Database drivers MUST be configured manually by creating a DI definition in `config/common/di/db.php`.

### `yiisoft/config` CLI Commands

Use the official Composer commands provided by `yiisoft/config` to inspect and manage configuration plans:

```bash
# Crawl configuration files and regenerate config/.merge-plan.php
composer yii-config-rebuild

# Display configuration groups and participating files
composer yii-config-info

# Inspect configuration details of a specific package
composer yii-config-info yiisoft/router

# Safely copy vendor configuration files into application directory
composer yii-config-copy yiisoft/router config/packages/
```

> [!NOTE]
> `config/.merge-plan.php` is an entirely generated file. **NEVER edit `config/.merge-plan.php` manually.** Its contents are overwritten whenever Composer runs or `yii-config-rebuild` is invoked.

### Configuration Merging Rules & Key Collision Invariant

The `yiisoft/config` merger processes files according to a strict hierarchy:
1. **Layer 1: Vendor (`Context::VENDOR = 1`):** Default parameters and DI definitions supplied by packages.
2. **Layer 2: Vendor Override (`Context::VENDOR_OVERRIDE = 2`):** Package overrides.
3. **Layer 3: Application (`Context::APPLICATION = 3`):** Application-level configs (`config/common/`, `config/web/`, `config/console/`).
4. **Layer 4: Environment (`Context::ENVIRONMENT = 4`):** Environment-specific overrides (`config/environments/dev/`, `prod/`, `test/`).

> [!CAUTION]
> **FATAL ERROR: Intra-Layer Duplicate String Keys:**
> Inside the **SAME layer** (for example, across multiple files in `config/common/params.php`), duplicate string keys in associative arrays are strictly prohibited.
> If two application-level parameter files define the same string key, `yiisoft/config` throws a fatal `\ErrorException: Duplicate key "<key>" in the following configs while building "<group>" group`.
>
> **Overriding is only permitted between different layers:** Application layer keys safely override Vendor layer keys; Environment layer keys safely override Application layer keys.
> Indexed numeric arrays (lists) are merged by sequential appending (`$result[] = $val`).
>
> **Scope Restriction:** The `$params` variable is **not available** inside `params.php` files. It is only accessible when building DI definitions (`di/*.php`).

### Canonical Wiring Recipes

All definitions must be written in strict PHP without missing dependencies or placeholders.

#### Recipe 1: MySQL Database Connection (`config/common/di/db.php`)

```php
<?php

declare(strict_types=1);

use Yiisoft\Db\Cache\SchemaCache;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Mysql\Connection;
use Yiisoft\Db\Mysql\Driver;
use Yiisoft\Definitions\Reference;

/** @var array $params */

return [
    ConnectionInterface::class => [
        'class' => Connection::class,
        '__construct()' => [
            'driver' => new Driver(
                $params['yiisoft/db-mysql']['dsn'],
                $params['yiisoft/db-mysql']['username'],
                $params['yiisoft/db-mysql']['password'],
            ),
            'schemaCache' => Reference::to(SchemaCache::class),
        ],
    ],
];
```

#### Recipe 2: Database Configuration Parameters (`config/common/params.php`)

```php
<?php

declare(strict_types=1);

use Yiisoft\Db\Mysql\Dsn;

return [
    'yiisoft/db-mysql' => [
        'dsn' => (string) new Dsn('mysql', '127.0.0.1', 'yiiapp', '3306', ['charset' => 'utf8mb4']),
        'username' => 'root',
        'password' => 'secret',
    ],
];
```

#### Recipe 3: Cache Storage (`config/common/di/cache.php`)

```php
<?php

declare(strict_types=1);

use Psr\SimpleCache\CacheInterface;
use Yiisoft\Cache\File\FileCache;

return [
    CacheInterface::class => FileCache::class,
];
```

#### Recipe 4: Logger & Multiple Targets (`config/common/di/logger.php`)

> [!IMPORTANT]
> **Logger Parameter Hallucination Warning:**
> The parameter `$params['yiisoft/log']['targets']` does not exist in `yiisoft/log`.
> Log targets are injected directly into the `Yiisoft\Log\Logger` constructor using `Yiisoft\Definitions\ReferencesArray::from([...])`.

```php
<?php

declare(strict_types=1);

use Psr\Log\LoggerInterface;
use Yiisoft\Definitions\ReferencesArray;
use Yiisoft\Log\Logger;
use Yiisoft\Log\Target\File\FileTarget;

/** @var array $params */

return [
    LoggerInterface::class => [
        'class' => Logger::class,
        '__construct()' => [
            'targets' => ReferencesArray::from([
                FileTarget::class,
            ]),
        ],
    ],
];
```

#### Recipe 5: RBAC Storages (`config/common/di/rbac.php`)

```php
<?php

declare(strict_types=1);

use Yiisoft\Aliases\Aliases;
use Yiisoft\Rbac\AssignmentsStorageInterface;
use Yiisoft\Rbac\ItemsStorageInterface;
use Yiisoft\Rbac\Php\AssignmentsStorage;
use Yiisoft\Rbac\Php\ItemsStorage;

return [
    ItemsStorageInterface::class => static fn (Aliases $aliases): ItemsStorage => new ItemsStorage(
        $aliases->get('@root/resources/rbac/items.php')
    ),
    AssignmentsStorageInterface::class => static fn (Aliases $aliases): AssignmentsStorage => new AssignmentsStorage(
        $aliases->get('@root/resources/rbac/assignments.php')
    ),
];
```

#### Recipe 6: Console Command Registration (`config/console/params.php`)

> [!NOTE]
> Console commands are registered via `$params['yiisoft/yii-console']['commands']`. There is no separate `commands` group in `extra.config-plugin`.

```php
<?php

declare(strict_types=1);

use App\Command\UserCreateCommand;

return [
    'yiisoft/yii-console' => [
        'commands' => [
            'user:create' => UserCreateCommand::class,
        ],
    ],
];
```

#### Recipe 7: Database Migrations (`config/console/params.php` & CLI execution)

Vendor package migrations (such as RBAC or Queue tables) are registered under `$params['yiisoft/db-migration']['sourcePaths']`:

```php
<?php

declare(strict_types=1);

return [
    'yiisoft/db-migration' => [
        'sourcePaths' => [
            dirname(__DIR__, 2) . '/vendor/yiisoft/rbac-db/migrations/items',
            dirname(__DIR__, 2) . '/vendor/yiisoft/rbac-db/migrations/assignments',
        ],
    ],
];
```

Execute migrations via the CLI runner:
```bash
./yii migrate:up
```

#### Recipe 8: Application Bootstrap Script (`config/common/bootstrap.php`)

Bootstrap callbacks are invoked during application startup before request handling:

```php
<?php

declare(strict_types=1);

use Psr\Container\ContainerInterface;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Connection\ConnectionProvider;

/**
 * @psalm-var list<callable(ContainerInterface): void>
 */
return [
    static function (ContainerInterface $container): void {
        ConnectionProvider::set($container->get(ConnectionInterface::class));
    },
];
```

### `yiisoft/definitions` Syntax & Container Invariants

Yii 3's dependency injection container (`Yiisoft\Di\Container`) is a strictly compliant PSR-11 container with explicit definition primitives:

- `Yiisoft\Definitions\Reference::to(string $id)`: Declares a mandatory reference to an existing service ID. Throws `NotFoundException` if missing.
- `Yiisoft\Definitions\Reference::optional(string $id)`: Declares an optional reference; resolves to `null` if the service ID is not configured.
- `Yiisoft\Definitions\DynamicReference::to(array $definition)`: Resolves an unshared, anonymous inline definition without registering it globally in the container.
- `Yiisoft\Definitions\ReferencesArray::from(array $ids)`: Batch converts an array of service class names or string aliases into an array of `Reference::to()` objects.

#### ArrayDefinition Structure Rules

When defining services via array configuration:
- `'class'`: The fully qualified class name to instantiate. (Never use Yii 2's `'__class'`).
- `'__construct()'`: Constructor arguments. Must be either **all positional** (indexed list) or **all named** (string keys matching parameter names). Mixing positional and named arguments in the same array is strictly prohibited.
- `'$propertyName'`: Property injection syntax.
- `'methodName()'`: Method call after instantiation.
- Metadata keys: Only `'tags'` (tagging services) and `'reset'` (resetting state in long-running runners) are permitted.

> [!IMPORTANT]
> **Container Immutability:**
> The DI container in Yii 3 is immutable at runtime. There is no `$container->set()` method during execution. All service definitions must be registered ahead of time in `config/**/di/*.php`.

---

## 5. Learn the API from the Source (vendor/)

To guarantee zero hallucination and complete fidelity to the codebase, never invent method signatures or copy unverified patterns from search snippets or outdated frameworks.

### Five-Step Source Inspection Protocol

```
                     [ Five-Step Inspection ]
                                |
    1. composer.lock --------> Verify installed major/minor version
                                |
    2. README.md ------------> Understand official usage & architecture
                                |
    3. config/ --------------> Inspect default params & DI definitions
                                |
    4. src/*Interface.php ---> Verify exact signatures & return types
                                |
    5. tests/ ---------------> Ground real usage patterns & edge cases
```

1. **Step 1: Check `composer.lock`:** Verify the exact tagged version installed in `composer.lock` for `vendor/yiisoft/<package>`.
2. **Step 2: Read Package `README.md`:** Open `vendor/yiisoft/<package>/README.md` to review the official usage overview, configuration parameters, and architectural philosophy.
3. **Step 3: Inspect Package `config/`:** If the package provides `config/params.php` or `config/di*.php`, inspect the default keys and factory definitions.
4. **Step 4: Inspect Public Contracts (`src/*Interface.php`):** Inspect the interface contracts and class constructors in `vendor/yiisoft/<package>/src/`. Note exact type hints, nullability (`?string`), and return types.
5. **Step 5: Inspect Package Tests (`tests/`):** Look at unit and functional tests in `vendor/yiisoft/<package>/tests/` for real-world instantiation and edge-case handling.

### Absolute Prohibition of Legacy Yii 2 Remnants

Yii 3 is a complete rewrite based on modern PHP 8.2+ and PSR standards. The following legacy patterns are strictly prohibited:

- ❌ **No `Yii::$app` or Static Facades:** All dependencies must be injected via constructor injection or action method parameters.
- ❌ **No `'__class'` in Definitions:** Use `'class'` exclusively.
- ❌ **No Superglobals (`$_GET`, `$_POST`):** Access request parameters through PSR-7 `ServerRequestInterface`.
- ❌ **No `$model->load($_POST)`:** Use `Yiisoft\Hydrator\Hydrator` and `Yiisoft\Validator\ValidatorInterface`.
- ❌ **No Editing `vendor/`:** Never edit files inside `vendor/`. Overrides must live in `config/` or application code.

---

## 6. Write Code, Then Verify

Once dependencies are verified and the API is grounded in source files, write the necessary application code and execute deterministic verification gates.

### Deterministic Skill Verifiers

Run the offline verification scripts provided with the skill before declaring the task complete:

#### 1. DI Configuration Syntax & Semantic Validator
Validates array definition keys, constructor arguments, interface bindings, and detects illegal closures in `params.php`:
```bash
php scripts/check-di-syntax.php config/
```
- **Exit Code `0`:** All files passed validation cleanly.
- **Exit Code `1`:** Validation errors detected (invalid definition keys, missing interface mappings, closure in params). **Must be fixed before finishing.**
- **Exit Code `2`:** Fatal invocation error (invalid path, unsupported PHP version).

#### 2. Action & Controller Verifier
Validates strict type declarations, PSR-7 response return types, and enforces the Thin Action principle:
```bash
php scripts/verify-actions.php src/
```
- **Exit Code `0`:** All controller and action files passed verification.
- **Exit Code `1`:** Action contract violations detected.
- **Exit Code `2`:** Fatal invocation error.

### Project Quality Gates

After deterministic verification passes, run the target project's configured test suite and static analysis tools:

```bash
# 1. Static Analysis (Psalm or PHPStan)
vendor/bin/psalm
# or
vendor/bin/phpstan analyse

# 2. Automated Architecture & Code Refactoring
vendor/bin/rector --dry-run

# 3. Code Style Enforcement
vendor/bin/php-cs-fixer fix --dry-run --diff

# 4. Automated Tests
vendor/bin/phpunit
```

All detected issues must be resolved cleanly before completing the task.
