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
    (new Group('/admin'))
        ->middleware(AdminAuthMiddleware::class)
        ->routes(
            (new Get('/users'))
                ->action(AdminUserListAction::class)
                ->name('admin.user.list'),

            (new Get('/users/{id:\d+}'))
                ->action(AdminUserViewAction::class)
                ->name('admin.user.view'),

            (new Post('/users/{id:\d+}/delete'))
                ->action(AdminUserDeleteAction::class)
                ->name('admin.user.delete'),

            (new Get('/settings'))
                ->action(AdminSettingsAction::class)
                ->name('admin.settings'),
        ),

    // Public API section - stays outside the admin group.
    new Get('/api/users', action: ApiUsersAction::class),
];
