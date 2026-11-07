<?php

declare(strict_types=1);

namespace App\Shop\Checkout;

use RuntimeException;
use Yiisoft\FriendlyException\FriendlyExceptionInterface;

/**
 * Customer-facing duplicate-order failure: a human title and remediation steps,
 * rendered automatically by the error handler. No internal storage details.
 */
final class DuplicateOrderException extends RuntimeException implements FriendlyExceptionInterface
{
    public static function forSku(string $sku): self
    {
        return new self("You have already placed an order for \"{$sku}\".");
    }

    public function getName(): string
    {
        return 'Duplicate Order';
    }

    public function getSolution(): ?string
    {
        return 'Each item can be ordered only once. Check your order history, and if you '
            . 'need a second copy or believe this is a mistake, contact support with your order reference.';
    }
}
