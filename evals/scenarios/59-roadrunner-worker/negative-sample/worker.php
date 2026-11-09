<?php

declare(strict_types=1);

use Yiisoft\Yii\Http\SapiEmitter;

// Antipattern: Using SapiEmitter in RoadRunner worker
$emitter = new SapiEmitter();
$emitter->emit($response);
