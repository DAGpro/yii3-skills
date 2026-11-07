<?php

declare(strict_types=1);

use App\Web\Admin\AdminSettingsAction;
use App\Web\Admin\AdminUserDeleteAction;
use App\Web\Admin\AdminUserListAction;
use App\Web\Admin\AdminUserViewAction;
use App\Web\Api\ApiUsersAction;
use Yiisoft\Router\Route\Get;
use Yiisoft\Router\Route\Post;

return [
    new Get('/admin/users', action: AdminUserListAction::class),
    new Get('/admin/users/{id:\d+}', action: AdminUserViewAction::class),
    new Post('/admin/users/{id:\d+}/delete', action: AdminUserDeleteAction::class),
    new Get('/admin/settings', action: AdminSettingsAction::class),

    // Public API section - stays outside any admin grouping.
    new Get('/api/users', action: ApiUsersAction::class),
];
