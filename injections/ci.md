## Yii3 support (from yii3-skills)

Load the `yii3` skill and generate CI pipelines per it — the skill is the single source of rules:

Operating context: this `aif-*` workflow runs the skill in its default AI Factory extension mode (contract: `references/core-aif-adapter.md`); the standalone fallback contract (`references/core-standalone-adapter.md`) is out of scope here.

CI-specific duties (the rules themselves live in the skill; all `references/*.md` paths resolve relative to the `yii3` skill directory):
- PHP environment & matrix (Step 2 & Step 3): target modern PHP (matrix: 8.2, 8.3, 8.4) via `shivammathur/setup-php` with Composer v2 cache and extensions: `pdo`, `intl`, `mbstring`, `opcache`, and the project's active database driver.
- Code quality & static analysis (Step 3): generate lint and analysis jobs with `composer validate --strict`, code style check (`vendor/bin/php-cs-fixer fix --dry-run --diff` or `composer check-style`), and static analysis (`vendor/bin/psalm` or `vendor/bin/phpstan`).
- Mandatory CLI smoke gate (Step 3): include an explicit CLI smoke test running `./yii list` (or `php yii`) before test suites to verify that DI definitions, configuration compilation (`.merge-plan.php`), and console commands build without fatal errors or missing bindings per `references/infra-runners-and-runtimes.md` and `references/testing-console.md`.
- Automated testing jobs (Step 3): execute PHPUnit (`vendor/bin/phpunit`) with coverage (pcov or xdebug) and set environment variables (`APP_ENV=test`, `YII_ENV=test`) per `references/testing-core.md`.
