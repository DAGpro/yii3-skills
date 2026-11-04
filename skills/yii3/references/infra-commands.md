# Yii3 Console Commands Guide

> Practical guide and implementation recipes for CLI commands, interactive terminal UX, lazy registration, argument parsing, error handling, and automated testing using `yiisoft/yii-console`, `yiisoft/yii-runner-console`, and `symfony/console`.

**Installation** (bare project):
```bash
composer require yiisoft/yii-console yiisoft/yii-runner-console
```
Requiring `yiisoft/yii-runner-console` alone is sufficient — it pulls in `yiisoft/yii-console` and `yiisoft/yii-runner` transitively. The console application template (`yiisoft/app-console`) already includes both.

---

## Table of Contents
- [1. Console Architecture & Presentation Layer Principle](#1-console-architecture--presentation-layer-principle)
- [2. Command Class Anatomy & Constructor Injection](#2-command-class-anatomy--constructor-injection)
- [3. Arguments & Options Specification](#3-arguments--options-specification)
- [4. Configuration & Lazy Command Registration](#4-configuration--lazy-command-registration)
- [5. Interactive Terminal UX with SymfonyStyle](#5-interactive-terminal-ux-with-symfonystyle)
- [6. Standard Exit Codes (Yiisoft\Yii\Console\ExitCode)](#6-standard-exit-codes-yiisoftyiiconsoleexitcode)
- [7. Friendly Exceptions & Global Error Handling](#7-friendly-exceptions--global-error-handling) — full reference in the [Friendly Exceptions Guide](core-friendly-exceptions.md)
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
       │ Boots DI container; yiisoft/config merges the seven console config groups
       │ (params-console, di-console, events-console, bootstrap-console,
       │  di-providers-console, di-delegates-console, di-tags-console)
       ▼
Application (`Yiisoft\Yii\Console\Application` extends Symfony Console Application)
       │ Dispatches `Yiisoft\Yii\Console\Event\ApplicationStartup`
       ▼
CommandLoader (`Yiisoft\Yii\Console\CommandLoader` implements CommandLoaderInterface)
       │ Resolves command from PSR-11 Container — lazily when a description
       │ exists (LazyCommand), eagerly otherwise
       ▼
Command (`Symfony\Component\Console\Command\Command`)
       │ 1. Parses & validates CLI input ($input->getArgument(), $input->getOption())
       │ 2. Prompts interactive input ($io->confirm(), QuestionHelper) if interactive
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
| Interactive user confirmation and question prompts (`confirm()`, `QuestionHelper`) | ❌ Database transaction management (`$db->transaction()`) |
| Syntax validation and argument type coercion | ❌ Business rules, domain invariants, core calculations |
| Formatted tables, status banners, verbosity-scoped output | ❌ Calling `exit()` or `die()` directly (skips events & runners) |
| Invoking Application Use Cases / CQRS Command Handlers | ❌ Direct `echo`, `print`, or raw unbuffered terminal writes |
| Translating domain exceptions into friendly CLI error messages | ❌ Hardcoding raw magic integers as exit codes (e.g. `return 1;`) |

### Console Lifecycle Events

Yii3 console dispatches explicit lifecycle events during execution: `Yiisoft\Yii\Console\Event\ApplicationStartup`, `Yiisoft\Yii\Console\Event\ApplicationShutdown`, and — bridged to the PSR-14 event dispatcher via `Yiisoft\Yii\Console\SymfonyEventDispatcher` — standard Symfony events (`ConsoleCommandEvent`, `ConsoleErrorEvent`, `ConsoleTerminateEvent`). Payloads, dispatch points, and the bridge mechanics are owned by the [Events & Listeners Guide](core-events-and-listeners.md), section 6.2.

### Subscribing to Lifecycle Events

Listeners are registered in the `events-console` configuration group. Create an app-level `config/common/events.php` file returning a map of event class to listener list and map it into the shared `events` group in `config/configuration.php` (`'events' => 'common/events.php'`) — the base runner reverse-merges `events` into `events-web` and `events-console`, so the file reaches console listeners too (see [Events Guide, §4.1](core-events-and-listeners.md)):

```php
// config/common/events.php
declare(strict_types=1);

use App\Application\Console\AuditTrailListener;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Event\ConsoleTerminateEvent;
use Yiisoft\Yii\Console\Event\ApplicationShutdown;
use Yiisoft\Yii\Console\Event\ApplicationStartup;

return [
    ApplicationStartup::class => [
        [AuditTrailListener::class, 'onStartup'],
    ],
    ApplicationShutdown::class => [
        [AuditTrailListener::class, 'onShutdown'],
    ],
    ConsoleTerminateEvent::class => [
        // Closures are supported too; closure parameters are resolved from the DI container.
        static function (LoggerInterface $logger): void {
            // e.g. flush buffered log messages on termination
        },
    ],
];
```

Wiring details:

- Listener formats (`[Class::class, 'method']`, closures, invokables) and the config-to-collection pipeline are owned by the [Events & Listeners Guide](core-events-and-listeners.md), section 4.2; group declaration and the `events` → `events-web`/`events-console` reverse-merge by its section 4.1.
- The dispatcher is wired automatically by `yiisoft/yii-console` (its default `di-console.php` sets `Yiisoft\Yii\Console\SymfonyEventDispatcher` on the `Application` — [Events Guide, §6.2](core-events-and-listeners.md)). Without a dispatcher configured, lifecycle events are not dispatched at all.
- Real-world examples: `yiisoft/yii-debug` subscribes `Debugger::start` to `ApplicationStartup` and `Debugger::stop` to `ApplicationShutdown` (see `vendor/yiisoft/yii-debug/config/events-console.php`); `yiisoft/log` registers a closure that flushes the logger on `ConsoleTerminateEvent` (see `vendor/yiisoft/log/config/events-console.php`).
- Nuances: `ApplicationStartup` carries the first raw argv token (e.g. `serve`), not the resolved command name — payload details in [Events Guide, §6.2](core-events-and-listeners.md).

---

## 2. Command Class Anatomy & Constructor Injection

Yii3 console commands extend `Symfony\Component\Console\Command\Command`. All dependencies and application services must be declared in the constructor and injected through the PSR-11 DI container.

> [!IMPORTANT]
> **Mandatory Parent Constructor Call:**
> In Symfony Console and Yii3, command constructors **must** invoke `parent::__construct()`. Every command across the official `yiisoft/*` packages follows this rule (per Symfony Console documentation, skipping the call leaves the command definition, helper set, and input definition uninitialized).

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
                  <info>./yii user:create user@example.com "John Doe" --role=admin</info>

                To skip welcome notification delivery:
                  <info>./yii user:create user@example.com "John Doe" --no-welcome</info>
                HELP,
            )
            ->addArgument('email', InputArgument::REQUIRED, 'The unique email address of the user.')
            ->addArgument('name', InputArgument::REQUIRED, 'The full display name of the user.')
            ->addOption(
                'role',
                'r',
                InputOption::VALUE_OPTIONAL,
                'User access role (admin, manager, user).',
                'user',
            )
            ->addOption(
                'no-welcome',
                null,
                InputOption::VALUE_NONE,
                'Suppress sending the welcome email to the user.',
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
        $io->writeln(sprintf('Email: <info>%s</info> | Name: <info>%s</info> | Role: %s', $email, $name, $role));

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
            // Shown only with -v / --verbose (OutputInterface::VERBOSITY_VERBOSE)
            $output->writeln($e->getTraceAsString(), OutputInterface::VERBOSITY_VERBOSE);
            return ExitCode::UNSPECIFIED_ERROR;
        }
    }
}
```

---

## 3. Arguments & Options Specification

Arguments and options define the command line interface contract.

### 3.1. Input Arguments (`InputArgument`)

`addArgument()` is defined by `Symfony\Component\Console\Command\Command` (see the Symfony Console documentation for the exact signature). Official packages call it in the **positional** form — name, mode, description, default:

```php
$this
    ->addArgument('target', InputArgument::REQUIRED, 'Primary deployment target environment.')
    ->addArgument(
        'services',
        InputArgument::OPTIONAL | InputArgument::IS_ARRAY,
        'Specific microservices to deploy (leave empty for all).',
        [],
    );
```

| Mode Constant | Description |
|---|---|
| `InputArgument::REQUIRED` | Must be provided by the caller; throws runtime error if omitted. |
| `InputArgument::OPTIONAL` | Optional value; falls back to the default when omitted. |
| `InputArgument::IS_ARRAY` | Accepts multiple space-separated trailing arguments (returns an array of strings). |
| `InputArgument::OPTIONAL \| InputArgument::IS_ARRAY` | Optional array of arguments with an empty-array default — the combination used by `yiisoft/queue` (`queue:run [queue...]`). |
| `InputArgument::REQUIRED \| InputArgument::IS_ARRAY` | Required array: at least one item. Not used in official `yiisoft/*` package sources; see the Symfony Console documentation. |

### 3.2. Input Options (`InputOption`)

`addOption()` is defined by `Symfony\Component\Console\Command\Command` (see the Symfony Console documentation for the exact signature). Official packages call it in the **positional** form — name, shortcut, mode, description, default:

| Mode Constant | Description | CLI Usage Example |
|---|---|---|
| `InputOption::VALUE_NONE` | Boolean flag; the option carries no value. | `--force`, `-f` |
| `InputOption::VALUE_REQUIRED` | Must receive a value when option is specified. | `--limit=50`, `-l 50` |
| `InputOption::VALUE_OPTIONAL` | Option may or may not have an explicit value. | `--output` or `--output=json` |
| `InputOption::VALUE_IS_ARRAY` | Can be specified multiple times; values gathered into an array (combine with `VALUE_REQUIRED` as in db-migration's `--path`). | `--path=a --path=b` |
| `InputOption::VALUE_NEGATABLE` | Generates both `--foo` and `--no-foo` toggles automatically (documented in db-migration for `--transactional` / `--no-transactional`). | `--notifications` / `--no-notifications` |

```php
$this
    ->addOption(
        'dry-run',
        'd',
        InputOption::VALUE_NONE,
        'Simulate changes without persisting to the database.',
    )
    ->addOption(
        'batch-size',
        'b',
        InputOption::VALUE_REQUIRED,
        'Number of records processed per transaction chunk.',
        100,
    )
    ->addOption(
        'exclude',
        'x',
        InputOption::VALUE_IS_ARRAY | InputOption::VALUE_REQUIRED,
        'Exclude specific service keys from synchronization.',
        [],
    )
    ->addOption(
        'notifications',
        null,
        InputOption::VALUE_NEGATABLE,
        'Enable or disable outbound notifications (--notifications / --no-notifications).',
        true,
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

> [!NOTE]
> The argument variant `mustSuggestArgumentValuesFor()` is exercised in official package sources (`vendor/yiisoft/yii-console/src/Command/Serve.php` uses it to complete the `serve` address argument). The option variant `mustSuggestOptionValuesFor()` belongs to the same Symfony Console completion API (see Symfony documentation).

---

## 4. Configuration & Lazy Command Registration

Yii3 avoids instantiating all command classes on every CLI launch. Commands are registered in configuration parameters and loaded on demand by `Yiisoft\Yii\Console\CommandLoader`.

### 4.1. Configuration Syntax (`config/console/params.php`)

In the official application templates, commands are registered in the params configuration. The web template (`yiisoft/app`) uses `config/console/params.php`; the console template (`yiisoft/app-console`) has no `console/` subdirectory and uses `config/params.php`. The
`yiisoft/yii-console` package itself ships its defaults in a `params-console.php` config group
(merged automatically by `yiisoft/config`) — override in the application's params file,
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

The `Yiisoft\Yii\Console\CommandLoader` handles loading:
1. **Description extraction without instantiation:** It reads the `#[AsCommand]` attribute on the command class (on Symfony Console < 8, the legacy `getDefaultDescription()` method) so that `./yii list` displays command descriptions without resolving command constructor dependencies from the DI container.
2. **Name and aliases priority:** The command name, aliases, and hidden status defined in the `commands` array configuration **always override** names specified in the PHP class attribute. Nuance: the hidden flag from the map is applied to the lazy command wrapper; it is not pushed onto eagerly instantiated command instances.
3. **Lazy instantiation with an eager fallback:** When a description is available, the loader wraps the command in `Symfony\Component\Console\Command\LazyCommand` and resolves it from the PSR-11 container only when the user actually invokes that specific command. Without a description, the loader instantiates the command class immediately (including during `./yii list`).

> [!WARNING]
> **Avoid Eager Instantiation Pitfall:**
> Always annotate your Command class with `#[AsCommand(description: '...')]`. If `CommandLoader` cannot obtain a description (no `#[AsCommand]` description, or on Symfony Console < 8 no `getDefaultDescription()` method), it skips `LazyCommand` and eagerly instantiates your command class immediately during `./yii list`, loading all injected database and network services prematurely.

> [!TIP]
> Keep the `name` in `#[AsCommand(name: 'user:create')]` identical to the primary array key in `commands` configuration to prevent discrepancies across tools and static analyzers.

### 4.3. Wiring Commands Through DI (`config/di-console.php`)

Command names live in params, but the instances are created by the DI container. The package's default `di-console.php` binds `Symfony\Component\Console\CommandLoader\CommandLoaderInterface` to `Yiisoft\Yii\Console\CommandLoader` and feeds it the `commands` map from params:

```php
// Excerpt of the defaults shipped by yiisoft/yii-console (config/di-console.php)
use Symfony\Component\Console\CommandLoader\CommandLoaderInterface;
use Yiisoft\Yii\Console\CommandLoader;

/** @var array $params */

return [
    CommandLoaderInterface::class => [
        'class' => CommandLoader::class,
        '__construct()' => [
            'commandMap' => $params['yiisoft/yii-console']['commands'],
        ],
    ],
];
```

Commands whose constructor only declares class-typed dependencies need no explicit definition — the container autowires them. When a command needs explicit constructor values, define it in `di-console.php` the same way the package defines its own `Serve` command:

```php
// Excerpt of the defaults shipped by yiisoft/yii-console (config/di-console.php)
use Yiisoft\Yii\Console\Command\Serve;

return [
    Serve::class => [
        'class' => Serve::class,
        '__construct()' => [
            'appRootPath' => $params['yiisoft/yii-console']['serve']['appRootPath'],
            'options' => $params['yiisoft/yii-console']['serve']['options'],
        ],
    ],
];
```

The `CommandLoader` resolves command classes through the PSR-11 container (`$container->get($commandClass)`), so explicit definitions, autowiring, and DI providers all apply to commands.

### 4.4. Console Application Entry Point (`./yii`)

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

The official `yiisoft/app-console` template passes `debug: (bool) $_ENV['YII_DEBUG']` and `checkEvents: (bool) $_ENV['YII_DEBUG']` without `?? false` fallbacks: its `autoload.php` normalizes the environment, defaulting `YII_DEBUG` to `true` and `YII_ENV` to `null` when unset. The `?? false` fallbacks above are a defensive variant — keep the normalization consistent with your template.

The full 17-parameter constructor with per-subclass defaults is documented in the [Runners & Runtimes Guide, §1.2](infra-runners-and-runtimes.md). Console specifics: `$rootPath` is required; every other parameter has a default (`debug: false`, `bootstrapGroup: 'bootstrap-console'`, `eventsGroup: 'events-console'`, `diGroup: 'di-console'`, `$configMergePlanFile: '.merge-plan.php'`).

The runner has no logger parameter; loggers reach console components through DI (for example, `Yiisoft\Yii\Console\ErrorListener` accepts an optional PSR-3 logger in its constructor).

Executing commands via CLI:
```bash
./yii user:create admin@example.com "Super Admin" --role=admin
```

> [!NOTE]
> `Yiisoft\Yii\Console\Application` has a `--config` option registered by its default DI definition (an `InputOption` with `VALUE_REQUIRED` and the help text "Set alternative configuration name", added via `Application::addOptions()` in `di-console.php`, so it shows up in `./yii --help`):
> ```bash
> ./yii --config=testing user:create test@example.com "Tester"
> ```
> The option's value is not consumed by `yiisoft/yii-console` itself — wiring it to an alternative configuration name is up to the application (e.g. by reading it in a config modifier or a custom runner). Do not assume built-in runtime configuration switching.

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

// Informational output
$io->writeln('Starting background catalog fetch from vendor upstream.');

// Status banners
$io->success('Catalog synchronized successfully.');
$io->warning('3 product images failed to download.');
$io->error('Database connection timed out.');
$io->note('Run with --verbose for detailed payload dumps.');

// Spacing
$io->newLine();
```

> [!NOTE]
> `SymfonyStyle` offers more styling methods (`text()`, `comment()`, `caution()`, `newLine()` with an argument, `listing()` — see Symfony Console documentation). The methods shown above are the ones exercised across official `yiisoft/*` package sources; prefer them for proven behavior.

### 5.2. Tables & Structured Output

```php
// Render aligned ASCII table (header cells may be null)
$io->table(
    ['ID', 'Email', 'Role', 'Status'],
    [
        ['1', 'admin@example.com', 'admin', '<fg=cyan>Active</>'],
        ['2', 'manager@example.com', 'manager', '<fg=cyan>Active</>'],
        ['3', 'guest@example.com', 'user', '<fg=yellow>Pending</>'],
        ['4', 'bot@example.com', 'service', '<fg=red>Blocked</>'],
    ],
);
```

Formatting tags verified in official package sources: `<info>`, `<error>`, `<fg=red>`, `<fg=yellow>`, `<fg=cyan>`, `<fg=magenta>`, `<fg=blue>` (see `vendor/yiisoft/yii-console/src/Application.php` and the yii-gii generate commands).

### 5.3. Interactive Prompts & Questions

> [!WARNING]
> **Non-Interactive CI Safety:**
> Always verify `$input->isInteractive()` or provide default values for unattended environments (Cron, Docker entrypoints, CI/CD pipelines). In automated runs, interactive prompts either block indefinitely or throw exceptions.

Confirmation (both two-argument and one-argument forms are used in official packages):

```php
$confirmed = $io->confirm('Do you want to truncate the audit log table?', false);

if (!$confirmed) {
    $io->warning('Operation aborted by user.');
    return ExitCode::OK;
}
```

A force flag instead of a prompt — the pattern used by `yiisoft/db-migration` (`--force-yes, -y`):

```php
if ($input->getOption('force-yes') || $io->confirm('Remove all migration history entries?', false)) {
    // Proceed without asking; safe for CI when the flag is passed.
}
```

Prompt only when interactive — the pattern used by yii-gii and `yiisoft/yii-cycle` migrations:

```php
use Symfony\Component\Console\Helper\QuestionHelper;
use Symfony\Component\Console\Question\ConfirmationQuestion;

// ...

if ($input->isInteractive()) {
    $question = new ConfirmationQuestion('Apply the above migrations? (yes|no) ', false);
    /** @var QuestionHelper $helper */
    $helper = $this->getHelper('question');
    if (!$helper->ask($input, $output, $question)) {
        return ExitCode::OK;
    }
}
```

For richer questions (free-text, hidden input, choice lists), the helper API exercised across official packages is Symfony's `QuestionHelper` with `Question` / `ConfirmationQuestion` / `ChoiceQuestion`:

```php
use Symfony\Component\Console\Helper\QuestionHelper;
use Symfony\Component\Console\Question\Question;

/** @var QuestionHelper $helper */
$helper = $this->getHelper('question');
$question = new Question('Please enter a number between 0 and 100: ');
$answer = $helper->ask($input, $output, $question);
```

> [!NOTE]
> `SymfonyStyle` also exposes `ask()`, `askHidden()`, and `choice()` convenience methods (see Symfony Console documentation); they are not exercised in official `yiisoft/*` package sources, which use `confirm()` and the `QuestionHelper` API shown above.

### 5.4. Long-Running Output & Non-Interactive Runs

For long-running tasks, report progress with verbosity-scoped output so that normal runs stay quiet while `-v / --verbose` shows details (the pattern used by `yiisoft/yii-console`'s `Serve` command):

```php
foreach ($records as $record) {
    $this->processor->process($record);
    $output->writeln(
        sprintf('Processed record ID #%d', $record->getId()),
        OutputInterface::VERBOSITY_VERBOSE,
    );
}

$io->success('Batch processing finished.');
```

> [!NOTE]
> `SymfonyStyle` also provides progress-bar methods (`progressStart()` / `progressAdvance()` / `progressFinish()`, `createProgressBar()` — see Symfony Console documentation). They are not exercised in official `yiisoft/*` package sources; prefer the verified verbosity-scoped output above.

For unattended environments (CI/CD, Cron, Docker), combine three verified tools:

1. The built-in `-n, --no-interaction` global option that the application template's `./yii` exposes (real invocation from the yii-gii documentation):
   ```bash
   ./yii gii:controller SampleController --actions=index --viewsPath=@runtime/gii-views --no-interaction
   ```
2. A force flag instead of a prompt (`--force-yes, -y` in db-migration — see §5.3).
3. An explicit `$input->isInteractive()` guard around every prompt (see §5.3).

---

## 6. Standard Exit Codes (`Yiisoft\Yii\Console\ExitCode`)

Never return arbitrary magic integers (`return 1;`, `return 2;`) or call `exit()`. Console exit codes follow the FreeBSD `sysexits(3)` standard via `Yiisoft\Yii\Console\ExitCode` (the class is marked `@final`).

### ExitCode Constants & Semantics

| Constant | Code | Sysexits Name | Recommended Usage in Yii3 |
|---|---|---|---|
| `ExitCode::OK` | `0` | `EX_OK` | Successful termination. |
| `ExitCode::UNSPECIFIED_ERROR` | `1` | *(generic — not a sysexits code)* | Generic unclassified runtime failure. |
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

An unknown code yields `"Unknown exit code"`.

> [!NOTE]
> Not every ecosystem command maps failures onto `ExitCode`: the built-in `Serve` command returns its own constants (see §9.1), and some packages return `Command::SUCCESS` / `Command::FAILURE`. `ExitCode` remains the recommended vocabulary for your own commands.

---

## 7. Friendly Exceptions & Global Error Handling

> **Ownership:** The complete Friendly Exceptions reference — the `FriendlyExceptionInterface` contract, the CLI-friendly exception recipe, the `Application::renderThrowable()` output branches (plain buffered output vs. `SymfonyStyle` `! [NOTE]` rendering), and global console error logging via `ErrorListener` — **is owned by the** [Friendly Exceptions Guide](core-friendly-exceptions.md), sections 4–5.
>
> One-line trap summary: the real runner flow renders friendly exceptions as `<fg=red>` title + `<fg=yellow>` solution (the `! [NOTE]` style appears only when the output implements `StyleInterface`), and the stack trace is always appended.

> **For the complete reference on** Friendly Exceptions and global console error handling **see the** [Friendly Exceptions Guide, §4–§5](core-friendly-exceptions.md).

---

## 8. Testing Console Commands (`CommandTester`)

Console commands are covered by lightweight integration tests using `Symfony\Component\Console\Tester\CommandTester`: construct the command with a mocked use-case handler, execute it with input arguments, and assert the exit code and display output.

### 8.1. Zero-Shot Compilable Command Test

```php
// App\Tests\Presentation\Console\Command\CreateUserCommandTest
public function testExecuteSuccessful(): void
{
    $handler = $this->createMock(CreateUserHandler::class);
    $handler->expects(self::once())->method('handle')
        ->willReturn(new CreateUserResult(id: 'usr_mock_123', name: 'Super Admin'));

    $tester = new CommandTester(new CreateUserCommand($handler));

    $exitCode = $tester->execute(['email' => 'admin@example.com', 'name' => 'Super Admin']);

    self::assertSame(ExitCode::OK, $exitCode);
    self::assertStringContainsString('User "Super Admin" created successfully', $tester->getDisplay(true));
}
```

Failure paths follow the same shape: feed invalid input (e.g. a malformed email) or throw from the mocked handler, then assert `ExitCode::DATAERR` and the friendly message returned by `getDisplay(true)`.

### 8.2. Assembling a Real `Application` Instance in Tests

Tests that need the full `Yiisoft\Yii\Console\Application` pipeline — `find()` lookup through `CommandLoader`, event bridging, default application options — assemble the application manually with test doubles from `yiisoft/test-support` (`SimpleContainer`, `SimpleEventDispatcher`). That assembly recipe, along with all `CommandTester` mechanics, is owned by the testing guide:

> [!TIP]
> **Console Command Testing Reference:**
> For the complete reference on `CommandTester` usage — exit codes (§2), output assertion with `getDisplay(true)` (§3), failure scenarios such as `ExitCode::DATAERR` (§4), interactive prompt simulation via `setInputs()` (§5), autocompletion testing via `CommandCompletionTester` (§6), and container-aware resolution via the `CommandHelper` pattern (§7) — see the [Console Testing Guide](testing-console.md).

Testing traps:

- `setInputs(['yes', ...])` pre-fills simulated answers for interactive prompts — use it only when the command under test actually prompts; to suppress prompts entirely, pass `['interactive' => false]` as the second argument of `CommandTester::execute()` (mirrors the production `--no-interaction` flag).
- When assembling a real `Application` in a test, call `setAutoExit(false)` — otherwise the test process terminates on the first non-zero command exit code.

---

## 9. Built-in Ecosystem Commands

The Yii3 ecosystem supplies production-ready console commands out of the box across official packages:

### 9.1. Built-in Web Server (`./yii serve`)

Packaged inside `yiisoft/yii-console`, `Yiisoft\Yii\Console\Command\Serve` starts PHP's built-in web server:

```bash
# Start on default 127.0.0.1:8080
./yii serve

# Custom address binding, port (-p) and docroot (-t)
./yii serve 0.0.0.0 -p 9000 -t public

# Multi-worker execution with Xdebug support
./yii serve --workers=4 --xdebug
```

Interface (all verified against the `Serve` command source):

| Input | Kind | Default | Notes |
|---|---|---|---|
| `address` | argument (optional) | `127.0.0.1` | Completion suggestions: `localhost`, `127.0.0.1`, `0.0.0.0`. |
| `--port, -p` | option | `8080` | |
| `--docroot, -t` | option | `public` | Missing docroot exits with code `2` (`EXIT_CODE_NO_DOCUMENT_ROOT`). |
| `--router, -r` | option | `public/index.php` | Missing router exits with code `3`. |
| `--workers, -w` | option | `2` | Hardcoded default; honored on Linux only (via `PHP_CLI_SERVER_WORKERS`). |
| `--env, -e` | option | — | Used for testing (`--env=test` short-circuits server launch). |
| `--open, -o` | option | disabled | Passed bare (`--open`) to open the browser. |
| `--xdebug, -x` | option | disabled | Takes effect only when passed **bare** (`--xdebug`, not `--xdebug 1`); requires the Xdebug extension and Linux. |

An address already taken by another process exits with code `5` (`EXIT_CODE_ADDRESS_TAKEN_BY_ANOTHER_PROCESS`).

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
        ],
    ],
],
```

These are the defaults shipped by the package. There is no default `workers` key — the worker count defaults to `2` inside `Serve` itself; adding a custom `'workers' => 4` entry under `options` is allowed and honored (on Linux).

### 9.2. Official Ecosystem Package Commands

| Package | Registered Primary Command Name | Primary Purpose |
|---|---|---|
| `yiisoft/yii-console` | `./yii serve`, `./yii yii` (hidden) | Built-in web server daemon and hidden guessing-game command |
| `yiisoft/db-migration` | `./yii migrate:up`, `./yii migrate:down`, `./yii migrate:create`, `./yii migrate:history`, `./yii migrate:new`, `./yii migrate:redo`, `./yii migrate:mark` | Database schema migrations, rollback, and state tracking |
| `yiisoft/queue` | `./yii queue:listen`, `./yii queue:run`, `./yii queue:listen-all` | Queue worker daemons and batch job consumption |
| `yiisoft/translator-extractor` | `./yii translator/extract` | Source code scanning for translation tokens |
| `yiisoft/yii-cycle` | `./yii cycle:schema`, `./yii cycle:schema:php`, `./yii cycle:schema:clear`, `./yii cycle:schema:rebuild`, `./yii migrate:create`, `./yii migrate:generate`, `./yii migrate:up`, `./yii migrate:down`, `./yii migrate:list` | Cycle ORM schema compilation, migrations, and schema caching |
| `yiisoft/yii-debug` | `./yii debug:reset` | Reset and clear collected debug tool panels and requests |
| `yiisoft/yii-gii` | `./yii gii:controller`, `./yii gii:active-record` | Code generation CLI wizards for controllers and models |

Ecosystem details worth knowing:

- `./yii yii` is the hidden `Yiisoft\Yii\Console\Command\Game` command (registered as `'|yii'` in the default `params-console.php`, therefore excluded from `./yii list`): an interactive number-guessing game over a random integer in 0–100, built with `QuestionHelper` — a compact live sample of question-helper usage.
- For `migrate:up` the implementing class in `yiisoft/db-migration` is `UpdateCommand` (not "UpCommand").
- Notable non-interactive options across packages: db-migration offers `--force-yes, -y` (accept all questions) and `migrate:create --transactional / --no-transactional` (a negatable option); queue commands accept a queue-name list plus `--limit, -m` (`queue:run`, `queue:listen-all`) and `--pause, -p` (`queue:listen-all`); `translator/extract` accepts `--languages, -L` (default `en`), `--category, -C` (default `app`), `--except, -E`, `--only, -O`.

---

## 10. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| **`class MyCommand extends \yii\console\Controller`** | Yii2 legacy architecture; fatal class not found crash in Yii3 runtime. | Extend `Symfony\Component\Console\Command\Command`. |
| **`actionIndex()`, `actionCreate()` methods** | Yii2 controller action routing does not exist in Yii3. | Implement a dedicated Command class per action with `protected function execute()`. |
| **Omitting `parent::__construct()` in Command** | Leaves Symfony Command's internal definition, helper set, and configuration uninitialized; causes fatal errors during configuration. | Always invoke `parent::__construct();` inside the command constructor. |
| **Calling `exit($code)` or `die()` in command** | Forcefully terminates the PHP process, skipping `ApplicationShutdown` events, output flushing, and runner cleanup. | Return integer code from `execute()` (e.g. `return ExitCode::OK;`). |
| **Direct DB queries or persistence in Command** | Violates Presentation Layer separation; couples CLI interface to persistence, preventing unit testing. | Inject Application Use Cases or CQRS Handlers via DI constructor. |
| **Raw `echo "text\n"` or `print()` output** | Bypasses output buffering, breaks CI runner formatting, and corrupts headless tests. | Wrap `$input` and `$output` into `SymfonyStyle` and use `$io->writeln()`, `$io->table()`, etc. |
| **Unconditional interactive prompts in automated runs** | Blocks indefinitely in automated background jobs, Docker containers, Cron, and CI/CD pipelines. | Check `$input->isInteractive()` or provide default values for non-interactive invocations. |
| **Returning magic numeric integers (e.g. `return 0;`, `return 1;`)** | Obscures failure root causes across shell scripts, Kubernetes probes, and monitoring tools. | Return explicit semantic constants from `Yiisoft\Yii\Console\ExitCode`. |
| **Hardcoding command name exclusively in `#[AsCommand]` while omitting configuration** | Command won't be registered in `CommandLoader` and won't appear in `./yii list`. | Register the command in `config/console/params.php` under `'yiisoft/yii-console' => ['commands' => [...]]`. |
| **Omitting `description` from `#[AsCommand]`** | Forces `CommandLoader` to eagerly instantiate the command class during `./yii list`, loading heavy DI dependencies prematurely. | Always provide `description` in `#[AsCommand(description: '...')]` to allow `CommandLoader` to use `LazyCommand`. |
| **Empty aliases or names in pipe config (e.g. `'user:list\|\|ul'` or `'\|'`)** | Throws `RuntimeException('Do not allow empty command name or alias.')` when `CommandLoader` is first instantiated (i.e. when the DI container builds the `CommandLoaderInterface` definition). | Use single pipes to separate valid non-empty alias tokens (e.g. `'user:list\|ul\|u:l'`). |
| **Reading `$_SERVER['argv']` or `$_GET` directly** | Couples command to global state; breaks in test environments (`CommandTester`) and sub-process runners. | Access inputs strictly through `$input->getArgument('name')` and `$input->getOption('name')`. |
| **Catching `\Throwable` and silently returning `ExitCode::OK`** | Hides critical system failures; shell pipelines believe the job succeeded when data was not processed. | Log the error, output an explanation via `$io->error()`, and return `ExitCode::UNSPECIFIED_ERROR` or specific BSD code. |

---

## 11. Related Topic Guides

- [Runners & Runtimes Guide](infra-runners-and-runtimes.md) — Application runner architecture, `ConsoleApplicationRunner`, and entry points.
- [DI & Configuration Guide](core-di-and-config.md) — Console config groups (`params-console`, `di-console`), definition syntax, and environment parameters.
- [Queue & Asynchronous Jobs Guide](infra-queue-jobs.md) — Console queue workers (`./yii queue:listen`) and mutex locks.
- [Friendly Exceptions Guide](core-friendly-exceptions.md) — `FriendlyExceptionInterface` contract, CLI-friendly exception recipes, console rendering branches, and `ErrorListener` logging (§7 of this guide).
- [Error Handling Guide](infra-error-handling.md) — Error catching pipelines, CLI error formatting, and logging.
- [Console Testing Guide](testing-console.md) — The complete console command testing reference: `CommandTester`, exit codes, prompts, and autocompletion.
- [Testing Core Guide](testing-core.md) — PSR test doubles, test runners, and unit testing architecture.
