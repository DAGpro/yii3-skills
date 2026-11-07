<?php

declare(strict_types=1);

use App\Web\Admin\AdminSettingsAction;
use App\Web\Admin\AdminUserDeleteAction;
use App\Web\Admin\AdminUserListAction;
use App\Web\Admin\AdminUserViewAction;
use App\Web\Api\ApiUsersAction;
use App\Web\Middleware\AdminAuthMiddleware;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route\Get;
use Yiisoft\Router\Route\Post;

return [
    Group::create('/admin', [
        new Get('/users', action: AdminUserListAction::class),
        new Get('/users/{id:\d+}', action: AdminUserViewAction::class),
        (new Post('/users/{id:\d+}/delete', action: AdminUserDeleteAction::class))
            ->middleware(AdminAuthMiddleware::class),
        new Get('/settings', action: AdminSettingsAction::class),
    ]),

    // Public API section - stays outside any admin grouping.
    new Get('/api/users', action: ApiUsersAction::class),
];
