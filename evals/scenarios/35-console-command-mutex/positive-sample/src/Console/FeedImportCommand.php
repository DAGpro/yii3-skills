<?php

declare(strict_types=1);

namespace App\Console;

use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Yiisoft\Mutex\MutexFactoryInterface;
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
    public function __construct(private MutexFactoryInterface $mutexFactory) {}

    // cron runs this every minute - a run longer than a minute must not overlap with the next one
    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        // Named lock: only one import may run at a time across overlapping cron runs.
        $mutex = $this->mutexFactory->create('app.feed_import');

        if (!$mutex->acquire(timeout: 30)) {
            $output->writeln('<error>Another feed import is already running - this run was skipped.</error>');

            return ExitCode::UNAVAILABLE;
        }

        try {
            $imported = $this->importFeed();
            $output->writeln("Imported <info>{$imported}</info> feed items.");
        } finally {
            $mutex->release();
        }

        return ExitCode::OK;
    }

    private function importFeed(): int
    {
        // Stub: the real implementation fetches the remote feed and upserts catalog rows.
        return 128;
    }
}
