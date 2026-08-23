# Testing Environment Setup

Reference for the test environment of Yii app templates — use when creating a project from scratch,
restoring removed test files, or adding a new suite. Suite overview: SKILL.md.

## Composer Configuration

```json
{
    "require-dev": {
        "codeception/codeception": "^5.3",
        "codeception/module-asserts": "^3.2",
        "codeception/module-cli": "^2.0",
        "codeception/module-phpbrowser": "^3.0",
        "phpunit/phpunit": "^11.5"
    },
    "autoload-dev": { "psr-4": { "App\\Tests\\": "tests" } },
    "scripts": { "test": "codecept run" }
}
```

If entries already exist, keep versions from `composer.lock`.

## codeception.yml

```yaml
namespace: App\Tests
support_namespace: Support
bootstrap: bootstrap.php

settings:
  shuffle: true
  colors: true

paths:
  tests: tests
  output: tests/_output
  data: tests/Support/Data
  support: tests/Support

coverage:
  enabled: true
  show_uncovered: true
  show_only_summary: true
  include:
    - src/*
    - public/index.php
    - yii

extensions:
  enabled:
    - Codeception\Extension\RunFailed
```

`tests/bootstrap.php` prepares the app environment per suite:

```php
<?php

declare(strict_types=1);

App\Environment::prepare();
```

Run with `APP_ENV=test` locally; Docker setups read it from the per-stage env file
(`APP_ENV=test`, `APP_DEBUG=false`, `APP_C3=true`, `XDEBUG_MODE=coverage`).

## Suite Files

| File                         | Contents                                                                                                           |
|------------------------------|--------------------------------------------------------------------------------------------------------------------|
| `tests/Unit.suite.yml`       | `actor: UnitTester`; modules: `Asserts`                                                                            |
| `tests/Functional.suite.yml` | `actor: FunctionalTester` (project helper)                                                                         |
| `tests/Web.suite.yml`        | `actor: WebTester`; extension RunProcess `composer serve` (sleep 3); module PhpBrowser url `http://127.0.0.1:8080` |
| `tests/Console.suite.yml`    | `actor: ConsoleTester`; module `Cli`                                                                               |

After adding/changing suites rebuild actors:

```sh
APP_ENV=test vendor/bin/codecept build     # or: make codecept build
```

## Test Configuration & State Reset

Test-only params go to `config/environments/test/params.php` (loaded when APP_ENV=test): DB name/
credentials, mailer transport, queue transport, cache storage, log paths. Keep them separate from
dev/prod.

Every test must leave predictable state for the next one. Pick ONE reset strategy per resource:

- Recreate/truncate DB tables before application-level tests (one project-wide fixture or migration
  flow — do not mix strategies).
- Clear cache pools used in tests.
- Clear sessions/cookies in web tests.
- Remove generated files from `runtime`.
- Replace outgoing mail, queues and HTTP clients with test doubles where practical (`/yii3-email`
  dev stubs, `/yii3-http-client` MockHandler).

## Coverage

Local (Xdebug enabled):

```sh
APP_ENV=test APP_C3=true XDEBUG_MODE=coverage vendor/bin/codecept run --coverage --coverage-html --disable-coverage-php
```

Docker (vars preconfigured): `make test-coverage`.
