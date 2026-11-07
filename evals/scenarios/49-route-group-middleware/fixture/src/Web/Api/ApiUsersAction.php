<?php

declare(strict_types=1);

namespace App\Web\Api;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;

final readonly class ApiUsersAction
{
    public function __construct(private DataResponseFactoryInterface $responses) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        return $this->responses->createResponse(['users' => []]);
    }
}
