<?php

declare(strict_types=1);

use App\Web\Site\AboutAction;
use Yiisoft\Router\Route\Get;

return [
    new Get('/{_language:[a-z]{2}}/about', action: AboutAction::class),
];
