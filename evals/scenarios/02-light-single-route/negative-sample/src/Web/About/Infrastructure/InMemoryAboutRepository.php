<?php

declare(strict_types=1);

namespace App\Web\About\Infrastructure;

use App\Web\About\Domain\AboutRepositoryInterface;

final class InMemoryAboutRepository implements AboutRepositoryInterface
{
    public function find(): array
    {
        return ['name' => 'Acme', 'edition' => 'community'];
    }
}
