<?php

declare(strict_types=1);

namespace App\Order;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class CancelOrderAction
{
    public function __construct(
        private OrderRepositoryInterface $repository,
    ) {
    }

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        return new \Nyholm\Psr7\Response(200);
    }
}
