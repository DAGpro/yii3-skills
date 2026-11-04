<?php

declare(strict_types=1);

use App\Domain\PostRepositoryInterface;
use App\Persistence\DbPostRepository;

return [
    PostRepositoryInterface::class => DbPostRepository::class,
];
