<?php

declare(strict_types=1);

use Yiisoft\Yii\Runner\RoadRunner\RoadRunnerApplicationRunner;

require_once __DIR__ . '/vendor/autoload.php';

$runner = new RoadRunnerApplicationRunner(
    rootPath: __DIR__,
    debug: false,
    checkEvents: false,
    environment: 'prod'
);

$runner->run();
