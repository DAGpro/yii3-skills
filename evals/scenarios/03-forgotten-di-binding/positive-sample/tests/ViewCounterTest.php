<?php

declare(strict_types=1);

namespace App\Tests;

use App\Blog\Infrastructure\DbViewCounter;
use PHPUnit\Framework\TestCase;
use Yiisoft\Db\Command\CommandInterface;
use Yiisoft\Db\Connection\ConnectionInterface;

final class ViewCounterTest extends TestCase
{
    public function testIncrementInsertsRow(): void
    {
        $command = $this->createMock(CommandInterface::class);
        $command->expects($this->once())->method('insert')->with('post_view', ['post_id' => 7])->willReturnSelf();
        $command->expects($this->once())->method('execute')->willReturn(true);

        $db = $this->createMock(ConnectionInterface::class);
        $db->expects($this->once())->method('createCommand')->with(null)->willReturn($command);

        (new DbViewCounter($db))->increment(7);
    }
}
