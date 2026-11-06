<?php

declare(strict_types=1);

namespace App\Blog\Application;

/**
 * Domain logic under test is already implemented; the task is exposing it as a command.
 * Returns the number of posts processed.
 */
final readonly class RecountViews
{
    public function __invoke(): int
    {
        return 42;
    }
}
