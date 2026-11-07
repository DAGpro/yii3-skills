<?php

declare(strict_types=1);

namespace App\User;

use SensitiveParameter;
use Yiisoft\Auth\IdentityInterface;

final class User implements IdentityInterface
{
    public function __construct(
        private readonly string $id,
        private readonly string $login,
        #[SensitiveParameter]
        private readonly string $passwordHash,
    ) {}

    public function getId(): ?string
    {
        return $this->id;
    }

    public function getLogin(): string
    {
        return $this->login;
    }

    public function verifyPassword(#[SensitiveParameter] string $password): bool
    {
        return password_verify($password, $this->passwordHash);
    }
}
