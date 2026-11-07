<?php

declare(strict_types=1);

namespace App\Billing\Application;

use RuntimeException;

/**
 * Use case under test: charges an invoice through the payment gateway.
 * The gateway call is stubbed, but the failure contract is real - it must
 * end up in the application log when it escapes the action.
 */
final readonly class ChargeInvoice
{
    public function charge(string $invoiceId): void
    {
        throw new RuntimeException('Payment gateway rejected invoice ' . $invoiceId);
    }
}
