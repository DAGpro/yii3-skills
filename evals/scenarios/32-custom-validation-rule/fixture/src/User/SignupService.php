<?php

declare(strict_types=1);

namespace App\User;

/**
 * Use case under test is already implemented; the task is reusable validation on top of it.
 */
final readonly class SignupService
{
    public function register(string $username, string $email, string $password): void
    {
    }
}
