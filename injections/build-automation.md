## Yii3 support (from yii3-skills)

Load the `yii3` skill and generate build automation files per it — the skill is the single source of rules:

Operating context: this `aif-*` workflow runs the skill in its default AI Factory extension mode (contract: `references/core-aif-adapter.md`); the standalone fallback contract (`references/core-standalone-adapter.md`) is out of scope here.

Build-automation-specific duties (the rules themselves live in the skill; all `references/*.md` paths resolve relative to the `yii3` skill directory):
- Standardized Yii 3 targets (Step 2 & Step 3): generate canonical targets tailored to Yii 3 CLI commands per `references/infra-commands.md`:
  - `serve`: development web server (`php -S 0.0.0.0:8080 -t public` for HTTP runner, or `./rr serve` for RoadRunner per `references/infra-runners-and-runtimes.md`).
  - `console`: interactive console entry point (`./yii` or `php yii`).
  - `migrate`: apply database migrations (`./yii migrate/up` per `references/persistence-migrations.md`).
  - `migrate-down`: revert the last migration (`./yii migrate/down`).
  - `migrate-create`: generate a migration skeleton (`./yii migrate/create`).
  - `test`: execute PHPUnit test suite (`vendor/bin/phpunit` per `references/testing-core.md`).
  - `test-unit` / `test-functional`: run isolated test suites (`vendor/bin/phpunit --testsuite=Unit`, `--testsuite=Functional`).
  - `cs-fix`: automatic code formatting (`vendor/bin/php-cs-fixer fix`).
  - `cs-check`: dry-run code style check (`vendor/bin/php-cs-fixer fix --dry-run --diff`).
  - `analyze`: static analysis check (`vendor/bin/psalm` or `vendor/bin/phpstan`).
  - `cache-clear`: flush runtime cache (`./yii cache/clear` or purge `runtime/cache`).
- Quality & ergonomics: define `.PHONY` for all non-file targets in `Makefile`; parameterize tools (`PHP ?= php`, `COMPOSER ?= composer`); avoid hardcoded absolute paths.
