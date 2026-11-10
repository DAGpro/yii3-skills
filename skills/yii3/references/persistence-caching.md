# Yii3 Caching & Performance Optimization Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Practical guide and configuration recipes for data caching, PSR-16 drivers, stampede prevention with `getOrSet()`, tag invalidation, view fragment caching with hole-punching, and unit testing using `yiisoft/cache` and driver adapters. External PSR-16 driver adapters and HTTP response caching are owned by dedicated child guides: the [Cache Driver Adapters Guide](persistence-cache-drivers.md) and the [HTTP Response Caching (ETag) Guide](http-cache-etag.md).

---

## Table of Contents
- [1. Caching Architecture: PSR-16 vs Yii CacheInterface](#1-caching-architecture-psr-16-vs-yii-cacheinterface)
  - [1.1. Cache Contracts & Responsibilities](#11-cache-contracts--responsibilities)
  - [1.2. Cache Key Rules (CacheKeyNormalizer)](#12-cache-key-rules-cachekeynormalizer)
  - [1.3. Value Object Ttl (cache 3.2.0+)](#13-value-object-ttl-cache-320)
- [2. Cache Drivers & DI Configuration](#2-cache-drivers--di-configuration)
  - [2.1. File Cache (yiisoft/cache-file)](#21-file-cache-yiisoftcache-file)
  - [2.2. External Cache Driver Adapters (Redis / DB / APCu / Memcached / WinCache)](#22-external-cache-driver-adapters-redis--db--apcu--memcached--wincache) — full reference in the [Cache Driver Adapters Guide](persistence-cache-drivers.md)
  - [2.3. Development & Namespacing Helpers](#23-development--namespacing-helpers)
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
- [6. HTTP Response Caching (ETag & Conditional Requests)](#6-http-response-caching-etag--conditional-requests) — full reference in the [HTTP Response Caching (ETag) Guide](http-cache-etag.md)
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
| **`YiisoftCacheInterface`** | `Yiisoft\Cache\CacheInterface` | Yii3 decorator contract declaring only three methods: `psr(): \Psr\SimpleCache\CacheInterface`, `getOrSet(...)`, and `remove(mixed $key): void`. Provides single-call read-through caching, probabilistic warm-path stampede prevention via "Probably Early Expiration" (XFetch), and invalidation dependencies. **It does not declare `get()` or `set()` methods** — access raw operations via `$cache->psr()`. |
| **`Cache`** | `Yiisoft\Cache\Cache` | Default implementation of `Yiisoft\Cache\CacheInterface`. Constructor: `__construct(Psr\SimpleCache\CacheInterface $handler, Ttl|DateInterval|int|null $defaultTtl = null)`. |
| **`TagDependency`** | `Yiisoft\Cache\Dependency\TagDependency` | Groups cached entries under logical tags (e.g. `user-42`, `catalog.products`) and invalidates them all at once via `TagDependency::invalidate()`. |
| **`Ttl`** | `Yiisoft\Cache\Ttl` | Immutable value object representing a time-to-live duration in seconds or infinity. |

> [!TIP]
> Always inject `Yiisoft\Cache\CacheInterface` into your domain and application services rather than `Psr\SimpleCache\CacheInterface`. The Yii-level interface intentionally does **not** extend PSR-16: `get()`, `set()`, `has()` etc. are only available through `$cache->psr()`.

### 1.2. Cache Key Rules (CacheKeyNormalizer)

`Yiisoft\Cache\CacheKeyNormalizer::normalize()` is applied automatically to every key passed to `getOrSet()` and `remove()`:

- A **string or int** key is used as-is if it is 1–64 characters long and contains none of the PSR-16 reserved characters `{ } ( ) / \ @ :` (integers are cast to strings).
- Any **string** key exceeding 64 characters or containing reserved characters is deterministically normalized to `md5($key)` — a plain MD5 hash of the key string itself.
- Only keys that are **neither string nor int** (e.g. an **array** such as `['catalog.featured', $limit]`) are serialized and normalized to `md5(json_encode($key))`.
- **Consequence:** Array keys are collision-safe across diverse data types but stored as 32-character hexadecimal MD5 hashes. They are **not human-readable** in Redis keyspaces or filesystem listings. Use flat string keys (e.g. `catalog.featured.10`) if manual cache inspection is required.
- Direct driver calls (`$cache->psr()->get()`, `$cache->psr()->set()`) do **not** run `CacheKeyNormalizer`. Passing empty strings or keys with reserved characters `{ } ( ) / \ @ :` directly to PSR-16 drivers throws an `InvalidArgumentException`.

### 1.3. Value Object Ttl (cache 3.2.0+)

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

### 2.2. External Cache Driver Adapters (Redis / DB / APCu / Memcached / WinCache)

> **Driver selection note:** `yiisoft/cache-file` (§2.1) is the zero-dependency default for simple web apps. Beyond it, exactly **ONE** additional PSR-16 driver package is installed per project — `yiisoft/cache-redis` XOR `yiisoft/cache-db` XOR `yiisoft/cache-apcu` XOR `yiisoft/cache-memcached` XOR `yiisoft/cache-wincache`. Resolve which driver is installed via the project's `composer.json` or the [Package Catalog, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family), then read only the matching adapter section in the child guide.
>
> **For the complete reference on external cache driver adapters** — `RedisCache` + Predis client wiring and cluster mode, `DbCache` schema initialization, `ApcuCache` per-SAPI shared memory, Memcached persistent connections and TTL semantics, and WinCache — **see the** [Cache Driver Adapters Guide](persistence-cache-drivers.md).

### 2.3. Development & Namespacing Helpers

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

where $\Delta$ is the time elapsed since the item was stored — the item's age at the moment of the check (`$now - $this->updated` in `CacheItem::expired()`, where `$updated` is the `microtime(true)` recorded at construction). It is **not** the execution time of the generator closure.

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
use Yiisoft\Cache\CacheKeyNormalizer;
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
        // Array keys must be normalized before the raw PSR-16 API: psr() returns a cache
        // typed `string $key`, so passing the array directly is a fatal TypeError.
        $psrKey = CacheKeyNormalizer::normalize($key);

        // 1. Fast un-locked check
        /** @var ReportData|null $cached */
        $cached = $this->cache->psr()->get($psrKey);
        if ($cached !== null) {
            return $cached;
        }

        // 2. Synchronize across concurrent processes with a 15-second acquisition timeout
        /** @var ReportData */
        return $this->synchronizer->execute("lock:$month", function () use ($psrKey, $month): ReportData {
            // 3. Double-Check inside critical section: Did another worker calculate it while we waited?
            /** @var ReportData|null $innerCached */
            $innerCached = $this->cache->psr()->get($psrKey);
            if ($innerCached !== null) {
                return $innerCached;
            }

            // 4. Exactly one process generates the heavy report
            $report = $this->reportGenerator->generateForMonth($month);
            $this->cache->psr()->set($psrKey, $report, Ttl::days(30)->toSeconds());

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

declare(strict_types=1);

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

> **For the complete reference on** HTTP-layer response caching — RFC 7232 conditional-request mechanics (weak validators, multi-value `If-None-Match`, compression suffix normalization), the declarative `HttpCacheMiddleware` PSR-15 recipe (ETag / `Last-Modified` providers, route wiring), and programmatic action-level conditional GET — **see the** [HTTP Response Caching (ETag) Guide](http-cache-etag.md). HTTP caching wraps the middleware pipeline and is distinct from application data caching (§1–§5); the middleware itself is catalogued in the [PSR-15 Middlewares Guide](http-middlewares.md).

---

## 7. Unit Testing Caching & Fault Injection

### 7.1. Storage Failure Simulation with MemorySimpleCache

`Yiisoft\Test\Support\SimpleCache\MemorySimpleCache` is an in-memory PSR-16 double with public boolean fault-injection flags: `$memoryCache->returnOnSet = false;` (plus the `returnOnDelete` / `returnOnClear` counterparts) makes `set()`, `delete()`, and `clear()` return `false`, simulating storage failures without a mocking framework. Under `yiisoft/cache`, a failed `set()` inside `getOrSet()` surfaces as a `SetCacheException`.

### 7.2. Inspecting Cache Operations with SimpleCacheActionLogger

Wrap any PSR-16 cache with `Yiisoft\Test\Support\SimpleCache\SimpleCacheActionLogger` to record every interaction as `Action` constants (`Action::GET`, `Action::SET`, `Action::DELETE`, `Action::CLEAR`, `Action::HAS`) — inspect the call sequence with `$logger->getActionKeyList()`. Note there is **no** `clearActions()` method: instantiate a fresh wrapper to record fresh actions. One compact zero-shot cache-hit assertion:

```php
public function testGetFeaturedProductsIsCached(): void
{
    $logger = new SimpleCacheActionLogger(new MemorySimpleCache());
    $service = new ProductCatalogService(new Cache($logger), $this->createMock(ProductRepositoryInterface::class));

    $first = $service->getFeaturedProducts(5); // Populates the cache
    $second = $service->getFeaturedProducts(5); // Served from cache

    self::assertSame($first, $second);
    self::assertSame([Action::GET, Action::SET, Action::GET], array_column($logger->getActionKeyList(), 0));
}
```

> [!TIP]
> **Cache Testing Reference:**
> For the complete reference on `MemorySimpleCache` fault-injection flags, `SimpleCacheActionLogger` / `Action` semantics, and the `clearActions()` trap, see the [Testing PSR Doubles Guide, §4. PSR-16 Simple Cache (`MemorySimpleCache` & `SimpleCacheActionLogger`)](testing-psr-doubles.md#4-psr-16-simple-cache-memorysimplecache--simplecacheactionlogger).

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
| Setting `$gcProbability` as a percentage (e.g. `1` for 1%) | Parameter is parts per million (PPM); `1` means 0.0001% (1 in 1,000,000 writes), effectively disabling garbage collection. | Use proper PPM scale: `FileCache` default `10` (0.001%), `DbCache` default `100` (0.01%), `10_000` (1.0%). |
| Invalidating cache tags before committing database transaction | Concurrent requests read uncommitted/stale DB state and re-populate cache, locking stale data under new tag timestamp. | Commit database transactions first, then call `TagDependency::invalidate()` in the post-commit phase. |
| Writing values via raw `psr()->set()` expecting dependencies to work | Raw PSR-16 writes store values directly without the `CacheItem` metadata envelope; dependencies are never validated. | Always use `getOrSet()` when attaching `TagDependency`, `FileDependency`, or `CallbackDependency`. |
| Passing a `Ttl` object directly to `CacheInterface::getOrSet()` | `getOrSet()` accepts `DateInterval|int|null`, not `Ttl`. Passing `Ttl` object directly triggers fatal `TypeError`. | Call `->toSeconds()` when passing to `getOrSet()`: `$cache->getOrSet(..., ttl: $ttl->toSeconds())`. |

---

## Related Topic Guides

- [Cache Driver Adapters Guide](persistence-cache-drivers.md) — External PSR-16 driver adapters (`cache-redis`, `cache-db`, `cache-apcu`, `cache-memcached`, `cache-wincache`): Predis wiring, `DbCache` schema initialization, per-SAPI shared-memory traps, and driver anti-patterns.
- [HTTP Response Caching (ETag) Guide](http-cache-etag.md) — RFC 7232 conditional requests, the `HttpCacheMiddleware` PSR-15 recipe, and action-level conditional GET.
- [Persistence: Plain DB Guide](persistence-db.md) — Database connection, `ConnectionInterface::transaction()`, and the cache-adjacent DB drivers (`DbCache` schema) required by cache adapters.
- [Testing Core Guide](testing-core.md) — `MemorySimpleCache` fault-injection flags and `SimpleCacheActionLogger` semantics (§7 references its PSR-16 section).
