<?php

declare(strict_types=1);

use App\Web\Blog\ShowPostAction;
use App\Web\Site\IndexAction;
use App\Web\Site\StatsAction;
use Yiisoft\Router\Route\Get;

return [
    new Get(pattern: '/', action: IndexAction::class),
    new Get(pattern: '/stats', action: StatsAction::class),
    new Get(pattern: '/posts/{id:\d+}', action: ShowPostAction::class),
];
