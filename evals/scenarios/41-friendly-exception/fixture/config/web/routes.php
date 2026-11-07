<?php

declare(strict_types=1);

use App\Web\Checkout\CheckoutAction;
use Yiisoft\Router\Route\Post;

return [
    new Post('/checkout/confirm/{userId:\d+}/{sku}', action: CheckoutAction::class),
];
