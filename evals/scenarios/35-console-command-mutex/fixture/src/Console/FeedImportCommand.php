<?php

declare(strict_types=1);

namespace App\Console;

use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Yiisoft\Yii\Console\ExitCode;

/**
 * Imports the remote product feed into the local catalog.
 */
#[AsCommand(
    name: 'feed:import',
    description: 'Import the remote product feed into the catalog.',
)]
final readonly class FeedImportCommand extends Command
{
    // cron runs this every minute
    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $imported = $this->importFeed();
        $output->writeln("Imported <info>{$imported}</info> feed items.");

        return ExitCode::OK;
    }

    private function importFeed(): int
    {
        // Stub: the real implementation fetches the remote feed and upserts catalog rows.
        return 128;
    }
}
