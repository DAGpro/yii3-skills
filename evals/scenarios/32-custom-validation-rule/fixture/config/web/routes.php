<?php

declare(strict_types=1);

use App\Web\Auth\SignupAction;
use Yiisoft\Router\Route\Post;

return [
    new Post('/signup', action: SignupAction::class),
];
