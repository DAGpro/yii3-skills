<?php

declare(strict_types=1);

namespace App\Shop\Application;

use App\Shop\Domain\OrderCompletedEvent;
use Psr\EventDispatcher\EventDispatcherInterface;
use Yiisoft\Mailer\MailerInterface;
use Yiisoft\Mailer\Message;

/**
 * Use case under test: completes an order, announces the domain event
 * and sends the confirmation email.
 */
final readonly class OrderService
{
    public function __construct(
        private MailerInterface $mailer,
        private EventDispatcherInterface $dispatcher,
    ) {}

    public function complete(string $orderId, string $customerEmail): void
    {
        // persistence placeholder: the order is marked as completed

        $message = (new Message())
            ->withTo($customerEmail)
            ->withSubject('Order confirmed')
            ->withTextBody("Your order {$orderId} has been confirmed.");
        $this->mailer->send($message);

        // announce the domain event as well, so future listeners can react
        $this->dispatcher->dispatch(new OrderCompletedEvent($orderId, $customerEmail));
    }
}
