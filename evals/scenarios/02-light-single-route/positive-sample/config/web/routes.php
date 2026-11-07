<?php

declare(strict_types=1);

use App\Web\AboutAction;
use App\Web\HomeAction;
use Yiisoft\Router\Route\Get;

return [
    new Get('/', action: HomeAction::class),
    new Get('/about', action: AboutAction::class),
];
