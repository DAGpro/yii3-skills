<?php

declare(strict_types=1);

use App\Web\Api\CatalogAction;
use Yiisoft\Router\Route\Get;

return [
    new Get('/api/catalog', action: CatalogAction::class),
];
