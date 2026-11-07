# Yii3 DB Persistence: Data Readers, Pagination & Drivers

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Part of the [Database Persistence Guide](persistence-db.md) split — the anti-pattern matrix and related guides live there.

## 5. Paginated Queries & Data Readers (`yiisoft/data-db`, `yiisoft/data`)

> [!IMPORTANT]
> **Critical FQCN Notice:**
> The data reader for `yiisoft/db` is `Yiisoft\Data\Db\QueryDataReader` (package `yiisoft/data-db`).
> Do **NOT** use `Yiisoft\DataDb\DataReader\QueryDataReader` (hallucinated namespace).

### 5.1. `QueryDataReader` & Sorting (`Sort::only()`, `Sort::any()`)

`QueryDataReader` bridges `Yiisoft\Db\Query\Query` with `yiisoft/data` sorting and pagination abstractions:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\Db;

use Yiisoft\Data\Db\QueryDataReader;
use Yiisoft\Data\Paginator\OffsetPaginator;
use Yiisoft\Data\Reader\Sort;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;

final readonly class UserGridQuery
{
    public function __construct(
        private ConnectionInterface $db,
    ) {}

    public function getPaginator(int $page = 1, int $pageSize = 20): OffsetPaginator
    {
        $query = (new Query($this->db))
            ->select(['id', 'name', 'email', 'created_at'])
            ->from('{{%user}}');

        // 1. Sort::only(): Restricts sorting strictly to allowed logical fields (safe for untrusted input)
        // Note: Sort::__construct is private! Always instantiate via Sort::only() or Sort::any().
        $sort = Sort::only(['id', 'name', 'created_at'])
            ->withOrderString('-created_at'); // Prefix '-' denotes SORT_DESC

        // 2. QueryDataReader: Wraps query and configures sort
        $dataReader = (new QueryDataReader($query))->withSort($sort);

        // 3. OffsetPaginator: 1-based page index
        return (new OffsetPaginator($dataReader))
            ->withPageSize($pageSize)
            ->withCurrentPage($page);
    }
}
```

> [!NOTE]
> **Sorting & Inspection Nuances:**
> - `Sort::only(array $config)` ignores any fields not present in `$config` when building criteria.
> - `Sort::any(array $config = [])` allows sorting by any field, using `$config` for field alias mappings.
> - `Sort` criteria inspection methods: `getOrder()`, `getCriteria()`, `getDefaultOrder()`, `hasFieldInConfig()`. Note: `getOrderConfig()` does **NOT** exist.
> - `QueryDataReader` exposes `withHaving(FilterInterface $having)` to configure HAVING filters, but has **no** `getHaving()` method.

### 5.2. Offset Pagination (`OffsetPaginator`)

`OffsetPaginator` handles page-based navigation:

```php
$paginator = (new OffsetPaginator($dataReader))
    ->withPageSize(25)
    ->withCurrentPage(2);

// Reading items for the current page
/** @var list<array<string, mixed>> $items */
$items = iterator_to_array($paginator->read());

$currentPage = $paginator->getCurrentPage();       // 2
$pageSize = $paginator->getPageSize();             // 25
$totalItems = $paginator->getTotalItems();         // e.g. 150
$totalPages = $paginator->getTotalPages();         // 6
$isOnFirst = $paginator->isOnFirstPage();          // false
$isOnLast = $paginator->isOnLastPage();            // false
$isRequired = $paginator->isPaginationRequired();  // true
```

### 5.3. Filtering in `QueryDataReader` (`withFilter()`)

`QueryDataReader` implements `Yiisoft\Data\Reader\FilterableDataInterface`. You can configure dynamic SQL filtering using framework filter objects from `Yiisoft\Data\Reader\Filter\*`:

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\Db;

use Yiisoft\Data\Db\QueryDataReader;
use Yiisoft\Data\Reader\Filter\AndX;
use Yiisoft\Data\Reader\Filter\Between;
use Yiisoft\Data\Reader\Filter\Equals;
use Yiisoft\Data\Reader\Filter\Like;
use Yiisoft\Data\Reader\Filter\LikeMode;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;

final readonly class FilteredUserSearch
{
    public function __construct(
        private ConnectionInterface $db,
    ) {}

    public function search(?string $status, ?string $term, ?int $minAge, ?int $maxAge): QueryDataReader
    {
        $query = (new Query($this->db))
            ->select(['id', 'name', 'email', 'status', 'age', 'created_at'])
            ->from('{{%user}}');

        $dataReader = new QueryDataReader($query);

        $filters = [];
        if ($status !== null && $status !== '') {
            $filters[] = new Equals('status', $status);
        }
        if ($term !== null && $term !== '') {
            $filters[] = new Like('name', $term, caseSensitive: false, mode: LikeMode::Contains);
        }
        if ($minAge !== null && $maxAge !== null) {
            $filters[] = new Between('age', $minAge, $maxAge);
        }

        if (!empty($filters)) {
            // Apply composite filter via immutable withFilter()
            $dataReader = $dataReader->withFilter(new AndX(...$filters));
        }

        return $dataReader;
    }
}
```

### 5.4. High-Performance Keyset (Cursor) Pagination (`KeysetPaginator`)

On large tables (millions of rows), `OffsetPaginator` degrades severely because `OFFSET 500000` forces the database engine to scan and discard 500,000 index entries. `KeysetPaginator` eliminates this by utilizing index cursor boundaries (`WHERE [[id]] > :token ORDER BY [[id]] ASC LIMIT :limit + 1`):

```php
declare(strict_types=1);

namespace App\Infrastructure\Persistence\Db;

use Yiisoft\Data\Db\QueryDataReader;
use Yiisoft\Data\Paginator\KeysetPaginator;
use Yiisoft\Data\Paginator\PageToken;
use Yiisoft\Data\Reader\Sort;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;

final readonly class KeysetUserFeed
{
    public function __construct(
        private ConnectionInterface $db,
    ) {}

    public function getFeed(int $limit = 50, ?string $nextTokenValue = null): KeysetPaginator
    {
        $query = (new Query($this->db))
            ->select(['id', 'name', 'email', 'created_at'])
            ->from('{{%user}}');

        // Keyset pagination REQUIRES strict sorting on unique/indexed fields
        $dataReader = (new QueryDataReader($query))
            ->withSort(Sort::only(['id'])->withOrderString('id'));

        $paginator = (new KeysetPaginator($dataReader))
            ->withPageSize($limit);

        // Apply cursor token if navigating from a previous page
        if ($nextTokenValue !== null) {
            $paginator = $paginator->withToken(PageToken::next($nextTokenValue));
        }

        return $paginator;
    }
}

// Consuming KeysetPaginator in an API Action:
$paginator = $feed->getFeed(limit: 20, nextTokenValue: $requestQuery['cursor'] ?? null);

$rows = iterator_to_array($paginator->read());
$nextToken = $paginator->getNextToken(); // ?PageToken

$response = [
    'items' => $rows,
    'next_cursor' => $nextToken?->value, // Extracted cursor string for subsequent requests
    'has_more' => $nextToken !== null,
];
```

---

## 6. Driver Packages: MySQL, PostgreSQL, SQLite, MSSQL & Oracle

`yiisoft/db` provides the abstractions (`ConnectionInterface`, `Query`, `CommandInterface`); a **driver package** provides the concrete PDO connection, dialect-specific `QueryBuilder`/`Schema`/`Quoter`, and column factories. Install exactly one per project (plus `yiisoft/db` itself):

### 6.1. Driver Specifications Matrix

| Driver | Composer Package | PHP Extension | DSN Prefix / Default Port | Identifier Quoting | Custom Quoter Class | Primary Key Retrieval |
|---|---|---|---|---|---|---|
| **MySQL** | `yiisoft/db-mysql` | `pdo_mysql` | `mysql` / `3306` | Backticks (`` ` ``) | `Yiisoft\Db\Mysql\Quoter` | `getLastInsertId()` (auto-increment) |
| **PostgreSQL** | `yiisoft/db-pgsql` | `pdo_pgsql` | `pgsql` / `5432` | Double quotes (`"`) | `Yiisoft\Db\Pgsql\Quoter` | `RETURNING <pks>` (sequence required) |
| **SQLite** | `yiisoft/db-sqlite` | `pdo_sqlite` | `sqlite` / N/A | Double quotes (`"`) | **None** (uses core `Quoter`) | `RETURNING <pks>` or rowid |
| **MSSQL** | `yiisoft/db-mssql` | `pdo_sqlsrv` | `sqlsrv` / `1433` | Brackets (`[ ]`) | `Yiisoft\Db\Mssql\Quoter` | `@temporary_inserted` output |
| **Oracle** | `yiisoft/db-oracle` | `pdo_oci` | `oci` / `1521` | Double quotes (`"`) | `Yiisoft\Db\Oracle\Quoter` | `RETURNING ... INTO ...` (sequence required) |

All five driver packages declare `"provide": {"yiisoft/db-implementation": "1.0.0"}` in their `composer.json`.

### 6.2. Canonical Connection Configuration

Each driver ships typed DSN value objects (`Yiisoft\Db\<Dialect>\Dsn`) that render the PDO DSN string. Canonical configuration in `config/common/params.php` (this is the official shape from the `yiisoft/db` docs; the companion `ConnectionInterface` DI definition is shown in [core-di-definitions.md](core-di-definitions.md), section 4.9):

> [!NOTE]
> `username` / `password` below are schema placeholders. In real applications read them from the environment — `(string) ($_ENV['DB_USERNAME'] ?? '')` / `(string) ($_ENV['DB_PASSWORD'] ?? '')` — never hardcode credentials in params (see the DI & Configuration Guide's anti-pattern matrix).

```php
// 1. MySQL / MariaDB (renders: mysql:host=127.0.0.1;dbname=yiitest;port=3306;charset=utf8mb4)
use Yiisoft\Db\Mysql\Dsn as MysqlDsn;

'yiisoft/db-mysql' => [
    'dsn' => new MysqlDsn('mysql', '127.0.0.1', 'yiitest', '3306', ['charset' => 'utf8mb4']),
    'username' => 'user',       // placeholder — use $_ENV
    'password' => 'secret',     // placeholder — use $_ENV
],

// 2. MySQL Unix Socket (renders: mysql:unix_socket=/var/run/mysqld/mysqld.sock;dbname=yiitest)
use Yiisoft\Db\Mysql\DsnSocket;

'yiisoft/db-mysql' => [
    'dsn' => new DsnSocket('mysql', '/var/run/mysqld/mysqld.sock', 'yiitest'),
    'username' => 'user',       // placeholder — use $_ENV
    'password' => 'secret',     // placeholder — use $_ENV
],

// 3. PostgreSQL (renders: pgsql:host=127.0.0.1;dbname=yiitest;port=5432)
use Yiisoft\Db\Pgsql\Dsn as PgsqlDsn;

'yiisoft/db-pgsql' => [
    'dsn' => new PgsqlDsn('pgsql', '127.0.0.1', 'yiitest', '5432'),
    'username' => 'postgres',   // placeholder — use $_ENV
    'password' => 'secret',     // placeholder — use $_ENV
],

// 4. SQLite: In-Memory (for CI/Testing, renders: sqlite::memory:)
use Yiisoft\Db\Sqlite\Dsn as SqliteDsn;

'yiisoft/db-sqlite' => [
    'dsn' => new SqliteDsn('sqlite', 'memory'),
],

// SQLite: File-Based (renders: sqlite:/path/to/database.sq3)
// Same 'yiisoft/db-sqlite' params group as in-memory (pick one per project) — the DSN alone distinguishes memory vs file storage.
'yiisoft/db-sqlite' => [
    'dsn' => new SqliteDsn('sqlite', '/var/data/app.sq3'),
],

// 5. Microsoft SQL Server (renders: sqlsrv:Server=localhost,1433;Database=yiitest)
use Yiisoft\Db\Mssql\Dsn as MssqlDsn;

'yiisoft/db-mssql' => [
    'dsn' => new MssqlDsn('sqlsrv', 'localhost', 'yiitest', '1433'),
    'username' => 'sa',         // placeholder — use $_ENV
    'password' => 'secret',     // placeholder — use $_ENV
],

// 6. Oracle Database (renders: oci:dbname=localhost:1521/XE;charset=AL32UTF8)
use Yiisoft\Db\Oracle\Dsn as OracleDsn;

'yiisoft/db-oracle' => [
    'dsn' => new OracleDsn('oci', 'localhost', 'XE', '1521', ['charset' => 'AL32UTF8']),
    'username' => 'system',     // placeholder — use $_ENV
    'password' => 'secret',     // placeholder — use $_ENV
],
```

The driver packages ship **no** DI config-plugin of their own. The DI definition mapping `ConnectionInterface::class` to the driver's `Connection` lives in the application (`config/common/di/db-<driver>.php` consuming `$params['yiisoft/db-<driver>']`) — the canonical definition is shown in [core-di-definitions.md](core-di-definitions.md), section 4.9.

### 6.3. Driver-Specific Nuances & Version Support

| Driver | Nuance & Version Support |
|---|---|
| **MySQL** | - Supported versions: MySQL 5.7+, MariaDB 10.4+.<br>- Default charset `utf8mb4`: on connect the driver runs `SET NAMES 'utf8mb4'` unless DSN contains `charset`.<br>- `LIMIT` is never optional in MySQL: `offset()` without `limit()` compiles to `LIMIT 18446744073709551615 OFFSET $offset`.<br>- PDO connections are forced to `ERRMODE_EXCEPTION` and `ATTR_STRINGIFY_FETCHES => true`. |
| **PostgreSQL** | - Supported versions: PostgreSQL 9+ (schema layer requires 9.6+).<br>- `getLastInsertId()` **requires a sequence name**: calling without one throws `InvalidArgumentException('PostgreSQL not support lastInsertId without sequence name.')`.<br>- Default schema is `public` (`Schema::$defaultSchema`).<br>- Upsert compiles to native `INSERT ... ON CONFLICT (...) DO UPDATE`.<br>- Full support for arrays, numeric/timestamp ranges, and structured PostgreSQL columns. |
| **SQLite** | - Supported versions: SQLite 3+ (driver README); the `yiisoft/db` docs support matrix lists "3.3 or higher".<br>- In-memory lifetime protection: `Yiisoft\Db\Sqlite\Connection::__clone()` preserves `$this->pdo` when the DSN starts with `sqlite::memory:`, preventing premature database loss on clone.<br>- **Foreign Keys are disabled by default**: Must execute `PRAGMA foreign_keys = ON;` upon connection initialization.<br>- **Restricted isolation levels**: SQLite transactions only support `SERIALIZABLE` (`PRAGMA read_uncommitted = False;`) and `READ_UNCOMMITTED` (`PRAGMA read_uncommitted = True;`). Any other isolation level throws `NotSupportedException`.<br>- Quoter architecture: SQLite does not define a custom `Quoter` class, instantiating the core `Yiisoft\Db\Schema\Quoter` with double quotes. |
| **MSSQL** | - Supported versions: SQL Server 2017+.<br>- Pagination uses `OFFSET n ROWS FETCH NEXT m ROWS ONLY`. When the query has no `ORDER BY`, the builder automatically injects `ORDER BY (SELECT NULL)` to satisfy SQL Server requirements.<br>- Upsert compiles to atomic `MERGE ... WITH (HOLDLOCK)`.<br>- Booleans are mapped to integer `0`/`1`. Savepoint release is a no-op. |
| **Oracle** | - Supported versions: Oracle 12c – 21c.<br>- `getLastInsertId()` strictly requires a sequence name and queries `SELECT $sequenceName.CURRVAL FROM DUAL`.<br>- Pagination does not use `OFFSET/FETCH`: it compiles to a Common Table Expression using `rownum as rowNumId` (`WITH USER_SQL AS ($sql), PAGINATION AS (SELECT USER_SQL.*, rownum as rowNumId FROM USER_SQL) SELECT * FROM PAGINATION WHERE rowNumId > :offset AND rownum <= :limit`).<br>- On connect, the driver sets session ISO-8601 date formats (`NLS_DATE_FORMAT`, `NLS_TIMESTAMP_FORMAT`). Default schema is the uppercase username. |

---

## 7. PHP 8 Named Arguments & Signatures Reference

```php
declare(strict_types=1);

use Yiisoft\Data\Db\QueryDataReader;
use Yiisoft\Data\Paginator\KeysetPaginator;
use Yiisoft\Data\Paginator\OffsetPaginator;
use Yiisoft\Data\Paginator\PageToken;
use Yiisoft\Data\Reader\Sort;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Exception\Exception;
use Yiisoft\Db\Query\Query;
use Yiisoft\Db\Transaction\TransactionInterface;
use Yiisoft\Hydrator\ArrayData;
use Yiisoft\Hydrator\HydratorInterface;

// 1. ConnectionInterface
$command = $db->createCommand(
    sql: 'SELECT * FROM {{%user}} WHERE [[id]] = :id',
    params: [':id' => $id],
);

$result = $db->transaction(
    closure: function (ConnectionInterface $db): mixed {
        return $db->createCommand(sql: 'SELECT 1')->queryOne();
    },
    isolationLevel: TransactionInterface::READ_COMMITTED,
);

$tx = $db->beginTransaction(
    isolationLevel: TransactionInterface::REPEATABLE_READ,
);

$lastId = $db->getLastInsertId(sequenceName: 'user_id_seq');

// 2. CommandInterface
$command->insert(table: '{{%user}}', columns: ['id' => $id, 'name' => $name]);
$command->update(table: '{{%user}}', columns: ['name' => $newName], condition: ['id' => $id]);
$command->delete(table: '{{%user}}', condition: ['id' => $id]);
$command->upsert(table: '{{%user}}', insertColumns: $insertData, updateColumns: $updateData);
$command->insertBatch(table: '{{%user}}', rows: [['1', 'Alice'], ['2', 'Bob']], columns: ['id', 'name']);
$command->insertReturningPks(table: '{{%user}}', columns: ['name' => 'Alice']);
$command->upsertReturningPks(table: '{{%user}}', insertColumns: $insertData, updateColumns: $updateData);
$command->setRetryHandler(handler: function (Exception $e, int $attempt): bool { return false; });

// 3. Query (Yiisoft\Db\Query\Query)
$query = (new Query($db))
    ->select(columns: ['id', 'name', 'email'])
    ->distinct()
    ->from(tables: '{{%user}}')
    ->where(condition: ['status' => 'active'])
    ->andWhere(condition: ['>', 'created_at', $timestamp])
    ->filterWhere(condition: ['role' => $roleOrNull])
    ->groupBy(columns: ['status'])
    ->having(condition: ['>', 'COUNT(*)', 1])
    ->orderBy(columns: ['created_at' => SORT_DESC])
    ->limit(limit: 50)
    ->offset(offset: 0)
    ->indexBy(column: 'id');

// Memory-safe streaming
$dataReader = $query->each(); // 0 arguments!
$batchResult = $query->batch(batchSize: 500);

// 4. Data Readers & Paginators
$sort = Sort::only(config: ['id', 'name', 'created_at'])->withOrderString(orderString: '-created_at');
$dataReader = (new QueryDataReader(query: $query))->withSort(sort: $sort);

$offsetPaginator = (new OffsetPaginator(dataReader: $dataReader))
    ->withPageSize(pageSize: 25)
    ->withCurrentPage(page: 1);

$keysetPaginator = (new KeysetPaginator(dataReader: $dataReader))
    ->withPageSize(pageSize: 50)
    ->withToken(token: PageToken::next(value: '100'));

// 5. HydratorInterface & ArrayData
$arrayData = new ArrayData(data: $row, map: ['createdAt' => 'created_at']);
$entity = $hydrator->create(class: User::class, data: $arrayData);
```

---
