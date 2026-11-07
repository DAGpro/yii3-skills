<?php

declare(strict_types=1);

namespace App\Web\Api;

use OpenApi\Attributes as OA;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;

final readonly class OrderViewAction
{
    public function __construct(private DataResponseFactoryInterface $responses) {}

    #[OA\Get(
        path: '/api/orders/{id}',
        summary: 'View an order',
        tags: ['Orders'],
        parameters: [
            new OA\Parameter(
                name: 'id',
                in: 'path',
                required: true,
                schema: new OA\Schema(type: 'string'),
            ),
        ],
        responses: [
            new OA\Response(
                response: Status::OK,
                description: 'Order details',
                content: new OA\JsonContent(type: 'object'),
            ),
            new OA\Response(
                response: Status::NOT_FOUND,
                description: 'Order not found',
            ),
        ],
    )]
    public function __invoke(CurrentRoute $route): ResponseInterface
    {
        $id = $route->getArgument('id');

        return $this->responses->createResponse([
            'id' => $id,
            'total' => '49.90',
        ], Status::OK);
    }
}
