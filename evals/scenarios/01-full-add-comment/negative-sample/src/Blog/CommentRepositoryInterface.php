<?php

namespace App\Blog;

interface CommentRepositoryInterface
{
    public function save(array $row): void;
}
