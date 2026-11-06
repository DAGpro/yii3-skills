<?php

declare(strict_types=1);

namespace App\Blog\Domain;

interface TagRepositoryInterface
{
    public function all(): array;
}
