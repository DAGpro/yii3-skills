<?php

declare(strict_types=1);

use App\Web\Admin\AdminUserDeleteAction;
use App\Web\Admin\AdminUserListAction;
use Yiisoft\Router\Route\Get;
use Yiisoft\Router\Route\Post;

return [
    new Get('/admin/users', action: AdminUserListAction::class),
    new Post('/admin/users/{id:\d+}/delete', action: AdminUserDeleteAction::class),
];
