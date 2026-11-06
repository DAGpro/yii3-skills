<?php

declare(strict_types=1);

namespace App\Blog\Application;

/**
 * Use case the legacy SiteController delegates to; the task is the HTTP layer around it.
 */
final readonly class StatsService
{
    public function summary(): array
    {
        return ['posts' => 42, 'comments' => 118];
    }
}
