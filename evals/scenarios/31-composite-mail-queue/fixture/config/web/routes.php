<?php

declare(strict_types=1);

use App\Web\Blog\RegisterAction;
use Yiisoft\Router\Route\Post;

return [
    new Post('/register', action: RegisterAction::class),
];
