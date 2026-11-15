<?php

declare(strict_types=1);

use App\User\Profile\UserRepository;
use App\User\Profile\UserRepositoryInterface;

return [
    UserRepositoryInterface::class => UserRepository::class,
];
