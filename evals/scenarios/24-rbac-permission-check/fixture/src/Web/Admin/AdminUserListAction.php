<?php

declare(strict_types=1);

namespace App\Web\Admin;

use App\User\UserRepository;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\User\CurrentUser;

final readonly class AdminUserListAction
{
    public function __construct(
        private UserRepository $users,
        private CurrentUser $currentUser,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(): ResponseInterface
    {
        return $this->responses->createResponse($this->users->findAll());
    }
}
