<?php

declare(strict_types=1);

namespace App\Blog\Application;

use App\Blog\Domain\Post;
use Yiisoft\Mailer\MailerInterface;
use Yiisoft\Mailer\Message;

/**
 * Composes and sends the publication confirmation through the mailer stack.
 * Sender identity is applied at send time from the messageSettings defaults.
 */
final readonly class PostPublishedNotifier
{
    public function __construct(
        private MailerInterface $mailer,
    ) {}

    public function notifyAuthor(Post $post): void
    {
        $message = (new Message())
            ->withTo($post->authorEmail)
            ->withSubject("Your post \"{$post->title}\" is published")
            ->withTextBody("Hi!\n\nYour post \"{$post->title}\" is now live on the blog.");

        $this->mailer->send($message);
    }
}
