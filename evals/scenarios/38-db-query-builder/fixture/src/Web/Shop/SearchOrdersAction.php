<?php

declare(strict_types=1);

namespace App\Web\Shop;

use App\Shop\Domain\SearchOrdersRepositoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;

final readonly class SearchOrdersAction
{
    public function __construct(
        private SearchOrdersRepositoryInterface $orders,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $term = (string) ($request->getQueryParams()['term'] ?? '');

        return $this->responses->createResponse($this->orders->search($term));
    }
}
