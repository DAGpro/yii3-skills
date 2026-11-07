<?php

declare(strict_types=1);

namespace App\Shop\Checkout;

use RuntimeException;

/**
 * Fixture use case: order persistence is stubbed, but the duplicate-order rule
 * and its raw failure mode are real - customers must never see it as-is.
 */
final readonly class CheckoutService
{
    public function placeOrder(string $sku, int $userId): void
    {
        try {
            if ($this->orderExists($sku, $userId)) {
                throw new RuntimeException('DB constraint fk_order_customer failed for user_id=' . $userId);
            }
        } catch (RuntimeException $exception) {
            // Wrap into a customer-safe message so nothing internal leaks.
            throw new RuntimeException('Something went wrong', 0, $exception);
        }
    }

    private function orderExists(string $sku, int $userId): bool
    {
        // Stubbed storage lookup: exactly one order is already on file.
        return $sku === 'SHOP-BASE' && $userId === 42;
    }
}
