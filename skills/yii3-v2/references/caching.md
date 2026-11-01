# Yii3 Caching & Performance Optimization Guide

> Practical guide and configuration recipes for data caching, PSR-16 drivers, stampede prevention with `getOrSet()`, tag invalidation, view fragment caching with hole-punching, HTTP conditional caching, and unit testing using `yiisoft/cache` and driver adapters.

---

## Table of Contents
- [1. Caching Architecture: PSR-16 vs Yii CacheInterface](#1-caching-architecture-psr-16-vs-yii-cacheinterface)
  - [1.1. Cache Contracts & Responsibilities](#11-cache-contracts--responsibilities)
  - [1.2. Cache Key Rules (CacheKeyNormalizer)](#12-cache-key-rules-cachekeynormalizer)
  - [1.3. Value Object Ttl (Yii 3.2+)](#13-value-object-ttl-yii-32)
- [2. Cache Drivers & DI Configuration](#2-cache-drivers--di-configuration)
  - [2.1. File Cache (yiisoft/cache-file)](#21-file-cache-yiisoftcache-file)
  - [2.2. Redis Cache (yiisoft/cache-redis)](#22-redis-cache-yiisoftcache-redis)
  - [2.3. Database Cache (yiisoft/cache-db)](#23-database-cache-yiisoftcache-db)
  - [2.4. APCu Cache (yiisoft/cache-apcu)](#24-apcu-cache-yiisoftcache-apcu)
  - [2.5. Memcached (yiisoft/cache-memcached)](#25-memcached-yiisoftcache-memcached)
  - [2.6. WinCache (yiisoft/cache-wincache)](#26-wincache-yiisoftcache-wincache)
  - [2.7. Development & Namespacing Helpers](#27-development--namespacing-helpers)
- [3. The getOrSet Pattern & Stampede Prevention](#3-the-getorset-pattern--stampede-prevention)
  - [3.1. Method Signatures & Basic Read-Through](#31-method-signatures--basic-read-through)
  - [3.2. Probabilistic Early Expiration (XFetch)](#32-probabilistic-early-expiration-xfetch)
  - [3.3. Cold Stampede Prevention: Mutex Double-Checked Locking](#33-cold-stampede-prevention-mutex-double-checked-locking)
- [4. Cache Invalidation & Dependency Management](#4-cache-invalidation--dependency-management)
  - [4.1. TagDependency Invalidation & Transaction Safety](#41-tagdependency-invalidation--transaction-safety)
  - [4.2. File & Callback Dependencies](#42-file--callback-dependencies)
  - [4.3. Dependency Combinators (AllDependencies vs AnyDependency)](#43-dependency-combinators-alldependencies-vs-anydependency)
  - [4.4. Worker Runtime Invariant (Resetting Static Pool)](#44-worker-runtime-invariant-resetting-static-pool)
- [5. View Fragment Caching & Dynamic Content (Hole-Punching)](#5-view-fragment-caching--dynamic-content-hole-punching)
  - [5.1. ViewRenderer Trap: Fatal Closure Serialization](#51-viewrenderer-trap-fatal-closure-serialization)
  - [5.2. Fragment Caching with Hole-Punching (CachedContent & DynamicContent)](#52-fragment-caching-with-hole-punching-cachedcontent--dynamiccontent)
- [6. HTTP Response Caching (ETag & Conditional Requests)](#6-http-response-caching-etag--conditional-requests)
  - [6.1. RFC 7232 Mechanics & Suffix Normalization](#61-rfc-7232-mechanics--suffix-normalization)
  - [6.2. Declarative PSR-15 Middleware (HttpCacheMiddleware)](#62-declarative-psr-15-middleware-httpcachemiddleware)
  - [6.3. Programmatic Action-Level Conditional GET](#63-programmatic-action-level-conditional-get)
- [7. Unit Testing Caching & Fault Injection](#7-unit-testing-caching--fault-injection)
  - [7.1. Storage Failure Simulation with MemorySimpleCache](#71-storage-failure-simulation-with-memorysimplecache)
  - [7.2. Inspecting Cache Operations with SimpleCacheActionLogger](#72-inspecting-cache-operations-with-simplecacheactionlogger)
- [8. Anti-Pattern Matrix](#8-anti-pattern-matrix)

---

## 1. Caching Architecture: PSR-16 vs Yii CacheInterface

### 1.1. Cache Contracts & Responsibilities

Yii3 clearly separates the low-level PSR-16 key-value store from the high-level application cache interface:

| Contract / Class | FQCN | Role & Distinct Capabilities |
|---|---|---|
| **`PsrCacheInterface`** | `Psr\SimpleCache\CacheInterface` | Standard PSR-16 contract (`get`, `set`, `delete`, `clear`, `has`, `getMultiple`, `setMultiple`, `deleteMultiple`). Implemented by storage drivers: `ArrayCache`, `FileCache`, `RedisCache`, `DbCache`, `ApcuCache`, `Memcached`, and `WinCache`. |
| **`YiisoftCacheInterface`** | `Yiisoft\Cache\CacheInterface` | Yii3 decorator contract declaring only three methods: `psr(): \Psr\SimpleCache\CacheInterface`, `getOrSet(...)`, and `remove(mixed $key): void`. Provides atomic read-through caching, stampede prevention via "Probably Early Expiration" (XFetch), and invalidation dependencies. **It does not declare `get()` or `set()` methods** — access raw operations via `$cache->psr()`. |
| **`Cache`** | `Yiisoft\Cache\Cache` | Default implementation of `Yiisoft\Cache\CacheInterface`. Constructor: `__construct(Psr\SimpleCache\CacheInterface $handler, Ttl|DateInterval|int|null $defaultTtl = null)`. |
| **`TagDependency`** | `Yiisoft\Cache\Dependency\TagDependency` | Groups cached entries under logical tags (e.g. `user-42`, `catalog.products`) and invalidates them all at once via `TagDependency::invalidate()`. |
| **`Ttl`** | `Yiisoft\Cache\Ttl` | Immutable value object representing a time-to-live duration in seconds or infinity. |

> [!TIP]
> Always inject `Yiisoft\Cache\CacheInterface` into your domain and application services rather than `Psr\SimpleCache\CacheInterface`. The Yii-level interface intentionally does **not** extend PSR-16: `get()`, `set()`, `has()` etc. are only available through `$cache->psr()`.

### 1.2. Cache Key Rules (CacheKeyNormalizer)

`Yiisoft\Cache\CacheKeyNormalizer::normalize()` is applied automatically to every key passed to `getOrSet()` and `remove()`:

- A **string or int** key is used as-is if it is 1–64 characters long and contains none of the PSR-16 reserved characters `{ } ( ) / \ @ :` (integers are cast to strings).
- Any **string** key exceeding 64 characters or containing reserved characters is deterministically normalized to `md5($key)` — a plain MD5 hash of the key string itself.
- Only non-string keys (e.g. an **array** such as `['catalog.featured', $limit]`) are serialized and normalized to `md5(json_encode($key))`.
- **Consequence:** Array keys are collision-safe across diverse data types but stored as 32-character hexadecimal MD5 hashes. They are **not human-readable** in Redis keyspaces or filesystem listings. Use flat string keys (e.g. `catalog.featured.10`) if manual cache inspection is required.
- Direct driver calls (`$cache->psr()->get()`, `$cache->psr()->set()`) do **not** run `CacheKeyNormalizer`. Passing empty strings or keys with reserved characters `{ } ( ) / \ @ :` directly to PSR-16 drivers throws an `InvalidArgumentException`.

### 1.3. Value Object Ttl (Yii 3.2+)

`Yiisoft\Cache\Ttl` is an immutable value object representing duration in seconds:

```php
declare(strict_types=1);

use Yiisoft\Cache\Ttl;

// Static named constructors
$ttl1 = Ttl::seconds(30);
$ttl2 = Ttl::minutes(15);
$ttl3 = Ttl::hours(4);
$ttl4 = Ttl::days(7);
$ttl5 = Ttl::forever(); // Represents null (no expiration)

// Composite constructor
$composite = Ttl::create(seconds: 30, minutes: 5, hours: 2, days: 1);

// Flexible factory method
$fromInt = Ttl::from(3600);
$fromInterval = Ttl::from(new \DateInterval('PT1H'));
$fromNull = Ttl::from(null); // Converts to Ttl::forever()

// Conversion methods
$seconds = $ttl3->toSeconds(); // 14400 (or null if forever)
$isInfinite = $ttl5->isForever(); // true
```

> [!IMPORTANT]
> **Signature Nuance:** `Yiisoft\Cache\Cache::__construct()` accepts `Ttl|DateInterval|int|null` as its `$defaultTtl`. However, `CacheInterface::getOrSet()` accepts `DateInterval|int|null $ttl = null`. When passing a `Ttl` object to `getOrSet()`, call `->toSeconds()`:
> ```php
> $cache->getOrSet('key', $callable, Ttl::hours(2)->toSeconds());
> ```

---

## 2. Cache Drivers & DI Configuration

The core `yiisoft/cache` package ships with a default container configuration in `vendor/yiisoft/cache/config/di.php` that maps `Yiisoft\Cache\CacheInterface => Yiisoft\Cache\Cache` and `Psr\SimpleCache\CacheInterface => Yiisoft\Cache\ArrayCache`.

To enable persistent caching, **override `Psr\SimpleCache\CacheInterface`** in your application's `config/common/di/cache.php`:

```php
declare(strict_types=1);

use Psr\SimpleCache\CacheInterface as PsrCacheInterface;
use Yiisoft\Cache\Cache;
use Yiisoft\Cache\CacheInterface as YiisoftCacheInterface;
use Yiisoft\Cache\File\FileCache;

return [
    YiisoftCacheInterface::class => Cache::class,
    PsrCacheInterface::class => FileCache::class,
];
```

### 2.1. File Cache (yiisoft/cache-file)

```shell
composer require yiisoft/cache-file
```

Configure parameters in `config/common/params.php` (parameter structure verified against `yiisoft/cache-file`):

```php
declare(strict_types=1);

return [
    'yiisoft/cache-file' => [
        'fileCache' => [
            'path' => '@runtime/cache',
            'directoryMode' => 0775,
            'fileSuffix' => '.bin',
            'fileMode' => null,
            'directoryLevel' => 1,
            'gcProbability' => 10, // Parts per million: 10 = 0.001% chance per write; 0 disables GC.
        ],
    ],
];
```

Wire the driver in `config/common/di/cache.php`:

```php
declare(strict_types=1);

use Psr\SimpleCache\CacheInterface as PsrCacheInterface;
use Yiisoft\Aliases\Aliases;
use Yiisoft\Cache\Cache;
use Yiisoft\Cache\CacheInterface as YiisoftCacheInterface;
use Yiisoft\Cache\File\FileCache;

/** @var array $params */

return [
    FileCache::class => static fn (Aliases $aliases): FileCache => new FileCache(
        cachePath: $aliases->get($params['yiisoft/cache-file']['fileCache']['path'] ?? '@runtime/cache'),
        directoryMode: (int) ($params['yiisoft/cache-file']['fileCache']['directoryMode'] ?? 0775),
        fileSuffix: (string) ($params['yiisoft/cache-file']['fileCache']['fileSuffix'] ?? '.bin'),
        fileMode: isset($params['yiisoft/cache-file']['fileCache']['fileMode'])
            ? (int) $params['yiisoft/cache-file']['fileCache']['fileMode']
            : null,
        directoryLevel: (int) ($params['yiisoft/cache-file']['fileCache']['directoryLevel'] ?? 1),
        gcProbability: (int) ($params['yiisoft/cache-file']['fileCache']['gcProbability'] ?? 10),
    ),

    PsrCacheInterface::class => FileCache::class,
    YiisoftCacheInterface::class => Cache::class,
];
```

> [!WARNING]
> `$gcProbability` is measured in **parts per million** (0–1,000,000), not percentage. The default `10` represents a **0.001%** probability that garbage collection runs on a `set()` call. Setting `1` means 0.0001% (nearly disabled), while `0` disables GC entirely, letting files accumulate indefinitely.

### 2.2. Redis Cache (yiisoft/cache-redis)

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

### 2.3. Database Cache (yiisoft/cache-db)

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

### 2.4. APCu Cache (yiisoft/cache-apcu)

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

### 2.5. Memcached (yiisoft/cache-memcached)

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

### 2.6. WinCache (yiisoft/cache-wincache)

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

### 2.7. Development & Namespacing Helpers

The core `yiisoft/cache` package includes two built-in PSR-16 decorators:

- `Yiisoft\Cache\NullCache`: Accepts all writes and returns default values on reads (no-op). Useful for disabling caching in local development or CI pipelines by mapping `PsrCacheInterface::class => NullCache::class`.
- `Yiisoft\Cache\PrefixedCache`: Wraps an inner PSR-16 cache and prepends a fixed prefix to every key (`new PrefixedCache($innerCache, 'tenant_42:')`). Use it to isolate cache namespaces per tenant or service on a shared Redis or Memcached cluster.

---

## 3. The getOrSet Pattern & Stampede Prevention

### 3.1. Method Signatures & Basic Read-Through

`Yiisoft\Cache\CacheInterface` declares three methods:

```php
declare(strict_types=1);

namespace Yiisoft\Cache;

use DateInterval;
use Psr\SimpleCache\CacheInterface as PsrCacheInterface;
use Yiisoft\Cache\Dependency\Dependency;

interface CacheInterface
{
    public function psr(): PsrCacheInterface;

    public function getOrSet(
        mixed $key,
        callable $callable,
        DateInterval|int|null $ttl = null,
        ?Dependency $dependency = null,
        float $beta = 1.0,
    );

    public function remove(mixed $key): void;
}
```

The `$callable` receives the PSR-16 handler as its argument (`callable(PsrCacheInterface): mixed`):

```php
declare(strict_types=1);

namespace App\Catalog\Application;

use App\Catalog\Domain\Product;
use App\Catalog\Domain\ProductRepositoryInterface;
use Yiisoft\Cache\CacheInterface;
use Yiisoft\Cache\Ttl;

final readonly class ProductCatalogService
{
    public function __construct(
        private CacheInterface $cache,
        private ProductRepositoryInterface $productRepository,
    ) {}

    /**
     * @return Product[]
     */
    public function getFeaturedProducts(int $limit = 10): array
    {
        /** @var Product[] */
        return $this->cache->getOrSet(
            key: ['catalog.featured', $limit],
            callable: fn (): array => $this->productRepository->findFeatured($limit),
            ttl: Ttl::hours(2)->toSeconds(),
            beta: 1.0,
        );
    }
}
```

### 3.2. Probabilistic Early Expiration (XFetch)

When a heavily queried item expires under high concurrent traffic, hundreds of processes attempt to recompute it simultaneously (cache stampede). The `$beta` parameter in `getOrSet()` implements the XFetch probabilistic early expiration algorithm in `Yiisoft\Cache\Metadata\CacheItem::expired()`:

$$\text{expired} = \text{now} - \Delta \times \beta \times \ln\left(\frac{\text{random}(1, \text{PHP\_INT\_MAX})}{\text{PHP\_INT\_MAX}}\right)$$

where $\Delta$ is the execution time required to compute the cached item.

- **$\beta = 1.0$ (Default):** The probability of recalculating early increases smoothly as expiration nears, ensuring a single worker updates the value before expiration while others continue receiving the cached entry.
- **$\beta > 1.0$ (e.g. $2.0$):** Widens the recalculation window for very expensive operations (e.g. multi-second aggregation queries).
- **$\beta = 0.0$:** Disables early expiration entirely; the item is only recomputed strictly after TTL expires.
- **$\beta < 0.0$:** Throws `Yiisoft\Cache\Exception\InvalidArgumentException`.

### 3.3. Cold Stampede Prevention: Mutex Double-Checked Locking

XFetch prevents stampedes when an item **already exists** in cache. However, on a **cold start**, after full cache eviction, or after broad tag invalidation, the key is absent (`null`). In this scenario, all concurrent requests experience an immediate cache miss and simultaneously invoke the generator closure.

To prevent cold cache dog-piling on critical resources, combine `Yiisoft\Mutex\Synchronizer` with the **Double-Checked Locking pattern**:

```php
declare(strict_types=1);

namespace App\Reporting\Application;

use App\Reporting\Domain\ReportData;
use App\Reporting\Domain\ReportGenerator;
use Yiisoft\Cache\CacheInterface;
use Yiisoft\Cache\Ttl;
use Yiisoft\Mutex\Synchronizer;

final readonly class MonthlySalesReportService
{
    public function __construct(
        private CacheInterface $cache,
        private Synchronizer $synchronizer,
        private ReportGenerator $reportGenerator,
    ) {}

    public function getReport(string $month): ReportData
    {
        $key = ['reports.sales.monthly', $month];

        // 1. Fast un-locked check
        /** @var ReportData|null $cached */
        $cached = $this->cache->psr()->get($key);
        if ($cached !== null) {
            return $cached;
        }

        // 2. Synchronize across concurrent processes with a 15-second acquisition timeout
        /** @var ReportData */
        return $this->synchronizer->execute("lock:$month", function () use ($key, $month): ReportData {
            // 3. Double-Check inside critical section: Did another worker calculate it while we waited?
            /** @var ReportData|null $innerCached */
            $innerCached = $this->cache->psr()->get($key);
            if ($innerCached !== null) {
                return $innerCached;
            }

            // 4. Exactly one process generates the heavy report
            $report = $this->reportGenerator->generateForMonth($month);
            $this->cache->psr()->set($key, $report, Ttl::days(30)->toSeconds());

            return $report;
        }, timeout: 15);
    }
}
```

---

## 4. Cache Invalidation & Dependency Management

### 4.1. TagDependency Invalidation & Transaction Safety

`Yiisoft\Cache\Dependency\TagDependency` links cached values to logical string tags.

- Constructor: `__construct(array|string $tags, ?int $ttl = null)`. The second argument `$ttl` controls the lifetime of the **tag metadata records** (defaults to `null`, meaning infinite lifetime). Passing `$ttl < 1` throws `InvalidArgumentException`.
- Invalidation: `TagDependency::invalidate(CacheInterface $cache, array|string $tags): void`.

```php
declare(strict_types=1);

namespace App\Catalog\Application;

use App\Catalog\Domain\Product;
use App\Catalog\Domain\ProductRepositoryInterface;
use Yiisoft\Cache\CacheInterface;
use Yiisoft\Cache\Dependency\TagDependency;
use Yiisoft\Cache\Ttl;

final readonly class ProductManagementService
{
    public function __construct(
        private CacheInterface $cache,
        private ProductRepositoryInterface $productRepository,
    ) {}

    public function getProduct(int $id): Product
    {
        /** @var Product */
        return $this->cache->getOrSet(
            key: ['catalog.product', $id],
            callable: fn (): Product => $this->productRepository->getById($id),
            ttl: Ttl::hours(24)->toSeconds(),
            dependency: new TagDependency(['catalog.products', "product.$id"]),
        );
    }

    public function updatePrice(int $id, int $newPriceInCents): void
    {
        // 1. Persist and commit database changes FIRST
        $this->productRepository->updatePrice($id, $newPriceInCents);

        // 2. Invalidate tags ONLY AFTER transactional commit
        TagDependency::invalidate($this->cache, ["product.$id", 'catalog.products']);
    }
}
```

> [!CAUTION]
> **Transaction Invariant:** Never call `TagDependency::invalidate()` inside an uncommitted database transaction. If invalidated before commit, concurrent requests will read stale database data and immediately repopulate the cache, re-anchoring the stale data to the newly generated tag timestamp.

### 4.2. File & Callback Dependencies

All cache dependencies inherit from `Yiisoft\Cache\Dependency\Dependency`:

- `FileDependency`: Invalidates when `filemtime($fileName)` changes. Constructor: `__construct(string $fileName)`.
- `CallbackDependency`: Invalidates when a PHP callable returns a different value than when the item was cached. Constructor: `__construct(callable $callback)`.

```php
declare(strict_types=1);

namespace App\Infrastructure\Cache;

use Yiisoft\Cache\CacheInterface;
use Yiisoft\Cache\Dependency\CallbackDependency;
use Yiisoft\Cache\Dependency\FileDependency;
use Yiisoft\Db\Connection\ConnectionInterface;

final readonly class SystemDependencies
{
    public function __construct(
        private ConnectionInterface $db,
    ) {}

    public function schemaFileDependency(string $schemaPath): FileDependency
    {
        return new FileDependency($schemaPath);
    }

    public function maxUpdatedAtDependency(): CallbackDependency
    {
        // NOTE: The callback receives Yiisoft\Cache\CacheInterface $cache, NOT a PSR-16 handler!
        return new CallbackDependency(
            function (CacheInterface $cache): string {
                /** @var string|false $result */
                $result = $this->db
                    ->createCommand('SELECT MAX(updated_at) FROM {{%catalog_product}}')
                    ->queryScalar();

                return (string) ($result ?: '0');
            },
        );
    }
}
```

### 4.3. Dependency Combinators (AllDependencies vs AnyDependency)

When a cached item depends on multiple conditions, combine them using combinators:

- **`Yiisoft\Cache\Dependency\AnyDependency` (Singular):** Logical **OR**. The cache item is invalidated if **any** sub-dependency reports a change.
- **`Yiisoft\Cache\Dependency\AllDependencies` (Plural):** Logical **AND**. The cache item is invalidated only if **all** sub-dependencies report a change.

```php
declare(strict_types=1);

namespace App\Catalog\Application;

use App\Catalog\Domain\CategoryRepositoryInterface;
use Yiisoft\Cache\CacheInterface;
use Yiisoft\Cache\Dependency\AllDependencies;
use Yiisoft\Cache\Dependency\AnyDependency;
use Yiisoft\Cache\Dependency\FileDependency;
use Yiisoft\Cache\Dependency\TagDependency;
use Yiisoft\Cache\Ttl;

final readonly class NavigationMenuService
{
    public function __construct(
        private CacheInterface $cache,
        private CategoryRepositoryInterface $categoryRepository,
    ) {}

    public function getNavigationTree(string $locale): array
    {
        return $this->cache->getOrSet(
            key: ['navigation.tree', $locale],
            callable: fn (): array => $this->categoryRepository->buildTree($locale),
            ttl: Ttl::days(7)->toSeconds(),
            // Invalidates if EITHER the schema file changes OR the categories tag is invalidated
            dependency: new AnyDependency([
                new FileDependency('/app/config/navigation-schema.json'),
                new TagDependency('catalog.categories'),
            ]),
        );
    }

    public function getStrictExportData(string $jobId): array
    {
        return $this->cache->getOrSet(
            key: ['catalog.export', $jobId],
            callable: fn (): array => $this->categoryRepository->buildExportData($jobId),
            ttl: Ttl::hours(6)->toSeconds(),
            // Invalidates ONLY IF BOTH dependencies have changed
            dependency: new AllDependencies([
                new TagDependency('export.schema.v2'),
                new TagDependency("export.job.$jobId"),
            ]),
        );
    }
}
```

### 4.4. Worker Runtime Invariant (Resetting Static Pool)

Calling `$dependency->markAsReusable()` instructs Yii to evaluate dependency data once and cache it in a private static pool (`Dependency::$reusableData`) for the duration of the request:

```php
$dependency = new CallbackDependency($callback);
$dependency->markAsReusable();
```

> [!CAUTION]
> **Worker Runtime Invariant:** In long-lived worker runtimes (RoadRunner, Swoole, FrankenPHP), static properties persist across HTTP requests. Failing to reset `Dependency::$reusableData` between worker loop iterations causes dependencies to be evaluated against stale static data from previous requests.
>
> In your worker loop or terminal PSR-15 reset middleware, always execute:
> ```php
> \Yiisoft\Cache\Dependency\Dependency::resetReusableData();
> ```

```php
declare(strict_types=1);

namespace App\Infrastructure\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Yiisoft\Cache\Dependency\Dependency;

final class WorkerStateResetMiddleware implements MiddlewareInterface
{
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        try {
            return $handler->handle($request);
        } finally {
            Dependency::resetReusableData();
        }
    }
}
```

---

## 5. View Fragment Caching & Dynamic Content (Hole-Punching)

### 5.1. ViewRenderer Trap: Fatal Closure Serialization

> [!NOTE]
> **Deprecation:** `Yiisoft\Yii\View\Renderer\ViewRenderer` is `@deprecated` since `yiisoft/yii-view-renderer` 7.4.0 — use `WebViewRenderer` instead. The closure-serialization trap applies equally to `WebViewRenderer`: its `render()` / `renderPartial()` methods return a deferred `ViewResponse` object, so caching the returned response instance triggers the same fatal error. Always use `renderAsString()` / `renderPartialAsString()` regardless of which renderer is installed.

In `yiisoft/yii-view-renderer`, methods `render()` and `renderPartial()` return a `Yiisoft\DataResponse\DataResponse` object that wraps an unexecuted closure:

```php
$this->responseFactory->createResponse(fn(): string => $this->renderProxy(...))
```

This closure captures `$this` (the entire `ViewRenderer` instance, containing references to DI services and response factories). Attempting to cache the output of `renderPartial()` causes PHP to halt with a fatal error:

```
Exception: Serialization of 'Closure' is not allowed
```

**The Solution:** Always use string rendering methods for fragment caching:
- `ViewRenderer::renderPartialAsString(string $view, array $parameters = []): string` (renders template without layout directly to HTML string)
- `ViewRenderer::renderAsString(string $view, array $parameters = []): string` (renders template with layout directly to HTML string)

### 5.2. Fragment Caching with Hole-Punching (CachedContent & DynamicContent)

The `yiisoft/view` package provides an official caching subsystem for view fragments:
- `Yiisoft\View\Cache\CachedContent`: Manages fragment caching, cache variations, and dynamic placeholders.
- `Yiisoft\View\Cache\DynamicContent`: Generates dynamic content to replace placeholders on every request (hole-punching). Dynamic placeholders follow the format `<![CDATA[YII-DYNAMIC-$id]]>`.

```php
declare(strict_types=1);

namespace App\Presentation\Widget;

use Yiisoft\Cache\CacheInterface;
use Yiisoft\Cache\Dependency\TagDependency;
use Yiisoft\Cache\Ttl;
use Yiisoft\View\Cache\CachedContent;
use Yiisoft\View\Cache\DynamicContent;
use Yiisoft\Yii\View\Renderer\ViewRenderer;

final readonly class SidebarWidget
{
    public function __construct(
        private CacheInterface $cache,
        private ViewRenderer $viewRenderer,
    ) {}

    public function render(string $currentUser, string $locale): string
    {
        $cachedContent = new CachedContent(
            id: 'widget.sidebar',
            cache: $this->cache,
            dynamicContents: [
                new DynamicContent(
                    id: 'user-greeting',
                    contentGenerator: static fn (array $params): string => sprintf(
                        '<div class="user-greeting">Hello, <strong>%s</strong>!</div>',
                        htmlspecialchars((string) ($params['user'] ?? 'Guest'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'),
                    ),
                    parameters: ['user' => $currentUser],
                ),
            ],
            variations: [$locale],
        );

        // 1. Attempt to serve from cache with hole-punching evaluated
        $cachedHtml = $cachedContent->get();
        if ($cachedHtml !== null) {
            return $cachedHtml;
        }

        // 2. Cache miss: render static template with dynamic placeholder
        $markup = $this->viewRenderer->renderPartialAsString('widgets/sidebar', [
            'categories' => ['Hardware', 'Software', 'Cloud'],
            'userGreetingPlaceholder' => '<![CDATA[YII-DYNAMIC-user-greeting]]>',
        ]);

        // 3. Store static template string and return rendered result
        return $cachedContent->cache(
            content: $markup,
            ttl: Ttl::hours(4)->toSeconds(),
            dependency: new TagDependency('catalog.categories'),
        );
    }
}
```

Template file `views/widgets/sidebar.php`:

```php
<?php
/** @var array<string> $categories */
/** @var string $userGreetingPlaceholder */
?>
<aside class="sidebar">
    <?= $userGreetingPlaceholder ?>
    <ul class="categories">
        <?php foreach ($categories as $category): ?>
            <li><?= htmlspecialchars($category, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></li>
        <?php endforeach; ?>
    </ul>
</aside>
```

---

## 6. HTTP Response Caching (ETag & Conditional Requests)

### 6.1. RFC 7232 Mechanics & Suffix Normalization

HTTP conditional caching enables browsers and edge CDNs to validate cached representations:
- **Weak Validators (`W/"..."`):** Indicate semantic equality rather than byte-for-byte identical representation (e.g. minified vs formatted JSON).
- **Multi-Value `If-None-Match`:** Clients or proxies may send multiple comma-separated ETags: `If-None-Match: "tag1", "tag2", W/"tag3"`.
- **Compression Suffixes (`-gzip`, `-br`):** Web servers like Apache (`mod_deflate`, `mod_brotli`) alter ETag values by appending compression suffixes. Without normalization, client ETags will fail to match server entity tags, causing 304 validation to fail.
- **Automatic 304 Not Modified:** When ETags match or `If-Modified-Since` is unchanged, the server must emit a `304 Not Modified` response without a message body.

### 6.2. Declarative PSR-15 Middleware (HttpCacheMiddleware)

The `yiisoft/http-middleware` package provides `Yiisoft\HttpMiddleware\HttpCache\HttpCacheMiddleware` to handle RFC 7232 negotiation automatically.

Constructor dependencies:
- `ResponseFactoryInterface $responseFactory`
- `CacheControlProviderInterface $cacheControlProvider = new NullCacheControlProvider()`
- `LastModifiedProviderInterface $lastModifiedProvider = new NullLastModifiedProvider()`
- `ETagProviderInterface $eTagProvider = new NullETagProvider()`
- `ETagGeneratorInterface $eTagGenerator = new DefaultETagGenerator()`
- `ETagValueNormalizerInterface $eTagValueNormalizer = new NoopETagValueNormalizer()`

Implement custom providers for your domain models:

```php
declare(strict_types=1);

namespace App\Blog\Http;

use App\Blog\Domain\BlogPostRepositoryInterface;
use DateTimeImmutable;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\HttpMiddleware\HttpCache\ETag;
use Yiisoft\HttpMiddleware\HttpCache\ETagProvider\ETagProviderInterface;
use Yiisoft\HttpMiddleware\HttpCache\LastModifiedProvider\LastModifiedProviderInterface;

final readonly class BlogPostETagProvider implements ETagProviderInterface
{
    public function __construct(
        private BlogPostRepositoryInterface $repository,
    ) {}

    public function get(ServerRequestInterface $request): ?ETag
    {
        $id = (string) $request->getAttribute('id', '');
        $post = $this->repository->findById($id);
        if ($post === null) {
            return null;
        }

        $seed = $post->getUpdatedAt()->format(\DateTimeInterface::ATOM) . ':' . $post->getTitle();

        return new ETag(seed: $seed, weak: false);
    }
}

final readonly class BlogPostLastModifiedProvider implements LastModifiedProviderInterface
{
    public function __construct(
        private BlogPostRepositoryInterface $repository,
    ) {}

    public function get(ServerRequestInterface $request): ?DateTimeImmutable
    {
        $id = (string) $request->getAttribute('id', '');
        $post = $this->repository->findById($id);

        return $post?->getUpdatedAt();
    }
}
```

Wire the middleware into route definitions in `config/common/routes.php`:

```php
declare(strict_types=1);

use App\Blog\Action\ViewPostAction;
use App\Blog\Http\BlogPostETagProvider;
use App\Blog\Http\BlogPostLastModifiedProvider;
use Psr\Http\Message\ResponseFactoryInterface;
use Yiisoft\HttpMiddleware\HttpCache\CacheControlProvider\ConstantCacheControlProvider;
use Yiisoft\HttpMiddleware\HttpCache\ETagValueNormalizer\SuffixETagValueNormalizer;
use Yiisoft\HttpMiddleware\HttpCache\HttpCacheMiddleware;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route\Get;

return [
    (new Group('/blog'))->routes(
        (new Get('/post/{id:\d+}'))
            ->middleware(static fn (
                ResponseFactoryInterface $responseFactory,
                BlogPostETagProvider $eTagProvider,
                BlogPostLastModifiedProvider $lastModifiedProvider,
            ): HttpCacheMiddleware => new HttpCacheMiddleware(
                responseFactory: $responseFactory,
                cacheControlProvider: new ConstantCacheControlProvider('public, max-age=3600, must-revalidate'),
                lastModifiedProvider: $lastModifiedProvider,
                eTagProvider: $eTagProvider,
                eTagValueNormalizer: new SuffixETagValueNormalizer(['-gzip', '-br']),
            ))
            ->action(ViewPostAction::class),
    ),
];
```

### 6.3. Programmatic Action-Level Conditional GET

For lightweight scenarios without route middleware:

```php
declare(strict_types=1);

namespace App\Blog\Action;

use App\Blog\Domain\BlogPost;
use App\Blog\Domain\BlogPostRepositoryInterface;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;

final readonly class ViewPostAction
{
    public function __construct(
        private BlogPostRepositoryInterface $repository,
        // Canonical factory from the ResponseFactory sub-namespace (wraps the payload
        // into a DataStream body). The deprecated root-namespace twin must not be used.
        private \Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface $dataResponseFactory,
        private ResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $id = (string) $request->getAttribute('id', '');
        $post = $this->repository->findById($id);

        if (!$post instanceof BlogPost) {
            return $this->responseFactory->createResponse(Status::NOT_FOUND);
        }

        $etag = '"' . sha1($post->getId() . ':' . $post->getUpdatedAt()->getTimestamp()) . '"';
        $clientEtag = $request->getHeaderLine(Header::IF_NONE_MATCH);

        if ($clientEtag === $etag) {
            return $this->responseFactory->createResponse(Status::NOT_MODIFIED);
        }

        return $this->dataResponseFactory
            ->createResponse($post->toArray())
            ->withHeader(Header::ETAG, $etag)
            ->withHeader(Header::CACHE_CONTROL, 'public, max-age=3600, must-revalidate');
    }
}
```

---

## 7. Unit Testing Caching & Fault Injection

### 7.1. Storage Failure Simulation with MemorySimpleCache

The `yiisoft/test-support` package provides `Yiisoft\Test\Support\SimpleCache\MemorySimpleCache`. It provides public boolean flags to simulate storage hardware failures and timeout exceptions without mocking frameworks:

- `$memoryCache->returnOnSet = false;` (causes `set()` to return `false`)
- `$memoryCache->returnOnDelete = false;` (causes `delete()` to return `false`)
- `$memoryCache->returnOnClear = false;` (causes `clear()` to return `false`)

### 7.2. Inspecting Cache Operations with SimpleCacheActionLogger

Wrap any PSR-16 cache with `Yiisoft\Test\Support\SimpleCache\SimpleCacheActionLogger` to record every cache interaction:
- Records actions as `Action` instances (`Action::GET`, `Action::SET`, `Action::DELETE`, `Action::CLEAR`, `Action::HAS`).
- Inspect call sequences with `$logger->getActionKeyList(): array<int, array{0: string, 1: mixed}>`.

Complete unit test demonstrating verification of cache hits and fault injection:

```php
declare(strict_types=1);

namespace App\Tests\Unit;

use App\Catalog\Application\ProductCatalogService;
use App\Catalog\Domain\Product;
use App\Catalog\Domain\ProductRepositoryInterface;
use PHPUnit\Framework\TestCase;
use Yiisoft\Cache\Cache;
use Yiisoft\Cache\Exception\SetCacheException;
use Yiisoft\Test\Support\SimpleCache\Action;
use Yiisoft\Test\Support\SimpleCache\MemorySimpleCache;
use Yiisoft\Test\Support\SimpleCache\SimpleCacheActionLogger;

final class ProductCatalogServiceTest extends TestCase
{
    public function testGetFeaturedProductsIsCached(): void
    {
        $memoryCache = new MemorySimpleCache();
        $logger = new SimpleCacheActionLogger($memoryCache);
        $cache = new Cache($logger);

        $repository = $this->createMock(ProductRepositoryInterface::class);
        $repository->expects(self::once())
            ->method('findFeatured')
            ->with(5)
            ->willReturn([new Product(1, 'Notebook Pro')]);

        $service = new ProductCatalogService($cache, $repository);

        // First call: executes repository and populates cache
        $firstCall = $service->getFeaturedProducts(5);
        self::assertCount(1, $firstCall);

        // Second call: served from cache (repository mock called only once)
        $secondCall = $service->getFeaturedProducts(5);
        self::assertCount(1, $secondCall);

        // Verify exact PSR-16 action sequence
        $actions = $logger->getActionKeyList();
        self::assertSame(Action::GET, $actions[0][0]);
        self::assertSame(Action::SET, $actions[1][0]);
        self::assertSame(Action::GET, $actions[2][0]);
    }

    public function testHandlesStorageFailureViaFaultInjection(): void
    {
        $memoryCache = new MemorySimpleCache();
        $memoryCache->returnOnSet = false; // Simulate persistent storage write failure

        $cache = new Cache($memoryCache);
        $repository = $this->createMock(ProductRepositoryInterface::class);
        $repository->method('findFeatured')->willReturn([new Product(1, 'Notebook Pro')]);

        $service = new ProductCatalogService($cache, $repository);

        $this->expectException(SetCacheException::class);
        $service->getFeaturedProducts(5);
    }
}
```

---

## 8. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| Static service-locator cache access (`Yii::$app->cache`) | Yii3 has no static facades or global application locator; static access fails with fatal error and breaks testability. | Inject `Yiisoft\Cache\CacheInterface` via constructor; wire driver in `config/common/di/cache.php`. |
| Injecting `Psr\SimpleCache\CacheInterface` when needing `getOrSet()` or tags | PSR-16 declares no `getOrSet()`, `remove()`, or dependency management; calling them throws fatal `Error: Call to undefined method`. | Inject `Yiisoft\Cache\CacheInterface`; drop down to `$cache->psr()` only for raw storage calls. |
| Calling `get()`, `set()`, or `has()` directly on `Yiisoft\Cache\CacheInterface` | The Yii interface declares only `psr()`, `getOrSet()`, and `remove()`. Direct calls fail with fatal `Error: Call to undefined method`. | Use `$cache->psr()->get(...)` / `->set(...)`, or model the read-through workflow with `getOrSet()`. |
| Instantiating `AnyDependencies` (plural) | Class does not exist; the singular form is `Yiisoft\Cache\Dependency\AnyDependency`. Triggers fatal `Error: Class "AnyDependencies" not found`. | Use `AnyDependency` (singular) for logical OR, and `AllDependencies` (plural) for logical AND. |
| Typing `$cache` in `CallbackDependency` as `Psr\SimpleCache\CacheInterface` | `CallbackDependency::generateDependencyData()` passes `Yiisoft\Cache\CacheInterface` to the closure; type mismatch throws fatal `TypeError`. | Type-hint closure argument as `Yiisoft\Cache\CacheInterface $cache` (or omit type declaration). |
| Forgetting `Dependency::resetReusableData()` in worker runtimes | Reusable dependency results stored in static `Dependency::$reusableData` leak across requests in RoadRunner/Swoole/FrankenPHP. | Invoke `Dependency::resetReusableData()` in worker loops or PSR-15 terminal reset middleware. |
| String cache keys containing `{ } ( ) / \ @ :` or longer than 64 characters | PSR-16 reserves these characters; all bundled drivers throw `InvalidArgumentException` on raw key violations. | Use safe flat strings (letters, digits, dots, dashes, underscores) or array keys (normalized to MD5). |
| Expecting array keys like `['catalog', $id]` to be human-readable strings | `CacheKeyNormalizer` deterministically converts array keys to `md5(json_encode($key))`. | Use explicit prefixed string keys (`catalog.product.10`) when manual inspection in storage is required. |
| Caching `ViewRenderer::renderPartial()` output directly | Returns `DataResponse` wrapping an unexecuted closure capturing `$this`; serialization throws fatal `Serialization of 'Closure' is not allowed`. | Cache string output using `renderPartialAsString()` (no layout) or `renderAsString()` (with layout). |
| Mapping `RedisCache::class` in DI without binding `Predis\ClientInterface` | Container cannot resolve constructor parameter `$client` and fails at runtime during initial resolution. | Define `Predis\ClientInterface::class` in DI configuration before binding `PsrCacheInterface => RedisCache::class`. |
| Using `DbCache` without creating `{{%yii_cache}}` table | Driver catches SQL exceptions and logs them; writes fail silently and `set()` returns `false`. | Execute `DbSchemaManager::ensureTable()` in migration or run SQL scripts from `vendor/yiisoft/cache-db/sql/`. |
| Setting `$gcProbability` as a percentage (e.g. `1` for 1%) | Parameter is parts per million (PPM); `1` means 0.0001% (1 in 1,000,000 writes), effectively disabling garbage collection. | Use proper PPM scale: `FileCache` default `10` (0.001%), `DbCache` default `100` (0.01%), `10_000` (1.0%). |
| Invalidating cache tags before committing database transaction | Concurrent requests read uncommitted/stale DB state and re-populate cache, locking stale data under new tag timestamp. | Commit database transactions first, then call `TagDependency::invalidate()` in the post-commit phase. |
| Writing values via raw `psr()->set()` expecting dependencies to work | Raw PSR-16 writes store values directly without the `CacheItem` metadata envelope; dependencies are never validated. | Always use `getOrSet()` when attaching `TagDependency`, `FileDependency`, or `CallbackDependency`. |
| Passing a `Ttl` object directly to `CacheInterface::getOrSet()` | `getOrSet()` accepts `DateInterval|int|null`, not `Ttl`. Passing `Ttl` object directly triggers fatal `TypeError`. | Call `->toSeconds()` when passing to `getOrSet()`: `$cache->getOrSet(..., ttl: $ttl->toSeconds())`. |
