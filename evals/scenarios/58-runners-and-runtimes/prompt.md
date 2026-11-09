# Prompt: Configure Application Runners (HTTP & Console)

Configure the standard Yii 3 entry points:
1. `public/index.php` using `Yiisoft\Yii\Runner\Http\HttpApplicationRunner`.
2. `./yii` console binary using `Yiisoft\Yii\Runner\Console\ConsoleApplicationRunner`.
3. Ensure `yiisoft/yii-runner-http` and `yiisoft/yii-runner-console` are declared in `composer.json`.
4. Do not use legacy Yii 2 static facades (`Yii::$app->run()`).
