<?php

declare(strict_types=1);

use App\Blog\Domain\TagRepositoryInterface;
use App\Blog\Infrastructure\Cycle\TagRepository;

return [
    TagRepositoryInterface::class => TagRepository::class,
];
