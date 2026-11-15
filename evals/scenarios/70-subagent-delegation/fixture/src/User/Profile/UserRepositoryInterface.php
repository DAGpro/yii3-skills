<?php

declare(strict_types=1);

namespace App\User\Profile;

interface UserRepositoryInterface
{
    public function updateBio(int $userId, string $bio): void;
}
