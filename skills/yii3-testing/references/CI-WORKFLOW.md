# GitHub Actions CI Workflow for Yii3

Place in `.github/workflows/ci.yml`. Pipeline order: validate → lint/fix check → static analysis → tests.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        php: ['8.2', '8.3', '8.4']

    steps:
      - uses: actions/checkout@v4

      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: ${{ matrix.php }}
          extensions: mbstring, intl, pdo_pgsql, opcache
          coverage: none

      - name: Get composer cache directory
        id: composer-cache
        run: echo "dir=$(composer config cache-files-dir)" >> $GITHUB_OUTPUT

      - uses: actions/cache@v4
        with:
          path: ${{ steps.composer-cache.outputs.dir }}
          key: composer-${{ matrix.php }}-${{ hashFiles('composer.lock') }}
          restore-keys: composer-${{ matrix.php }}-

      - name: Install dependencies
        run: composer install --prefer-dist --no-interaction --no-progress

      - name: Validate composer.json
        run: composer validate --strict

      # Optional: enable once configured in the project
      # - name: Code style
      #   run: vendor/bin/php-cs-fixer fix --dry-run --diff

      # Optional: static analysis (psalm or phpstan)
      # - name: Psalm
      #   run: vendor/bin/psalm --no-progress
      # - name: PHPStan
      #   run: vendor/bin/phpstan analyse --no-progress

      - name: Tests
        run: APP_ENV=test vendor/bin/codecept run
        env:
          DB_DSN: sqlite::memory:

      # Docker projects: use the make-based pipeline instead of raw commands:
      #   make build && make test
```

Notes:
- Pin `php-version` matrix to the range declared in `composer.json`.
- Provide a test database via service containers (postgres/mysql) if suites need one:
  add a `services:` block with health checks and pass DSN through env.
- Keep debug tooling out of CI (`APP_ENV=test`); static analysis should run on the same
  PHP version as production.
