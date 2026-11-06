<?php

declare(strict_types=1);

namespace App\Blog\Application;

/**
 * Use case under test is already implemented; the task is the typed HTTP layer on top of it.
 */
final readonly class SettingsService
{
    public function save(string $title, int $postsPerPage, string $description = ''): void
    {
    }
}
