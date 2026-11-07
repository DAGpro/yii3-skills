<?php

declare(strict_types=1);

use App\Blog\Domain\PostRepositoryInterface;
use App\Blog\Infrastructure\InMemoryPostRepository;

return [
    PostRepositoryInterface::class => InMemoryPostRepository::class,
];
