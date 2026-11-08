<?php

declare(strict_types=1);

namespace App\Newsletter\Application;

final readonly class SubscribeCommand
{
    public function __construct(
        public string $email,
    ) {
    }
}

