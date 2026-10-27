# Yii3 Console Commands Guide

> Practical guide and implementation recipes for CLI commands, interactive terminal UX, lazy registration, argument parsing, error handling, and automated testing using `yiisoft/yii-console`, `yiisoft/yii-runner-console`, and `symfony/console`.

---

## Table of Contents
- [1. Console Architecture & Presentation Layer Principle](#1-console-architecture--presentation-layer-principle)
- [2. Command Class Anatomy & Constructor Injection](#2-command-class-anatomy--constructor-injection)
- [3. Arguments & Options Specification](#3-arguments--options-specification)
- [4. Configuration & Lazy Command Registration](#4-configuration--lazy-command-registration)
- [5. Interactive Terminal UX with SymfonyStyle](#5-interactive-terminal-ux-with-symfonystyle)
- [6. Standard Exit Codes (Yiisoft\Yii\Console\ExitCode)](#6-standard-exit-codes-yiisoftyiiconsoleexitcode)
- [7. Friendly Exceptions & Global Error Handling](#7-friendly-exceptions--global-error-handling)
- [8. Testing Console Commands (CommandTester)](#8-testing-console-commands-commandtester)
- [9. Built-in Ecosystem Commands](#9-built-in-ecosystem-commands)
- [10. Anti-Pattern Matrix](#10-anti-pattern-matrix)
- [11. Related Topic Guides](#11-related-topic-guides)

---

## 1. Console Architecture & Presentation Layer Principle

In Yii3, console commands are first-class citizens of the **Presentation Layer**, occupying the exact same architectural boundary as HTTP Controllers and Actions. They translate incoming CLI input (arguments and options) into domain calls, format responses for terminal display, and return structured integer exit codes.

```
CLI Invocation (`./yii user:create admin@example.com "Super Admin" --role=admin`)
       │
       ▼
ConsoleApplicationRunner (`Yiisoft\Yii\Runner\Console\ConsoleApplicationRunner`)
       │ Boots DI container, merges params-console, di-console, events-console
       ▼
Application (`Yiisoft\Yii\Console\Application` extends Symfony Console Application)
       │ Dispatches `Yiisoft\Yii\Console\Event\ApplicationStartup`
       ▼
CommandLoader (`Yiisoft\Yii\Console\CommandLoader` implements CommandLoaderInterface)
       │ Lazy-resolves command instance from PSR-11 Container only upon execution
       ▼
Command (`Symfony\Component\Console\Command\Command`)
       │ 1. Parses & validates CLI input ($input->getArgument(), $input->getOption())
       │ 2. Prompts interactive input ($io->ask(), $io->confirm()) if interactive
       │ 3. Delegates business logic to Application Use Case / Handler DTO
       ▼
Application Layer (Use Case / Domain Service / Command Handler)
       │ Executes domain logic, business validations, persistence transactions
       ▼
Command Presentation Return
       │ 1. Renders visual feedback ($io->success(), $io->table(), $io->error())
       │ 2. Returns standard integer exit code (`Yiisoft\Yii\Console\ExitCode`)
       ▼
Application Shutdown
       │ Dispatches `Yiisoft\Yii\Console\Event\ApplicationShutdown`
       ▼
Operating System Process Exit ($exitCode)
```

### Layer Responsibilities

| Permitted in Commands (Presentation) | Strictly Forbidden in Commands (Domain Leaks) |
|---|---|
| Parse CLI arguments, options, and environmental flags | ❌ Direct SQL queries, Cycle ORM or persistence layer calls |
| Interactive user confirmation, secret inputs, choice prompts | ❌ Database transaction management (`$db->transaction()`) |
| Syntax validation and argument type coercion | ❌ Business rules, domain invariants, core calculations |
| Progress bars, status spinners, formatted tables, listings | ❌ Calling `exit()` or `die()` directly (skips events & runners) |
| Invoking Application Use Cases / CQRS Command Handlers | ❌ Direct `echo`, `print`, or raw unbuffered terminal writes |
| Translating domain exceptions into friendly CLI error messages | ❌ Hardcoding raw magic integers as exit codes (e.g. `return 1;`) |

### Console Lifecycle Events

Yii3 console dispatches explicit lifecycle events during execution:
1. `Yiisoft\Yii\Console\Event\ApplicationStartup`: Dispatched before running the resolved command. Carries `public ?string $commandName = null` containing the primary command token from CLI input.
2. `Yiisoft\Yii\Console\Event\ApplicationShutdown`: Dispatched in the `finally` block of `ConsoleApplicationRunner`. Carries `getExitCode(): int` before the PHP process exits.
3. Symfony Console Events: Standard Symfony events (`ConsoleCommandEvent`, `ConsoleErrorEvent`, `ConsoleTerminateEvent`) are bridged to the PSR-14 event dispatcher via `Yiisoft\Yii\Console\SymfonyEventDispatcher`.

---

## 2. Command Class Anatomy & Constructor Injection

Yii3 console commands extend `Symfony\Component\Console\Command\Command`. All dependencies and application services must be declared in the constructor and injected through the PSR-11 DI container.

> [!IMPORTANT]
> **Mandatory Parent Constructor Call:**
> In Symfony Console and Yii3, command constructors **must** invoke `parent::__construct()`. Failing to call `parent::__construct()` leaves the underlying command definition, helper set, and input definition uninitialized, causing fatal runtime crashes.

### Zero-Shot Compilable Domain & Use Case Companion Classes

To ensure clean architecture and testability, commands delegate all business logic to dedicated application handlers:

```php
declare(strict_types=1);

namespace App\Domain\User\Exception;

use RuntimeException;

final class UserAlreadyExistsException extends RuntimeException
{
}
```

```php
declare(strict_types=1);

namespace App\Application\UseCase\User\Create;

final readonly class CreateUserDto
{
    public function __construct(
        public string $email,
        public string $name,
        public string $role = 'user',
        public bool $sendWelcome = true,
    ) {
    }
}
```

```php
declare(strict_types=1);

namespace App\Application\UseCase\User\Create;

final readonly class CreateUserResult
{
    public function __construct(
        private string $id,
        private string $name,
    ) {
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }
}
```

```php
declare(strict_types=1);

namespace App\Application\UseCase\User\Create;

use App\Domain\User\Exception\UserAlreadyExistsException;

final class CreateUserHandler
{
    public function handle(CreateUserDto $dto): CreateUserResult
    {
        if ($dto->email === 'existing@example.com') {
            throw new UserAlreadyExistsException('User with this email already exists.');
        }

        // Domain logic, persistence, and event dispatching belong here
        return new CreateUserResult(
            id: 'usr_' . bin2hex(random_bytes(8)),
            name: $dto->name,
        );
    }
}
```

### Zero-Shot Compilable Command Example

```php
declare(strict_types=1);

namespace App\Presentation\Console\Command;

use App\Application\UseCase\User\Create\CreateUserDto;
use App\Application\UseCase\User\Create\CreateUserHandler;
use App\Domain\User\Exception\UserAlreadyExistsException;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Completion\CompletionInput;
use Symfony\Component\Console\Completion\CompletionSuggestions;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Throwable;
use Yiisoft\FriendlyException\FriendlyExceptionInterface;
use Yiisoft\Yii\Console\ExitCode;

#[AsCommand(
    name: 'user:create',
    description: 'Creates a new user account with assigned role and status.',
)]
final class CreateUserCommand extends Command
{
    public function __construct(
        private readonly CreateUserHandler $handler,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->setHelp(
                <<<'HELP'
                The <info>user:create</info> command provisions a new system user:
                  <comment>./yii user:create user@example.com "John Doe" --role=admin</comment>

                To skip welcome notification delivery:
                  <comment>./yii user:create user@example.com "John Doe" --no-welcome</comment>
                HELP,
            )
            ->addArgument(
                name: 'email',
                mode: InputArgument::REQUIRED,
                description: 'The unique email address of the user.',
            )
            ->addArgument(
                name: 'name',
                mode: InputArgument::REQUIRED,
                description: 'The full display name of the user.',
            )
            ->addOption(
                name: 'role',
                shortcut: 'r',
                mode: InputOption::VALUE_OPTIONAL,
                description: 'User access role (admin, manager, user).',
                default: 'user',
            )
            ->addOption(
                name: 'no-welcome',
                shortcut: null,
                mode: InputOption::VALUE_NONE,
                description: 'Suppress sending the welcome email to the user.',
            );
    }

    /**
     * Provides dynamic shell auto-completion suggestions for arguments and options.
     */
    public function complete(CompletionInput $input, CompletionSuggestions $suggestions): void
    {
        if ($input->mustSuggestOptionValuesFor('role')) {
            $suggestions->suggestValues(['admin', 'manager', 'user']);
        }
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        /** @var string $email */
        $email = $input->getArgument('email');
        /** @var string $name */
        $name = $input->getArgument('name');
        /** @var string $role */
        $role = (string) ($input->getOption('role') ?? 'user');
        $sendWelcome = !$input->getOption('no-welcome');

        $io->title('Provisioning User Account');
        $io->text(sprintf('Email: <info>%s</info> | Name: <info>%s</info> | Role: <comment>%s</comment>', $email, $name, $role));

        // Basic syntax/input verification before invoking application domain
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $io->error(sprintf('Invalid email format: "%s".', $email));
            return ExitCode::DATAERR;
        }

        try {
            $dto = new CreateUserDto(
                email: $email,
                name: $name,
                role: $role,
                sendWelcome: $sendWelcome,
            );

            $result = $this->handler->handle($dto);

            $io->success(sprintf(
                'User "%s" created successfully (ID: %s).',
                $result->getName(),
                $result->getId(),
            ));

            return ExitCode::OK;
        } catch (UserAlreadyExistsException $e) {
            $io->error($e->getMessage());
            return ExitCode::DATAERR;
        } catch (FriendlyExceptionInterface $e) {
            $io->error($e->getName());
            if ($e->getSolution() !== null) {
                $io->note($e->getSolution());
            }
            return ExitCode::UNSPECIFIED_ERROR;
        } catch (Throwable $e) {
            $io->error('Failed to create user account: ' . $e->getMessage());
            if ($output->isVerbose()) {
                $io->text($e->getTraceAsString());
            }
            return ExitCode::UNSPECIFIED_ERROR;
        }
    }
}
```

---

## 3. Arguments & Options Specification

Arguments and options define the command line interface contract.

### 3.1. Input Arguments (`InputArgument`)

Method signature:
```php
public function addArgument(
    string $name,
    ?int $mode = null,
    string $description = '',
    mixed $default = null,
): static
```

| Mode Constant | Value | Description |
|---|---|---|
| `InputArgument::REQUIRED` | `1` | Must be provided by the caller; throws runtime error if omitted. |
| `InputArgument::OPTIONAL` | `2` | Optional value; falls back to `$default` when omitted. |
| `InputArgument::IS_ARRAY` | `4` | Accepts multiple space-separated trailing arguments (returns `array<string>`). |
| `InputArgument::OPTIONAL \| InputArgument::IS_ARRAY` | `6` | Optional array of arguments (e.g. `files...`). |
| `InputArgument::REQUIRED \| InputArgument::IS_ARRAY` | `5` | Required array: must provide at least one item, accepts multiple. |

```php
$this
    ->addArgument(
        name: 'target',
        mode: InputArgument::REQUIRED,
        description: 'Primary deployment target environment.',
    )
    ->addArgument(
        name: 'services',
        mode: InputArgument::IS_ARRAY | InputArgument::OPTIONAL,
        description: 'Specific microservices to deploy (leave empty for all).',
        default: [],
    );
```

### 3.2. Input Options (`InputOption`)

Method signature:
```php
public function addOption(
    string $name,
    string|array|null $shortcut = null,
    ?int $mode = null,
    string $description = '',
    mixed $default = null,
): static
```

| Mode Constant | Value | Description | CLI Usage Example |
|---|---|---|---|
| `InputOption::VALUE_NONE` | `1` | Boolean flag. Returns `true` if passed, `false` otherwise. | `--force`, `-f` |
| `InputOption::VALUE_REQUIRED` | `2` | Must receive a value when option is specified. | `--limit=50`, `-l 50` |
| `InputOption::VALUE_OPTIONAL` | `4` | Option may or may not have an explicit value. | `--output` or `--output=json` |
| `InputOption::VALUE_IS_ARRAY` | `8` | Can be specified multiple times; values gathered into an array. | `--tag=v1 --tag=v2` |
| `InputOption::VALUE_NEGATABLE` | `16` | Generates both `--foo` and `--no-foo` toggles automatically. | `--ansi` / `--no-ansi` |

```php
$this
    ->addOption(
        name: 'dry-run',
        shortcut: 'd',
        mode: InputOption::VALUE_NONE,
        description: 'Simulate changes without persisting to the database.',
    )
    ->addOption(
        name: 'batch-size',
        shortcut: 'b',
        mode: InputOption::VALUE_REQUIRED,
        description: 'Number of records processed per transaction chunk.',
        default: 100,
    )
    ->addOption(
        name: 'exclude',
        shortcut: 'x',
        mode: InputOption::VALUE_IS_ARRAY | InputOption::VALUE_REQUIRED,
        description: 'Exclude specific service keys from synchronization.',
        default: [],
    )
    ->addOption(
        name: 'notifications',
        shortcut: null,
        mode: InputOption::VALUE_NEGATABLE,
        description: 'Enable or disable outbound notifications (--notifications / --no-notifications).',
        default: true,
    );
```

### 3.3. Dynamic Shell Auto-Completion (`complete()`)

Override `complete()` to suggest dynamic values for bash/zsh auto-completion:

```php
public function complete(CompletionInput $input, CompletionSuggestions $suggestions): void
{
    if ($input->mustSuggestArgumentValuesFor('target')) {
        $suggestions->suggestValues(['production', 'staging', 'development']);
        return;
    }

    if ($input->mustSuggestOptionValuesFor('role')) {
        $suggestions->suggestValues(['admin', 'manager', 'user']);
    }
}
```

---

## 4. Configuration & Lazy Command Registration

Yii3 avoids instantiating all command classes on every CLI launch. Commands are registered in configuration parameters and loaded on demand by `Yiisoft\Yii\Console\CommandLoader`.

### 4.1. Configuration Syntax (`config/console/params.php`)

In the official application templates, commands are registered in `config/console/params.php`. The
`yiisoft/yii-console` package itself ships its defaults in a `params-console.php` config group
(merged automatically by `yiisoft/config`) — override in the application's `config/console/params.php`,
not in `vendor/`.

Commands are configured under the `'yiisoft/yii-console' => ['commands' => [...]]` key:

```php
declare(strict_types=1);

use App\Presentation\Console\Command\CleanCacheCommand;
use App\Presentation\Console\Command\CreateUserCommand;
use App\Presentation\Console\Command\ListUsersCommand;
use App\Presentation\Console\Command\SecretSyncCommand;

return [
    'yiisoft/yii-console' => [
        'commands' => [
            // Standard single command
            'user:create' => CreateUserCommand::class,

            // Command with multiple aliases (pipe-separated)
            'user:list|ul|u:l' => ListUsersCommand::class,

            // Hidden command (prefixed with '|' - hidden from `./yii list`)
            '|cache:clean' => CleanCacheCommand::class,

            // Hidden command with alias
            '|secret:sync|ss' => SecretSyncCommand::class,
        ],
    ],
];
```

### 4.2. How `CommandLoader` Resolves Commands

The `Yiisoft\Yii\Console\CommandLoader` handles lazy loading:
1. **Description extraction without instantiation:** It inspects the `#[AsCommand]` attribute on the command class so that `./yii list` displays command descriptions without resolving command constructor dependencies from the DI container.
2. **Name and aliases priority:** The command name, aliases, and hidden status defined in the `commands` array configuration **always override** names specified in the PHP class attribute.
3. **Lazy instantiation:** The PSR-11 container only instantiates the command class when the user actually invokes that specific command.

> [!WARNING]
> **Avoid Eager Instantiation Pitfall:**
> Always annotate your Command class with `#[AsCommand(description: '...')]`. If a command class lacks both `#[AsCommand]` description and legacy `getDefaultDescription()`, `CommandLoader` cannot construct a `Symfony\Component\Console\Command\LazyCommand`. It falls back to eagerly instantiating your command class immediately during `./yii list`, loading all injected database and network services prematurely.

> [!TIP]
> Keep the `name` in `#[AsCommand(name: 'user:create')]` identical to the primary array key in `commands` configuration to prevent discrepancies across tools and static analyzers.

### 4.3. Console Application Entry Point (`./yii`)

In Yii3 applications, the CLI entry point runs via `Yiisoft\Yii\Runner\Console\ConsoleApplicationRunner`:

```php
#!/usr/bin/env php
<?php

declare(strict_types=1);

use Yiisoft\Yii\Runner\Console\ConsoleApplicationRunner;

require_once __DIR__ . '/autoload.php';

$runner = new ConsoleApplicationRunner(
    rootPath: __DIR__,
    debug: (bool) ($_ENV['YII_DEBUG'] ?? false),
    checkEvents: (bool) ($_ENV['YII_DEBUG'] ?? false),
    environment: $_ENV['YII_ENV'] ?? null,
);
$runner->run();
```

Executing commands via CLI:
```bash
./yii user:create admin@example.com "Super Admin" --role=admin
```

> [!NOTE]
> `Yiisoft\Yii\Console\Application` automatically registers a built-in `--config` option (`di-console.php`), allowing you to switch configuration environments at runtime:
> ```bash
> ./yii --config=testing user:create test@example.com "Tester"
> ```

---

## 5. Interactive Terminal UX with `SymfonyStyle`

Always encapsulate `$input` and `$output` inside `Symfony\Component\Console\Style\SymfonyStyle`. It guarantees consistent colors, proper line wrapping, and standard formatting across varying terminal environments.

```php
$io = new SymfonyStyle($input, $output);
```

### 5.1. Banners, Headings & Text Formatting

```php
// Headings and sections
$io->title('User Maintenance & Catalog Sync');
$io->section('Phase 1: Validating Remote Endpoints');

// Informational blocks
$io->text('Starting background catalog fetch from vendor upstream.');
$io->comment('API latency: 120ms.');

// Status banners
$io->success('Catalog synchronized successfully.');
$io->warning('3 product images failed to download.');
$io->error('Database connection timed out.');
$io->note('Run with --verbose for detailed payload dumps.');
$io->caution('This operation cannot be undone.');

// Spacing
$io->newLine(2);
```

### 5.2. Tables & Structured Listings

```php
// Render aligned ASCII table
$io->table(
    headers: ['ID', 'Email', 'Role', 'Status', 'Created At'],
    rows: [
        ['1', 'admin@example.com', 'admin', '<fg=green>Active</>', '2026-01-15'],
        ['2', 'manager@example.com', 'manager', '<fg=green>Active</>', '2026-02-01'],
        ['3', 'guest@example.com', 'user', '<fg=yellow>Pending</>', '2026-03-10'],
    ],
);

// Bulleted listing
$io->listing([
    'Step 1: Verified token permissions',
    'Step 2: Cleaned orphaned schema records',
    'Step 3: Rebuilt search indexes',
]);
```

### 5.3. Interactive Prompts & Questions

> [!WARNING]
> **Non-Interactive CI Safety:**
> Always verify `$input->isInteractive()` or provide default values for unattended environments (Cron, Docker entrypoints, CI/CD pipelines). In automated runs, interactive prompts either block indefinitely or throw exceptions.

```php
// Standard text prompt
$username = $io->ask(
    question: 'Enter username',
    default: 'guest',
    validator: static function (?string $value): string {
        if (empty($value) || strlen($value) < 3) {
            throw new \RuntimeException('Username must be at least 3 characters.');
        }
        return $value;
    },
);

// Hidden input for sensitive data (passwords, secret API tokens)
$secretKey = $io->askHidden(
    question: 'Enter API Secret Key:',
    validator: static function (?string $value): string {
        if (empty($value)) {
            throw new \RuntimeException('Secret key cannot be empty.');
        }
        return $value;
    },
);

// Confirmation prompt (yes/no)
$confirmed = $io->confirm(
    question: 'Do you want to truncate the audit log table?',
    default: false,
);

if (!$confirmed) {
    $io->warning('Operation aborted by user.');
    return ExitCode::OK;
}

// Choice selection
$environment = $io->choice(
    question: 'Select deployment target',
    choices: ['staging', 'production', 'testing'],
    default: 'staging',
);
```

### 5.4. Progress Bars for Batch Processing

For long-running tasks, render progress bars to prevent perceived freezing.

#### Simple Progress Tracking
```php
$io->progressStart(count($items));

foreach ($items as $item) {
    $this->processor->process($item);
    $io->progressAdvance();
}

$io->progressFinish();
$io->newLine();
$io->success('All items processed successfully.');
```

#### Detailed Progress Bar with Verbose Formatting
```php
$progressBar = $io->createProgressBar(count($records));
$progressBar->setFormat(' %current%/%max% [%bar%] %percent:3s%% (%elapsed:6s%/%estimated:-6s%) %memory:6s% -- %message%');
$progressBar->setMessage('Initializing batch...');
$progressBar->start();

foreach ($records as $record) {
    $progressBar->setMessage(sprintf('Processing record ID #%d', $record->getId()));
    $this->processor->process($record);
    $progressBar->advance();
}

$progressBar->setMessage('Completed');
$progressBar->finish();
$io->newLine(2);
$io->success('Batch processing finished.');
```

---

## 6. Standard Exit Codes (`Yiisoft\Yii\Console\ExitCode`)

Never return arbitrary magic integers (`return 1;`, `return 2;`) or call `exit()`. Console exit codes follow the FreeBSD `sysexits(3)` standard via `Yiisoft\Yii\Console\ExitCode`.

### ExitCode Constants & Semantics

| Constant | Code | Sysexits Meaning | Recommended Usage in Yii3 |
|---|---|---|---|
| `ExitCode::OK` | `0` | `EX_OK` | Successful termination. |
| `ExitCode::UNSPECIFIED_ERROR` | `1` | `EX__BASE` | Generic unclassified runtime failure. |
| `ExitCode::USAGE` | `64` | `EX_USAGE` | Invalid CLI syntax, wrong number of arguments, illegal option flag. |
| `ExitCode::DATAERR` | `65` | `EX_DATAERR` | Input data format error (e.g. invalid email format, schema parse failure). |
| `ExitCode::NOINPUT` | `66` | `EX_NOINPUT` | Input file missing, corrupted, or unreadable. |
| `ExitCode::NOUSER` | `67` | `EX_NOUSER` | Target user, recipient, or account not found in system. |
| `ExitCode::NOHOST` | `68` | `EX_NOHOST` | Remote host or network endpoint not found. |
| `ExitCode::UNAVAILABLE` | `69` | `EX_UNAVAILABLE` | External service, database, or API dependency unavailable. |
| `ExitCode::SOFTWARE` | `70` | `EX_SOFTWARE` | Internal application software bug or uncaught domain error. |
| `ExitCode::OSERR` | `71` | `EX_OSERR` | Operating system failure (unable to fork, out of file descriptors). |
| `ExitCode::OSFILE` | `72` | `EX_OSFILE` | Critical system configuration file missing or unreadable. |
| `ExitCode::CANTCREAT` | `73` | `EX_CANTCREAT` | Output destination file or directory cannot be created. |
| `ExitCode::IOERR` | `74` | `EX_IOERR` | Physical I/O failure while reading/writing disk files. |
| `ExitCode::TEMPFAIL` | `75` | `EX_TEMPFAIL` | Temporary failure; indicates caller should retry operation later. |
| `ExitCode::PROTOCOL` | `76` | `EX_PROTOCOL` | Protocol exchange error during remote communication. |
| `ExitCode::NOPERM` | `77` | `EX_NOPERM` | Insufficient operating system or domain access permissions. |
| `ExitCode::CONFIG` | `78` | `EX_CONFIG` | Application misconfiguration or invalid parameter settings. |

### Inspecting Exit Reasons
```php
use Yiisoft\Yii\Console\ExitCode;

// Returns human-readable explanation: "Input file not found or unreadable"
$reason = ExitCode::getReason(ExitCode::NOINPUT);
```

---

## 7. Friendly Exceptions & Global Error Handling

Yii3 provides first-class support for `Yiisoft\FriendlyException\FriendlyExceptionInterface`. When a command throws a friendly exception, `Yiisoft\Yii\Console\Application` renders actionable guidance directly to the terminal user.

### 7.1. Implementing a CLI-Friendly Exception

```php
declare(strict_types=1);

namespace App\Domain\User\Exception;

use RuntimeException;
use Yiisoft\FriendlyException\FriendlyExceptionInterface;

final class DatabaseTablesNotMigratedException extends RuntimeException implements FriendlyExceptionInterface
{
    public function getName(): string
    {
        return 'Database Schema Not Initialized';
    }

    public function getSolution(): ?string
    {
        return 'Run "./yii migrate:up" to apply pending database migrations before creating users.';
    }
}
```

When thrown during command execution, `Application` formats:
```
  Database Schema Not Initialized

  ! [NOTE] Run "./yii migrate:up" to apply pending database migrations before creating users.
```

### 7.2. Global Console Error Logging (`ErrorListener`)

`Yiisoft\Yii\Console\ErrorListener` automatically subscribes to `Symfony\Component\Console\Event\ConsoleErrorEvent` in `config/events-console.php`. When a command terminates with an uncaught exception, it logs the failure with full stack traces to the configured PSR-3 logger:

```php
// config/events-console.php
use Symfony\Component\Console\Event\ConsoleErrorEvent;
use Yiisoft\Yii\Console\ErrorListener;

return [
    ConsoleErrorEvent::class => [
        [ErrorListener::class, 'onError'],
    ],
];
```

---

## 8. Testing Console Commands (`CommandTester`)

Console commands must be covered by automated integration tests using `Symfony\Component\Console\Tester\CommandTester`.

### Zero-Shot Compilable Command Test

```php
declare(strict_types=1);

namespace App\Tests\Presentation\Console\Command;

use App\Application\UseCase\User\Create\CreateUserDto;
use App\Application\UseCase\User\Create\CreateUserHandler;
use App\Application\UseCase\User\Create\CreateUserResult;
use App\Domain\User\Exception\UserAlreadyExistsException;
use App\Presentation\Console\Command\CreateUserCommand;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Tester\CommandTester;
use Yiisoft\Yii\Console\ExitCode;

final class CreateUserCommandTest extends TestCase
{
    public function testExecuteSuccessful(): void
    {
        $handler = $this->createMock(CreateUserHandler::class);
        $handler
            ->expects(self::once())
            ->method('handle')
            ->with(self::callback(static function (CreateUserDto $dto): bool {
                return $dto->email === 'admin@example.com'
                    && $dto->name === 'Super Admin'
                    && $dto->role === 'admin'
                    && $dto->sendWelcome === true;
            }))
            ->willReturn(new CreateUserResult(id: 'usr_mock_123', name: 'Super Admin'));

        $command = new CreateUserCommand($handler);
        $tester = new CommandTester($command);

        $exitCode = $tester->execute([
            'email' => 'admin@example.com',
            'name' => 'Super Admin',
            '--role' => 'admin',
        ]);

        self::assertSame(ExitCode::OK, $exitCode);

        $display = $tester->getDisplay();
        self::assertStringContainsString('Provisioning User Account', $display);
        self::assertStringContainsString('User "Super Admin" created successfully (ID: usr_mock_123).', $display);
    }

    public function testExecuteWithInvalidEmailReturnsDataError(): void
    {
        $handler = $this->createMock(CreateUserHandler::class);
        $handler->expects(self::never())->method('handle');

        $command = new CreateUserCommand($handler);
        $tester = new CommandTester($command);

        $exitCode = $tester->execute([
            'email' => 'invalid-email-string',
            'name' => 'John Doe',
        ]);

        self::assertSame(ExitCode::DATAERR, $exitCode);
        self::assertStringContainsString('Invalid email format: "invalid-email-string".', $tester->getDisplay());
    }

    public function testExecuteHandlesDomainExceptionGracefully(): void
    {
        $handler = $this->createMock(CreateUserHandler::class);
        $handler
            ->expects(self::once())
            ->method('handle')
            ->willThrowException(new UserAlreadyExistsException('User with this email already exists.'));

        $command = new CreateUserCommand($handler);
        $tester = new CommandTester($command);

        $exitCode = $tester->execute([
            'email' => 'existing@example.com',
            'name' => 'Existing User',
        ]);

        self::assertSame(ExitCode::DATAERR, $exitCode);
        self::assertStringContainsString('User with this email already exists.', $tester->getDisplay());
    }

    public function testExecuteWithInteractivePrompt(): void
    {
        $handler = $this->createMock(CreateUserHandler::class);
        $handler
            ->expects(self::once())
            ->method('handle')
            ->willReturn(new CreateUserResult(id: 'usr_mock_interactive', name: 'Interactive User'));

        $command = new CreateUserCommand($handler);
        $tester = new CommandTester($command);

        // Pre-fill simulated inputs for interactive prompts
        $tester->setInputs(['interactive@example.com', 'Interactive User', 'user']);

        $exitCode = $tester->execute([
            'email' => 'interactive@example.com',
            'name' => 'Interactive User',
        ]);

        self::assertSame(ExitCode::OK, $exitCode);
        self::assertStringContainsString('User "Interactive User" created successfully', $tester->getDisplay());
    }
}
```

---

## 9. Built-in Ecosystem Commands

The Yii3 ecosystem supplies production-ready console commands out of the box across official packages:

### 9.1. Built-in Web Server (`./yii serve`)

Packaged inside `yiisoft/yii-console`, `Yiisoft\Yii\Console\Command\Serve` starts PHP's built-in web server:

```bash
# Start on default 127.0.0.1:8080
./yii serve

# Custom port and binding
./yii serve 0.0.0.0 -p 9000 -t public

# Multi-worker Linux execution with Xdebug support
./yii serve --workers=4 --xdebug
```

Configuration in `config/console/params.php`:
```php
'yiisoft/yii-console' => [
    'serve' => [
        'appRootPath' => null,
        'options' => [
            'address' => '127.0.0.1',
            'port' => '8080',
            'docroot' => 'public',
            'router' => 'public/index.php',
            'workers' => 2,
        ],
    ],
],
```

### 9.2. Official Ecosystem Package Commands

| Package | Registered Primary Command Name | Primary Purpose |
|---|---|---|
| `yiisoft/yii-console` | `./yii serve`, `./yii yii` | Built-in web server daemon and interactive console game |
| `yiisoft/db-migration` | `./yii migrate:up`, `./yii migrate:down`, `./yii migrate:create`, `./yii migrate:history`, `./yii migrate:new`, `./yii migrate:redo`, `./yii migrate:mark` | Database schema migrations, rollback, and state tracking |
| `yiisoft/queue` | `./yii queue:listen`, `./yii queue:run`, `./yii queue:listen-all` | Queue worker daemons and batch job consumption |
| `yiisoft/translator-extractor` | `./yii translator/extract` | Source code scanning for translation tokens |
| `yiisoft/yii-cycle` | `./yii cycle:schema`, `./yii cycle:schema:php`, `./yii cycle:schema:clear`, `./yii cycle:schema:rebuild`, `./yii migrate:create`, `./yii migrate:generate`, `./yii migrate:up`, `./yii migrate:down`, `./yii migrate:list` | Cycle ORM schema compilation, migrations, and schema caching |
| `yiisoft/yii-debug` | `./yii debug:reset` | Reset and clear collected debug tool panels and requests |
| `yiisoft/yii-gii` | `./yii gii:controller`, `./yii gii:active-record` | Code generation CLI wizards for controllers and models |

---

## 10. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| **`class MyCommand extends \yii\console\Controller`** | Yii2 legacy architecture; fatal class not found crash in Yii3 runtime. | Extend `Symfony\Component\Console\Command\Command`. |
| **`actionIndex()`, `actionCreate()` methods** | Yii2 controller action routing does not exist in Yii3. | Implement a dedicated Command class per action with `protected function execute()`. |
| **Omitting `parent::__construct()` in Command** | Leaves Symfony Command's internal definition, helper set, and configuration uninitialized; causes fatal errors during configuration. | Always invoke `parent::__construct();` inside the command constructor. |
| **Calling `exit($code)` or `die()` in command** | Forcefully terminates the PHP process, skipping `ApplicationShutdown` events, output flushing, and runner cleanup. | Return integer code from `execute()` (e.g. `return ExitCode::OK;`). |
| **Direct DB queries or persistence in Command** | Violates Presentation Layer separation; couples CLI interface to persistence, preventing unit testing. | Inject Application Use Cases or CQRS Handlers via DI constructor. |
| **Raw `echo "text\n"` or `print()` output** | Bypasses output buffering, breaks CI runner formatting, and corrupts headless tests. | Wrap `$input` and `$output` into `SymfonyStyle` and use `$io->text()`, `$io->table()`, etc. |
| **Unconditional interactive prompts in automated runs** | Blocks indefinitely in automated background jobs, Docker containers, Cron, and CI/CD pipelines. | Check `$input->isInteractive()` or provide default values for non-interactive invocations. |
| **Returning magic numeric integers (e.g. `return 0;`, `return 1;`)** | Obscures failure root causes across shell scripts, Kubernetes probes, and monitoring tools. | Return explicit semantic constants from `Yiisoft\Yii\Console\ExitCode`. |
| **Hardcoding command name exclusively in `#[AsCommand]` while omitting configuration** | Command won't be registered in `CommandLoader` and won't appear in `./yii list`. | Register the command in `config/console/params.php` under `'yiisoft/yii-console' => ['commands' => [...]]`. |
| **Omitting `description` from `#[AsCommand]`** | Forces `CommandLoader` to eagerly instantiate the command class during `./yii list`, loading heavy DI dependencies prematurely. | Always provide `description` in `#[AsCommand(description: '...')]` to allow `CommandLoader` to use `LazyCommand`. |
| **Empty aliases or names in pipe config (e.g. `'user:list\|\|ul'` or `'\|'`)** | Throws `RuntimeException('Do not allow empty command name or alias.')` during container bootstrap. | Use single pipes to separate valid non-empty alias tokens (e.g. `'user:list\|ul\|u:l'`). |
| **Reading `$_SERVER['argv']` or `$_GET` directly** | Couples command to global state; breaks in test environments (`CommandTester`) and sub-process runners. | Access inputs strictly through `$input->getArgument('name')` and `$input->getOption('name')`. |
| **Catching `\Throwable` and silently returning `ExitCode::OK`** | Hides critical system failures; shell pipelines believe the job succeeded when data was not processed. | Log the error, output an explanation via `$io->error()`, and return `ExitCode::UNSPECIFIED_ERROR` or specific BSD code. |

---

## 11. Related Topic Guides

- [Runners & Runtimes Guide](runners-and-runtimes.md) — Application runner architecture, `ConsoleApplicationRunner`, and entry points.
- [DI & Configuration Guide](di-and-config.md) — Console config groups (`params-console`, `di-console`), definition syntax, and environment parameters.
- [Queue & Asynchronous Jobs Guide](queue-jobs.md) — Console queue workers (`./yii queue:listen`) and mutex locks.
- [Error Handling Guide](error-handling.md) — Friendly Exceptions, CLI error formatting, and logging.
