# Yii3 Persistence: Active Record Queries, Pagination & Signatures

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> ActiveQuery engine mechanics, single-argument constructor rule, strict where conditions, memory-safe query streams (`each()`, `batch()`), grid pagination & sorting (`QueryDataReader`), and master PHP 8 signature reference.

## Table of Contents

- [3. `ActiveQuery` & Query Engine](#3-activequery--query-engine)
  - [3.1. Single-Argument Constructor Rule](#31-single-argument-constructor-rule)
  - [3.2. Query Execution & Return Semantics](#32-query-execution--return-semantics)
  - [3.3. Strict Condition Guard on `Query::where()` (`LogicException`)](#33-strict-condition-guard-on-querywhere-logicexception)
  - [3.4. Memory-Safe Query Streams (`each()`, `batch()`) & Hydration Bypass (`asArray()`)](#34-memory-safe-query-streams-each-batch--hydration-bypass-asarray)
  - [3.5. Query Result Caching Architecture (Absence of `Query::cache()`)](#35-query-result-caching-architecture-absence-of-querycache)
- [6. Grid Pagination & Sorting (`QueryDataReader` & `OffsetPaginator`)](#6-grid-pagination--sorting-querydatareader--offsetpaginator)
  - [6.1. Hydrated Data Reader Pipeline (`QueryDataReader`)](#61-hydrated-data-reader-pipeline-querydatareader)
  - [6.2. Whitelist Sorting with `Sort::only()`](#62-whitelist-sorting-with-sortonly)
- [7. PHP 8 Named Arguments & Signatures Reference](#7-php-8-named-arguments--signatures-reference)

## 3. `ActiveQuery` & Query Engine

### 3.1. Single-Argument Constructor Rule

> [!IMPORTANT]
> `ActiveQuery::__construct(ActiveRecordInterface|string $modelClass)` takes **strictly one argument**.
> Passing `$db` as a second argument (`new ActiveQuery(UserRecord::class, $db)`) triggers a fatal PHP `ArgumentCountError`.

```php
declare(strict_types=1);

use App\Infrastructure\Persistence\ActiveRecord\UserRecord;
use Yiisoft\ActiveRecord\ActiveQuery;

// Instantiation passing the model class name:
$query = new ActiveQuery(UserRecord::class);

// Or via static factory on the record (available on all ActiveRecord subclasses):
$query = UserRecord::query();
```

To implement custom domain query scopes, subclass `ActiveQuery` and override `Model::query()`:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\ActiveRecord;

use Yiisoft\ActiveRecord\ActiveQuery;
use Yiisoft\ActiveRecord\ActiveQueryInterface;
use Yiisoft\ActiveRecord\ActiveRecord;
use Yiisoft\ActiveRecord\ActiveRecordInterface;

final class CustomerQuery extends ActiveQuery
{
    public function active(): self
    {
        return $this->andWhere(['status' => 'active']);
    }
}

final class CustomerRecord extends ActiveRecord
{
    public function tableName(): string
    {
        return '{{%customer}}';
    }

    public static function query(ActiveRecordInterface|string|null $modelClass = null): ActiveQueryInterface
    {
        return new CustomerQuery($modelClass ?? static::class);
    }
}
```

### 3.2. Query Execution & Return Semantics

`ActiveQuery` inherits from `Yiisoft\Db\Query\Query` and hydrates database rows into model instances:

```php
declare(strict_types=1);

use App\Infrastructure\Persistence\ActiveRecord\UserRecord;
use Yiisoft\ActiveRecord\ActiveQuery;

// 1. Fetch single hydrated record (UserRecord|null)
$user = (new ActiveQuery(UserRecord::class))
    ->where(['email' => $email])
    ->one();

// 2. Fetch list of hydrated records (list<UserRecord>)
$users = (new ActiveQuery(UserRecord::class))
    ->where(['status' => 'active'])
    ->orderBy(['created_at' => SORT_DESC])
    ->limit(20)
    ->all();

// 3. Query scalar count without hydrating objects
$count = (new ActiveQuery(UserRecord::class))
    ->where(['status' => 'active'])
    ->count();

// 4. Check existence without fetching row data
$hasInactive = (new ActiveQuery(UserRecord::class))
    ->where(['status' => 'inactive'])
    ->exists();
```

### 3.3. Strict Condition Guard on `Query::where()` (`LogicException`)

In Yii3 DBAL, `Query::where()` guards against accidental condition overwrites:

```php
// In Yiisoft\Db\Query\Query::where():
if ($this->where !== null) {
    throw new \LogicException(
        'The `where` condition was set earlier. Use the `setWhere()`, `andWhere()` or `orWhere()` method.',
    );
}
```

To manipulate conditions cleanly:
- Use `setWhere()` when intentionally replacing the entire condition.
- Use `andWhere()` or `orWhere()` when chaining additional criteria.
- Use `andFilterWhere()` to append conditions only when values are not null/empty.

```php
declare(strict_types=1);

use App\Infrastructure\Persistence\ActiveRecord\UserRecord;

$query = UserRecord::query()->where(['status' => 'active']);

// Calling where() again throws \LogicException:
// $query->where(['role' => 'admin']); // ERROR: throws LogicException!

// Correct: append conditions using andWhere() or replace using setWhere()
$query->andWhere(['role' => 'admin']);
$query->setWhere(['status' => 'archived']); // Overwrites cleanly
```

### 3.4. Memory-Safe Query Streams (`each()`, `batch()`) & Hydration Bypass (`asArray()`)

For high-volume data sets or heavy CLI batch jobs, avoid loading all rows into memory at once with `all()`:

```php
declare(strict_types=1);

use App\Infrastructure\Persistence\ActiveRecord\UserRecord;

// 1. Streaming one record at a time with constant memory usage
// ActiveQuery::each() takes 0 arguments in Yii3! Returns DataReaderInterface
foreach (UserRecord::query()->where(['status' => 'active'])->each() as $user) {
    /** @var UserRecord $user */
    processUser($user);
}

// 2. Chunked batch processing (yields array of hydrated models per batch)
// ActiveQuery::batch(int $batchSize = 100) returns BatchQueryResultInterface
foreach (UserRecord::query()->where(['status' => 'active'])->batch(500) as $batch) {
    /** @var list<UserRecord> $batch */
    foreach ($batch as $user) {
        processUser($user);
    }
}

// 3. Hydration bypass: returns raw associative arrays instead of model objects
// Essential for read-only high-performance API endpoints
$rawRows = UserRecord::query()
    ->where(['status' => 'active'])
    ->asArray(true)
    ->all();
```

### 3.5. Query Result Caching Architecture (Absence of `Query::cache()`)

> [!NOTE]
> **No `Query::cache()` or `Query::noCache()` in Yii3:**
> In legacy Yii2, `Query` provided query result caching. In Yii3 DBAL, query result caching is completely absent from `Query` and `ActiveQuery`.
> The DBAL only provides `SchemaCache` (`Yiisoft\Db\Cache\SchemaCache`) for caching database schema metadata.
> Result set caching must be implemented at the application service or repository layer using PSR-16 (`Psr\SimpleCache\CacheInterface` or `Yiisoft\Cache\CacheInterface`).

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\ActiveRecord;

use App\Domain\Model\User;
use App\Domain\Model\UserId;
use App\Domain\Repository\UserRepositoryInterface;
use Psr\SimpleCache\CacheInterface;

final readonly class CachedArUserRepository implements UserRepositoryInterface
{
    public function __construct(
        private ArUserRepository $innerRepository,
        private CacheInterface $cache,
    ) {}

    public function findById(UserId $id): ?User
    {
        $cacheKey = 'user:' . $id->value;

        if ($this->cache->has($cacheKey)) {
            /** @var User|null */
            return $this->cache->get($cacheKey);
        }

        $user = $this->innerRepository->findById($id);
        $this->cache->set($cacheKey, $user, 3600);

        return $user;
    }

    public function save(User $user): void
    {
        $this->innerRepository->save($user);
        $this->cache->delete('user:' . $user->getId()->value);
    }

    public function delete(User $user): void
    {
        $this->innerRepository->delete($user);
        $this->cache->delete('user:' . $user->getId()->value);
    }
}
```

---

## 6. Grid Pagination & Sorting (`QueryDataReader` & `OffsetPaginator`)

### 6.1. Hydrated Data Reader Pipeline (`QueryDataReader`)

`Yiisoft\Data\Db\QueryDataReader` natively accepts any `ActiveQuery` instance. Under the hood, `ActiveQuery::index()` overrides `Query::index()` to invoke `$this->populate($rows)` $\rightarrow$ `$this->createModels($rows)`.
Therefore, `QueryDataReader::read()` yields **fully hydrated Active Record model instances** with relations preloaded via `with()`:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\ActiveRecord;

use App\Infrastructure\Persistence\ActiveRecord\UserRecord;
use Yiisoft\ActiveRecord\ActiveQuery;
use Yiisoft\Data\Db\QueryDataReader;
use Yiisoft\Data\Paginator\OffsetPaginator;
use Yiisoft\Data\Reader\Sort;

final readonly class UserGridProvider
{
    /**
     * @return array{items: list<UserRecord>, totalItems: int, totalPages: int, currentPage: int}
     */
    public function getUsers(int $page = 1, int $pageSize = 20, ?string $sortParam = '-created_at'): array
    {
        // 1. Whitelist allowable sort columns
        $sort = Sort::only(['id', 'email', 'created_at']);
        if ($sortParam !== null) {
            $sort = $sort->withOrderString($sortParam);
        }

        // 2. Build ActiveQuery with eager-loaded relations
        $query = (new ActiveQuery(UserRecord::class))
            ->where(['status' => 'active'])
            ->with('profile');

        // 3. Wrap query in QueryDataReader
        $dataReader = (new QueryDataReader($query))->withSort($sort);

        // 4. Wrap data reader in OffsetPaginator
        $paginator = (new OffsetPaginator($dataReader))
            ->withPageSize($pageSize)
            ->withCurrentPage($page);

        return [
            // Iterating yields hydrated UserRecord instances!
            'items' => iterator_to_array($paginator->read()),
            'totalItems' => $paginator->getTotalItems(),
            'totalPages' => $paginator->getTotalPages(),
            'currentPage' => $paginator->getCurrentPage(),
        ];
    }
}
```

### 6.2. Whitelist Sorting with `Sort::only()`

`Sort::only()` prevents SQL injection and column name enumeration by strictly discarding sort parameters that are not explicitly whitelisted:

```php
declare(strict_types=1);

use Yiisoft\Data\Reader\Sort;

$sort = Sort::only([
    'id',
    'email',
    'created_at' => [
        'asc' => ['created_at' => SORT_ASC],
        'desc' => ['created_at' => SORT_DESC],
        'default' => 'desc',
    ],
]);
```

---

## 7. PHP 8 Named Arguments & Signatures Reference

```php
declare(strict_types=1);

use App\Infrastructure\Persistence\ActiveRecord\OrderRecord;
use App\Infrastructure\Persistence\ActiveRecord\ProfileRecord;
use App\Infrastructure\Persistence\ActiveRecord\UserRecord;
use Psr\Log\LoggerInterface;
use Yiisoft\ActiveRecord\ActiveQuery;
use Yiisoft\ActiveRecord\LazyLoadGuard;
use Yiisoft\ActiveRecord\LazyLoadGuardMode;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Connection\ConnectionProvider;

/** @var ConnectionInterface $db */
/** @var LoggerInterface $logger */

// 1. Registering connections in ConnectionProvider
ConnectionProvider::set(
    connection: $db,
    name: ConnectionProvider::DEFAULT,
);

// 2. ActiveQuery Constructor (strictly 1 argument: $modelClass)
$query = new ActiveQuery(
    modelClass: UserRecord::class,
);

// 3. Eager Loading relations
$query->with(
    'orders',
    'profile',
);

// 4. ActiveQuery Joining relations
$query->joinWith(
    with: 'orders',
    eagerLoading: true,
    joinType: 'LEFT JOIN',
);

// 5. ActiveQuery Direct Table Junction
$query->viaTable(
    tableName: '{{%user_role}}',
    link: ['user_id' => 'id'],
);

// 6. Active Record Mutations
$record = new UserRecord();
$record->save(
    properties: null, // null saves all attributes or changed properties
);
$record->update(
    properties: null,
);
$record->delete(); // returns int (number of deleted rows)

// 7. Active Record Relation Definitions
$record->hasOne(
    modelClass: ProfileRecord::class,
    link: ['user_id' => 'id'],
);
$record->hasMany(
    modelClass: OrderRecord::class,
    link: ['user_id' => 'id'],
);

// 8. LazyLoadGuard Configuration & Worker Reset
LazyLoadGuard::set(
    mode: LazyLoadGuardMode::Strict,
    logger: $logger,
);
LazyLoadGuard::resetCounters();
```

---
