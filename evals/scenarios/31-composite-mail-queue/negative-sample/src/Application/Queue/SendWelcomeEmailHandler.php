<?php

declare(strict_types=1);

namespace App\Application\Queue;

use Yiisoft\Mailer\MailerInterface;
use Yiisoft\Mailer\Message;

final class SendWelcomeEmailHandler
{
    public function __construct(
        private MailerInterface $mailer,
    ) {}

    public function handle(WelcomeEmailMessage $message): void
    {
        $welcome = new Message(
            to: $message->email,
            subject: 'Welcome to the blog',
            textBody: sprintf('Hi %s, welcome aboard!', $message->name),
        );
        $this->mailer->send($welcome);
    }
}
