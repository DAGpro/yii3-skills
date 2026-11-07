<?php

declare(strict_types=1);

namespace App\User\Console;

use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Yii\Console\ExitCode;

#[AsCommand(name: 'user:import', description: 'Imports users from a CSV file (columns: email,name).')]
final class ImportUsersCommand extends Command
{
    public function __construct(private readonly ConnectionInterface $db)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('file', InputArgument::REQUIRED, 'Path to the CSV file');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $file = (string) $input->getArgument('file');
        $handle = fopen($file, 'rb');
        if ($handle === false) {
            $io->error("Cannot open file: $file");
            return ExitCode::DATAERR;
        }
        while (($row = fgetcsv($handle)) !== false) {
            [$email, $name] = $row;
            $this->db->createCommand()->insert('{{%user}}', ['email' => $email, 'name' => $name])->execute();
        }
        fclose($handle);
        $io->success('Users imported.');
        return ExitCode::OK;
    }
}
