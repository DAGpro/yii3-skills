<?php

declare(strict_types=1);

namespace App\Newsletter\Application\Event;

final readonly class SubscribedEvent
{
    public function __construct(
        public string $email,
    ) {
    }
}

