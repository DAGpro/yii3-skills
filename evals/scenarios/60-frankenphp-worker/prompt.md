# Prompt: Configure FrankenPHP Worker Runtime

Configure the application for FrankenPHP persistent worker mode:
1. Require `yiisoft/yii-runner-frankenphp` in `composer.json`.
2. Create `worker.php` in the project root using `Yiisoft\Yii\Runner\FrankenPHP\FrankenPHPApplicationRunner`.
3. Create `Caddyfile` with FrankenPHP worker directive.
4. Ensure `worker.php` includes `ignore_user_abort(true)` (or uses FrankenPHPApplicationRunner which enforces it) to protect container state from premature client disconnections.
