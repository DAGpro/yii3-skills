<?php

declare(strict_types=1);

namespace App\Blog\Domain;

final class Post
{
    public function __construct(
        public readonly int $id,
        public readonly string $title,
        public readonly string $authorEmail,
    ) {}
}
