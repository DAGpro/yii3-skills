<?php

declare(strict_types=1);

namespace App\Web\Admin;

use App\User\UserRepository;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;
use Yiisoft\User\CurrentUser;

final readonly class AdminUserDeleteAction
{
    public function __construct(
        private UserRepository $users,
        private CurrentUser $currentUser,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(CurrentRoute $route): ResponseInterface
    {
        // Guests must never reach the admin area: answer with a 404 like the list page
        if ($this->currentUser->isGuest()) {
            return $this->responses->createResponse(['error' => 'Not found'], Status::NOT_FOUND);
        }

        $this->users->delete((int) $route->getArgument('id'));

        return $this->responses->createResponse(['status' => 'deleted'], Status::OK);
    }
}
