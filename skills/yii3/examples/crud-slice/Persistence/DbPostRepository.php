<?php

declare(strict_types=1);

namespace App\Persistence;

use App\Domain\Post;
use App\Domain\PostRepositoryInterface;
use App\Domain\PostStatus;
use DateTimeImmutable;
use LogicException;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;

/**
 * Database repository implementation (adapter) using yiisoft/db.
 * Communicates with the database table via ConnectionInterface and Query builder.
 */
final readonly class DbPostRepository implements PostRepositoryInterface
{
    private const TABLE_NAME = '{{%post}}';

    public function __construct(
        private ConnectionInterface $db,
    ) {}

    public function findById(int $id): ?Post
    {
        /** @var array<string, mixed>|null $row */
        $row = (new Query($this->db))
            ->from(self::TABLE_NAME)
            ->where(['id' => $id])
            ->one();

        return $row !== null ? $this->hydrate($row) : null;
    }

    public function findAll(): array
    {
        /** @var list<array<string, mixed>> $rows */
        $rows = (new Query($this->db))
            ->from(self::TABLE_NAME)
            ->orderBy(['created_at' => SORT_DESC])
            ->all();

        return array_map(fn (array $row): Post => $this->hydrate($row), $rows);
    }

    public function existsByTitle(string $title): bool
    {
        return (new Query($this->db))
            ->from(self::TABLE_NAME)
            ->where(['title' => $title])
            ->exists();
    }

    public function save(Post $post): void
    {
        if ($post->getId() !== null) {
            throw new LogicException('Only new posts are persisted by save(); update tracked posts through their intent methods.');
        }

        $this->db->createCommand()
            ->insert(self::TABLE_NAME, [
                'title' => $post->getTitle(),
                'content' => $post->getContent(),
                'status' => $post->getStatus()->value,
                'created_at' => $post->getCreatedAt()->format('Y-m-d H:i:s'),
                'updated_at' => $post->getUpdatedAt()?->format('Y-m-d H:i:s'),
            ])
            ->execute();

        $post->assignId((int) $this->db->getLastInsertId());
    }

    public function delete(Post $post): void
    {
        $id = $post->getId();
        if ($id === null) {
            return;
        }

        $this->db->createCommand()
            ->delete(self::TABLE_NAME, ['id' => $id])
            ->execute();
    }

    /**
     * Hydrates a database record into a pure Domain aggregate.
     *
     * @param array<string, mixed> $row
     */
    private function hydrate(array $row): Post
    {
        return Post::restore(
            id: (int) ($row['id'] ?? 0),
            title: (string) ($row['title'] ?? ''),
            content: (string) ($row['content'] ?? ''),
            status: PostStatus::from((string) ($row['status'] ?? PostStatus::Draft->value)),
            createdAt: isset($row['created_at']) && is_string($row['created_at'])
                ? new DateTimeImmutable($row['created_at'])
                : new DateTimeImmutable(),
            updatedAt: isset($row['updated_at']) && is_string($row['updated_at'])
                ? new DateTimeImmutable($row['updated_at'])
                : null,
        );
    }
}
