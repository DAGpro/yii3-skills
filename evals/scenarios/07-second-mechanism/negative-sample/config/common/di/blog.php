<?php

declare(strict_types=1);

use App\Blog\Domain\PostRepositoryInterface;
use App\Blog\Domain\TagRepositoryInterface;
use App\Blog\Infrastructure\PostRepository;
use App\Blog\Infrastructure\TagRepository;

return [
    PostRepositoryInterface::class => PostRepository::class,
    TagRepositoryInterface::class => TagRepository::class,
];
