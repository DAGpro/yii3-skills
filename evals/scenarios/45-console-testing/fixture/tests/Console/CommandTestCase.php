<?php

namespace App\Tests\Console;

use PHPUnit\Framework\TestCase;

/**
 * Legacy console-test helper left in this project. Kept for the old suites.
 */
abstract class CommandTestCase extends TestCase
{
    /**
     * @return array{0: int, 1: string} [exit code, raw output]
     */
    protected function runCommand(string $command): array
    {
        exec('php yii ' . $command, $outputLines, $exitCode);

        return [$exitCode, implode("\n", $outputLines)];
    }
}
