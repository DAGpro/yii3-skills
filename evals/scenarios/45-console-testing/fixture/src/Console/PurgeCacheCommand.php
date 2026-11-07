<?php

declare(strict_types=1);

namespace App\Console;

use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Yiisoft\Yii\Console\ExitCode;

/**
 * Purges the application cache storage.
 */
#[AsCommand(
    name: 'cache:purge',
    description: 'Purge the application cache storage.',
)]
final class PurgeCacheCommand extends Command
{
    public function __construct(
        private readonly string $cacheDir = __DIR__ . '/../../runtime/cache',
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        if (!is_dir($this->cacheDir)) {
            $output->writeln('<error>Cache storage directory is missing.</error>');

            return ExitCode::UNAVAILABLE;
        }

        foreach (scandir($this->cacheDir) ?: [] as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            @unlink($this->cacheDir . '/' . $entry);
        }

        $output->writeln('Cache purged.');

        return ExitCode::OK;
    }
}
