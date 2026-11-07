<?php

declare(strict_types=1);

use App\Web\HealthAction;
use Yiisoft\Router\Route\Get;

return [
    new Get('/health', action: HealthAction::class),
];
