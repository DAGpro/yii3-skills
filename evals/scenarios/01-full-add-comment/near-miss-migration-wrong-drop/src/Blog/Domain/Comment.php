<?php

declare(strict_types=1);

namespace App\Blog\Domain;

final class Comment
{
    public function __construct(public readonly int $postId, public readonly string $body, public ?int $id = null) {}
}
