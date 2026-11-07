<?php

declare(strict_types=1);

use App\User\UserRepository;
use Psr\EventDispatcher\EventDispatcherInterface;
use Yiisoft\Auth\IdentityRepositoryInterface;
use Yiisoft\Session\SessionInterface;
use Yiisoft\User\CurrentUser;

/** @var array $params */

return [
    IdentityRepositoryInterface::class => UserRepository::class,

    CurrentUser::class => static function (
        IdentityRepositoryInterface $identityRepository,
        EventDispatcherInterface $eventDispatcher,
        SessionInterface $session,
    ): CurrentUser {
        return (new CurrentUser($identityRepository, $eventDispatcher))
            ->withSession($session);
    },
];
