<?php

declare(strict_types=1);

use App\Web\Checkout\CheckoutAction;
use Yiisoft\Router\Route\Post;

return [
    new Post('/checkout', action: CheckoutAction::class),
];
