<?php

declare(strict_types=1);

use App\Blog\Domain\PostRepositoryInterface;
use App\Blog\Domain\ViewCounterInterface;
use App\Blog\Infrastructure\DbPostRepository;
use App\Blog\Infrastructure\DbViewCounter;

return [
    PostRepositoryInterface::class => DbPostRepository::class,
    ViewCounterInterface::class => DbViewCounter::class,
];
