<?php

declare(strict_types=1);

namespace App\Tests\Support;

use App\Domain\Post;
use App\Domain\PostRepositoryInterface;
use LogicException;
use RuntimeException;

/**
 * Recording test double for `PostRepositoryInterface`.
 *
 * Tracks which aggregates were persisted, can simulate a storage failure
 * (to exercise transaction rollback paths in handler tests), and can
 * pre-seed existing titles (to exercise the uniqueness pre-check).
 */
final class SpyPostRepository implements PostRepositoryInterface
{
    /** @var list<Post> */
    private array $saved = [];

    /** @var list<string> */
    private array $existingTitles = [];

    private bool $failSave = false;

    public function failNextSave(): void
    {
        $this->failSave = true;
    }

    public function seedExistingTitle(string $title): void
    {
        $this->existingTitles[] = $title;
    }

    /**
     * @return list<Post>
     */
    public function getSaved(): array
    {
        return $this->saved;
    }

    public function findById(int $id): ?Post
    {
        throw new LogicException('Not expected in this test.');
    }

    public function findAll(): array
    {
        throw new LogicException('Not expected in this test.');
    }

    public function existsByTitle(string $title): bool
    {
        return in_array($title, $this->existingTitles, true);
    }

    public function save(Post $post): void
    {
        if ($this->failSave) {
            throw new RuntimeException('Simulated storage failure (forces transaction rollback).');
        }
        $this->saved[] = $post;
        $post->assignId(count($this->saved));
    }

    public function delete(Post $post): void
    {
        throw new LogicException('Not expected in this test.');
    }
}
