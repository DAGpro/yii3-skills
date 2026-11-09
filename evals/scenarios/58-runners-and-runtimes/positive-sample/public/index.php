<?php

declare(strict_types=1);

use Yiisoft\Yii\Runner\Http\HttpApplicationRunner;

require_once dirname(__DIR__) . '/vendor/autoload.php';

$runner = new HttpApplicationRunner(
    rootPath: dirname(__DIR__),
    debug: false,
    checkEvents: false,
    environment: 'prod'
);

$runner->run();
