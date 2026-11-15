# Yii3 Console Commands: Terminal UX, Exit Codes & Execution

> **Grounding:** APIs in `vendor/yiisoft/<pkg>/src/`, patterns in this guide, conventions in architecture artifact (SKILL.md Core rule 2).

> Interactive terminal user experience with `SymfonyStyle`, standard exit code constants (`Yiisoft\Yii\Console\ExitCode`), friendly exceptions, `CommandTester` unit testing recipes, and built-in ecosystem commands (`./yii serve`).

## Table of Contents

- [5. Interactive Terminal UX with `SymfonyStyle`](#5-interactive-terminal-ux-with-symfonystyle)
  - [5.1. Banners, Headings & Text Formatting](#51-banners-headings--text-formatting)
  - [5.2. Tables & Structured Output](#52-tables--structured-output)
  - [5.3. Interactive Prompts & Questions](#53-interactive-prompts--questions)
  - [5.4. Long-Running Output & Non-Interactive Runs](#54-long-running-output--non-interactive-runs)
- [6. Standard Exit Codes (`Yiisoft\Yii\Console\ExitCode`)](#6-standard-exit-codes-yiisoftyiiconsoleexitcode)
  - [ExitCode Constants & Semantics](#exitcode-constants--semantics)
  - [Inspecting Exit Reasons](#inspecting-exit-reasons)
- [7. Friendly Exceptions & Global Error Handling](#7-friendly-exceptions--global-error-handling)
- [8. Testing Console Commands (`CommandTester`)](#8-testing-console-commands-commandtester)
- [9. Built-in Ecosystem Commands](#9-built-in-ecosystem-commands)
  - [9.1. Built-in Web Server (`./yii serve`)](#91-built-in-web-server-yii-serve)
  - [9.2. Official Ecosystem Package Commands](#92-official-ecosystem-package-commands)

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
> `SymfonyStyle` also exposes `ask()`, `askHidden()`, and `choice()` convenience methods (see Symfony Console documentation). Of these, only `choice()` is exercised in official `yiisoft/*` package sources — once, by `yiisoft/yii-dev-tool`'s release tooling (`OutputManager::choice()` delegating to `SymfonyStyle::choice()` in `Release/MakeCommand.php`); `ask()` and `askHidden()` are not exercised anywhere. Official packages otherwise use `confirm()` and the `QuestionHelper` API shown above.

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

Console commands are covered by lightweight integration tests using `Symfony\Component\Console\Tester\CommandTester`: construct the command with a mocked use-case handler, execute it with input arguments, and assert exit codes and display output.

> [!TIP]
> **Console Command Testing Reference:**
> For the complete reference on `CommandTester` usage — exit codes (§2), output assertion with `getDisplay(true)` (§3), failure scenarios such as `ExitCode::DATAERR` (§4), interactive prompt simulation via `setInputs()` (§5), autocompletion testing via `CommandCompletionTester` (§6), and container-aware resolution via the `CommandHelper` pattern (§7) — see the [Console Testing Guide](testing-console.md).

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
