<?php

declare(strict_types=1);

namespace App\Blog\Domain;

interface CommentRepositoryInterface
{
    public function save(Comment $comment): void;
}
