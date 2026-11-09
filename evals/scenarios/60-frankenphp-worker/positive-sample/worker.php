<?php

declare(strict_types=1);

use Yiisoft\Yii\Runner\FrankenPHP\FrankenPHPApplicationRunner;

ignore_user_abort(true);

require_once __DIR__ . '/vendor/autoload.php';

$runner = new FrankenPHPApplicationRunner(
    rootPath: __DIR__,
    debug: false,
    checkEvents: false,
    environment: 'prod'
);

$runner->run();
