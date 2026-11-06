<?php

declare(strict_types=1);

namespace App\Blog\Application;

/**
 * Slow use case under test (collects posts and builds the weekly digest for every subscriber).
 * The heavy work is already implemented; the task is moving it off the request path.
 */
final readonly class DigestGenerator
{
    public function generateWeeklyDigest(): int
    {
        return 42; // number of subscribers processed
    }
}
