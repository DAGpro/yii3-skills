<?php

declare(strict_types=1);

namespace App\Web\Admin;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;

final readonly class AdminUserListAction
{
    public function __construct(private DataResponseFactoryInterface $responses) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        return $this->responses->createResponse(['users' => []]);
    }
}
