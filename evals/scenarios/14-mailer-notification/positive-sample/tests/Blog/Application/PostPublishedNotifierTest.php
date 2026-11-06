<?php

declare(strict_types=1);

namespace App\Tests\Blog\Application;

use App\Blog\Application\PostPublishedNotifier;
use App\Blog\Domain\Post;
use PHPUnit\Framework\TestCase;
use Yiisoft\Mailer\StubMailer;

final class PostPublishedNotifierTest extends TestCase
{
    public function testAuthorIsNotifiedOnPublish(): void
    {
        $mailer = new StubMailer();
        $notifier = new PostPublishedNotifier($mailer);

        $notifier->notifyAuthor(new Post(7, 'Hello without notifications', 'author@example.com'));

        $messages = $mailer->getMessages();
        self::assertCount(1, $messages);
        self::assertSame('author@example.com', $messages[0]->getTo());
        self::assertSame('Your post "Hello without notifications" is published', $messages[0]->getSubject());
    }
}
