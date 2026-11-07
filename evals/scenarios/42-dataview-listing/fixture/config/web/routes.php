<?php

declare(strict_types=1);

use App\Web\Product\ProductListAction;
use Yiisoft\Router\Route\Get;

return [
    new Get('/products', action: ProductListAction::class),
];
