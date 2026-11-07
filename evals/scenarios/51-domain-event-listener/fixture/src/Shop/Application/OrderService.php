<?php

declare(strict_types=1);

namespace App\Shop\Application;

use Yiisoft\Mailer\MailerInterface;
use Yiisoft\Mailer\Message;

/**
 * Use case under test: completes an order.
 * The task decouples the confirmation email from this service.
 */
final readonly class OrderService
{
    public function __construct(private MailerInterface $mailer) {}

    public function complete(string $orderId, string $customerEmail): void
    {
        // persistence placeholder: the order is marked as completed

        $message = (new Message())
            ->withTo($customerEmail)
            ->withSubject('Order confirmed')
            ->withTextBody("Your order {$orderId} has been confirmed.");
        $this->mailer->send($message);
    }
}
