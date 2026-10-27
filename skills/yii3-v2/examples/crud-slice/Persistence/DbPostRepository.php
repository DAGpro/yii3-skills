<?php

declare(strict_types=1);

namespace App\Persistence;

use App\Domain\Post;
use App\Domain\PostRepositoryInterface;
use DateTimeImmutable;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Query\Query;

/**
 * Database repository implementation using yiisoft/db.
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

    /**
     * @return list<Post>
     */
    public function findAll(): array
    {
        /** @var list<array<string, mixed>> $rows */
        $rows = (new Query($this->db))
            ->from(self::TABLE_NAME)
            ->orderBy(['created_at' => SORT_DESC])
            ->all();

        return array_map(fn (array $row): Post => $this->hydrate($row), $rows);
    }

    public function save(Post $post): void
    {
        $now = new DateTimeImmutable();

        if ($post->getId() === null) {
            $this->db->createCommand()
                ->insert(self::TABLE_NAME, [
                    'title' => $post->getTitle(),
                    'content' => $post->getContent(),
                    'status' => $post->getStatus(),
                    'created_at' => $post->getCreatedAt()->format('Y-m-d H:i:s'),
                    'updated_at' => $post->getUpdatedAt()?->format('Y-m-d H:i:s'),
                ])
                ->execute();

            $id = (int) $this->db->getLastInsertID();
            $post->setId($id);
        } else {
            $this->db->createCommand()
                ->update(
                    self::TABLE_NAME,
                    [
                        'title' => $post->getTitle(),
                        'content' => $post->getContent(),
                        'status' => $post->getStatus(),
                        'updated_at' => $now->format('Y-m-d H:i:s'),
                    ],
                    ['id' => $post->getId()],
                )
                ->execute();
        }
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
     * Hydrates a database record into a pure Domain Entity.
     *
     * @param array<string, mixed> $row
     */
    private function hydrate(array $row): Post
    {
        return new Post(
            id: isset($row['id']) ? (int) $row['id'] : null,
            title: (string) ($row['title'] ?? ''),
            content: (string) ($row['content'] ?? ''),
            status: (string) ($row['status'] ?? 'draft'),
            createdAt: isset($row['created_at']) && is_string($row['created_at'])
                ? new DateTimeImmutable($row['created_at'])
                : new DateTimeImmutable(),
            updatedAt: isset($row['updated_at']) && is_string($row['updated_at'])
                ? new DateTimeImmutable($row['updated_at'])
                : null,
        );
    }
}
