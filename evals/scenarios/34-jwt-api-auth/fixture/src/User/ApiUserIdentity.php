<?php

declare(strict_types=1);

namespace App\User;

use Yiisoft\Auth\IdentityInterface;

/**
 * Stateless API identity resolved from the verified JWT `sub` claim.
 */
final readonly class ApiUserIdentity implements IdentityInterface
{
    public function __construct(private string $id) {}

    public function getId(): ?string
    {
        return $this->id;
    }
}
