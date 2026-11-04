# Yii3 Friendly Exceptions Guide

> [!IMPORTANT]
> **Grounding rule:** this guide is authoring synthesis for navigation and patterns. The source of truth for every class name, method signature, constructor argument, and configuration key is the installed package source under `vendor/yiisoft/<pkg>/src/`. Verify there before writing code; never substitute this guide for vendor sources, and never write Yii 2 APIs.

> Reference guide for `yiisoft/friendly-exception`: the `FriendlyExceptionInterface` contract that lets domain, infrastructure, and configuration exceptions carry a human-readable title (`getName()`) and actionable remediation steps (`getSolution()`), together with the automatic rendering behavior of the web error handler and the console application runner.

**Scope & Ownership:** This guide is the single source of truth for Friendly Exceptions across the skill package; it consolidates the former sections in the [Utility Packages Guide, §9](core-utilities.md#9-yiisoftfriendly-exception--actionable-error-solution-contract), the [Error Handling Guide, §6](infra-error-handling.md#6-friendly-exceptions-friendlyexceptioninterface), and the [Console Commands Guide, §7](infra-commands.md#7-friendly-exceptions--global-error-handling). The surrounding error-handling pipeline (ErrorCatcher, exception mapping, custom renderers, `UserException` disclosure) is owned by the [Error Handling Guide](infra-error-handling.md); command authoring is owned by the [Console Commands Guide](infra-commands.md).

---

## Table of Contents
- [1. Package Contract & Markdown Invariants](#1-package-contract--markdown-invariants)
- [2. Implementation Recipes](#2-implementation-recipes)
  - [2.1. Full Application Exception with Markdown Solution](#21-full-application-exception-with-markdown-solution)
  - [2.2. Compact Domain Exception with Plain-String Solution](#22-compact-domain-exception-with-plain-string-solution)
- [3. Web Rendering (`yiisoft/error-handler`)](#3-web-rendering-yiisofterror-handler)
- [4. Console Rendering (`yiisoft/yii-console`)](#4-console-rendering-yiisoftyii-console)
  - [4.1. Implementing a CLI-Friendly Exception](#41-implementing-a-cli-friendly-exception)
  - [4.2. Rendering Branches: Plain Buffered Output vs. Styled Output](#42-rendering-branches-plain-buffered-output-vs-styled-output)
- [5. Global Console Error Logging (`ErrorListener`)](#5-global-console-error-logging-errorlistener)
- [Related Topic Guides](#related-topic-guides)

---

## 1. Package Contract & Markdown Invariants

`yiisoft/friendly-exception` (`Yiisoft\FriendlyException\FriendlyExceptionInterface`) is a lightweight contract that extends `\Throwable`. It establishes a standard mechanism for exceptions to provide actionable remediation steps directly to developers, allowing domain, infrastructure, and configuration exceptions to carry explicit, human-readable diagnoses:

```php
declare(strict_types=1);

namespace Yiisoft\FriendlyException;

use Throwable;

interface FriendlyExceptionInterface extends Throwable
{
    /**
     * Human-understandable exception title.
     */
    public function getName(): string;

    /**
     * Actionable remediation instructions to resolve the error.
     * Must be formatted as plain CommonMark Markdown. HTML tags are forbidden!
     */
    public function getSolution(): ?string;
}
```

> [!IMPORTANT]
> **Three Invariants for `getSolution()`:**
> 1. Keep instructions concise, focused, and directly actionable.
> 2. **Never use raw HTML tags.**
> 3. **Use standard CommonMark Markdown** (backticks for CLI commands, file paths, and configuration keys).

Implementation guidelines (from the interface docblock):
- `getName()`: Short, human-understandable exception title.
- `getSolution()`: Clear resolution advice. Make it as short as possible, do **not** use HTML tags, and use simple markdown (`*`, `` ` ``, `-`).

Over 25 packages in the Yii3 ecosystem implement this interface (including `yiisoft/di`, `yiisoft/error-handler`, `yiisoft/yii-console`, `yiisoft/middleware-dispatcher`, and `yiisoft/validator`). Application code never needs custom try-catch rendering blocks for friendly exceptions — the ecosystem handlers render them automatically (see §3 and §4).

---

## 2. Implementation Recipes

### 2.1. Full Application Exception with Markdown Solution

```php
declare(strict_types=1);

namespace App\Exception;

use RuntimeException;
use Yiisoft\FriendlyException\FriendlyExceptionInterface;

final class DatabaseConfigurationException extends RuntimeException implements FriendlyExceptionInterface
{
    public function __construct(
        private string $connectionName,
        string $message = 'Database connection failed.'
    ) {
        parent::__construct($message);
    }

    public function getName(): string
    {
        return 'Database Connection Configuration Error';
    }

    public function getSolution(): ?string
    {
        return <<<MARKDOWN
        The database connection `{$this->connectionName}` could not be established.

        **To fix this issue:**
        1. Check your `.env` file to verify that `DB_HOST`, `DB_PORT`, and `DB_NAME` are correctly defined.
        2. Ensure your local database daemon (e.g. PostgreSQL or MySQL) is running.
        3. Run database migrations:
           ```bash
           ./yii migrate:up
           ```
        MARKDOWN;
    }
}
```

### 2.2. Compact Domain Exception with Plain-String Solution

For short remediation advice a plain string is sufficient. In `src/Domain/User/Exception/UserNotFoundException.php`:

```php
<?php

declare(strict_types=1);

namespace App\Domain\User\Exception;

use RuntimeException;
use Yiisoft\FriendlyException\FriendlyExceptionInterface;

final class UserNotFoundException extends RuntimeException implements FriendlyExceptionInterface
{
    public function getName(): string
    {
        return 'User Account Not Found';
    }

    public function getSolution(): ?string
    {
        return "Verify that the provided user ID exists in the database.\n"
            . "If testing locally, run `php yii fixture/load` to seed initial test users.";
    }
}
```

---

## 3. Web Rendering (`yiisoft/error-handler`)

During web requests the error handler renders friendly exceptions automatically in debug mode:
- `HtmlRenderer` renders `$e->getName()` in the title banner and parses `$e->getSolution()` via Markdown into a styled, prominent solution container above the stack trace.
- `HtmlRenderer::renderVerbose()` (development) parses `$throwable->getSolution()` — or, for exceptions without the interface, the exception class PHPDoc description — via `cebe/markdown` (`GithubMarkdown`) and displays it as a diagnostic solution block.
- Markdown parsing happens **only** in verbose rendering; the production `render()` performs no solution/description handling. `parseMarkdown()` additionally strips HTML through an allow-list of roughly 30 tags.

---

## 4. Console Rendering (`yiisoft/yii-console`)

Yii3 provides first-class support for `Yiisoft\FriendlyException\FriendlyExceptionInterface` in the console. When a command throws a friendly exception, `Yiisoft\Yii\Console\Application` renders actionable guidance directly to the terminal user: the runner catches the throwable and `Application::renderThrowable()` (public API over the protected `doRenderThrowable()`) prints the friendly title and the solution note (styled via Symfony Console style helpers, or raw ANSI tags at low verbosity) and always appends the stack trace.

### 4.1. Implementing a CLI-Friendly Exception

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

### 4.2. Rendering Branches: Plain Buffered Output vs. Styled Output

The rendering has two branches. In the real runner flow the output object is a buffered plain console output (not a `SymfonyStyle`), so the friendly exception reaches the terminal in the red/yellow branch: a styled `<fg=red>` header with the friendly name and a prominent `<fg=yellow>` note block with the solution text, followed by the stack trace:

```
Database Schema Not Initialized            <- printed with <fg=red>
Run "./yii migrate:up" to apply pending
database migrations before creating users. <- printed with <fg=yellow>

#0 /app/... (stack trace is always appended)
```

The `! [NOTE]`-styled rendering (title + note) applies only when the output object implements `StyleInterface` — for example, when a command itself passes a `SymfonyStyle` instance to `renderThrowable()` (the pattern used by yii-console's own tests).

---

## 5. Global Console Error Logging (`ErrorListener`)

`Yiisoft\Yii\Console\ErrorListener` automatically subscribes to `Symfony\Component\Console\Event\ConsoleErrorEvent` through the `events-console` group shipped by the package (`vendor/yiisoft/yii-console/config/events-console.php`; the shipped group contents are quoted in the [Events & Listeners Guide, §6.2](core-events-and-listeners.md#62-console-application-lifecycle-yiisoftyii-console) — no application wiring needed). When a command terminates with an uncaught exception, it logs the failure to the optional PSR-3 logger with the message format `'%s: %s in %s:%s while running console command "%s".'` and the exception in the `exception` context entry; without a bound logger it is a no-op. Roles stay separated: logging (ErrorListener) is independent from rendering (Application).

---

## Related Topic Guides

- [Error Handling Guide](infra-error-handling.md) — ErrorCatcher middleware, exception mapping with `ExceptionResponder`, custom HTML/JSON renderers, `UserException` information disclosure, and Sentry monitoring.
- [Console Commands Guide](infra-commands.md) — Command class anatomy, `SymfonyStyle` terminal UX, exit codes, and testing with `CommandTester`.
- [Events & Listeners Guide](core-events-and-listeners.md) — The `events-console` configuration group contents (`ErrorListener` subscription), section 6.2.
- [Runners & Runtimes Guide](infra-runners-and-runtimes.md) — Console application runner lifecycle, including the friendly-exception rendering summary (§3.6).
- [Utility Packages Guide](core-utilities.md) — Core everyday standalone helpers (`yiisoft/arrays`, `yiisoft/strings`, `yiisoft/json`).
