<?php

declare(strict_types=1);

namespace App\Domain\Billing;

final readonly class Invoice
{
    public function __construct(
        public string $customer,
        public int $amountCents,
    ) {}
}
