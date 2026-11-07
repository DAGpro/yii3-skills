<?php

declare(strict_types=1);

namespace App\Application\Queue;

use InvalidArgumentException;
use Yiisoft\Mailer\MailerInterface;
use Yiisoft\Mailer\Message;
use Yiisoft\Queue\Message\Handler\HandlerInterface;
use Yiisoft\Queue\Message\MessageInterface;

use function sprintf;

/**
 * Worker-side execution unit: composes and sends the welcome email off the request path.
 */
final readonly class SendWelcomeEmailHandler implements HandlerInterface
{
    public function __construct(
        private MailerInterface $mailer,
    ) {}

    public function handle(MessageInterface $message): void
    {
        if (!$message instanceof SendWelcomeEmailMessage) {
            throw new InvalidArgumentException(sprintf('Unexpected message type "%s".', $message->getType()));
        }

        $welcome = new Message(
            to: $message->email,
            subject: 'Welcome to the blog',
            textBody: sprintf('Hi %s, welcome aboard!', $message->name),
        );
        $this->mailer->send($welcome);
    }
}
