<?php

declare(strict_types=1);

namespace App\Blog\Domain;

final readonly class CommentAdded
{
    public function __construct(public int $postId) {}
}
