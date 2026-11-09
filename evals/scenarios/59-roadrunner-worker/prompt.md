# Prompt: Configure RoadRunner Worker Runtime

Configure the application for RoadRunner persistent worker mode:
1. Require `yiisoft/yii-runner-roadrunner` in `composer.json`.
2. Create `worker.php` in the project root using `Yiisoft\Yii\Runner\RoadRunner\RoadRunnerApplicationRunner`.
3. Create `.rr.yaml` configuring the HTTP service with `command: "php worker.php"`.
4. Ensure no standard SAPI emitter is used inside `worker.php`.
