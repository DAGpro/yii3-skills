<?php

declare(strict_types=1);

use App\User\ApiUserIdentityRepository;
use Yiisoft\Auth\IdentityRepositoryInterface;
use Yiisoft\Definitions\Reference;

return [
    IdentityRepositoryInterface::class => Reference::to(ApiUserIdentityRepository::class),
];
