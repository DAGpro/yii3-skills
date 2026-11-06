<?php

declare(strict_types=1);

use App\Web\Blog\ShowPostAction;
use App\Web\Site\SiteController;
use Yiisoft\Router\Route\Get;

return [
    new Get(pattern: '/', action: [SiteController::class, 'actionIndex']),
    new Get(pattern: '/stats', action: [SiteController::class, 'actionStats']),
    new Get(pattern: '/posts/{id:\d+}', action: ShowPostAction::class),
];
