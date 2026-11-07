<?php

declare(strict_types=1);

namespace App\Billing\Application;

use App\Billing\Domain\InvoiceRepositoryInterface;
use Throwable;

/**
 * Renders invoices as plain text for the download endpoint.
 *
 * Known issue: export failures are swallowed - callers only see null and
 * support has no trace of what went wrong.
 */
final readonly class InvoiceExporter
{
    public function __construct(private InvoiceRepositoryInterface $invoices) {}

    public function export(int $invoiceId): ?string
    {
        try {
            $invoice = $this->invoices->find($invoiceId);

            return $this->render($invoice);
        } catch (Throwable) {
            // TODO: failures disappear here - support cannot diagnose broken exports.
            return null;
        }
    }

    /**
     * @param array<string, mixed> $invoice
     */
    private function render(array $invoice): string
    {
        return sprintf(
            "INVOICE %s\nCustomer: %s\nTotal: %s %s\n",
            $invoice['number'] ?? '-',
            $invoice['customer'] ?? '-',
            $invoice['currency'] ?? 'USD',
            $invoice['total'] ?? '0.00',
        );
    }
}
