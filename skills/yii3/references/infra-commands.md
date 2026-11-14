# Yii3 Console Commands Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Thin console commands, Symfony Console integration, presentation separation, interactive UX, and ecosystem tools in Yii3 applications.

This topic is split into two focused guides — load the one that matches the task:

- [Architecture, Input Binding & Registration](infra-commands-definition.md) — Command class architecture, presentation separation, constructor injection, argument/option binding (attribute-based `argument attributes` and imperative `configure()`), and lazy DI registration in `config/console/params.php` (§1–§4).
- [Terminal UX, Exit Codes & Execution](infra-commands-execution.md) — Interactive terminal UX with `SymfonyStyle`, standard exit code semantics (`Yiisoft\Yii\Console\ExitCode`), friendly exceptions, `CommandTester` testing, and built-in ecosystem commands (`./yii serve`) (§5–§9).

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
