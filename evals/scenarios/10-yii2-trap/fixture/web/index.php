<?php

defined('YII_ENV') or define('YII_ENV', 'dev');
defined('YII_DEBUG') or define('YII_DEBUG', true);

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../vendor/yiisoft/yii2/Yii.php';

(new yii\web\Application(require __DIR__ . '/../config/web.php'))->run();
