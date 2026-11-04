<?php

declare(strict_types=1);

namespace App\Domain;

use DateTimeImmutable;
use LogicException;

/**
 * Pure domain aggregate root representing a Post.
 * Free of database annotations, ORM inheritance, or framework abstractions.
 *
 * Invariants enforced by the aggregate itself:
 * - the identity is assigned exactly once (after the INSERT, by the repository);
 * - state changes go through explicit intent methods, never through setters;
 * - the `PostCreated` domain event is recorded inside the aggregate at
 *   creation time and released post-commit by the use case handler.
 */
final class Post
{
    /** @var list<object> */
    private array $recordedEvents = [];

    private function __construct(
        private ?int $id,
        private string $title,
        private string $content,
        private PostStatus $status,
        private DateTimeImmutable $createdAt,
        private ?DateTimeImmutable $updatedAt = null,
    ) {}

    /**
     * Factory method for a brand-new post. The only supported way to
     * create a `Post` from application code; records the domain event.
     */
    public static function create(string $title, string $content, PostStatus $status = PostStatus::Draft): self
    {
        if (trim($title) === '') {
            throw new LogicException('Post title must not be empty.');
        }

        $post = new self(
            id: null,
            title: $title,
            content: $content,
            status: $status,
            createdAt: new DateTimeImmutable(),
        );
        $post->recordedEvents[] = new PostCreated(
            title: $title,
            status: $status,
        );

        return $post;
    }

    /**
     * Rehydrates an existing post from persistence. Used by repositories only.
     */
    public static function restore(
        int $id,
        string $title,
        string $content,
        PostStatus $status,
        DateTimeImmutable $createdAt,
        ?DateTimeImmutable $updatedAt,
    ): self {
        return new self(
            id: $id,
            title: $title,
            content: $content,
            status: $status,
            createdAt: $createdAt,
            updatedAt: $updatedAt,
        );
    }

    /**
     * Assigns the database identity after a successful INSERT.
     *
     * @throws LogicException when the identity has already been assigned.
     */
    public function assignId(int $id): void
    {
        if ($this->id !== null) {
            throw new LogicException('Post identity is already assigned.');
        }
        $this->id = $id;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getTitle(): string
    {
        return $this->title;
    }

    public function getContent(): string
    {
        return $this->content;
    }

    public function getStatus(): PostStatus
    {
        return $this->status;
    }

    public function getCreatedAt(): DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): ?DateTimeImmutable
    {
        return $this->updatedAt;
    }

    public function update(string $title, string $content): void
    {
        $this->title = $title;
        $this->content = $content;
        $this->updatedAt = new DateTimeImmutable();
    }

    public function publish(): void
    {
        $this->status = PostStatus::Published;
        $this->updatedAt = new DateTimeImmutable();
    }

    public function archive(): void
    {
        $this->status = PostStatus::Archived;
        $this->updatedAt = new DateTimeImmutable();
    }

    /**
     * @return list<object>
     */
    public function releaseEvents(): array
    {
        $events = $this->recordedEvents;
        $this->recordedEvents = [];
        return $events;
    }

    /**
     * Serializes the aggregate into array representation (API responses).
     *
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'content' => $this->content,
            'status' => $this->status->value,
            'created_at' => $this->createdAt->format('Y-m-d H:i:s'),
            'updated_at' => $this->updatedAt?->format('Y-m-d H:i:s'),
        ];
    }
}
