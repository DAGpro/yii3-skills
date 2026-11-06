<?php

declare(strict_types=1);

namespace App\Blog\Application;

/**
 * Use case under test is already implemented; the task is the HTML editing layer on top of it.
 */
final readonly class UpdatePostService
{
    public function update(int $id, string $title, string $content, ?string $coverPath = null): void
    {
    }
}
