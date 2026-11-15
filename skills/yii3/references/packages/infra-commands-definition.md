# Yii3 Console Commands: Architecture, Input Binding & Registration

> **Grounding:** APIs in `vendor/yiisoft/<pkg>/src/`, patterns in this guide, conventions in architecture artifact (SKILL.md Core rule 2).

> Architecture, presentation-layer separation, command class anatomy, constructor injection, arguments & options specification (attribute-based and imperative), and lazy command registration in `config/console/params.php`.

## Table of Contents

- [1. Console Architecture & Presentation Layer Principle](#1-console-architecture--presentation-layer-principle)
  - [Command Responsibilities](#command-responsibilities)
  - [Console Lifecycle Events](#console-lifecycle-events)
  - [Subscribing to Lifecycle Events](#subscribing-to-lifecycle-events)
- [2. Command Class Anatomy & Constructor Injection](#2-command-class-anatomy--constructor-injection)
  - [Complete Compilable Command Example](#complete-compilable-command-example)
- [3. Arguments & Options Specification](#3-arguments--options-specification)
  - [3.1. Input Arguments (`InputArgument`)](#31-input-arguments-inputargument)
  - [3.2. Input Options (`InputOption`)](#32-input-options-inputoption)
  - [3.3. Dynamic Shell Auto-Completion (`complete()`)](#33-dynamic-shell-auto-completion-complete)
- [4. Configuration & Lazy Command Registration](#4-configuration--lazy-command-registration)
  - [4.1. Configuration Syntax (`config/console/params.php`)](#41-configuration-syntax-configconsoleparamsphp)
  - [4.2. How `CommandLoader` Resolves Commands](#42-how-commandloader-resolves-commands)
  - [4.3. Wiring Commands Through DI (`config/di-console.php`)](#43-wiring-commands-through-di-configdi-consolephp)
  - [4.4. Console Application Entry Point (`./yii`)](#44-console-application-entry-point-yii)

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

### Command Responsibilities

| Permitted in Commands | Strictly Forbidden in Commands |
|---|---|
| Parse CLI arguments, options, and environmental flags | ❌ Direct SQL queries, Cycle ORM or persistence layer calls |
| Interactive user confirmation and question prompts (`confirm()`, `QuestionHelper`) | ❌ Database transaction management (`$db->transaction()`) |
| Syntax validation and argument type coercion | ❌ Business rules, domain invariants, core calculations |
| Formatted tables, status banners, verbosity-scoped output | ❌ Calling `exit()` or `die()` directly (skips events & runners) |
| Invoking business operations, services, or handler contracts | ❌ Direct `echo`, `print`, or raw unbuffered terminal writes |
| Translating exceptions into user-friendly CLI error messages | ❌ Hardcoding raw magic integers as exit codes (e.g. `return 1;`) |

### Console Lifecycle Events

Yii3 console dispatches explicit lifecycle events during execution: `Yiisoft\Yii\Console\Event\ApplicationStartup`, `Yiisoft\Yii\Console\Event\ApplicationShutdown`, and — bridged to the PSR-14 event dispatcher via `Yiisoft\Yii\Console\SymfonyEventDispatcher` — standard Symfony events (`ConsoleCommandEvent`, `ConsoleErrorEvent`, `ConsoleTerminateEvent`). Payloads, dispatch points, and the bridge mechanics are owned by the [Events & Listeners Guide, §6.2](core-events-reference.md#62-console-application-lifecycle-yiisoftyii-console).

### Subscribing to Lifecycle Events

Listeners are registered in the `events-console` configuration group. Create an app-level `config/common/events.php` file returning a map of event class to listener list and map it into the shared `events` group in `config/configuration.php` (`'events' => 'common/events.php'`) — the base runner reverse-merges `events` into `events-web` and `events-console`, so the file reaches console listeners too (see [Events Guide, §4.1](core-events-design.md#41-configuration-architecture--scopes)):

```php
// config/common/events.php
declare(strict_types=1);

use App\Listener\AuditTrailListener;
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

- Listener formats (`[Class::class, 'method']`, closures, invokables) and the config-to-collection pipeline are owned by the [Events & Listeners Guide, §4.2](core-events-design.md#42-declarative-event-mapping--supported-listener-formats); group declaration and the `events` → `events-web`/`events-console` reverse-merge by its [§4.1](core-events-design.md#41-configuration-architecture--scopes).
- The dispatcher is wired automatically by `yiisoft/yii-console` (its default `di-console.php` sets `Yiisoft\Yii\Console\SymfonyEventDispatcher` on the `Application` — [Events Guide, §6.2](core-events-reference.md#62-console-application-lifecycle-yiisoftyii-console)). Without a dispatcher configured, lifecycle events are not dispatched at all.
- Real-world examples: `yiisoft/yii-debug` subscribes `Debugger::start` to `ApplicationStartup` and `Debugger::stop` to `ApplicationShutdown` (see `vendor/yiisoft/yii-debug/config/events-console.php`); `yiisoft/log` registers a closure that flushes the logger on `ConsoleTerminateEvent` (see `vendor/yiisoft/log/config/events-console.php`).
- Nuances: `ApplicationStartup` carries the first raw argv token (e.g. `serve`), not the resolved command name — payload details in [Events Guide, §6.2](core-events-reference.md#62-console-application-lifecycle-yiisoftyii-console).

---

## 2. Command Class Anatomy & Constructor Injection

Yii3 console commands extend `Symfony\Component\Console\Command\Command`. All dependencies and application services must be declared in the constructor and injected through the PSR-11 DI container.

> [!IMPORTANT]
> **Mandatory Parent Constructor Call:**
> In Symfony Console and Yii3, command constructors **must** invoke `parent::__construct()`. Every command across the official `yiisoft/*` packages follows this rule (per Symfony Console documentation, skipping the call leaves the command definition, helper set, and input definition uninitialized).

> [!NOTE]
> **Command Placement & Delegation:** File placement and namespace follow the project's Architecture Pattern (`core-architecture-alignment.md` §6) — e.g. `App\Command\User` in Layered, `App\User\Command` in Structured Modules, `App\Presentation\Console\Command` in Explicit. Commands delegate business logic to injected services or domain operations.

### Complete Compilable Command Example

```php
declare(strict_types=1);

namespace App\Command;

use DomainException;
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
use Yiisoft\Yii\Console\ExitCode;

interface UserCreatorInterface
{
    public function create(string $email, string $name, string $role, bool $sendWelcome): string;
}

#[AsCommand(
    name: 'user:create',
    description: 'Creates a new user account with assigned role and status.',
)]
final class CreateUserCommand extends Command
{
    public function __construct(
        private readonly UserCreatorInterface $userCreator,
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

        // Basic syntax/input verification before invoking business logic
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $io->error(sprintf('Invalid email format: "%s".', $email));
            return ExitCode::DATAERR;
        }

        try {
            $userId = $this->userCreator->create(
                email: $email,
                name: $name,
                role: $role,
                sendWelcome: $sendWelcome,
            );

            $io->success(sprintf(
                'User "%s" created successfully (ID: %s).',
                $name,
                $userId,
            ));

            return ExitCode::OK;
        } catch (DomainException $e) {
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

use App\Command\CleanCacheCommand;
use App\Command\CreateUserCommand;
use App\Command\ListUsersCommand;
use App\Command\SecretSyncCommand;

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
