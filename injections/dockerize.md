## Yii3 support (from yii3-skills)

Load the `yii3` skill and generate Docker configuration per it — the skill is the single source of rules:

Operating context: this `aif-*` workflow runs the skill in its default AI Factory extension mode (contract: `references/core-aif-adapter.md`); the standalone fallback contract (`references/core-standalone-adapter.md`) is out of scope here.

Dockerize-specific duties (the rules themselves live in the skill; all `references/*.md` paths resolve relative to the `yii3` skill directory):
- Runtime archetype selection (Step 1.3 & Step 2): inspect `composer.json` to identify the active runner:
  - If `yiisoft/yii-runner-roadrunner` is installed: configure RoadRunner (`spiral/roadrunner` binary + CLI PHP worker) without PHP-FPM/Nginx per `references/infra-runtime-roadrunner.md`.
  - If `yiisoft/yii-runner-frankenphp` is installed: use official FrankenPHP Caddy-based image per `references/infra-runtime-frankenphp.md`.
  - If `yiisoft/yii-runner-http` is installed: configure standard PHP-FPM (PHP 8.2+) with Nginx per `references/infra-runners-and-runtimes.md`.
- Filesystem permissions & volumes (Step 2 & Step 3): ensure `runtime/` and `public/assets/` directories exist and are owned by `www-data:www-data` (writable). In development compose (`compose.override.yml`), mount local workspace but avoid clobbering container `vendor/` and isolate container `runtime/`.
- PHP extensions & composer (Step 2): mandate required extensions: `pdo`, `intl`, `mbstring`, `opcache`, and the specific database driver (`pdo_mysql`, `pdo_pgsql`, `pdo_sqlite`). Install Composer 2.x in the builder stage.
- Production hardening & caching (Step 3 & Step 4): use a multi-stage build running `composer install --no-dev --optimize-autoloader --no-interaction`; warmup configuration merge plan (`.merge-plan.php`); enable OPcache with `opcache.validate_timestamps=0` and non-root execution (`USER www-data`).
- State safety in persistent runtimes: for RoadRunner/FrankenPHP containers, audit that container worker lifecycles comply with `StateResetter` requirements per `references/infra-state-resetter.md`.
