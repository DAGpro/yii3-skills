# Yii3 Cache Driver Adapters Guide (Redis, DB, APCu, Memcached, WinCache)

> Configuration recipes for the external PSR-16 cache driver packages of `yiisoft/cache`: `yiisoft/cache-redis` (Predis client wiring), `yiisoft/cache-db` (storage-table initialization), `yiisoft/cache-apcu` (per-SAPI shared memory), `yiisoft/cache-memcached` (persistent connections and TTL semantics), and `yiisoft/cache-wincache`.

**Scope & Ownership:** This guide is the single source of truth for external PSR-16 cache driver adapter wiring; it was extracted from the [Caching & Performance Guide, §2.2–§2.6](persistence-caching.md#2-cache-drivers--di-configuration). Exactly **ONE** external driver package is installed per project — `yiisoft/cache-redis` XOR `yiisoft/cache-db` XOR `yiisoft/cache-apcu` XOR `yiisoft/cache-memcached` XOR `yiisoft/cache-wincache`; the zero-dependency default `yiisoft/cache-file` and the `NullCache` / `PrefixedCache` development helpers are owned by the parent [Caching & Performance Guide, §2](persistence-caching.md#2-cache-drivers--di-configuration). Resolve which driver is installed via the project's `composer.json` or the [Package Catalog, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family), then read only the matching adapter section below.

---

## Table of Contents
- [1. Redis Cache (yiisoft/cache-redis)](#1-redis-cache-yiisoftcache-redis)
- [2. Database Cache (yiisoft/cache-db)](#2-database-cache-yiisoftcache-db)
- [3. APCu Cache (yiisoft/cache-apcu)](#3-apcu-cache-yiisoftcache-apcu)
- [4. Memcached (yiisoft/cache-memcached)](#4-memcached-yiisoftcache-memcached)
- [5. WinCache (yiisoft/cache-wincache)](#5-wincache-yiisoftcache-wincache)
- [6. Anti-Patterns](#6-anti-patterns)
- [Related Topic Guides](#related-topic-guides)

---

## 1. Redis Cache (yiisoft/cache-redis)

```shell
composer require yiisoft/cache-redis
```

`Yiisoft\Cache\Redis\RedisCache` requires a `Predis\ClientInterface` instance (`predis/predis` `^3.0`). Register the client and bind the PSR-16 cache:

```php
declare(strict_types=1);

use Predis\Client;
use Predis\ClientInterface;
use Psr\SimpleCache\CacheInterface as PsrCacheInterface;
use Yiisoft\Cache\Cache;
use Yiisoft\Cache\CacheInterface as YiisoftCacheInterface;
use Yiisoft\Cache\Redis\RedisCache;

/** @var array $params */

return [
    ClientInterface::class => static fn (): ClientInterface => new Client([
        'scheme' => 'tcp',
        'host' => $params['redis']['host'] ?? '127.0.0.1',
        'port' => (int) ($params['redis']['port'] ?? 6379),
        'password' => $params['redis']['password'] ?? null,
        'database' => (int) ($params['redis']['database'] ?? 0),
        'read_write_timeout' => 2.0,
    ]),

    PsrCacheInterface::class => RedisCache::class,
    YiisoftCacheInterface::class => Cache::class,
];
```

Redis cluster configurations are supported natively: pass multiple node configurations to `Predis\Client`, and `RedisCache` executes cluster-aware command routing and cluster-wide `flushdb` operations on `clear()`.

## 2. Database Cache (yiisoft/cache-db)

```shell
composer require yiisoft/cache-db
```

`Yiisoft\Cache\Db\DbCache` requires a `Yiisoft\Db\Connection\ConnectionInterface`. Constructor: `__construct(ConnectionInterface $db, string $table = '{{%yii_cache}}', int $gcProbability = 100)`.

```php
declare(strict_types=1);

use Psr\SimpleCache\CacheInterface as PsrCacheInterface;
use Yiisoft\Cache\Cache;
use Yiisoft\Cache\CacheInterface as YiisoftCacheInterface;
use Yiisoft\Cache\Db\DbCache;
use Yiisoft\Db\Connection\ConnectionInterface;

return [
    DbCache::class => static fn (ConnectionInterface $db): DbCache => new DbCache(
        db: $db,
        table: '{{%yii_cache}}',
        gcProbability: 100, // 0.01% chance per write
    ),

    PsrCacheInterface::class => DbCache::class,
    YiisoftCacheInterface::class => Cache::class,
];
```

> [!WARNING]
> `DbCache` does **not** create its storage table automatically. Before the first write, initialize the schema (`{{%yii_cache}}`) by running `Yiisoft\Cache\Db\DbSchemaManager::ensureTable()` in a migration or executing the SQL scripts provided in `vendor/yiisoft/cache-db/sql/`. Writes to a non-existent table fail silently (the error is logged at `LogLevel::ERROR` and `set()` returns `false`).

## 3. APCu Cache (yiisoft/cache-apcu)

```shell
composer require yiisoft/cache-apcu
```

`Yiisoft\Cache\Apcu\ApcuCache` is a `final` class implementing `Psr\SimpleCache\CacheInterface` with no constructor arguments:

```php
declare(strict_types=1);

use Psr\SimpleCache\CacheInterface as PsrCacheInterface;
use Yiisoft\Cache\Apcu\ApcuCache;
use Yiisoft\Cache\Cache;
use Yiisoft\Cache\CacheInterface as YiisoftCacheInterface;

return [
    PsrCacheInterface::class => ApcuCache::class,
    YiisoftCacheInterface::class => Cache::class,
];
```

> [!WARNING]
> APCu is **per-server, per-SAPI shared memory**: web workers and CLI processes do **not** share memory. For CLI scripts (queue workers, console commands) enable APCu via `apc.enable_cli = 1` in `php.ini`. CLI processes cannot clear the web SAPI's cache pool. For multi-server clusters or CLI-to-web invalidations, use Redis or Database cache instead.

## 4. Memcached (yiisoft/cache-memcached)

```shell
composer require yiisoft/cache-memcached
```

`Yiisoft\Cache\Memcached\Memcached` wraps the PECL `memcached` extension. Constructor: `__construct(string $persistentId = '', array $servers = [], array $options = [])`. Class constants: `DEFAULT_SERVER_HOST = '127.0.0.1'`, `DEFAULT_SERVER_PORT = 11211`, `DEFAULT_SERVER_WEIGHT = 1`.

```php
declare(strict_types=1);

// config/common/params.php
return [
    'yiisoft/cache-memcached' => [
        'memcached' => [
            'persistentId' => 'app-cache', // Sharing persistent ID pools connections across requests
            'servers' => [
                ['host' => 'cache-1.internal', 'port' => 11211, 'weight' => 100],
                ['host' => 'cache-2.internal', 'port' => 11211, 'weight' => 50],
            ],
            'options' => [],
        ],
    ],
];
```

Bind the PSR-16 interface in `config/common/di/cache.php`:

```php
declare(strict_types=1);

use Psr\SimpleCache\CacheInterface as PsrCacheInterface;
use Yiisoft\Cache\Cache;
use Yiisoft\Cache\CacheInterface as YiisoftCacheInterface;
use Yiisoft\Cache\Memcached\Memcached;

return [
    PsrCacheInterface::class => Memcached::class,
    YiisoftCacheInterface::class => Cache::class,
];
```

> [!WARNING]
> **TTL Semantics:** Numeric TTLs **greater than 2,592,000 (30 days)** are treated by Memcached as absolute Unix timestamps; the driver converts them via `$ttl + time()`. Storing `set($key, $val, 31 * 86400)` expires in 31 days, but passing an absolute timestamp smaller than 2,592,000 causes immediate expiration.
>
> Memcached provides **no authentication or access control**: any client capable of connecting to the port can read or wipe all data. Never cache unencrypted sensitive data in Memcached.

## 5. WinCache (yiisoft/cache-wincache)

```shell
composer require yiisoft/cache-wincache
```

`Yiisoft\Cache\WinCache\WinCache` is a `final` class with no constructor arguments; requires `wincache.ucenabled = 1` in `php.ini` (and `wincache.enablecli = 1` for CLI):

```php
declare(strict_types=1);

use Psr\SimpleCache\CacheInterface as PsrCacheInterface;
use Yiisoft\Cache\Cache;
use Yiisoft\Cache\CacheInterface as YiisoftCacheInterface;
use Yiisoft\Cache\WinCache\WinCache;

return [
    PsrCacheInterface::class => WinCache::class,
    YiisoftCacheInterface::class => Cache::class,
];
```

## 6. Anti-Patterns

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| Mapping `RedisCache::class` in DI without binding `Predis\ClientInterface` | Container cannot resolve constructor parameter `$client` and fails at runtime during initial resolution. | Define `Predis\ClientInterface::class` in DI configuration before binding `PsrCacheInterface => RedisCache::class`. |
| Using `DbCache` without creating `{{%yii_cache}}` table | Driver catches SQL exceptions and logs them; writes fail silently and `set()` returns `false`. | Execute `DbSchemaManager::ensureTable()` in migration or run SQL scripts from `vendor/yiisoft/cache-db/sql/`. |

## Related Topic Guides

- [Caching & Performance Guide](persistence-caching.md) — Cache architecture (PSR-16 vs `CacheInterface`), the File cache default (§2.1), dev/namespace helpers (§2.7), `getOrSet()` stampede prevention, tag invalidation, and view fragment caching.
- [Persistence: Plain DB Guide](persistence-db.md) — Database connection and driver configuration required by `DbCache`.
- [DI & Configuration Guide](core-di-and-config.md) — Config groups, definitions, modifiers, and container compilation.
