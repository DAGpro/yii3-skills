<?php

declare(strict_types=1);

namespace App\Tests\Console;

use PHPUnit\Framework\TestCase;

final class PurgeCacheCommandTest extends TestCase
{
    public function testPurgeCommandWorks(): void
    {
        exec('php yii cache:purge', $outputLines);

        $this->assertStringContainsString('Cache purged', implode("\n", $outputLines));
    }
}
