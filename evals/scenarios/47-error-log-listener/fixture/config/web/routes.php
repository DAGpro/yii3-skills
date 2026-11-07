<?php

declare(strict_types=1);

use App\Web\Api\ChargeAction;
use Yiisoft\Router\Route\Get;

return [
    new Get('/api/charges/{invoiceId:\d+}', action: ChargeAction::class),
];
