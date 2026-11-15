<?php

declare(strict_types=1);

namespace App\User\Profile;

final class UserRepository implements UserRepositoryInterface
{
    public function updateBio(int $userId, string $bio): void
    {
        // Persistence logic
    }
}
