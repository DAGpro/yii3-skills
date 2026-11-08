<?php

declare(strict_types=1);

namespace App\Tests\Newsletter;

use App\Newsletter\Application\SubscribeCommand;
use App\Newsletter\Application\SubscribeHandler;
use App\Newsletter\Domain\Subscriber;
use App\Newsletter\Domain\SubscriberRepositoryInterface;
use PHPUnit\Framework\TestCase;
use Psr\EventDispatcher\EventDispatcherInterface;
use Yiisoft\Db\Connection\ConnectionInterface;

final class SubscribeTest extends TestCase
{
    public function testSubscribeSavesEntity(): void
    {
        $repo = $this->createMock(SubscriberRepositoryInterface::class);
        $repo->expects($this->once())->method('save');

        $db = $this->createMock(ConnectionInterface::class);
        $db->method('transaction')->willReturnCallback(fn($cb) => $cb());

        $dispatcher = $this->createMock(EventDispatcherInterface::class);
        $dispatcher->expects($this->once())->method('dispatch');

        $handler = new SubscribeHandler($repo, $db, $dispatcher);
        $handler->handle(new SubscribeCommand('user@example.com'));
    }
}

