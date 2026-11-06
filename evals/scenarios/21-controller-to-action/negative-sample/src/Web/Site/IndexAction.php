<?php

declare(strict_types=1);

namespace App\Web\Site;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;

final readonly class IndexAction
{
    public function __construct(private readonly DataResponseFactoryInterface $responses) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        return $this->responses->createResponse(['app' => 'acme-blog', 'version' => '1.0']);
    }
}
