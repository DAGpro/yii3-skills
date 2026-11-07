<?php

declare(strict_types=1);

namespace App\Web\Admin;

use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;

final readonly class AdminUsersAction
{
    public function __construct(private DataResponseFactoryInterface $responses) {}

    public function __invoke(): ResponseInterface
    {
        return $this->responses->createResponse(
            ['title' => 'Admin users'],
            Status::OK,
        );
    }
}
