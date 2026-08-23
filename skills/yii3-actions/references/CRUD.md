# Yii3 Full CRUD Scaffold (Persistence Layer)

Scaffold a full CRUD module in a Yii3 app. Reference implementation from the official guide uses a `Page`
entity — adapt names to the requested entity.

## Step 0: Analyze the Project

1. Load context per `yii3` master skill.
2. Detect the storage layer:
   - `yiisoft/db` + repository pattern (default of this skill) — recommended.
   - `yiisoft/active-record` — if the project already uses it, follow project style instead.
3. Detect migrations setup: `yiisoft/db-migration` installed? Params configured?
   ```php
   'yiisoft/db-migration' => [
       'newMigrationNamespace' => 'App\\Migration',
       'sourceNamespaces' => ['App\\Migration'],
   ],
   ```
4. Ask the user for: entity name, fields (name/type/constraints), URL prefix, whether UUID or auto-increment PK.

## Step 1: Migration

Create `src/Migration/M<YYMMDDHHMMSS><Name>.php` (timestamp prefix is required for ordering):

```php
<?php

declare(strict_types=1);

namespace {Namespace}\Migration;

use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;

final class M251102141707Post implements RevertibleMigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $column = $b->columnBuilder();

        $b->createTable('post', [
            'id' => $column::uuidPrimaryKey(),
            'title' => $column::string()->notNull(),
            'slug' => $column::string()->notNull()->unique(),
            'text' => $column::text()->notNull(),
            'created_at' => $column::dateTime(),
            'updated_at' => $column::dateTime(),
        ]);
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropTable('post');
    }
}
```

Apply with `make yii migrate:up` (Docker) or `php yii migrate:up`. For UUID PKs ensure `ramsey/uuid` is required.

## Step 2: Entity

`src/Web/Post/Post.php` — immutable entity with a named constructor:

```php
<?php

declare(strict_types=1);

namespace App\Web\Post;

use DateTimeImmutable;
use Yiisoft\Strings\Inflector;

final readonly class Post
{
    private function __construct(
        public string $id,
        public string $title,
        public string $text,
        public string $slug,
        public DateTimeImmutable $createdAt,
        public DateTimeImmutable $updatedAt,
    ) {}

    public static function create(
        string $id,
        string $title,
        string $text,
        ?string $slug = null,
        DateTimeImmutable $createdAt = new DateTimeImmutable(),
        DateTimeImmutable $updatedAt = new DateTimeImmutable(),
    ): self {
        return new self(
            id: $id,
            title: $title,
            slug: $slug ?? (new Inflector())->toSlug($title),
            text: $text,
            createdAt: $createdAt,
            updatedAt: $updatedAt,
        );
    }
}
```

## Step 3: Repository

`src/Web/Post/PostRepository.php` — hides SQL behind domain methods:

```php
<?php

declare(strict_types=1);

namespace App\Web\Post;

use DateTimeImmutable;
use Yiisoft\Db\Connection\ConnectionInterface;

final readonly class PostRepository
{
    public function __construct(
        private ConnectionInterface $connection,
    ) {}

    public function save(Post $post): void
    {
        $row = [
            'id' => $post->id,
            'title' => $post->title,
            'slug' => $post->slug,
            'text' => $post->text,
            'created_at' => $post->createdAt,
            'updated_at' => $post->updatedAt,
        ];

        if ($this->exists($post->id)) {
            $this->connection->createCommand()->update('{{%post}}', $row, ['id' => $post->id])->execute();
        } else {
            $this->connection->createCommand()->insert('{{%post}}', $row)->execute();
        }
    }

    public function findOneBySlug(string $slug): ?Post
    {
        $query = $this->connection
            ->select()
            ->from('{{%post}}')
            ->where('slug = :slug', ['slug' => $slug]);

        return $this->hydrate($query->one());
    }

    /**
     * @return iterable<Post>
     */
    public function findAll(): iterable
    {
        foreach ($this->connection->select()->from('{{%post}}')->all() as $row) {
            yield $this->hydrate($row);
        }
    }

    public function deleteBySlug(string $slug): void
    {
        $this->connection->createCommand()->delete('{{%post}}', ['slug' => $slug])->execute();
    }

    public function exists(string $id): bool
    {
        return $this->connection->createQuery()
            ->from('{{%post}}')
            ->where(['id' => $id])
            ->exists();
    }

    private function hydrate(?array $row): ?Post
    {
        if ($row === null) {
            return null;
        }

        return Post::create(
            id: $row['id'],
            title: $row['title'],
            text: $row['text'],
            slug: $row['slug'],
            createdAt: new DateTimeImmutable($row['created_at']),
            updatedAt: new DateTimeImmutable($row['updated_at']),
        );
    }
}
```

## Next: Actions, Form, Templates

Generate actions, FormModel and templates per SKILL.md (types `list`/`view`/`create`/`edit`/`delete`,
patterns in PATTERNS.md). Register grouped routes per SKILL.md Step 3.

## Verify

1. `php -l` every file.
2. Migration applied successfully (`migrate:up`); `migrate:down` reverts cleanly.
3. Walk through: create → view → edit → delete in the browser or via functional test.
4. Deletion is never reachable by GET; forms carry CSRF.
