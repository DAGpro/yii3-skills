<?php

declare(strict_types=1);

namespace App\Web\Admin;

use App\User\UserRepository;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;
use Yiisoft\User\CurrentUser;

/**
 * FIXME: destructive action without authorization - any authenticated request deletes.
 */
final readonly class AdminUserDeleteAction
{
    public function __construct(
        private UserRepository $users,
        private CurrentUser $currentUser,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(CurrentRoute $route): ResponseInterface
    {
        $this->users->delete((int) $route->getArgument('id'));

        return $this->responses->createResponse(['status' => 'deleted'], Status::OK);
    }
}
