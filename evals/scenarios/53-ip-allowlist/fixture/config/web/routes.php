<?php

declare(strict_types=1);

use App\Web\Admin\AdminDashboardAction;
use App\Web\Admin\AdminSettingsAction;
use App\Web\Admin\AdminUsersAction;
use Yiisoft\Router\Route\Get;

// FIXME: the /admin section must only be reachable from the office network - currently public.
return [
    new Get('/admin/dashboard', action: AdminDashboardAction::class),
    new Get('/admin/settings', action: AdminSettingsAction::class),
    new Get('/admin/users', action: AdminUsersAction::class),
];
