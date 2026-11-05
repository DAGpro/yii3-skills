# Dependency Protocol

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> **Operational gate for the dependency lifecycle: check → decide → install → wire → learn.**
> Per the [SKILL.md](../SKILL.md) core rules, every capability goes through this protocol **before** any code that uses it is written. It prevents package hallucinations, version drift, broken container graphs, and supply-chain mistakes.
> Post-install code verification (project quality gates) is a separate, final step — see [§6](#6-verify-the-result).

---

## Table of Contents
- [1. Check Requirements](#1-check-requirements)
- [2. Decide Who Decides](#2-decide-who-decides)
- [3. Install Safely](#3-install-safely)
- [4. Verify Wiring](#4-verify-wiring)
- [5. Learn the API from the Source (vendor/)](#5-learn-the-api-from-the-source-vendor)
- [6. Verify the Result](#6-verify-the-result)
- [Related Topic Guides](#related-topic-guides)

---

Every dependency decision starts from two canonical inputs and walks the protocol in order:

1. **Required Capability** — the functional need for the task, resolved to a canonical package name via the [Package Catalog](package-catalog.md).
2. **Project Manifest** — the target project's root `composer.json`, `composer.lock`, and `config/` layout.

Sequence: **[1](#1-check-requirements)** check whether the capability is already installed → **[2](#2-decide-who-decides)** if not, decide who authorizes the install → **[3](#3-install-safely)** install → **[4](#4-verify-wiring)** verify the DI/config wiring → **[5](#5-learn-the-api-from-the-source-vendor)** ground the API in the installed package source → write code, then verify the result ([§6](#6-verify-the-result)).

---

## 1. Check Requirements

Before issuing any command or proposing modifications:

1. **Check for Existing Installation:** Inspect `require` and `require-dev` in `composer.json`. If the package is already listed, **skip installation entirely** and proceed directly to [§4 Verify Wiring](#4-verify-wiring).
2. **Resolve Missing Capabilities:** If the capability is not present, look up the canonical package name in the [Package Catalog](package-catalog.md). Never invent or assume package names; proceed to [§2 Decide Who Decides](#2-decide-who-decides).
3. **Select Exactly One Driver for Interchangeable Subsystems:** When a capability provides multiple driver backends (database drivers, cache backends, queue transports, mutex drivers, RBAC storages), resolve to **strictly one driver** matching the target infrastructure. Forcing multiple implementations of the same interface into the DI container leads to ambiguous service resolution or container compilation failure. The full subsystem → interface → driver matrix with per-family selection rules lives in [Package Catalog §3](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family); consult it there and never duplicate driver selections across subsystems.

### 1.1. Four-Step Heuristic for Detecting Existing Drivers

When entering an existing codebase, detect the provisioned driver without guessing:

1. **Step 1: Check `composer.json`:** Look for installed driver packages in `require` (e.g. `yiisoft/db-pgsql` vs `yiisoft/db-mysql`).
2. **Step 2: Check DI Container Definitions:** Inspect `config/common/di/db.php`, `config/common/di/cache.php`, and `config/common/di/rbac.php` to see which concrete class implements the interface.
3. **Step 3: Check Configuration Parameters:** Inspect `config/**/params.php` for driver-specific keys such as `yiisoft/db-mysql`, `yiisoft/cache-file`, or `yiisoft/db-migration`.
4. **Step 4: Check Environment & Infrastructure Files:** Inspect `.env` or `.env.example` for DSN prefixes (`mysql:`, `pgsql:`, `sqlite:`) and `docker-compose.yml` for database images (e.g. `postgres:16-alpine`, `mysql:8.0`, `redis:7`).

### 1.2. Unknown Capabilities

If the required capability is not listed in the [Package Catalog](package-catalog.md):

1. Search Packagist specifically within the official organization: `https://github.com/yiisoft`.
2. Verify the package is actively maintained and compatible with PHP 8.2+.
3. If no official `yiisoft/*` package exists and a third-party package must be selected, **explicitly disclose** the non-Yii dependency to the user with architectural rationale.

---

## 2. Decide Who Decides

Clear boundaries govern when an agent may install dependencies autonomously versus when it must request confirmation:

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
  - Any non-`yiisoft/*` third-party vendor package (e.g. `league/*`, `symfony/*`, `ramsey/uuid`).
  - Core architectural decisions:
    - Choice of persistence paradigm (Active Record vs Cycle ORM vs Plain DB).
    - Database engine choice (PostgreSQL vs MySQL vs SQLite).
    - Template engine selection (Yii View PHP templates vs Twig).
    - Asynchronous queue broker (Redis vs AMQP vs Beanstalkd).

### 2.1. Persistence Paradigm Branches

The three persistence architectures in Yii 3 are mutually distinct and cannot be mixed arbitrarily:

| Paradigm | Component Stack | Entity Design | Data Manipulation Pattern |
| :--- | :--- | :--- | :--- |
| **Active Record** | `yiisoft/db`<br>`yiisoft/db-<driver>`<br>`yiisoft/active-record`<br>`yiisoft/db-migration`<br>`yiisoft/data-db`<br>`yiisoft/rbac-db` | Domain models extend `Yiisoft\ActiveRecord\ActiveRecord`. | `$user = new User();`<br>`$user->name = 'Alice';`<br>`$user->save();` |
| **Cycle ORM** | `yiisoft/yii-cycle`<br>`cycle/orm`<br>`cycle/annotated`<br>`cycle/migrations`<br>`yiisoft/data-cycle`<br>`yiisoft/rbac-cycle-db` | Plain PHP classes with attributes `#[Entity]`, `#[Column]`. | `$em->persist($user);`<br>`$em->run();` |
| **Plain DB** | `yiisoft/db`<br>`yiisoft/db-<driver>`<br>`yiisoft/db-migration`<br>`yiisoft/data-db`<br>`yiisoft/rbac-db` | Plain PHP DTOs or arrays; queries written via query builder. | `$db->createCommand(...)`<br>`$query->from('user')->all();` |

### 2.2. Autonomous Mode Invariants (`HANDOFF_MODE=1`)

When executing in an unattended pipeline or autonomous runner (`HANDOFF_MODE=1`):

1. **Never Prompt:** Do not emit interactive clarification prompts.
2. **Follow Existing Stack:** Adopt whatever architecture is already present in `composer.json` and `config/`.
3. **Empty Project Default:** If the target project is completely uninitialized and has no established persistence paradigm, default to **`yiisoft/db` + `yiisoft/active-record` with SQLite or MySQL** (matching `.env`), and log the choice in the execution report.
4. **Halt on Ambiguity:** If an unresolvable conflict occurs or a mandatory third-party selection cannot be deduced, immediately mark the task status as `blocked` with an explicit reason.

---

## 3. Install Safely

### 3.1. Invocation Channels

Always invoke Composer using the workflow established in the target project. Preserving the runtime environment ensures native C-extensions (`ext-pdo`, `ext-intl`, `ext-mbstring`, `ext-redis`) match:

- **Makefile (Preferred if present):** `make composer req="yiisoft/cache-file"`
- **Docker Compose (Containerized):** `docker compose exec app composer require yiisoft/cache-file`
- **Host CLI (Standard):** `composer require yiisoft/cache-file`

### 3.2. Supply Chain Security & Forbidden Flags

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

### 3.3. Composer Plugin Trust (`config.allow-plugins`)

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

### 3.4. Version Conflict Diagnostics

When a package fails to resolve against the project's lockfile, never force it with `--with-all-dependencies` if it causes unexpected downgrades. Diagnose the collision using Composer's introspection commands:

```bash
# Check why a package is currently installed and what depends on it
composer why yiisoft/db

# Check why a specific new version cannot be installed
composer why-not yiisoft/db ^2.0
```

Report the blocking dependency and the version mismatch in your task summary.

### 3.5. Offline / Sandbox Fallback Protocol

If the execution environment lacks network access or Composer cannot reach external mirrors:

1. Do not crash or abort the task silently.
2. Record the exact `composer require <package>` command in the implementation summary under `Pending Manual Installation Steps`.
3. Implement the application code strictly against the documented vendor interfaces.
4. Mark the task verification status as `unverified (offline environment)`.

---

## 4. Verify Wiring

Once installed, a dependency must be correctly integrated into the application's configuration and DI container. Yii 3 packages fall into two structural categories with different wiring behavior:

### 4.1. Package Architecture Classification

| Category | `composer.json` marker | Examples | Wiring Behavior | Verification |
| :--- | :--- | :--- | :--- | :--- |
| **A — Auto-Configured** | `extra.config-plugin` present | `yiisoft/router`, `yiisoft/view`, `yiisoft/db`, `yiisoft/active-record`, `yiisoft/yii-cycle`, `yiisoft/cache-file`, `yiisoft/log-target-file`, `yiisoft/rbac-rules-container`, `yiisoft/yii-console` | The `yiisoft/config` plugin scans the package's config files and merges them into `config/.merge-plan.php` automatically | Confirm the package name is present in the respective configuration group (`params`, `di-web`, `di-console`, ...) of `config/.merge-plan.php` |
| **B — Pure Library** | `extra.config-plugin` absent | DB drivers (`yiisoft/db-mysql`, `yiisoft/db-pgsql`, `yiisoft/db-sqlite`, `yiisoft/db-mssql`, `yiisoft/db-oracle`), cache backends (`yiisoft/cache-redis`, `yiisoft/cache-db`), `yiisoft/log-target-db`, RBAC storages (`yiisoft/rbac-php`, `yiisoft/rbac-db`) | Ships pure classes and interfaces only, **no config files** | Write a manual DI definition in `config/**/di/*.php` |

> [!WARNING]
> **CRITICAL ARCHITECTURAL PITFALL — Database Drivers and `.merge-plan.php`:**
> Database driver packages (`yiisoft/db-mysql`, `yiisoft/db-pgsql`, `yiisoft/db-sqlite`) **NEVER APPEAR IN `config/.merge-plan.php`**!
> Expecting them in `.merge-plan.php` is a false failure alarm.
> Database drivers MUST be configured manually by creating a DI definition in `config/common/di/db.php`.

> [!NOTE]
> **`yiisoft/di` itself is NOT a Category A package:** its `composer.json` has no `extra.config-plugin` key. It is a pure library — the PSR-11 container implementation that **consumes** the configuration merged by `yiisoft/config` — and therefore never appears in `config/.merge-plan.php` under its own name.

### 4.2. `yiisoft/config` Composer Commands

The plugin commands — `composer yii-config-rebuild` (regenerate the merge plan), `composer yii-config-info [package]` (inspect groups/files), `composer yii-config-copy <package> [target] [files...]` — are documented with full semantics in the [DI & Config Guide, §2.3](core-di-and-config.md). The verification loop in this protocol mostly needs:

```bash
# Crawl configuration files and regenerate config/.merge-plan.php
composer yii-config-rebuild
```

> [!NOTE]
> `config/.merge-plan.php` is an entirely generated file — **never edit it manually** ([DI & Config Guide, §2.2](core-di-and-config.md)).

### 4.3. Configuration Layering & Key Collisions

`yiisoft/config` merges layers in strict order — vendor defaults → vendor overrides → application (`config/common/`, `config/web/`, `config/console/`) → environment overlays. Overriding is permitted **between** layers (application keys win over vendor keys, environment keys win over application keys).

> [!CAUTION]
> **FATAL ERROR: Intra-Layer Duplicate String Keys.** Inside the **same** layer, duplicate string keys in associative arrays throw a fatal `ErrorException: Duplicate key "<key>" in the following configs while building "<group>" group` — e.g. two application-level parameter files defining the same key. Full layer semantics, group syntax, and prefix rules (`$`, `*`, `?`) are specified in the [DI & Config Guide, §2](core-di-and-config.md).
>
> **Scope Restriction:** The variable-scope rules for configuration files are owned by the [DI & Config Guide, §3.1 rule 4](core-di-and-config.md#31-rules-for-parameters): in short, params files see **neither** `$params` nor `$config`, while DI, events, routes, and bootstrap files receive both.

### 4.4. Canonical Wiring Recipes

All definitions must be written in strict PHP without missing dependencies or placeholders. The canonical wiring recipes and the full `yiisoft/definitions` syntax live in the topic guides — resolve the recipe there before writing any definition:

| Wiring Topic | Canonical Recipe Location |
| :--- | :--- |
| Database connection (`config/common/di/db-<driver>.php`) + DSN params | [DI & Config Guide, §4.9](core-di-and-config.md) |
| Cache storage binding (`CacheInterface` → driver) | [DI & Config Guide](core-di-and-config.md) |
| Logger & multiple targets | [Logging Guide, §2](infra-logging.md) |
| RBAC storages (`config/common/di/rbac.php`) | [Auth & RBAC Guide, §8](infra-auth-and-rbac.md) |
| Console command registration (`config/console/params.php`) | [Console Commands Guide, §4](infra-commands.md) |
| Vendor migration `sourcePaths` (`yiisoft/db-migration`) | [Migrations Guide](persistence-migrations.md) |
| Bootstrap callbacks (`config/common/bootstrap.php`) | [DI & Config Guide](core-di-and-config.md), [Runners & Runtimes Guide](infra-runners-and-runtimes.md) |
| Definition syntax (`'class'`, `'__construct()'`, `'$property'`, `'method()'`, tags, `reset`) and container invariants | [DI & Config Guide, §4](core-di-and-config.md) |

> [!IMPORTANT]
> **Logger Parameter Hallucination Warning:**
> The parameter `$params['yiisoft/log']['targets']` does not exist in `yiisoft/log`.
> Log targets are injected directly into the `Yiisoft\Log\Logger` constructor using `Yiisoft\Definitions\ReferencesArray::from([...])` — see the [Logging Guide, §2](infra-logging.md).

---

## 5. Learn the API from the Source (vendor/)

To guarantee zero hallucination and complete fidelity to the installed codebase, never invent method signatures or copy unverified patterns from search snippets or outdated frameworks. Inspect the package source in five steps:

1. **Check `composer.lock`:** Verify the exact tagged version installed for `vendor/yiisoft/<package>` — newer majors change syntax.
2. **Read Package `README.md`:** Open `vendor/yiisoft/<package>/README.md` for the official usage overview, configuration parameters, and architectural philosophy.
3. **Inspect Package `config/`:** If the package provides `config/params.php` or `config/di*.php` (Category A), inspect the default keys and factory definitions before overriding them.
4. **Inspect Public Contracts (`src/*Interface.php`):** Verify interface contracts and class constructors in `vendor/yiisoft/<package>/src/`. Note exact type hints, nullability (`?string`), and return types.
5. **Inspect Package Tests (`tests/`):** Ground real-world instantiation and edge-case handling in `vendor/yiisoft/<package>/tests/`.

> [!IMPORTANT]
> **Never edit files inside `vendor/`.** Overrides must live in `config/` or application code. The full list of forbidden legacy Yii 2 patterns lives in [SKILL.md → "Cross-Cutting Yii 2 Bans (Quick Guard List)"](../SKILL.md#cross-cutting-yii-2-bans-quick-guard-list).

---

## 6. Verify the Result

After dependencies are installed and wired, run the target project's own quality gates — tests, `composer cs-fix`, Psalm/PHPStan, Rector where configured — and confirm the wiring per [SKILL.md → Finale](../SKILL.md); the blocking gate in AI Factory workflows is defined by `injections/verify.md`.

---

## Related Topic Guides

- [Package Catalog](package-catalog.md) — capability → package resolution, driver selection matrix, and minimal package sets per feature archetype.
- [DI & Config Guide](core-di-and-config.md) — PSR-11 container invariants, config layer hierarchy, definition syntax recipes, and parameter inheritance.
- [Feature Recipes](core-feature-recipes.md) — decomposition into the artifact graph (Domain, Persistence, Use Case, Presentation, Wiring).
- [Architecture Alignment](core-architecture-alignment.md) — layer placement and vendor boundary isolation.
