<?php

declare(strict_types=1);

use App\Web\Contact\ContactAction;
use Yiisoft\Router\Route\Get;

return [
    new Get('/contact', action: ContactAction::class),
];
