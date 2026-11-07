<?php

declare(strict_types=1);

namespace App\Domain\Billing;

/**
 * Port owned by the domain: every payment gateway adapter must implement it.
 */
interface PaymentGatewayInterface
{
    public function charge(int $amountCents, string $currency, string $reference): string;
}
