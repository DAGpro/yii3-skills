<?php

declare(strict_types=1);

namespace App\Blog\Domain;

final readonly class Post
{
    public function __construct(public int $id, public string $title) {}

    public function getId(): int
    {
        return $this->id;
    }

    public function getTitle(): string
    {
        return $this->title;
    }
}
