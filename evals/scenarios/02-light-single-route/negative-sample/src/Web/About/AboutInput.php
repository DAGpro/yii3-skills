<?php

declare(strict_types=1);

namespace App\Web\About;

final readonly class AboutInput
{
    public function __construct(
        public readonly string $name = 'Acme',
        public readonly string $edition = 'community',
    ) {}
}
