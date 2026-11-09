# Rubric: FrankenPHP Worker Runtime

- **Pass**:
  - `composer.json` declares `yiisoft/yii-runner-frankenphp`.
  - `worker.php` instantiates and executes `FrankenPHPApplicationRunner`.
  - `Caddyfile` exists and specifies `frankenphp` worker configuration.
  - Container safety against client aborts is addressed.
- **Fail**:
  - Missing runner package, missing `worker.php`, or missing `Caddyfile`.
