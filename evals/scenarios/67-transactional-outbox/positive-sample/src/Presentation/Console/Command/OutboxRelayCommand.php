<?php

declare(strict_types=1);

namespace App\Presentation\Console\Command;

use App\Infrastructure\Outbox\OutboxRelayService;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Yiisoft\Di\StateResetter;
use Yiisoft\Yii\Console\ExitCode;

use function sleep;

#[AsCommand(
    name: 'outbox:relay',
    description: 'Publishes due transactional outbox messages to the queue.',
)]
final class OutboxRelayCommand extends Command
{
    public function __construct(
        private readonly OutboxRelayService $relay,
        private readonly StateResetter $stateResetter,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('limit', 'l', InputOption::VALUE_REQUIRED, 'Batch size per poll iteration.', 100)
            ->addOption('once', null, InputOption::VALUE_NONE, 'Process one batch and exit.')
            ->addOption('sleep', null, InputOption::VALUE_REQUIRED, 'Seconds to sleep when idle.', 2);
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $limit = max(1, (int) $input->getOption('limit'));
        $sleepSeconds = max(1, (int) $input->getOption('sleep'));
        $once = (bool) $input->getOption('once');

        do {
            $published = $this->relay->relayPending($limit);
            $this->stateResetter->reset();

            if ($once) {
                $io->success("Relayed {$published} outbox message(s).");
                return ExitCode::OK;
            }

            if ($published === 0) {
                sleep($sleepSeconds);
            }
        } while (true);
    }
}
