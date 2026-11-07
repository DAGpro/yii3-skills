<?php

declare(strict_types=1);

namespace App\User;

final readonly class UserRegistered
{
    public function __construct(public readonly string $email) {}
}
