<?php

declare(strict_types=1);

namespace App\User;

use Yiisoft\Auth\IdentityInterface;
use Yiisoft\Auth\IdentityRepositoryInterface;

/**
 * Fixture storage: password hashes are seeded with password_hash(), persistence is stubbed.
 */
final class UserRepository implements IdentityRepositoryInterface
{
    /** @var array<string, User> */
    private array $users = [];

    public function __construct()
    {
        $this->users = [
            'alice' => new User('1', 'alice', password_hash('secret123', PASSWORD_DEFAULT)),
            'bob' => new User('2', 'bob', password_hash('hunter2!', PASSWORD_DEFAULT)),
        ];
    }

    public function findByLogin(string $login): ?User
    {
        return $this->users[$login] ?? null;
    }

    public function findIdentity(string $id): ?IdentityInterface
    {
        foreach ($this->users as $user) {
            if ($user->getId() === $id) {
                return $user;
            }
        }

        return null;
    }
}
