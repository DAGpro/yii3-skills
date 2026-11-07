<?php

declare(strict_types=1);

use App\Web\Home\HomePageAction;
use Yiisoft\Router\Route\Get;

return [
    new Get('/', action: HomePageAction::class),
];
