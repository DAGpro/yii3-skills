<?php

declare(strict_types=1);

namespace App\User;

/**
 * Fixture storage: persistence is stubbed, but the destructive delete use case
 * is real enough that it must be authorization-guarded.
 */
final class UserRepository
{
    /** @var array<int, array{id: int, login: string}> */
    private array $users = [
        1 => ['id' => 1, 'login' => 'admin'],
        2 => ['id' => 2, 'login' => 'editor'],
        3 => ['id' => 3, 'login' => 'viewer'],
    ];

    /** @return array<int, array{id: int, login: string}> */
    public function findAll(): array
    {
        return $this->users;
    }

    public function delete(int $id): void
    {
        unset($this->users[$id]);
    }
}
