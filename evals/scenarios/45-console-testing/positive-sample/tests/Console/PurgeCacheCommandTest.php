<?php

declare(strict_types=1);

namespace App\Tests\Console;

use App\Console\PurgeCacheCommand;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Tester\CommandTester;
use Yiisoft\Yii\Console\ExitCode;

final class PurgeCacheCommandTest extends TestCase
{
    public function testPurgesCacheAndSucceeds(): void
    {
        $cacheDir = sys_get_temp_dir() . '/cache-purge-test';
        @mkdir($cacheDir);
        file_put_contents($cacheDir . '/stale.php', 'data');

        $command = new PurgeCacheCommand($cacheDir);
        $tester = new CommandTester($command);

        $exitCode = $tester->execute([]);

        $this->assertSame(ExitCode::OK, $exitCode);
        $tester->assertCommandIsSuccessful();

        $output = $tester->getDisplay(true);
        $this->assertStringContainsString('Cache purged.', $output);
        $this->assertSame(['.', '..'], scandir($cacheDir));

        @rmdir($cacheDir);
    }

    public function testReturnsUnavailableWhenStorageMissing(): void
    {
        $command = new PurgeCacheCommand(sys_get_temp_dir() . '/cache-purge-missing');
        $tester = new CommandTester($command);

        $exitCode = $tester->execute([]);

        $this->assertSame(ExitCode::UNAVAILABLE, $exitCode);
        $this->assertStringContainsString('Cache storage directory is missing.', $tester->getDisplay(true));
    }
}
