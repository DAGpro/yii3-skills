<?php

declare(strict_types=1);

use App\Web\Admin\AdminDashboardAction;
use App\Web\Admin\AdminSettingsAction;
use App\Web\Admin\AdminUsersAction;
use App\Web\Middleware\AdminIpAllowlistMiddleware;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route\Get;

return [
    // The whole /admin section is only reachable from the office network:
    // the allowlist middleware rejects every other client with 403 before any action runs.
    (new Group('/admin'))
        ->middleware(AdminIpAllowlistMiddleware::class)
        ->routes(
            new Get('/dashboard', action: AdminDashboardAction::class),
            new Get('/settings', action: AdminSettingsAction::class),
            new Get('/users', action: AdminUsersAction::class),
        ),
];
