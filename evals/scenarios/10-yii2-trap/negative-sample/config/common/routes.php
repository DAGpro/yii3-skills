<?php

use Yiisoft\Router\Route\Get;

return [
    (new Get('/health'))->action(App\Health\HealthAction::class)->name('health'),
];
