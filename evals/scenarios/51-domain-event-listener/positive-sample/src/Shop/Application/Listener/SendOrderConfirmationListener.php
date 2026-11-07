<?php

declare(strict_types=1);

namespace App\Shop\Application\Listener;

use App\Shop\Domain\OrderCompletedEvent;
use Yiisoft\Mailer\MailerInterface;
use Yiisoft\Mailer\Message;

/**
 * Sends the confirmation email when an order is completed.
 */
final readonly class SendOrderConfirmationListener
{
    public function __construct(private MailerInterface $mailer) {}

    public function __invoke(OrderCompletedEvent $event): void
    {
        $message = (new Message())
            ->withTo($event->customerEmail)
            ->withSubject('Order confirmed')
            ->withTextBody("Your order {$event->orderId} has been confirmed.");
        $this->mailer->send($message);
    }
}
