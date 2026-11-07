<?php

declare(strict_types=1);

namespace App\Billing\Infrastructure;

use App\Billing\Domain\InvoiceRepositoryInterface;
use RuntimeException;
use function sprintf;

/**
 * Fixture stub for the real SQL-backed repository: the storage backend is
 * unavailable in this environment, so every export attempt fails - which is
 * exactly why the swallowed errors matter to support.
 */
final class DbInvoiceRepository implements InvoiceRepositoryInterface
{
    public function find(int $invoiceId): array
    {
        throw new RuntimeException(sprintf('Storage unavailable for invoice #%d.', $invoiceId));
    }
}
