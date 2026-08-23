---
name: yii3-data-layer
description: >-
  End-to-end data access workflows for Yii3: DB migrations (yiisoft/db-migration), repositories over
  the yiisoft/db query builder (select/joins/conditions/expressions), transactions, pagination with
  yiisoft/data readers, optional Active Record models (yiisoft/active-record). Use when user says
  "add table", "create migration", "write repository", "query builder", "join", "transaction",
  "paginate query", "active record", or builds any persistence code for a Yii3 app.
argument-hint: "[migration|repository|transaction task]"
allowed-tools: Read Glob Grep Write Edit Bash(php -l *; composer *; ./yii *; make yii *) AskUserQuestion Questions
disable-model-invocation: false
metadata:
  author: DAGpro (https://github.com/DAGpro)
  version: "0.1"
  category: framework-yii3
---

# Yii3 Data Layer Workflow

Schema → repository → queries → pagination for a Yii3 application. Packages:
`yiisoft/db` (+ driver: `db-mysql`, `db-pgsql`, `db-sqlite`, `db-mssql`, `db-oracle`),
`yiisoft/db-migration` for schema, `yiisoft/data` for readers/pagination, optional
`yiisoft/active-record`. A PSR-16 cache is required for schema metadata (`yiisoft/cache`).

## Quick Start

```
/yii3-data-layer add orders table with UUID primary key   → migration + entity + repository
/yii3-data-layer report query with joins                  → repository method
/yii3-data-layer wrap order checkout in a transaction     → transactional service method
```

## Workflow

### Step 0: Detect Conventions

Scan the project before writing persistence code:

- Driver/connection: `config/common/di/db.php`, `$params['db']`; inject
  `Yiisoft\Db\Connection\ConnectionInterface` everywhere — never instantiate connections in code.
- Existing repository layout: namespace (`App\Blog\Post\`...), naming (`PostRepositoryInterface`
  + `DbPostRepository` or plain `PostRepository`), where bindings live (`config/common/di/*.php`).
- Whether migrations directory exists and its naming style.

### Step 1: Schema Changes → Migrations

All schema work goes through migrations — never runtime DDL.
Full guide: **references/MIGRATIONS.md** (`RevertibleMigrationInterface`, column builder,
apply/revert via `./yii migrate:up|migrate:down`).

```php
use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;

final class M240101000000CreateOrders implements RevertibleMigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $b->createTable('{{%order}}', [
            'id' => $b->uuidPrimaryKey(),
            'user_id' => $b->integer()->notNull(),
            'total' => $b->money(10, 2)->notNull(),
            'created_at' => $b->datetime(),
        ]);
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropTable('{{%order}}');
    }
}
```

### Step 2: Repository + Query Builder

Repositories own ALL SQL; actions/services call repository methods
(scaffold via `/yii3-actions crud`). Core builder patterns:

```php
// SELECT with conditions — always array conditions, values bound automatically
$rows = $this->db
    ->select(['id', 'email'])
    ->from('{{%user}}')
    ->where(['status' => 'active'])
    ->andWhere(['>', 'age', 18])
    ->orderBy(['created_at' => 'desc'])
    ->limit(10)
    ->all();
```

Condition vocabulary: `['=', '>', '<', '>=', ...]` implicit equality,
`and`/`or` composites, `in`, `between`, `like`, `is` (null). Table names use
`{{%table}}` (`%` = configured prefix, double braces quote identifiers).
Joins: `->leftJoin('{{%profile}}', '{{%user}}.id = {{%profile}}.user_id')`.
Raw expressions — parameters still bound, never interpolated:

```php
use Yiisoft\Db\Expression\Expression;

->andWhere(new Expression('YEAR(created_at) = :year', [':year' => $year]))
```

Writes:

```php
$this->db->createCommand()->insert('{{%order}}', [...])->execute();
$this->db->createCommand()->update('{{%order}}', ['status' => 'paid'], ['id' => $id])->execute();
$this->db->createCommand()->delete('{{%order}}', ['id' => $id])->execute();
```

Transactions (closure auto-commits/rolls back):

```php
$this->db->transaction(static function (ConnectionInterface $db) use ($order): void {
    $db->createCommand()->insert('{{%order}}', $order->toArray())->execute();
    $db->createCommand()->update('{{%user}}', ['balance' => $new], ['id' => $userId])->execute();
});
```

ORM-style models on request only: **references/ACTIVE-RECORD.md** — keep business logic out
of AR classes regardless.

### Step 3: Pagination & Sorting

List endpoints return a DataReader, rendered by `/yii3-view` (GridView, references/DATAVIEW.md):

```php
use Yiisoft\Data\Reader\IterableReader; // or DbReader for direct DB feeding

$reader = (new IterableReader($rows))
    ->withSort(new Sort(['created_at', 'total']));

$page = (new OffsetPaginator($reader))->withCurrentPage($request->getQueryParams()['page'] ?? 1);
```

### Step 4: Register DI

```php
// config/common/di/blog.php
return [
    PostRepositoryInterface::class => DbPostRepository::class,
];
```

## Rules

- Repositories own queries; actions/services never build SQL or touch `ConnectionInterface` directly
  (except transaction orchestration inside a UseCase when several repositories participate).
- Always parameter-bound conditions and expressions — no string interpolation of user input, ever.
- Schema changes only through migrations; every migration must be revertible.
- List queries get an explicit `LIMIT` + paginator.
- Validate data before writes (`/yii3-forms`), not inside SQL strings.

## Verification Checklist

1. `php -l` on all new files; migration applies AND reverts cleanly (`migrate:up` / `migrate:down`).
2. Repository methods return typed results; list method returns a paginator-friendly reader.
3. Transaction paths roll back on simulated failure.

## References

- `references/MIGRATIONS.md` — migrations with `yiisoft/db-migration`: interfaces, column builder,
  apply/revert workflow, entity + repository generation
- `references/ACTIVE-RECORD.md` — `yiisoft/active-record`: model classes, query API, relations,
  optimistic locking, boundaries vs repositories

## Related Skills

- `/yii3-actions` — CRUD scaffold wiring repository + actions (references/CRUD.md)
- `/yii3-forms` — validating data before writes
