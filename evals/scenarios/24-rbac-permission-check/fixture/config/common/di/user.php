<?php

declare(strict_types=1);

use App\User\UserIdentityRepository;
use Psr\EventDispatcher\EventDispatcherInterface;
use Yiisoft\Access\AccessCheckerInterface;
use Yiisoft\Auth\IdentityRepositoryInterface;
use Yiisoft\Session\SessionInterface;
use Yiisoft\User\CurrentUser;

/** @var array $params */

return [
    IdentityRepositoryInterface::class => UserIdentityRepository::class,

    CurrentUser::class => static function (
        IdentityRepositoryInterface $identityRepository,
        EventDispatcherInterface $eventDispatcher,
        SessionInterface $session,
        AccessCheckerInterface $accessChecker,
    ): CurrentUser {
        return (new CurrentUser($identityRepository, $eventDispatcher))
            ->withSession($session)
            ->withAccessChecker($accessChecker);
    },
];
