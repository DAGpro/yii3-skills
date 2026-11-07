<?php

declare(strict_types=1);

use App\Web\Shop\SearchOrdersAction;
use Yiisoft\Router\Route\Get;

return [
    new Get('/orders/search', action: SearchOrdersAction::class),
];
