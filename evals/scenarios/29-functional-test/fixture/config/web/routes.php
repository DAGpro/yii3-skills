<?php

declare(strict_types=1);

use App\Web\Api\StatusAction;
use Yiisoft\Router\Route\Get;

return [
    new Get('/api/status', action: StatusAction::class),
];
