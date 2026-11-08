<?php

declare(strict_types=1);

namespace App\Newsletter\Domain;

final class Subscriber
{
    public function __construct(
        private ?int $id,
        private string $email,
        private int $createdAt,
    ) {
    }

    public static function create(string $email): self
    {
        return new self(null, $email, time());
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getEmail(): string
    {
        return $this->email;
    }

    public function getCreatedAt(): int
    {
        return $this->createdAt;
    }
}

