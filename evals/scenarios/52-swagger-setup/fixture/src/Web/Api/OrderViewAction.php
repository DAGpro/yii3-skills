<?php

declare(strict_types=1);

namespace App\Web\Api;

use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;

final readonly class OrderViewAction
{
    public function __construct(private DataResponseFactoryInterface $responses) {}

    public function __invoke(CurrentRoute $route): ResponseInterface
    {
        $id = $route->getArgument('id');

        return $this->responses->createResponse([
            'id' => $id,
            'total' => '49.90',
        ], Status::OK);
    }
}
