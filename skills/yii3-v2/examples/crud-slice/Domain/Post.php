<?php

declare(strict_types=1);

namespace App\Domain;

use DateTimeImmutable;

/**
 * Pure domain entity representing a Post.
 * Free of database annotations, ORM inheritance, or framework abstractions.
 */
final class Post
{
    public function __construct(
        private ?int $id,
        private string $title,
        private string $content,
        private string $status = 'draft',
        private ?DateTimeImmutable $createdAt = null,
        private ?DateTimeImmutable $updatedAt = null,
    ) {
        $this->createdAt ??= new DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function setId(int $id): void
    {
        $this->id = $id;
    }

    public function getTitle(): string
    {
        return $this->title;
    }

    public function getContent(): string
    {
        return $this->content;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function getCreatedAt(): DateTimeImmutable
    {
        return $this->createdAt ??= new DateTimeImmutable();
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
        $this->status = 'published';
        $this->updatedAt = new DateTimeImmutable();
    }

    public function archive(): void
    {
        $this->status = 'archived';
        $this->updatedAt = new DateTimeImmutable();
    }

    /**
     * Serializes domain entity into array representation.
     *
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'content' => $this->content,
            'status' => $this->status,
            'created_at' => $this->getCreatedAt()->format('Y-m-d H:i:s'),
            'updated_at' => $this->updatedAt?->format('Y-m-d H:i:s'),
        ];
    }
}
