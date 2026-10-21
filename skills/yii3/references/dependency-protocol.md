# Dependency protocol

Input: Capability needed for a task (from `references/package-catalog.md`) and project's `composer.json`.

## 1. Check requirements
- Package already in `composer.json` (require or require-dev) → go to step 4 (wiring).
- Package missing → install (step 3). Consult `references/package-catalog.md` for package names.
- Multiple driver options (e.g. DB driver, cache/log/rbac storage) → pick ONE option matching the project (DB from env/docker/existing code; storage from existing config). Ask the user if it cannot be determined (autonomous mode: see below).
- Unknown capability → check `references/package-catalog.md` first; if absent, search Packagist (https://github.com/yiisoft) before writing custom code; say explicitly if you fall back to a non-Yii package.

## 2. Decide who decides
- `yiisoft/*` package, no architectural impact → install without asking.
- Non-`yiisoft/*` package, or a core choice (ORM/ActiveRecord vs Cycle vs plain `yiisoft/db`, DB driver, template engine) → ask.
- Autonomous mode (`HANDOFF_MODE=1`): never ask; use what the project already uses, else the `yiisoft/*` default; record it; if impossible → blocked.

## 3. Install safely
- Use the project's way to run composer (Makefile, composer script, Docker service).
- `composer require <pkg>[ <pkg>...]` with the default stable constraint (`--dev` only where appropriate, e.g. debug, test helpers). Never:
  `composer update` without package names, `--ignore-platform-reqs`, `dev-master`/`@dev` constraints (unless the project already
  uses them), new `repositories` entries.
- Match the project's yiisoft line: a new package must resolve against the already locked `yiisoft/*` majors. On a resolver conflict
  do not force it; report the conflict and the blocking package.
- If composer asks to trust a plugin (`allow-plugins`), do not approve silently: ask (autonomous mode: blocked), unless it is already allowed.
- No composer/network available → write a manual "install" step into the summary, code against the documented API, mark as unverified.

## 4. Verify wiring
- Packages register config via `extra.config-plugin` in their `composer.json`; `yiisoft/config` merges it. Check that
  `config/.merge-plan.php` mentions the package (generated; never edit).
- Read `vendor/yiisoft/<pkg>/config/params.php` and `di*.php` for defaults. Override params in the project's `config/**/params.php`,
  or redefine the definition in the project's DI config. Never edit `vendor/`.
- Packages needing app-level registration (bootstrap, events, middleware, console commands, migrations/tables) — follow the package README.

## 5. Learn the API from the source (vendor/)
- Inspect the installed package directly: read `vendor/yiisoft/<pkg>/README.md`, then inspect public interfaces in `vendor/yiisoft/<pkg>/src/`.
- Use the installed major version (from `composer.lock`); never copy examples written for another major or invent method signatures from memory.

## 6. Write code, then verify
- Run tests/static analysis/code style as the project does (Psalm/PHPStan, Rector, PHP-CS-Fixer/ECS, PHPUnit) and fix findings.
