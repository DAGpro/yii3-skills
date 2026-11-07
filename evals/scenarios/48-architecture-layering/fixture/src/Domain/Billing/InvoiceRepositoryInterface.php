<?php

declare(strict_types=1);

namespace App\Domain\Billing;

interface InvoiceRepositoryInterface
{
    public function save(Invoice $invoice): void;
}
