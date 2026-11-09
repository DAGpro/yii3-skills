# Rubric: RoadRunner Worker Runtime

- **Pass**:
  - `composer.json` declares `yiisoft/yii-runner-roadrunner`.
  - `worker.php` instantiates and executes `RoadRunnerApplicationRunner`.
  - `.rr.yaml` defines server command pointing to `worker.php`.
  - No `SapiEmitter` used in persistent worker.
- **Fail**:
  - Missing package, missing `worker.php`, or missing `.rr.yaml`.
