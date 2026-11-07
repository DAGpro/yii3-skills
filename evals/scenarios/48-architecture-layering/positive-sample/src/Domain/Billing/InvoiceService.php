<?php

declare(strict_types=1);

namespace App\Domain\Billing;

final class InvoiceService
{
    public function __construct(
        private InvoiceRepositoryInterface $invoices,
        private PaymentGatewayInterface $gateway,
    ) {}

    public function draft(string $customer, int $amountCents): Invoice
    {
        $invoice = new Invoice(customer: $customer, amountCents: $amountCents);
        $this->invoices->save($invoice);

        return $invoice;
    }

    public function collect(Invoice $invoice): string
    {
        return $this->gateway->charge($invoice->amountCents, 'USD', $invoice->customer);
    }
}
