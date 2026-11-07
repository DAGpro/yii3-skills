<?php

declare(strict_types=1);

use App\Web\HealthAction;
use App\Web\DocsAction;
use Yiisoft\Router\Route\Get;

return [
    new Get('/health', action: HealthAction::class),
    new Get('/docs', action: DocsAction::class),
];
