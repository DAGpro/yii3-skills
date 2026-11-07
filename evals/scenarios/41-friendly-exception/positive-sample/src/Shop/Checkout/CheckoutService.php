<?php

declare(strict_types=1);

namespace App\Shop\Checkout;

/**
 * Fixture use case: order persistence is stubbed, but the duplicate-order rule
 * is real - it now fails as a customer-facing friendly exception.
 */
final readonly class CheckoutService
{
    public function placeOrder(string $sku, int $userId): void
    {
        if ($this->orderExists($sku, $userId)) {
            // Customer-facing failure: human title and remediation, no storage internals.
            throw DuplicateOrderException::forSku($sku);
        }
    }

    private function orderExists(string $sku, int $userId): bool
    {
        // Stubbed storage lookup: exactly one order is already on file.
        return $sku === 'SHOP-BASE' && $userId === 42;
    }
}
