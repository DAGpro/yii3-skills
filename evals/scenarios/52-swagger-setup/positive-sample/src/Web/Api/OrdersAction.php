<?php

declare(strict_types=1);

namespace App\Web\Api;

use OpenApi\Attributes as OA;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;

final readonly class OrdersAction
{
    public function __construct(private DataResponseFactoryInterface $responses) {}

    #[OA\Get(
        path: '/api/orders',
        summary: 'List orders',
        tags: ['Orders'],
        responses: [
            new OA\Response(
                response: Status::OK,
                description: 'Orders list',
                content: new OA\JsonContent(
                    properties: [
                        new OA\Property(
                            property: 'orders',
                            type: 'array',
                            items: new OA\Items(type: 'object'),
                        ),
                    ],
                ),
            ),
        ],
    )]
    public function __invoke(): ResponseInterface
    {
        return $this->responses->createResponse([
            'orders' => [
                ['id' => 1001, 'total' => '49.90'],
                ['id' => 1002, 'total' => '12.50'],
            ],
        ], Status::OK);
    }
}
