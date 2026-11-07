<?php

declare(strict_types=1);

namespace App\Web\About\Domain;

interface AboutRepositoryInterface
{
    public function find(): array;
}
