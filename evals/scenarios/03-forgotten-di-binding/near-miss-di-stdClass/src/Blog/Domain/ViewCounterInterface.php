<?php

declare(strict_types=1);

namespace App\Blog\Domain;

interface ViewCounterInterface
{
    public function increment(int $postId): void;
}
