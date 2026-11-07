<?php

declare(strict_types=1);

namespace App\Shop\Domain;

interface SearchOrdersRepositoryInterface
{
    /**
     * @return array<array<string, mixed>> Order rows matching the search term.
     */
    public function search(string $term): array;
}
