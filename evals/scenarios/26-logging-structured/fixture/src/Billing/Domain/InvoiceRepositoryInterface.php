<?php

declare(strict_types=1);

namespace App\Billing\Domain;

interface InvoiceRepositoryInterface
{
    /**
     * @return array<string, mixed>
     */
    public function find(int $invoiceId): array;
}
