<?php

declare(strict_types=1);

namespace App\Service;

final class RequestContext
{
    private ?string $userId = null;
    private array $attributes = [];

    public function setUserId(?string $userId): void
    {
        $this->userId = $userId;
    }

    public function getUserId(): ?string
    {
        return $this->userId;
    }

    public function reset(): void
    {
        $this->userId = null;
        $this->attributes = [];
    }
}
