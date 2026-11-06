<?php

declare(strict_types=1);

namespace App\Console;

use App\Blog\Application\RecountViews;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Yiisoft\Yii\Console\ExitCode;

#[AsCommand(
    name: 'blog:recount',
    description: 'Recount view counters for all posts.',
)]
final readonly class BlogRecountCommand extends Command
{
    public function __construct(private RecountViews $recount) {}

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $count = ($this->recount)();
        $output->writeln("Recounted <info>{$count}</info> posts.");

        return ExitCode::OK;
    }
}
