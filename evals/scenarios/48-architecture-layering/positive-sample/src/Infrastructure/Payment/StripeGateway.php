<?php

declare(strict_types=1);

namespace App\Infrastructure\Payment;

use App\Domain\Billing\PaymentGatewayInterface;

/**
 * Payment gateway adapter (offline stub: returns a fake charge id instead of calling the gateway API).
 */
final class StripeGateway implements PaymentGatewayInterface
{
    public function charge(int $amountCents, string $currency, string $reference): string
    {
        return 'ch_' . md5($reference . ':' . $amountCents . ':' . $currency);
    }
}
