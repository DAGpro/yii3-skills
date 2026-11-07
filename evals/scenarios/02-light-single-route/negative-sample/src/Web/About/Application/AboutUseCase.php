<?php

declare(strict_types=1);

namespace App\Web\About\Application;

use App\Web\About\Domain\AboutRepositoryInterface;

final readonly class AboutUseCase
{
    public function __construct(private AboutRepositoryInterface $about) {}

    public function handle(): array
    {
        return $this->about->find();
    }
}
