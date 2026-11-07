<?php

declare(strict_types=1);

namespace App\User;

use Yiisoft\Auth\IdentityInterface;

final class UserIdentity implements IdentityInterface
{
    public function __construct(
        private readonly string $id,
        private readonly string $login,
    ) {}

    public function getId(): ?string
    {
        return $this->id;
    }

    public function getLogin(): string
    {
        return $this->login;
    }
}
