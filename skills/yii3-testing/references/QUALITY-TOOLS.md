# Quality Tools in Yii App Templates

The Yii application template ships static analysis and code-quality tools alongside the test suite.
Docker setups expose them as `make <tool>` targets (cs-fix, psalm, rector, ...).

## Psalm

```sh
vendor/bin/psalm                 # config: psalm.xml
make psalm                       # in Docker
```

Runs in CI for supported PHP versions. When Psalm reports an issue: fix the code or add a precise
type annotation. Keep suppressions narrow and local to the exact line/method.

## Composer Dependency Analyser

Checks `composer.json` against classes actually used:

```sh
vendor/bin/composer-dependency-analyser --config=composer-dependency-analyser.php
make composer-dependency-analyser
```

Run after adding/removing package usage in `src`, `config`, or `tests`.

## PHP CS Fixer

```sh
vendor/bin/php-cs-fixer fix --config=.php-cs-fixer.php --diff
make cs-fix
```

Commit formatting changes together with the code that needs them.

## Rector

```sh
vendor/bin/rector --dry-run      # preview first
vendor/bin/rector                # apply, config: rector.php
make rector
```

Review changes before committing — automated refactoring can change behavior with custom rules or
broad paths.

## Pre-PR Checklist

```sh
APP_ENV=test vendor/bin/codecept build
APP_ENV=test vendor/bin/codecept run
vendor/bin/psalm
vendor/bin/composer-dependency-analyser --config=composer-dependency-analyser.php
vendor/bin/php-cs-fixer fix --config=.php-cs-fixer.php --diff
```

Docker equivalents: `make codecept build && make test && make psalm && make composer-dependency-analyser && make cs-fix`.
