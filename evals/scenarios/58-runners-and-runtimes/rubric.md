# Rubric: Application Runners & Runtimes

- **Pass**:
  - `public/index.php` instantiates and executes `HttpApplicationRunner`.
  - `yii` executable instantiates and executes `ConsoleApplicationRunner`.
  - Both runner packages are declared in `composer.json` under `require`.
  - No references to legacy `Yii::$app`.
- **Fail**:
  - Missing runner entry points or using monolithic static facades.
  - Runners omitted from `composer.json`.
