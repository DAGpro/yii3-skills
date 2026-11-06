<?php

declare(strict_types=1);

namespace App\Web\Site;

use App\Blog\Application\StatsService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;

final readonly class StatsAction
{
    public function __construct(
        private readonly StatsService $stats,
        private readonly DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        return $this->responses->createResponse($this->stats->summary());
    }
}
