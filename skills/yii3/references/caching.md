# Yii3 Caching & Performance Optimization Guide

> Practical guide and configuration recipes for data caching, PSR-16 drivers, stampede prevention with `getOrSet()`, tag invalidation, and HTTP/view fragment caching using `yiisoft/cache` and driver adapters.
>
> **Source of Truth & Verification Rule for AI Models:**
> In projects using this extension, always verify exact method signatures, constructor arguments, and options directly in `vendor/yiisoft/<package>/src/` for installed packages.
> When generating code, if an installed package's method signature or property is unfamiliar or in doubt, **read its source files in `vendor/yiisoft/<package>/src/`** rather than guessing or relying on Yii2 habits.

---

## Table of Contents
- [1. Caching Architecture: PSR-16 vs Yii CacheInterface](#1-caching-architecture-psr-16-vs-yii-cacheinterface)
- [2. Cache Drivers & DI Configuration](#2-cache-drivers--di-configuration)
  - [2.1. File Cache (yiisoft/cache-file)](#21-file-cache-yiisoftcache-file)
  - [2.2. Redis Cache (yiisoft/cache-redis)](#22-redis-cache-yiisoftcache-redis)
  - [2.3. Database Cache (yiisoft/cache-db)](#23-database-cache-yiisoftcache-db)
  - [2.4. Development & Namespacing Helpers](#24-development--namespacing-helpers)
- [3. The getOrSet Pattern & Stampede Prevention](#3-the-getorset-pattern--stampede-prevention)
- [4. Cache Invalidation & Tag Dependencies](#4-cache-invalidation--tag-dependencies)
  - [4.1. TagDependency Invalidation](#41-tagdependency-invalidation)
  - [4.2. File & Callback Dependencies](#42-file--callback-dependencies)
- [5. View Fragment Caching](#5-view-fragment-caching)
- [6. HTTP Response Caching (ETag & Conditional Requests)](#6-http-response-caching-etag--conditional-requests)
- [7. Anti-Pattern Matrix](#7-anti-pattern-matrix)

---

## 1. Caching Architecture: PSR-16 vs Yii CacheInterface

Yii3 separates the low-level PSR-16 key-value store from the high-level application cache interface:

| Contract / Class | FQCN | Role & Distinct Capabilities |
|---|---|---|
| **`PsrCacheInterface`** | `Psr\SimpleCache\CacheInterface` | Standard PSR-16 contract (`get`, `set`, `delete`, `clear`, `has`, `getMultiple`, `setMultiple`, `deleteMultiple`). Implemented by storage drivers: `ArrayCache`, `FileCache`, `RedisCache`, `DbCache`, and others. |
| **`YiisoftCacheInterface`** | `Yiisoft\Cache\CacheInterface` | Yii3 decorator contract with only three methods: `psr()`, `getOrSet()`, `remove()`. Provides atomic `getOrSet()`, stampede prevention via "Probably Early Expiration" (XFetch), and dependency validation. **It has no `get()`/`set()` methods** — use `psr()` to drop down to PSR-16 operations. |
| **`Cache`** | `Yiisoft\Cache\Cache` | Default implementation of `Yiisoft\Cache\CacheInterface`. Constructor: `__construct(Psr\SimpleCache\CacheInterface $handler, Ttl|DateInterval|int|null $defaultTtl = null)`. |
| **`TagDependency`** | `Yiisoft\Cache\Dependency\TagDependency` | Groups cached entries under logical tags (e.g. `user-42`, `products`) and invalidates all of them at once via `TagDependency::invalidate()`. |

> [!TIP]
> Always inject `Yiisoft\Cache\CacheInterface` into your services rather than `Psr\SimpleCache\CacheInterface` whenever you need `getOrSet()`, `remove()`, or tag-based invalidation. The Yii-level interface intentionally does **not** extend PSR-16: `get()`, `set()`, `has()` etc. are only available through `$cache->psr()`.

### Cache Key Rules (CacheKeyNormalizer)

`Yiisoft\Cache\CacheKeyNormalizer::normalize()` is applied to every key passed to `getOrSet()`/`remove()`:

- A **string or int** key is used as-is if it is 1–64 characters long and contains none of the PSR-16 reserved characters `{ } ( ) / \ @ :`.
- Anything else (longer strings, reserved characters, **arrays**) is normalized deterministically to `md5(json_encode($key))`.
- Consequence: array keys such as `['catalog.featured', $limit]` are collision-safe but stored as MD5 hashes — they are **not human-readable** in Redis/file listings. Use flat string keys (e.g. `catalog.featured.10`) if you need to inspect cache entries manually.
- All bundled PSR-16 drivers (`ArrayCache`, `FileCache`, `RedisCache`, `DbCache`) additionally **throw an exception** when a raw string key contains `{ } ( ) / \ @ :` or is empty — this applies to keys passed directly to `psr()->set()` too.

---

## 2. Cache Drivers & DI Configuration

The core `yiisoft/cache` package ships with a default DI configuration that maps `Yiisoft\Cache\CacheInterface` to `Yiisoft\Cache\Cache` and `Psr\SimpleCache\CacheInterface` to `Yiisoft\Cache\ArrayCache`. **Override the PSR-16 mapping** in `config/common/di/cache.php` to select a persistent driver:

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

Configure file storage in `config/common/params.php` (parameter names verified against `yiisoft/cache-file`'s own `config/params.php`):

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

Constructor of `Yiisoft\Cache\File\FileCache` for reference:
`__construct(string $cachePath, int $directoryMode = 0775, string $fileSuffix = '.bin', ?int $fileMode = null, int $directoryLevel = 1, int $gcProbability = 10)`.

> [!WARNING]
> `$gcProbability` is expressed in **parts per million** (0–1000000), not percent. The default `10` means a **0.001%** chance that garbage collection of expired files runs on each `set()` call. A value of `0` disables garbage collection entirely, which lets expired files accumulate indefinitely.

### 2.2. Redis Cache (yiisoft/cache-redis)

For high-concurrency production deployments:

```shell
composer require yiisoft/cache-redis
```

`Yiisoft\Cache\Redis\RedisCache` requires a **`Predis\ClientInterface`** instance (`predis/predis` `^3.0` package). If you only map `PsrCacheInterface::class => RedisCache::class` without defining the client, the DI container cannot resolve the constructor argument and fails at runtime. Wire both:

```php
declare(strict_types=1);

use Predis\Client;
use Predis\ClientInterface;
use Psr\SimpleCache\CacheInterface as PsrCacheInterface;
use Yiisoft\Cache\Cache;
use Yiisoft\Cache\CacheInterface as YiisoftCacheInterface;
use Yiisoft\Cache\Redis\RedisCache;

return [
    ClientInterface::class => static fn () => new Client([
        'scheme' => 'tcp',
        'host' => '127.0.0.1',
        'port' => 6379,
    ]),
    YiisoftCacheInterface::class => Cache::class,
    PsrCacheInterface::class => RedisCache::class,
];
```

Redis cluster is supported natively by `RedisCache`: pass multiple node connection arrays to the Predis client, and the driver routes commands per key (including cluster-aware `flushdb` in `clear()`).

> [!NOTE]
> The connection parameter array above (`scheme`, `host`, `port`) is the standard Predis client format. For the full set of connection and cluster options, read the `predis/predis` package documentation in `vendor/predis/predis/` for the version installed in the project.

### 2.3. Database Cache (yiisoft/cache-db)

For shared caching over existing SQL database connections:

```shell
composer require yiisoft/cache-db
```

`Yiisoft\Cache\Db\DbCache` requires a **`Yiisoft\Db\Connection\ConnectionInterface`** (provided by the `yiisoft/db-*` packages). Its constructor:
`__construct(ConnectionInterface $db, string $table = '{{%yii_cache}}', int $gcProbability = 100)`.

```php
declare(strict_types=1);

use Psr\SimpleCache\CacheInterface as PsrCacheInterface;
use Yiisoft\Cache\Cache;
use Yiisoft\Cache\CacheInterface as YiisoftCacheInterface;
use Yiisoft\Cache\Db\DbCache;
use Yiisoft\Db\Connection\ConnectionInterface;

return [
    YiisoftCacheInterface::class => Cache::class,
    PsrCacheInterface::class => static fn (ConnectionInterface $db) => new DbCache($db),
];
```

> [!WARNING]
> `DbCache` does **not** create its storage table automatically. Before the first write, initialize the schema (default table `{{%yii_cache}}`) with `Yiisoft\Cache\Db\DbSchemaManager::ensureTable()` or by executing the SQL files shipped in the package's `sql/` directory (MySQL, PostgreSQL, SQLite, SQL Server, Oracle). Writing to a missing table fails silently — the driver logs the error and returns `false` from `set()`.

### 2.4. Development & Namespacing Helpers

The core package ships two PSR-16 decorators that are frequently useful in DI configurations:

- `Yiisoft\Cache\NullCache` — accepts all writes and returns the default on reads. Use it to disable caching in development or test environments by mapping `PsrCacheInterface::class => NullCache::class` conditionally.
- `Yiisoft\Cache\PrefixedCache` — decorator wrapping another PSR-16 cache and prepending a fixed prefix to every key: `new PrefixedCache($innerCache, 'tenant42:')`. Use it to isolate cache namespaces per tenant, module, or deployment stage on a shared Redis server.

---

## 3. The getOrSet Pattern & Stampede Prevention

The `getOrSet()` method retrieves a value or executes a fallback closure, storing the computed result. Verbatim method declarations from `Yiisoft\Cache\CacheInterface` (see `vendor/yiisoft/cache/src/CacheInterface.php` in the installed package):

```php
declare(strict_types=1);

namespace Yiisoft\Cache;

use DateInterval;
use Yiisoft\Cache\Dependency\Dependency;

interface CacheInterface
{
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

The callable receives the PSR-16 handler as its argument and must be typed `callable(\Psr\SimpleCache\CacheInterface): mixed`.

```php
declare(strict_types=1);

namespace App\Application\Catalog\Service;

use App\Domain\Catalog\Repository\ProductRepositoryInterface;
use Yiisoft\Cache\CacheInterface;

final readonly class ProductCatalogService
{
    public function __construct(
        private CacheInterface $cache,
        private ProductRepositoryInterface $productRepository,
    ) {}

    public function getFeaturedProducts(int $limit = 10): array
    {
        return $this->cache->getOrSet(
            key: ['catalog.featured', $limit],
            callable: fn (): array => $this->productRepository->findFeatured($limit),
            ttl: 3600, // 1 hour TTL
            beta: 1.0, // Stampede prevention factor; the default, sufficient in most cases
        );
    }
}
```

### Cache Stampede Prevention ("Probably Early Expiration")

When a heavy cached item expires under high traffic, hundreds of concurrent processes might attempt to recalculate it simultaneously (dog-piling / stampede). The `$beta` parameter controls the XFetch-style probabilistic early expiration implemented in `Yiisoft\Cache\Metadata\CacheItem::expired()`:

```
$expired = $now - $delta * $beta * log(random_int(1, PHP_INT_MAX) / PHP_INT_MAX);
```

where `$delta` is the elapsed time since the item was stored. The larger `$beta`, the larger the recalculation window: as expiration nears, the probability that one request re-computes the value early rises smoothly instead of spiking exactly at the TTL boundary. The default `1.0` is sufficient in most cases; increase it (e.g. `2.0`) for very expensive recomputations, and pass `beta: 0.0` only when strict freshness matters more than load protection. A negative `$beta` throws `Yiisoft\Cache\Exception\InvalidArgumentException`.

`Cache::getOrSet()` also stores dependency metadata alongside the value; `$ttl` accepts an `int` (seconds), a `DateInterval`, or `null` (uses the `defaultTtl` passed to the `Cache` constructor; `null`/`Ttl` semantics: `null` means "forever", zero or negative TTL deletes the key).

---

## 4. Cache Invalidation & Tag Dependencies

### 4.1. TagDependency Invalidation

Group multiple cache entries under shared tags and invalidate them atomically. `Yiisoft\Cache\Dependency\TagDependency` constructor: `__construct(array|string $tags, ?int $ttl = null)` — the second argument is the TTL of the **tag metadata entries** (not of the cached values); `null` means the tags live forever. Static invalidation: `TagDependency::invalidate(Yiisoft\Cache\CacheInterface $cache, array|string $tags): void`.

```php
declare(strict_types=1);

namespace App\Application\User\Service;

use App\Domain\User\Repository\UserRepositoryInterface;
use Yiisoft\Cache\CacheInterface;
use Yiisoft\Cache\Dependency\TagDependency;

final readonly class UserProfileService
{
    public function __construct(
        private CacheInterface $cache,
        private UserRepositoryInterface $userRepository,
    ) {}

    public function getProfile(string $userId): array
    {
        return $this->cache->getOrSet(
            key: ['user.profile', $userId],
            callable: fn (): array => $this->userRepository->getProfileData($userId),
            ttl: 86400,
            dependency: new TagDependency("user.{$userId}"),
        );
    }

    public function updateProfile(string $userId, array $data): void
    {
        $this->userRepository->saveProfile($userId, $data);

        // Invalidate all entries tagged with "user.{$userId}".
        // MUST run after the repository write, never before.
        TagDependency::invalidate($this->cache, "user.{$userId}");
    }
}
```

### 4.2. File & Callback Dependencies

Invalidate cache entries based on external conditions. All dependency classes live in the `Yiisoft\Cache\Dependency\` namespace (`TagDependency`, `FileDependency`, `CallbackDependency`, `ValueDependency`, plus combinators `AllDependencies` and `AnyDependencies`).

```php
declare(strict_types=1);

namespace App\Infrastructure\Cache;

use Yiisoft\Cache\CacheInterface;
use Yiisoft\Cache\Dependency\CallbackDependency;
use Yiisoft\Cache\Dependency\FileDependency;

final readonly class SchemaDependencies
{
    public function __construct(private CacheInterface $cache) {}

    // Invalidates when the referenced file's modification time changes.
    public function fileDependency(): FileDependency
    {
        return new FileDependency('/runtime/schema.json');
    }

    // Invalidates when the callable returns a different value than at cache-write time.
    // The callable receives the PSR-16 handler as its argument.
    public function maxUpdatedAtDependency(): CallbackDependency
    {
        return new CallbackDependency(
            static fn (): string => (string) self::queryMaxUpdatedAt(),
        );
    }
}
```

Useful base-class behavior from `Yiisoft\Cache\Dependency\Dependency`: call `markAsReusable()` on a dependency instance to evaluate its data only once per request (useful when the same dependency guards several `getOrSet()` calls in one page render).

> [!IMPORTANT]
> Dependencies are only evaluated by `getOrSet()`. Values written directly via `psr()->set()` carry no dependency metadata and are never dependency-invalidated.

---

## 5. View Fragment Caching

In view templates or presentation actions, cache expensive widget renderings as strings using `$cache->getOrSet()`.

> [!WARNING]
> `Yiisoft\Yii\View\Renderer\ViewRenderer::renderPartial()` returns a **`DataResponse` object with deferred rendering**, not a string. Caching its result would serialize a response object (and its closure payload) instead of HTML. For cacheable fragments, use `renderPartialAsString(): string` (without layout) or `renderAsString(): string` (with layout).

```php
declare(strict_types=1);

namespace App\Presentation\Action\Home;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Cache\CacheInterface;
use Yiisoft\Cache\Dependency\TagDependency;
use Yiisoft\Yii\View\Renderer\ViewRenderer;

final readonly class IndexAction
{
    public function __construct(
        private ViewRenderer $viewRenderer,
        private CacheInterface $cache,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $sidebarHtml = $this->cache->getOrSet(
            key: 'home.sidebar.html',
            callable: fn (): string => $this->viewRenderer->renderPartialAsString('home/_sidebar'),
            ttl: 1800,
            dependency: new TagDependency('sidebar'),
        );

        return $this->viewRenderer->render('home/index', [
            'sidebarHtml' => $sidebarHtml,
        ]);
    }
}
```

---

## 6. HTTP Response Caching (ETag & Conditional Requests)

Implement conditional GET caching using PSR-7 headers (`ETag`, `If-None-Match`, `Last-Modified`). Constants verified in `yiisoft/http`: `Header::ETAG = 'ETag'`, `Header::IF_NONE_MATCH = 'If-None-Match'`, `Header::CACHE_CONTROL = 'Cache-Control'`, `Status::NOT_MODIFIED = 304`.

```php
declare(strict_types=1);

namespace App\Presentation\Action\Api;

use App\Domain\Post\Repository\PostRepositoryInterface;
use App\Domain\Post\Dto\Post;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;

final readonly class GetPostAction
{
    public function __construct(
        private PostRepositoryInterface $postRepository,
        private DataResponseFactoryInterface $dataResponseFactory,
        private ResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $postId = (string) $request->getAttribute('id');
        $post = $this->postRepository->findById($postId);

        if (!$post instanceof Post) {
            return $this->responseFactory->createResponse(Status::NOT_FOUND);
        }

        $etag = '"' . md5($post->getId() . $post->getUpdatedAt()->getTimestamp()) . '"';
        $clientEtag = $request->getHeaderLine(Header::IF_NONE_MATCH);

        // Client cache is still fresh: return 304 Not Modified without payload
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

> [!NOTE]
> A production-grade comparison should also handle weak validators (`W/"..."`) and multi-value `If-None-Match` headers. The strict equality above is intentionally minimal; verify the exact `Header` constants and response factory signatures in `vendor/yiisoft/http/src/Header.php` and `vendor/yiisoft/data-response/src/ResponseFactory/` for your installed versions.

---

## 7. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| Static service-locator cache access (Yii 2 style) | Yii3 has no static facades or global application locator; no such constant exists and the code cannot be instantiated or tested. | Inject `Yiisoft\Cache\CacheInterface` into classes via constructor; wire the driver in `config/common/di/cache.php`. |
| Injecting `Psr\SimpleCache\CacheInterface` when the service needs tags or `getOrSet()` | The PSR-16 contract has no `getOrSet()`, no `remove()`, and no dependency support; calling them is a fatal error. | Type-hint `Yiisoft\Cache\CacheInterface` and use `psr()` only for raw PSR-16 operations. |
| Calling `get()`/`set()`/`has()` on `Yiisoft\Cache\CacheInterface` directly | The Yii-level interface declares only `psr()`, `getOrSet()`, `remove()` — those methods do not exist on it. | Use `$cache->psr()->get(...)` / `->set(...)`, or model the read-through flow with `getOrSet()`. |
| String cache keys containing `{ } ( ) / \ @ :` or longer than 64 characters | Every bundled PSR-16 driver throws an `InvalidArgumentException` for reserved characters; PSR-16 defines them as reserved. | Use safe flat strings (letters, digits, dots, dashes, underscores, ≤64 chars) or array keys, which `CacheKeyNormalizer` MD5-hashes deterministically. |
| Expecting array keys like `['catalog.featured', $limit]` to be readable strings in storage | They are normalized to `md5(json_encode($key))`; debugging Redis or file listings by hand fails. | Use explicit prefixed string keys (`catalog.featured.10`) when cache inspection matters, or `Yiisoft\Cache\PrefixedCache` for namespacing. |
| Caching `ViewRenderer::renderPartial()` output | `renderPartial()` returns a `DataResponse` with deferred rendering (closure payload), not HTML; serializing it corrupts the cached value. | Cache `renderPartialAsString()` (no layout) or `renderAsString()` (with layout), both returning `string`. |
| Mapping `RedisCache::class` without a `Predis\ClientInterface` definition | The DI container cannot resolve the constructor argument and fails at first resolution with a "not found" error. | Define `Predis\ClientInterface::class` (closure or array definition with connection parameters) before binding `PsrCacheInterface::class => RedisCache::class`. |
| Using `DbCache` without initializing the `{{%yii_cache}}` table | Every `set()` fails silently (logged, returns `false`); cache misses degrade to full database recomputation. | Run `Yiisoft\Cache\Db\DbSchemaManager::ensureTable()` (or the package's `sql/` scripts) during deployment, before first use. |
| Treating `$gcProbability` as a percentage | It is parts per million: `FileCache` default `10` = 0.001%, `DbCache` default `100` = 0.01%. Setting "1" for "1%" nearly disables garbage collection and expired files accumulate. | Keep defaults or compute explicitly: value/1000000 = probability per write; `0` disables GC. |
| Invalidating tags before persisting the change | Concurrent requests repopulate the cache from the old database state between invalidation and commit, then the fresh tag timestamp locks the stale value in. | Save modified data to the database (and commit the transaction) first, then call `TagDependency::invalidate()` — never inside an open transaction. |
| Writing values with dependencies via raw `psr()->set()` | Dependency objects are only evaluated and stored by `getOrSet()`; raw PSR-16 writes bypass metadata, so `TagDependency` invalidation never affects them. | Use `getOrSet(key, callable, ttl, $dependency)` for anything that must participate in tag or file invalidation. |
| Using `ArrayCache` as the persistent driver in multi-process environments (PHP-FPM, workers) | Memory is isolated per worker and erased between requests: cache hit rates stay at zero and dependencies silently "never match" across processes. | Map `Psr\SimpleCache\CacheInterface` to a persistent driver (`FileCache`, `RedisCache`, `DbCache`); keep `ArrayCache` for tests and single-request memoization. |
| Recomputing dependency data on every `getOrSet()` call in a hot path | Each call runs the dependency's data generation (e.g. a `MAX(updated_at)` query), multiplying database load. | Call `markAsReusable()` on the dependency instance so its data is generated once per request. |
