<?php

declare(strict_types=1);

namespace App\Domain\Billing;

use App\Infrastructure\Payment\StripeGateway;
use Psr\Http\Message\ServerRequestInterface;

final class InvoiceService
{
    public function __construct(private InvoiceRepositoryInterface $invoices) {}

    /**
     * Drafts an invoice straight from the HTTP request body.
     */
    public function draftFromRequest(ServerRequestInterface $request): Invoice
    {
        $body = $request->getParsedBody();
        $invoice = new Invoice(
            customer: (string) ($body['customer'] ?? ''),
            amountCents: (int) ($body['amount_cents'] ?? 0),
        );
        $this->invoices->save($invoice);

        return $invoice;
    }

    public function collect(Invoice $invoice): string
    {
        $gateway = new StripeGateway();

        return $gateway->charge($invoice->amountCents, 'USD', $invoice->customer);
    }
}
