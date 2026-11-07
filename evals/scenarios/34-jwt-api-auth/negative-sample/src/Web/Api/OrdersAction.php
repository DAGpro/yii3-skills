<?php

declare(strict_types=1);

namespace App\Web\Api;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;

final readonly class OrdersAction
{
    public function __construct(private DataResponseFactoryInterface $responses) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        // Only calls carrying our shared token are accepted.
        $header = $request->getHeaderLine('Authorization');
        if ($header !== 'Bearer ' . $_ENV['API_TOKEN']) {
            return $this->responses->createResponse(['error' => 'Unauthorized'], Status::UNAUTHORIZED);
        }

        return $this->responses->createResponse([
            'orders' => [
                ['id' => 1001, 'total' => '49.90'],
                ['id' => 1002, 'total' => '12.50'],
            ],
        ], Status::OK);
    }
}
