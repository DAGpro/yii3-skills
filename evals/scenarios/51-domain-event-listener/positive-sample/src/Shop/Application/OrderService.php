<?php

declare(strict_types=1);

namespace App\Shop\Application;

use App\Shop\Domain\OrderCompletedEvent;
use Psr\EventDispatcher\EventDispatcherInterface;

/**
 * Use case under test: completes an order and announces it as a domain event.
 */
final readonly class OrderService
{
    public function __construct(private EventDispatcherInterface $dispatcher) {}

    public function complete(string $orderId, string $customerEmail): void
    {
        // persistence placeholder: the order is marked as completed

        $this->dispatcher->dispatch(new OrderCompletedEvent($orderId, $customerEmail));
    }
}
