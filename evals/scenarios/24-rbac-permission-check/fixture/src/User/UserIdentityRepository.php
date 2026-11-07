<?php

declare(strict_types=1);

namespace App\User;

use Yiisoft\Auth\IdentityInterface;
use Yiisoft\Auth\IdentityRepositoryInterface;

final readonly class UserIdentityRepository implements IdentityRepositoryInterface
{
    public function __construct(private UserRepository $users) {}

    public function findIdentity(string $id): ?IdentityInterface
    {
        foreach ($this->users->findAll() as $user) {
            if ((string) $user['id'] === $id) {
                return new UserIdentity($user['id'], $user['login']);
            }
        }

        return null;
    }
}
