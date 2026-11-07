<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence;

use App\Domain\Billing\Invoice;
use App\Domain\Billing\InvoiceRepositoryInterface;

final class DbInvoiceRepository implements InvoiceRepositoryInterface
{
    public function save(Invoice $invoice): void
    {
        // Offline fixture stub: a real adapter would persist the invoice here.
    }
}
