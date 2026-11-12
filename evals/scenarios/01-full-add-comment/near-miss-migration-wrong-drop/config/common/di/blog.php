<?php

declare(strict_types=1);

use App\Blog\Domain\CommentRepositoryInterface;
use App\Blog\Domain\PostRepositoryInterface;
use App\Blog\Infrastructure\DbCommentRepository;
use App\Blog\Infrastructure\DbPostRepository;

return [
    PostRepositoryInterface::class => DbPostRepository::class,
    CommentRepositoryInterface::class => DbCommentRepository::class,
];
