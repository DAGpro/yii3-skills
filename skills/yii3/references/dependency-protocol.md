# Dependency protocol

Input: output of `scripts/yii3-context.mjs --need <capabilities>`. Run for every capability a task needs.

## 1. Read the probe
- `missing: []` and no `choice`/`action` → installed; go to step 4.
- `missing: [...]` → install (step 3). `composer` shows the exact command.
- `choice` with empty `satisfied` → pick ONE option matching the project (DB from env/docker/existing code; cache/log/rbac storage
  from existing config). Ask the user if it cannot be determined (autonomous mode: see below).
- `warning` / `exists: unverified` → confirm the package first: `composer show -a <pkg>` or `composer require <pkg> --dry-run`.
  If composer is unavailable, mark the usage as an unverified assumption in the summary.
- `error: unknown capability` → search (`composer search`, Packagist, https://github.com/yiisoft) before writing custom code;
  say explicitly if you fall back to a non-Yii package.

## 2. Decide who decides
- `yiisoft/*` package from the probe, no architectural impact → install without asking.
- Non-`yiisoft/*` package, or a core choice (ORM/ActiveRecord vs Cycle vs plain `yiisoft/db`, DB driver, template engine) → ask.
- Autonomous mode (`HANDOFF_MODE=1`): never ask; use what the project already uses, else the `yiisoft/*` default; record it;
  if impossible → blocked.

## 3. Install safely
- Use the project's way to run composer (Makefile, composer script, Docker service).
- `composer require <pkg>[ <pkg>...]` with the default stable constraint (`--dev` only where the probe says). Never:
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

## 5. Learn the API from the source
- `vendor/yiisoft/<pkg>/README.md`, then public interfaces in `src/`. Type-hint interfaces in constructors.
- Use the installed major version (`locked` in the probe); do not copy examples written for another major.

## 6. Write code, then verify
- Run tests/static analysis/code style as the project does; re-run `scripts/yii3-context.mjs --scan-git` and fix findings.
