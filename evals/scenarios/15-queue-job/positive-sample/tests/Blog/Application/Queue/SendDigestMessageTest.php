<?php

declare(strict_types=1);

namespace App\Tests\Blog\Application\Queue;

use App\Blog\Application\Queue\SendDigestMessage;
use PHPUnit\Framework\TestCase;

final class SendDigestMessageTest extends TestCase
{
    public function testFromPayloadRoundTrip(): void
    {
        $message = SendDigestMessage::fromPayload('blog.send-digest', ['initiatedByUserId' => 42]);

        self::assertSame('blog.send-digest', $message->getType());
        self::assertSame(42, $message->initiatedByUserId);
        self::assertSame(['initiatedByUserId' => 42], $message->getPayload());
    }
}
