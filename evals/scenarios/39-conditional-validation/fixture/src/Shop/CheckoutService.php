<?php

declare(strict_types=1);

namespace App\Shop;

/**
 * Use case under test is already implemented; the task is the conditional validation on the form model.
 */
final readonly class CheckoutService
{
    public function place(string $name, string $address, ?string $couponCode = null): void
    {
    }
}
