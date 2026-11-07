<?php

declare(strict_types=1);

namespace App\User;

use Yiisoft\Auth\IdentityInterface;
use Yiisoft\Auth\IdentityRepositoryInterface;

/**
 * Maps the JWT subject claim to a stateless API identity.
 */
final readonly class ApiUserIdentityRepository implements IdentityRepositoryInterface
{
    public function findIdentity(string $id): ?IdentityInterface
    {
        return new ApiUserIdentity($id);
    }
}
