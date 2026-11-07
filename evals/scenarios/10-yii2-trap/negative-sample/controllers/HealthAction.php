<?php

declare(strict_types=1);

namespace App\Health;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\DataResponseFactoryInterface;

final readonly class HealthAction
{
    public function __construct(private DataResponseFactoryInterface $responseFactory)
    {
    }

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        return $this->responseFactory->createResponse(['status' => 'ok']);
    }
}
