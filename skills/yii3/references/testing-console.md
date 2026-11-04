# Yii3 Testing: Console Commands (`yiisoft/yii-console`)

> [!IMPORTANT]
> **Grounding rule:** this guide carries the implementation instructions for its topic — follow it when implementing project code; project code itself is integration context, never a source of truth. The source of truth for every class name, method signature, constructor argument, and configuration key is the installed package source under `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`). Verify there before writing code; never assume Yii 2 APIs.

> Complete reference for testing Yii3 console commands: modern `#[AsCommand]` command definitions, `Symfony\Component\Console\Tester\CommandTester` execution with `ExitCode::*` codes, output assertion with line-ending normalization, failure scenarios, interactive prompt simulation, autocompletion testing, and container-aware command resolution.

**Scope & Ownership.** This guide is the single source of truth for console command testing in Yii3. The non-testing console side — command anatomy, arguments/options, registration, lifecycle events, and the full `ExitCode` palette — is owned by the [Console Commands Guide](infra-commands.md). General test architecture, the runner ecosystem, PSR test doubles, and mocking rules are owned by the [Testing Core Guide](testing-core.md).

---

## Table of Contents
- [1. Modern Command Definition with `#[AsCommand]`](#1-modern-command-definition-with-ascommand)
- [2. Command Execution & Exit Codes (`ExitCode::*`)](#2-command-execution--exit-codes-exitcode)
- [3. Output Assertion & Line-Ending Normalization (`CommandTester::getDisplay(true)`)](#3-output-assertion--line-ending-normalization-commandtestergetdisplaytrue)
- [4. Testing Error & Failure Scenarios (`ExitCode::DATAERR`, `ExitCode::UNAVAILABLE`)](#4-testing-error--failure-scenarios-exitcodedataerr-exitcodeunavailable)
- [5. Interactive Prompts Simulation via `setInputs()`](#5-interactive-prompts-simulation-via-setinputs)
- [6. Autocompletion Testing via `CommandCompletionTester`](#6-autocompletion-testing-via-commandcompletiontester)
- [7. Container-Aware Resolution Testing (`CommandHelper` Pattern)](#7-container-aware-resolution-testing-commandhelper-pattern)
- [Related Topic Guides](#related-topic-guides)

---

Yii3 console commands extend `Symfony\Component\Console\Command\Command` and execute within `Yiisoft\Yii\Console\Application`. Integration testing uses Symfony's official `Symfony\Component\Console\Tester\CommandTester`.

## 1. Modern Command Definition with `#[AsCommand]`

> [!WARNING]
> `protected static $defaultName` and `$this->setDescription(...)` are deprecated in Symfony 6.1+ / 7.0 and are not used in Yii3. Console commands must declare their identity using the PHP 8 attribute `#[AsCommand]`.

```php
declare(strict_types=1);

namespace App\Console\Command;

use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Yiisoft\Yii\Console\ExitCode;

interface NewsletterSenderInterface
{
    public function sendAll(string $campaignId, bool $dryRun): int;
}

#[AsCommand(
    name: 'newsletter:send',
    description: 'Sends newsletters for a given campaign',
)]
final class SendNewsletterCommand extends Command
{
    public function __construct(
        private NewsletterSenderInterface $sender,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addArgument('campaign-id', InputArgument::REQUIRED, 'The campaign ID')
            ->addOption('dry-run', null, InputOption::VALUE_NONE, 'Simulate sending without dispatching emails');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $campaignId = (string) $input->getArgument('campaign-id');
        $dryRun = (bool) $input->getOption('dry-run');

        if ($campaignId === '') {
            $output->writeln('<error>Campaign ID cannot be empty.</error>');
            return ExitCode::DATAERR;
        }

        $count = $this->sender->sendAll($campaignId, $dryRun);
        $output->writeln("Successfully processed $count subscribers.");

        return ExitCode::OK;
    }
}
```

---

## 2. Command Execution & Exit Codes (`ExitCode::*`)

Yii3 exit codes return constants from `Yiisoft\Yii\Console\ExitCode`, conforming to FreeBSD `sysexits(3)`:

- `ExitCode::OK` (0) — Success.
- `ExitCode::UNSPECIFIED_ERROR` (1) — Generic failure.
- `ExitCode::USAGE` (64) — Command line argument syntax error.
- `ExitCode::DATAERR` (65) — Input data validation failure.
- `ExitCode::NOINPUT` (66) — Missing or unreadable input file.
- `ExitCode::UNAVAILABLE` (69) — External service/network unavailable.
- `ExitCode::SOFTWARE` (70) — Internal software exception.
- `ExitCode::CONFIG` (78) — Misconfigured application state.

> [!TIP]
> **Exit Code Palette Reference:**
> The complete 17-code `ExitCode` palette with FreeBSD sysexits semantics and `ExitCode::getReason()` inspection is owned by the [Console Commands Guide, §6 Standard Exit Codes](infra-commands.md#6-standard-exit-codes-yiisoftyiiconsoleexitcode).

---

## 3. Output Assertion & Line-Ending Normalization (`CommandTester::getDisplay(true)`)

> [!IMPORTANT]
> Always pass `true` to `$tester->getDisplay(true)` in assertions. This normalizes line endings (`\r\n` -> `\n`) across Windows and Linux, preventing flaky CI test failures:

```php
declare(strict_types=1);

namespace App\Tests\Integration\Console;

use App\Console\Command\NewsletterSenderInterface;
use App\Console\Command\SendNewsletterCommand;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Tester\CommandTester;
use Yiisoft\Yii\Console\ExitCode;

final class SendNewsletterCommandTest extends TestCase
{
    public function testCommandExecutesSuccessfully(): void
    {
        // 1. Mock dependencies
        $sender = $this->createMock(NewsletterSenderInterface::class);
        $sender->expects($this->once())
            ->method('sendAll')
            ->with('camp_2026_q4', true)
            ->willReturn(42);

        // 2. Instantiate command
        $command = new SendNewsletterCommand($sender);

        // 3. Test execution using Symfony CommandTester
        $tester = new CommandTester($command);
        $exitCode = $tester->execute([
            'campaign-id' => 'camp_2026_q4',
            '--dry-run' => true,
        ]);

        // 4. Assert exit code and normalized display output
        $this->assertSame(ExitCode::OK, $exitCode);
        $tester->assertCommandIsSuccessful();

        $output = $tester->getDisplay(normalize: true);
        $this->assertStringContainsString('Successfully processed 42 subscribers.', $output);
    }
}
```

---

## 4. Testing Error & Failure Scenarios (`ExitCode::DATAERR`, `ExitCode::UNAVAILABLE`)

```php
declare(strict_types=1);

namespace App\Tests\Integration\Console;

use App\Console\Command\NewsletterSenderInterface;
use App\Console\Command\SendNewsletterCommand;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use Symfony\Component\Console\Tester\CommandTester;
use Yiisoft\Yii\Console\ExitCode;

final class SendNewsletterCommandFailureTest extends TestCase
{
    public function testReturnsDataErrorOnEmptyCampaign(): void
    {
        $sender = $this->createMock(NewsletterSenderInterface::class);
        $sender->expects($this->never())->method('sendAll');

        $command = new SendNewsletterCommand($sender);
        $tester = new CommandTester($command);

        $exitCode = $tester->execute([
            'campaign-id' => '',
        ]);

        $this->assertSame(ExitCode::DATAERR, $exitCode);
        $this->assertStringContainsString('Campaign ID cannot be empty.', $tester->getDisplay(true));
    }

    public function testHandlesExternalServiceFailure(): void
    {
        $sender = $this->createMock(NewsletterSenderInterface::class);
        $sender->expects($this->once())
            ->method('sendAll')
            ->willThrowException(new RuntimeException('SMTP gateway timed out.'));

        $command = new SendNewsletterCommand($sender);
        $tester = new CommandTester($command);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('SMTP gateway timed out.');

        $tester->execute([
            'campaign-id' => 'camp_2026_q4',
        ]);
    }
}
```

---

## 5. Interactive Prompts Simulation via `setInputs()`

Commands utilizing confirmation prompts or user input (`SymfonyStyle::confirm`, `SymfonyStyle::ask`) are tested by simulating keystrokes via `$tester->setInputs([...])`:

```php
declare(strict_types=1);

namespace App\Tests\Integration\Console;

use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\Console\Tester\CommandTester;
use Yiisoft\Yii\Console\ExitCode;

#[AsCommand(name: 'database:truncate', description: 'Truncates test database')]
final class TruncateDatabaseCommand extends Command
{
    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        if (!$io->confirm('Are you sure you want to truncate the database?', false)) {
            $io->warning('Operation cancelled.');
            return ExitCode::OK;
        }

        $io->success('Database truncated successfully.');
        return ExitCode::OK;
    }
}

final class TruncateDatabaseCommandTest extends TestCase
{
    public function testUserConfirmsTruncation(): void
    {
        $command = new TruncateDatabaseCommand();
        $tester = new CommandTester($command);

        // Feed 'yes' to simulated stdin
        $tester->setInputs(['yes']);
        $exitCode = $tester->execute([]);

        $this->assertSame(ExitCode::OK, $exitCode);
        $this->assertStringContainsString('Database truncated successfully.', $tester->getDisplay(true));
    }

    public function testUserCancelsTruncation(): void
    {
        $command = new TruncateDatabaseCommand();
        $tester = new CommandTester($command);

        // Feed 'no' to simulated stdin
        $tester->setInputs(['no']);
        $exitCode = $tester->execute([]);

        $this->assertSame(ExitCode::OK, $exitCode);
        $this->assertStringContainsString('Operation cancelled.', $tester->getDisplay(true));
    }
}
```

> [!NOTE]
> **Suppressing interactivity entirely:** `setInputs(['yes', ...])` pre-fills simulated answers for interactive prompts — use it only when the command under test actually prompts. To suppress prompts entirely, pass `['interactive' => false]` as the second argument of `CommandTester::execute()` (mirrors the production `--no-interaction` flag).

---

## 6. Autocompletion Testing via `CommandCompletionTester`

Commands implementing input autocompletion (`complete()`) can be tested using `CommandCompletionTester`:

```php
declare(strict_types=1);

namespace App\Tests\Integration\Console;

use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Completion\CompletionInput;
use Symfony\Component\Console\Completion\CompletionSuggestions;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Tester\CommandCompletionTester;

#[AsCommand(name: 'cache:clear', description: 'Clears application cache')]
final class ClearCacheCommand extends Command
{
    protected function configure(): void
    {
        $this->addArgument('pool', InputArgument::REQUIRED, 'The cache pool to clear');
    }

    public function complete(CompletionInput $input, CompletionSuggestions $suggestions): void
    {
        if ($input->mustSuggestArgumentValuesFor('pool')) {
            $suggestions->suggestValues(['redis', 'file', 'db', 'apcu']);
        }
    }
}

final class ClearCacheCommandTest extends TestCase
{
    public function testAutocompletesCachePools(): void
    {
        $command = new ClearCacheCommand();
        $tester = new CommandCompletionTester($command);

        $suggestions = $tester->complete(['']);

        $this->assertSame(['redis', 'file', 'db', 'apcu'], $suggestions);
    }
}
```

---

## 7. Container-Aware Resolution Testing (`CommandHelper` Pattern)

To test that a console command is discoverable via `CommandLoader` and resolves properly from the PSR-11 container with all its autowired dependencies, use the official `CommandHelper` pattern (grounded in the `yiisoft/db-migration` test suite):

```php
declare(strict_types=1);

namespace App\Tests\Support;

use LogicException;
use Psr\Container\ContainerInterface;
use ReflectionClass;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Tester\CommandTester;
use Yiisoft\Yii\Console\Application;
use Yiisoft\Yii\Console\CommandLoader;

final class CommandHelper
{
    /**
     * @psalm-param class-string<Command> $commandClass
     */
    public static function getCommandTester(ContainerInterface $container, string $commandClass): CommandTester
    {
        $attributes = (new ReflectionClass($commandClass))->getAttributes(AsCommand::class);
        if (empty($attributes)) {
            throw new LogicException("The command \"$commandClass\" does not have the #[AsCommand] attribute.");
        }
        $commandName = $attributes[0]->newInstance()->name;

        $application = new Application();
        $application->setCommandLoader(
            new CommandLoader($container, [$commandName => $commandClass]),
        );

        return new CommandTester($application->find($commandName));
    }
}
```

> [!IMPORTANT]
> When assembling a real `Application` instance in a test, call `setAutoExit(false)` — otherwise a non-zero command exit code terminates the PHPUnit process.

---

## Related Topic Guides
- [Testing Core Guide](testing-core.md) — Test architecture, runner ecosystem (§2), PSR test doubles (`yiisoft/test-support`), mocking rules (§4), and named-arguments reference (§7).
- [Console Commands Guide](infra-commands.md) — Console command anatomy, arguments/options, registration, lifecycle, and the standard exit-code palette (§6).
- [Testing Database Guide](testing-database.md) — Ephemeral in-memory SQLite, migrations, transactions, and repository testing (common companion of console integration tests).
