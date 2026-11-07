<?php

declare(strict_types=1);

use App\Shop\Application\Listener\SendOrderConfirmationListener;
use App\Shop\Domain\OrderCompletedEvent;

return [
    OrderCompletedEvent::class => [
        SendOrderConfirmationListener::class,
    ],
];
